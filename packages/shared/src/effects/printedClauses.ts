import type { CardDefinition } from "../cards/types.js";
import type { CardEffect } from "./ir/card.js";
import type { SubTriggerEvent } from "./ir/actions/subTrigger.js";
import type { EffectTrigger } from "./ir/triggers.js";

/**
 * Match compiled IR back to the printed clause it came from, so a decision or a log can
 * show the player the words on the card instead of an engine summary. A card can print
 * several clauses under one timing bracket (EX13-023 prints two [When Digivolving]
 * lines), so the trigger alone is not enough: the `raw` fragments the IR keeps are used
 * to tell those clauses apart, and a watcher's event phrase is the last resort.
 */

/** The printed bracket for each trigger that is spelled as a bracket on the card. */
export const PRINTED_TIMING_LABELS: Readonly<Partial<Record<EffectTrigger, string>>> = {
  OnPlay: "On Play",
  WhenDigivolving: "When Digivolving",
  WhenAttacking: "When Attacking",
  OnDeletion: "On Deletion",
  EndOfAttack: "End of Attack",
  AllTurns: "All Turns",
  YourTurn: "Your Turn",
  OpponentsTurn: "Opponent's Turn",
  StartOfYourTurn: "Start of Your Turn",
  EndOfYourTurn: "End of Your Turn",
  StartOfOpponentsTurn: "Start of Opponent's Turn",
  EndOfOpponentsTurn: "End of Opponent's Turn",
  StartOfYourMainPhase: "Start of Your Main Phase",
  StartOfOpponentsMainPhase: "Start of Opponent's Main Phase",
  EndOfAllTurns: "End of All Turns",
  Main: "Main",
  Security: "Security",
  Counter: "Counter",
  Hand: "Hand",
  Trash: "Trash",
  Breeding: "Breeding",
  WhenMoving: "When Moving",
  WhenLinking: "When Linking",
  Rule: "Rule",
};

const CONTINUOUS_LABELS = [
  PRINTED_TIMING_LABELS.AllTurns!,
  PRINTED_TIMING_LABELS.YourTurn!,
  PRINTED_TIMING_LABELS.OpponentsTurn!,
];

/** Triggers whose clauses hold watchers ("When one of your Digimon becomes suspended, ..."). */
export const CONTINUOUS_TRIGGERS: ReadonlySet<EffectTrigger> = new Set<EffectTrigger>([
  "Static",
  "AllTurns",
  "YourTurn",
  "OpponentsTurn",
]);

/**
 * Only events whose printed wording is unmistakable. A phrase that could describe two
 * different events would pick the wrong clause, which is worse than showing the whole box.
 */
const WATCHER_EVENT_PHRASES: Readonly<Partial<Record<SubTriggerEvent, RegExp>>> = {
  whenSuspended: /\b(?:becomes?|is|are|would be) suspended\b|\bwhen\b[^.,]*\bsuspends?\b/i,
  whenUnsuspended: /\b(?:becomes?|is|are|would be) unsuspended\b|\bwhen\b[^.,]*\bunsuspends?\b/i,
  whenAttacking: /\bwhen\b[^.]*\battacks?\b/i,
  whenOpponentAttacks: /\bwhen\b[^.]*opponent'?s?\b[^.]*\battacks?\b/i,
  whenBlocked: /\bblocked\b/i,
  whenBlockerActivated: /＜Blocker＞/,
  whenDeletesInBattle: /\bdeletes?\b[^.]*\bin battle\b/i,
  onDeletionOf: /\b(?:is|are|would be|becomes?) deleted\b/i,
  whenPlayed: /\b(?:is|are|would be) played\b|\bwhen (?:you|your opponent) (?:would )?plays?\b/i,
  whenHatch: /\bhatch/i,
  whenOneOfYoursDigivolves: /\bdigivolves?\b/i,
  whenAnyDigivolves: /\bdigivolves?\b/i,
  whenSecurityRemoved: /\bsecurity\b[^.]*\bremoved\b/i,
  whenEffectRemovesFromSecurity: /\bsecurity\b[^.]*\bremoved\b/i,
  whenCardTrashedFromSecurity: /\btrashed from\b[^.]*\bsecurity\b/i,
  whenEffectTrashesFromSecurity: /\btrashed from\b[^.]*\bsecurity\b/i,
  whenAddSecurity: /\badded to\b[^.]*\bsecurity\b/i,
  whenCardAddedToSecurity: /\badded to\b[^.]*\bsecurity\b/i,
  whenHandTrashed: /\btrashed from\b[^.]*\bhand\b/i,
  whenHandCardTrashed: /\btrashed from\b[^.]*\bhand\b/i,
  whenTrashedFromHand: /\btrashed from\b[^.]*\bhand\b/i,
  whenLinked: /\blink(?:s|ed)?\b/i,
  whenLeavesPlay: /\bleaves? the battle area\b/i,
  whenMovedFromBreeding: /\bbreeding area\b/i,
  whenOpponentMovedFromBreeding: /\bbreeding area\b/i,
  whenOpponentDraws: /\bdraws?\b/i,
  whenBattleWon: /\bwins? (?:a|the) battle\b/i,
  whenDigivolutionTrashed: /\bdigivolution cards?\b[^.]*\btrashed\b/i,
  whenTrashedFromDigivolutionCards: /\btrashed from\b[^.]*\bdigivolution cards?\b/i,
  onDigivolutionCardDiscarded: /\bdigivolution cards?\b[^.]*\btrashed\b/i,
  onDigivolutionCardsDiscardedBatch: /\bdigivolution cards?\b[^.]*\btrashed\b/i,
  whenDigimonReturnsToHand: /\breturned to\b[^.]*\bhand\b/i,
  whenEffectAddsToHand: /\badded to\b[^.]*\bhand\b/i,
  whenEffectAddsToDeck: /\badded to\b[^.]*\bdeck\b/i,
  whenCardPlacedInDigivolution: /\bplaced\b[^.]*\bdigivolution cards?\b/i,
  endOfTurn: /\bend of\b[^.]*\bturn\b/i,
  startOfYourMainPhase: /\bstart of\b[^.]*\bmain phase\b/i,
};

