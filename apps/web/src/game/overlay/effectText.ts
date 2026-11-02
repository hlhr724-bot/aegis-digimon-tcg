import { getPrintedClauseGroups } from "@/game/getPrintedClauseGroups";
import {
  getCardDefinition,
  printedTimingLabelPattern,
  printedModalBullets,
  printedModalPreamble,
  type DecisionKind,
} from "@aegis/shared";

/**
 * Pure text layer between the engine's effect model and the printed card: given a
 * resolving timing and a card, slice out the matching printed clause so overlays and
 * feeds can show the player the same words the card shows them.
 *
 * Three rules run through this file:
 *
 * - Two timing vocabularies. The server names a timing two ways: `effectTriggered`
 *   carries the engine's EffectTiming enum key ("OnUseAttack"), while a decision's
 *   provenance carries the IR trigger ("WhenAttacking"). TIMING_LABELS maps both
 *   spellings to the one printed bracket, so the notice and the decision dialog slice
 *   the same clause whichever one arrives.
 *
 * - Shared-bracket clause runs. Adjacent timing brackets share one clause body: cards
 *   like AD1-001 print "[On Play] [When Digivolving] You may return ..." — a single
 *   clause that fires under either timing. effectClauseForTiming treats a run of
 *   brackets separated only by whitespace as one shared clause header, so BOTH
 *   timings return the full "[On Play] [When Digivolving] ..." body instead of the
 *   On Play slice collapsing to an empty "[On Play]".
 *
 * - Printed-catalog-only rule. playerFacingEffectClause resolves display text only
 *   from the printed catalog. Granted effects and synthesized keyword activations
 *   use the server's description because they need not be printed on their host.
 */

export const TIMING_LABELS: Record<string, string> = {
  whenHandTrashed: "When Cards Are Trashed from Your Hand",
  whenTrashedFromHand: "When Trashed from Hand",
  whenPlayed: "When Played",
  whenSecurityRemoved: "When Security Is Removed",
  OnPlay: "On Play",
  WhenDigivolving: "When Digivolving",
  WhenAttacking: "When Attacking",
  OnUseAttack: "When Attacking",
  OnAllyAttack: "When Attacking",
  OnDeletion: "On Deletion",
  OnDestroyedAnyone: "On Deletion",
  EndOfAttack: "End of Attack",
  OnEndAttack: "End of Attack",
  AllTurns: "All Turns",
  YourTurn: "Your Turn",
  OpponentsTurn: "Opponent's Turn",
  StartOfYourTurn: "Start of Your Turn",
  EndOfYourTurn: "End of Your Turn",
  StartOfOpponentsTurn: "Start of Opponent's Turn",
  EndOfOpponentsTurn: "End of Opponent's Turn",
  OnStartMainPhase: "Start of Main Phase",
  StartOfYourMainPhase: "Start of Your Main Phase",
  StartOfOpponentsMainPhase: "Start of Opponent's Main Phase",
  EndOfAllTurns: "End of All Turns",
  Main: "Main",
  OnUseOption: "Main",
  // A declared activation is the turn player's [Main] ability, whether printed under
  // [Main] alone or as a [Hand]/[Trash]/[Breeding] clause that shares its header.
  OnDeclaration: "Main",
  Security: "Security",
  SecuritySkill: "Security",
  Counter: "Counter",
  OnCounterTiming: "Counter",
  Hand: "Hand",
  Trash: "Trash",
  Breeding: "Breeding",
  Rule: "Rule",
  WhenMoving: "When Moving",
  WhenLinking: "When Linking",
  OnLinking: "When Linking",
  OnMove: "When Moving",
};

/** Engine timings whose printed clause carries no bracket: the card opens with the sentence itself. */
const UNBRACKETED_TIMINGS: ReadonlySet<string> = new Set(["OnDiscardSecurity"]);

const GENERIC_TIMING_VARIANTS: Record<string, string[]> = {
  OnStartTurn: ["StartOfYourTurn", "StartOfOpponentsTurn"],
  OnStartMainPhase: ["StartOfYourMainPhase", "StartOfOpponentsMainPhase"],
  OnEndTurn: ["EndOfYourTurn", "EndOfOpponentsTurn", "EndOfAllTurns"],
};

/**
 * Slice the single printed clause for the resolving `timing` out of the card's full
 * effect text (dropping the [Digivolve]/cost preamble and any sibling clauses). Falls
 * back to the full text when the timing is unknown or its bracket is not present.
 */
export function effectClauseForTiming(effectText: string | undefined, timing: string | undefined): string | undefined {
  const label = timing ? TIMING_LABELS[timing] : undefined;
  if (!effectText) return effectText;
  const { marks, groups } = getPrintedClauseGroups(effectText);
  // Intrinsic pay-time reducers are represented as Static IR but their printed sentence has
  // no [Static] label. When it precedes a bracketed sibling clause (EX3-054), the prefix is
  // the exact player-facing clause; do not show the unrelated watcher beside the payment UI.
  if (timing === "Static") {
    const prefix = effectText.slice(0, marks[0]?.index ?? effectText.length).trim();
    if (prefix.length > 0) return prefix;
  }
  if (!label) {
    // A timing printed without a bracket (OnDiscardSecurity: "When an effect trashes this
    // card from the security stack, ...") resolves to the sentence a card prints BEFORE its
    // first bracketed clause. That sentence is the whole clause; the bracketed siblings that
    // follow it belong to other timings and only bury it.
    return (
      (timing !== undefined && UNBRACKETED_TIMINGS.has(timing)
        ? unbracketedLeadingClause(effectText, marks[0]?.index)
        : undefined) ?? effectText
    );
  }
  const groupIdx = groups.findIndex((g) => g.labels.has(label));
  const group = groups[groupIdx];
  if (group === undefined) {
    // A card printing exactly one clause has nothing else to offer, so showing it beats
    // showing nothing. A card printing several unrelated clauses (BT26-016's On Play/When
    // Digivolving/When Attacking block AND its All Turns block) has no clause for this
    // timing at all — e.g. a synthesized ＜Engage＞/＜Vortex＞ end-of-turn attack, which is
    // never printed as its own bracket — and the whole raw block would name every other
    // effect on the card instead of the one actually resolving.
    return groups.length <= 1 ? effectText : undefined;
  }
  const end = groups[groupIdx + 1]?.start ?? effectText.length;
  return effectText.slice(group.start, end).trim();
}

/**
 * Every printed clause opened by the `timing` bracket, in printed order. A card can print
 * the same timing twice (EX13-036's two [When Digivolving] lines); `effectClauseForTiming`
 * returns only the first, so a chooser listing both effects needs the full list to tell
 * them apart.
 */
export function effectClausesForTiming(effectText: string | undefined, timing: string | undefined): string[] {
  const label = timing ? TIMING_LABELS[timing] : undefined;
  if (!effectText || !label) return [];
  const { groups } = getPrintedClauseGroups(effectText);
  return groups.flatMap((group, index) => {
    if (!group.labels.has(label)) return [];
    const end = groups[index + 1]?.start ?? effectText.length;
    return [effectText.slice(group.start, end).trim()];
  });
}

/** The prose a card prints before its first timing bracket, when it is a sentence of its own. */
function unbracketedLeadingClause(effectText: string, firstBracketIndex: number | undefined): string | undefined {
  if (firstBracketIndex === undefined) return undefined;
  const prefix = effectText.slice(0, firstBracketIndex).trim();
  // A keyword line ("＜Barrier＞") or a requirement preamble ("[Digivolve] Lv.5 ...: Cost 3")
  // also precedes the first timing bracket, and neither is an effect clause.
  return /^[A-Za-z]/.test(prefix) ? prefix : undefined;
}

/**
 * The timing brackets that open clauses in a printed box, and those brackets grouped into
 * shared clause headers (a run of brackets separated only by whitespace is one header).
 */

/**
 * The printed text boxes to search for a timing, ordered by how likely each box is to hold
 * the resolving clause, plus the first box that prints the timing's bracket.
 */