/** Shortest `raw` fragment worth matching; anything shorter recurs across unrelated clauses. */
const MIN_HINT_LENGTH = 12;

export interface PrintedClause {
  labels: ReadonlySet<string>;
  text: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * A regex source matching a timing label as printed. Some texts use a typographic apostrophe
 * ("[End of Opponent’s Turn]", BT13-103), so either apostrophe matches.
 */
export const printedTimingLabelPattern = (label: string) => escapeRegExp(label).replace(/'/g, "['’]");
/** The canonical spelling of a label matched by {@link printedTimingLabelPattern}. */
export const canonicalTimingLabel = (printed: string) => printed.replace(/’/g, "'");
const canonicalLabel = canonicalTimingLabel;
const timingLabelsPattern = Object.values(PRINTED_TIMING_LABELS).map(printedTimingLabelPattern).join("|");
const timingBoundary = () => new RegExp(`\\[(${timingLabelsPattern})\\]`, "g");

/** A granted effect's quoted timing belongs to the enclosing clause, not a new one. */
export function isInsidePrintedQuote(text: string, index: number): boolean {
  for (const match of text.matchAll(/"[^"]*"|“[^”]*”/g)) {
    if (match.index < index && index < match.index + match[0].length) return true;
  }
  return false;
}

const timingReferenceTail = new RegExp(
  `^\\s*(?:(?:or|and|,|/)\\s*\\[(?:${timingLabelsPattern})\\]\\s*)*effects?\\b`,
  "i",
);

/** A timing followed by "effect(s)", including "[On Play] or [When Digivolving] effect", is a reference. */
export function isPrintedTimingReference(text: string, bracketEnd: number): boolean {
  return timingReferenceTail.test(text.slice(bracketEnd));
}

/**
 * Split a printed text box into its clauses: each starts at a run of timing brackets
 * separated only by whitespace ("[On Play] [When Digivolving] ...") and runs to the next
 * such run. Text before the first bracket (keywords, digivolve costs) is not a clause.
 */
export function splitPrintedClauses(text: string | undefined): PrintedClause[] {
  if (!text) return [];
  const marks: { label: string; index: number; end: number }[] = [];
  const boundary = timingBoundary();
  for (let match = boundary.exec(text); match !== null; match = boundary.exec(text)) {
    if (isInsidePrintedQuote(text, match.index)) continue;
    // "activate 1 of that Digimon's [When Digivolving] effects" mentions a timing mid-sentence.
    if (isPrintedTimingReference(text, match.index + match[0].length)) continue;
    marks.push({ label: canonicalLabel(match[1] ?? ""), index: match.index, end: match.index + match[0].length });
  }
  const groups: { labels: Set<string>; start: number }[] = [];
  marks.forEach((mark, index) => {
    const previous = groups[groups.length - 1];
    const gap = index > 0 ? text.slice(marks[index - 1]!.end, mark.index) : "|";
    if (previous !== undefined && gap.trim() === "") previous.labels.add(mark.label);
    else groups.push({ labels: new Set([mark.label]), start: mark.index });
  });
  return groups.map((group, index) => ({
    labels: group.labels,
    text: text.slice(group.start, groups[index + 1]?.start ?? text.length).trim(),
  }));
}

/**
 * The bullets ("・...") a printed clause lists, in printed order: the options of an "activate
 * 1 of the effects below" choice. A bullet ends at the next bullet or line break.
 */
export function printedModalBullets(clauseText: string): string[] {
  const [, ...bullets] = clauseText.split("・");
  return bullets.map((bullet) => bullet.split("\n")[0]!.trim()).filter((bullet) => bullet.length > 0);
}

/** The text a printed clause prints before its first bullet ("[When Digivolving] Activate 1 of the effects below:"). */
export function printedModalPreamble(clauseText: string): string {
  return clauseText.split("・")[0]!.trim();
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

/** Every `raw` fragment the IR kept for this node, at any depth. */
export function rawHints(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const entry of node) rawHints(entry, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "raw" && typeof value === "string" && value.trim().length >= MIN_HINT_LENGTH) out.push(value);
    else rawHints(value, out);
  }
  return out;
}