function printedBoxesForTiming(
  cardId: string,
  timing: string | undefined,
  isInherited: boolean,
): { texts: string[]; matching: string | undefined } {
  const definition = getCardDefinition(cardId);
  // Checked-card skills and resident [Security][Your Turn] clauses can share
  // the Security bracket while belonging to different printed text boxes.
  const isSecuritySkill = timing === "Security" || timing === "SecuritySkill";
  const boxes = isSecuritySkill
    ? [definition?.securityEffectText, definition?.effectText, definition?.inheritedEffectText]
    : isInherited
      ? [definition?.inheritedEffectText, definition?.effectText, definition?.securityEffectText]
      : (timing === "Main" || timing === "OnUseOption") && definition?.isDualCard
        ? [
            definition.optionEffect,
            definition.effectText,
            definition.inheritedEffectText,
            definition.securityEffectText,
          ]
        : [
            definition?.effectText,
            definition?.inheritedEffectText,
            definition?.securityEffectText,
            definition?.linkEffect,
          ];
  const texts = boxes.filter((text): text is string => Boolean(text));
  const label = timing ? TIMING_LABELS[timing] : undefined;
  const matching = label
    ? texts.find((text) => new RegExp(`\\[${printedTimingLabelPattern(label)}\\]`).test(text))
    : undefined;
  return { texts, matching };
}

/** Every printed clause a card opens with the `timing` bracket, in printed order. */
export function cardEffectClausesForTiming(cardId: string, timing: string | undefined, isInherited = false): string[] {
  const { matching } = printedBoxesForTiming(cardId, timing, isInherited);
  return effectClausesForTiming(matching, timing);
}

/**
 * Select the matching printed clause across a card's main, inherited, and Security text
 * boxes. A timing bracket can appear in more than one box, so when the caller knows the
 * resolving effect is inherited, the inherited box is searched first.
 */
export function cardEffectClauseForTiming(
  cardId: string,
  timing: string | undefined,
  isInherited = false,
): string | undefined {
  const { texts, matching } = printedBoxesForTiming(cardId, timing, isInherited);
  if (matching === undefined && timing !== undefined) {
    // Watcher event names describe a condition inside a turn-scoped clause,
    // rather than the bracket printed on the card.
    const watcherCondition =
      timing === "whenHandTrashed"
        ? /\bwhen\b[^.\n]*(?:hands?[^.\n]*trash|trash[^.\n]*hands?)/i
        : timing === "whenSecurityRemoved"
          ? /\bwhen\b[^.\n]*security[^.\n]*remov/i
          : undefined;
    if (watcherCondition) {
      const clauses = new Set(
        texts.flatMap((text) =>
          ["AllTurns", "YourTurn", "OpponentsTurn"].flatMap((variant) => {
            const variantLabel = TIMING_LABELS[variant]!;
            if (!text.includes(`[${variantLabel}]`)) return [];
            const clause = effectClauseForTiming(text, variant);
            return clause && watcherCondition.test(clause) ? [clause] : [];
          }),
        ),
      );
      if (clauses.size === 1) return [...clauses][0];
    }
    const variants = GENERIC_TIMING_VARIANTS[timing] ?? [];
    const present = variants.flatMap((variant) => {
      const variantLabel = TIMING_LABELS[variant];
      if (variantLabel === undefined) return [];
      const text = texts.find((candidate) =>
        new RegExp(`\\[${printedTimingLabelPattern(variantLabel)}\\]`).test(candidate),
      );
      return text === undefined ? [] : [{ text, variant }];
    });
    if (present.length === 1) return effectClauseForTiming(present[0]!.text, present[0]!.variant);
  }
  return effectClauseForTiming(matching ?? texts[0], timing);
}

/**
 * The printed timing bracket for an engine timing name ("OnPlay" -> "[On Play]"),
 * or undefined when the timing is unknown. This is how the trigger chooser tells
 * apart two effects of one permanent, which share every other visible detail.
 */
export function printedTimingLabel(timing: string | undefined): string | undefined {
  const label = timing ? TIMING_LABELS[timing] : undefined;
  return label === undefined ? undefined : `[${label}]`;
}

/** The printed clause to surface for a resolved effect, or undefined when there is nothing worth showing. */
export function resolvedEffectClause(
  cardId: string,
  timing: string | undefined,
  isInherited = false,
): string | undefined {
  const clause = cardEffectClauseForTiming(cardId, timing, isInherited);
  const trimmed = clause?.trim();
  if (!trimmed) return undefined;
  // A bare "[On Play] [When Digivolving]" header with no body carries nothing to read.
  return trimmed.replace(/\[[^\]]*\]/g, "").trim() ? trimmed : undefined;
}

// Engine summaries remain useful only for filtering generic decision prompts.
const DESCRIBED_ACTION_PHRASES: readonly RegExp[] = [
  /^Draw -?\d+$/,
  // A target count is a number or the literal "all" (`String(action.target.count)`
  // in describeAction stringifies both), so "Delete all target(s)" is generated too.
  /^Delete (?:\d+|all) target\(s\)$/,
  /^(?:Suspend|Unsuspend) (?:\d+|all) target\(s\)$/,
  /^Trash (?:\d+|all) card\(s\)$/,
  /^Trash (?:up to )?-?\d+ card\(s\) from the top of the deck$/,
  /^Return (?:\d+|all) to [A-Za-z]+$/,
  /^Modify DP by -?\d+$/,
  /^Set base DP to -?\d+$/,
  /^Set memory to -?\d+$/,
  /^(?:Gain|Lose) \d+ memory$/,
  /^(?:Play|Use an Option) (?:without paying the cost|with the cost reduced by \d+|by paying its cost)$/,
  /^Place (?:up to )?(?:\d+|all) card\(s\) under$/,
  /^Reveal top \d+ and add$/,
  /^Gain (?:＜[^＞]+＞|<[^>]+>|keyword)$/,
  // Security summaries can share a description with bare IR kinds. Recognize
  // every phrase emitted by describeSecurityManipulation so the whole summary
  // falls back to the matching printed clause.
  /^Add -?\d+ card\(s\) to the opponent's security$/,
  /^＜Recovery \+-?\d+＞$/,
  /^Trash (?:up to )?-?\d+ of (?:your|opponent's) top security card\(s\)$/,
  /^Reveal (?:your|opponent's) (?:top|bottom) security card$/,
  /^Flip (?:your|opponent's) security card face up$/,
  /^Move (?:your|opponent's) top security card to the bottom$/,
  /^Place -?\d+ card\(s\) as (?:your|opponent's) security card\(s\)$/,
  /^Play \d+ (?:\[[^\]]+\] )?token\(s\)$/,
  /^Move to the (?:breeding|battle) area$/,
  /^(?:Target (?:can't|doesn't|can only|is unaffected)[^$]*|Apply a restriction)$/,
  /^Hatch a Digi-Egg$/,
  /^Search your deck$/,
  /^(?:Digivolve|DNA digivolve|De-Digivolve)$/,
  // describeAction wraps a cost-gated action as "By paying: <cost> → <body>"; the cost may
  // echo printed text, so the prefix alone marks the summary as generated.
  /^By paying: /,
];
// An "activate this?" prompt built from an unmapped IR action kind arrives as a bare
// identifier ("GainMemory", "gainMemory"): readable in a log, meaningless in a modal. Drop
// it so the overlay falls back to its generic prompt and the printed clause carries the
// meaning. Other decision kinds prompt with a card name, which is single-token by nature.
const INTERNAL_IDENTIFIER_PROMPT = /^[A-Za-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/;
const INTERNAL_ACTION_PROMPT = /^(?:attack|delete|digivolve|draw|play|return|suspend|trash|unsuspend)$/i;

/** The prompt above a decision, excluding internal summaries and repeated printed passages. */
export function playerFacingPromptText(
  promptText: string | undefined,
  kind: DecisionKind,
  printedEffectPassage?: string,
): string | undefined {
  const trimmed = promptText?.trim();
  if (!trimmed) return undefined;
  if (/^select bind$/i.test(trimmed)) return undefined;
  // Generic engine verbs add no guidance beyond the decision kind and leak English into
  // localized matches. Let the modal use its translated fallback while the printed effect
  // clause explains what is being selected.
  if (/^(?:choose targets?|select cards?|choose one effect to activate|choose the card order)$/i.test(trimmed))
    return undefined;
  if (kind !== "optional") return trimmed;
  // Watchers can ask with their whole raw clause while the body shows only the current
  // printed passage. Keep that prose below the localized question, including when a
  // follow-on sentence comes after the passage or raw omits its final punctuation.
  if (printedEffectPassage) {
    const normalize = (text: string) =>
      text
        .replace(/^(?:\[[^\]]+\]\s*)+/, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.!?]+$/, "");
    const passage = normalize(printedEffectPassage);
    const prompt = normalize(trimmed);
    if (passage && (prompt === passage || prompt.startsWith(`${passage}. `) || prompt.startsWith(`${passage} `)))
      return undefined;
  }
  // Printed optional clauses belong in the body, below the short activation question.
  if (/^you may\b/i.test(trimmed)) return undefined;
  // A reducer or keyword effect asks with the engine's own summary of what it does
  // ("Draw 2", "Gain 2 memory"), which the printed clause under the prompt already says.
  return INTERNAL_IDENTIFIER_PROMPT.test(trimmed) ||
    INTERNAL_ACTION_PROMPT.test(trimmed) ||
    DESCRIBED_ACTION_PHRASES.some((shape) => shape.test(trimmed))
    ? undefined
    : trimmed;
}

/** Resolve printed clauses from the catalog and granted keyword activations from their descriptions. */
export function playerFacingEffectClause({
  cardId,
  timing,
  description,
  isInherited,
  effectTextPart,
}: {
  cardId: string;
  timing: string | undefined;
  description: string | undefined;
  isInherited?: boolean;
  effectTextPart?: string;
}): string | undefined {
  const definition = getCardDefinition(cardId);
  const inherited = isInherited ?? description?.includes("[Inherited]") ?? false;
  const describedTiming = Object.entries(TIMING_LABELS).find(([, label]) =>
    description?.match(/^(?:\[[^\]]*\]\s*)+/)?.[0].includes(`[${label}]`),
  )?.[0];
  const effectiveTiming = timing && TIMING_LABELS[timing] ? timing : (describedTiming ?? timing);
  const boxes = inherited
    ? [definition?.inheritedEffectText]
    : [definition?.effectText, definition?.optionEffect, definition?.securityEffectText, definition?.linkEffect];
  const externalPrefix = description?.trim().match(/^\[(?:Granted|Pending)\]\s*/)?.[0];
  const supplied = externalPrefix ? description!.trim().slice(externalPrefix.length).trim() : description?.trim();
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const exactPrintedClause = supplied
    ? boxes.flatMap((text) => text?.split("\n") ?? []).find((line) => normalize(line) === normalize(supplied))
    : undefined;
  // Some catalog entries place consecutive printed clauses on one line. A watcher still sends
  // its complete bracketed clause, so recognize that exact fragment instead of falling back to
  // the first clause with the same timing.
  const containedPrintedClause =
    supplied &&
    /^\[[^\]]+\]/.test(supplied) &&
    boxes.some((text) => normalize(text ?? "").includes(normalize(supplied)))
      ? supplied
      : undefined;
  // Older watchers may paraphrase the payload while retaining the printed "When ...,"
  // condition. A unique condition identifies its catalog clause without substituting the
  // first effect that happens to share its timing (Titamon's two [All Turns] effects).
  const suppliedCondition = supplied?.match(/^(?:\[[^\]]*\]\s*)+((?:When|If|While)\b[^,]+,)/)?.[1];
  const conditionMatches = suppliedCondition
    ? cardEffectClausesForTiming(cardId, effectiveTiming, inherited).filter((candidate) =>
        normalize(candidate).includes(normalize(suppliedCondition)),
      )
    : [];
  const conditionPrintedClause = conditionMatches.length === 1 ? conditionMatches[0] : undefined;
  const fragmentMatches =
    supplied && !/^(?:\[|＜)/.test(supplied)
      ? boxes
          .flatMap((text) => effectClausesForTiming(text, effectiveTiming))
          .filter((candidate) => normalize(candidate).includes(normalize(supplied)))
      : [];
  const fragmentPrintedClause = fragmentMatches.length === 1 ? fragmentMatches[0] : undefined;
  // A full card text can start with a keyword preamble (e.g. Use Req.).
  // Keyword activations are standalone or followed by explanatory prose.
  const keywordPrefix = supplied?.match(/^＜[^＞]+＞/)?.[0];
  const printedKeyword =
    keywordPrefix && !/^(?:\[|＜)/.test(supplied!.slice(keywordPrefix.length).trim()) ? keywordPrefix : undefined;
  const standaloneKeyword = supplied?.match(/^＜[^＞]+＞$/)?.[0];
  // Takato grants "[When Digivolving] ＜Blitz＞" to another card. Preserve that
  // timed keyword instead of substituting the host's printed effect; a host OPT
  // would otherwise also make the chooser hide Blitz as a duplicate of that OPT.
  const timedKeyword =
    describedTiming !== undefined && supplied?.match(/^(?:\[[^\]]+\]\s*)+＜[^＞]+＞$/) ? supplied : undefined;
  // Synthesized keyword effects describe their activation after a colon. The
  // keyword may have been granted by another card and be absent from this card.
  const keywordActivation = supplied?.match(/^＜[^＞]+＞:\s*\S/) ? supplied : undefined;
  const matchingKeyword =
    printedKeyword &&
    boxes
      .flatMap((text) => text?.match(/＜[^＞]+＞/g) ?? [])
      .find((keyword) => normalize(keyword) === normalize(printedKeyword));
  // Some catalog entries print the keyword with ASCII brackets ("<Delay>").
  const delayClause = supplied?.match(/^\[Main\]\s*[＜<]Delay[＞>]/)
    ? boxes
        .map((text) => {
          const offset = text?.search(/\[Main\]\s*[＜<]Delay[＞>]/) ?? -1;
          return offset >= 0 ? effectClauseForTiming(text?.slice(offset), "Main") : undefined;
        })
        .find(Boolean)
    : undefined;
  const clause =
    (standaloneKeyword ||
      timedKeyword ||
      keywordActivation ||
      matchingKeyword ||
      delayClause ||
      fragmentPrintedClause ||
      ((exactPrintedClause || containedPrintedClause || conditionPrintedClause) &&
        effectClauseForTiming(
          exactPrintedClause || containedPrintedClause || conditionPrintedClause,
          effectiveTiming,
        ))) ??
    (effectiveTiming === undefined || externalPrefix
      ? undefined
      : resolvedEffectClause(cardId, effectiveTiming, inherited));
  const part = effectTextPart?.trim();
  const timingClause =
    part && matchingKeyword && effectiveTiming !== undefined
      ? resolvedEffectClause(cardId, effectiveTiming, inherited)
      : undefined;
  // A card can print two clauses under the same timing (BT16-101's and EX12-019's two
  // [All Turns] lines). `clause` resolves to the FIRST of them, so an authored passage from
  // the second would be replaced by the wrong printed text; accept any authored part that is
  // a verbatim fragment of this card's own printed boxes.
  // A supplied passage that stitches SEVERAL of this card's printed clauses together is the
  // fuller reading of one moment — a [Security] clause that activates this card's [Main] effect
  // carries both — so it is shown whole. A whole printed BOX is not that: it is the card's text
  // with every clause in it, and the timing still has to be sliced out of it.
  const wholePrintedBox = supplied && boxes.some((text) => text && normalize(text) === normalize(supplied));
  if (
    supplied &&
    clause &&
    !wholePrintedBox &&
    // A keyword activation already IS the passage to show; only a sliced printed clause can
    // be the narrower half of a longer supplied one.
    !keywordActivation &&
    !matchingKeyword &&
    !delayClause &&
    normalize(supplied) !== normalize(clause) &&
    normalize(supplied).includes(normalize(clause))
  )
    return stripTrailingCardRequirements(supplied);
  // A clause extracted after a processing cost starts its own sentence in the dialog.
  // Permit its initial capital without accepting changes to the printed words.
  const sentencePart = part?.replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  const printedPart =
    part &&
    boxes.some(
      (text) =>
        text && (normalize(text).includes(normalize(part)) || normalize(text).includes(normalize(sentencePart!))),
    );
  if (
    part &&
    (printedPart ||
      [clause, timingClause].some((candidate) => candidate && normalize(candidate).includes(normalize(part))))
  )
    return stripTrailingCardRequirements(part);
  return stripTrailingCardRequirements(clause ?? (externalPrefix ? supplied : undefined));
}

/**
 * The clause an effect notice reads out. A clause offering a choice of bullets is read up to
 * its bullets: the one chosen arrives as its own notice (`effectOptionChosen`), and listing
 * every bullet would name effects that are not happening.
 */
export function noticeEffectClause(options: {
  cardId: string;
  timing: string | undefined;
  description: string | undefined;
  isInherited?: boolean;
  effectTextPart?: string;
}): string | undefined {
  const clause = playerFacingEffectClause(options);
  if (options.effectTextPart || clause === undefined) return clause;
  return printedModalBullets(clause).length >= 2 ? printedModalPreamble(clause) : clause;
}

function stripTrailingCardRequirements(text: string | undefined): string | undefined {
  return (
    text
      ?.replace(/\n\s*[＜<[]Assembly\s*[-−–]\s*\d+\s*[＞>\]][\s\S]*$/i, "")
      .replace(/(?:\s*[＜<]Arts Digivolve[＞>])+\s*$/i, "")
      .trim() || undefined
  );
}