function printedBoxes(
  definition: CardDefinition,
  { inherited, linked = false, trigger }: { inherited: boolean; linked?: boolean; trigger: EffectTrigger },
) {
  if (linked) return [definition.linkEffect];
  if (inherited) return [definition.inheritedEffectText];
  if (trigger === "Security") return [definition.securityEffectText, definition.effectText];
  if (trigger === "Main") return [definition.effectText, definition.optionEffect];
  return [definition.effectText];
}

/**
 * The single clause the hints point at, or undefined when they point at none or several. A
 * lone candidate is accepted without evidence unless `requireHints` is set.
 */
function clauseByHints(
  clauses: readonly PrintedClause[],
  hints: readonly string[],
  requireHints = false,
): PrintedClause | undefined {
  if (clauses.length === 1 && !requireHints) return clauses[0];
  if (clauses.length === 0 || hints.length === 0) return undefined;
  const scores = clauses.map((clause) => {
    const text = normalize(clause.text);
    return hints.filter((hint) => text.includes(normalize(hint))).length;
  });
  const best = Math.max(...scores);
  if (best === 0 || scores.filter((score) => score === best).length !== 1) return undefined;
  return clauses[scores.indexOf(best)];
}

/** Every printed clause opened by the trigger's bracket, in printed order. */
export function printedClausesForTrigger({
  definition,
  trigger,
  inherited,
  linked = false,
}: {
  definition: CardDefinition;
  trigger: EffectTrigger;
  inherited: boolean;
  linked?: boolean;
}): string[] {
  const label = PRINTED_TIMING_LABELS[trigger];
  if (label === undefined) return [];
  return printedBoxes(definition, { inherited, linked, trigger })
    .flatMap(splitPrintedClauses)
    .filter((clause) => clause.labels.has(label))
    .map((clause) => clause.text);
}

/**
 * The printed clause a compiled effect came from, when the card text makes that unambiguous.
 * `requireHints` is for an effect that shares its trigger with another compiled effect of the
 * same card: one of them may be synthesized (a ＜Delay＞ body registered as a second [Main]),
 * so a lone printed clause is claimed only by the effect whose raw fragments it contains.
 */
export function printedClauseForEffect({
  definition,
  effect,
  requireHints = false,
}: {
  definition: CardDefinition;
  effect: CardEffect;
  requireHints?: boolean;
}): string | undefined {
  const label = PRINTED_TIMING_LABELS[effect.trigger];
  if (label === undefined) return undefined;
  const clauses = printedBoxes(definition, {
    inherited: effect.isInherited === true,
    linked: effect.isLinked === true,
    trigger: effect.trigger,
  })
    .flatMap(splitPrintedClauses)
    .filter((clause) => clause.labels.has(label));
  return clauseByHints(clauses, rawHints(effect.actions), requireHints)?.text;
}

/**
 * The printed continuous clause ("[All Turns] When ..., ...") a watcher implements. The
 * enclosing effect's bracket narrows the candidates; a synthetic Static effect may stand
 * for any of the three continuous brackets.
 */
export function printedClauseForWatcher({
  definition,
  effect,
  event,
  action,
}: {
  definition: CardDefinition;
  effect: CardEffect;
  event: SubTriggerEvent;
  action: unknown;
}): string | undefined {
  if (!CONTINUOUS_TRIGGERS.has(effect.trigger)) return undefined;
  const label = PRINTED_TIMING_LABELS[effect.trigger];
  const labels = label === undefined ? CONTINUOUS_LABELS : [label];
  const clauses = printedBoxes(definition, {
    inherited: effect.isInherited === true,
    linked: effect.isLinked === true,
    trigger: effect.trigger,
  })
    .flatMap(splitPrintedClauses)
    .filter((clause) => labels.some((candidate) => clause.labels.has(candidate)));
  const byHints = clauseByHints(clauses, rawHints(action));
  if (byHints !== undefined) return byHints.text;
  const phrase = WATCHER_EVENT_PHRASES[event];
  if (phrase === undefined) return undefined;
  const matching = clauses.filter((clause) => phrase.test(clause.text));
  return matching.length === 1 ? matching[0]!.text : undefined;
}
