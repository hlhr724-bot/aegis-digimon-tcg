// Deriving keyword-driven behavior from a card's compiled effects at registration time.

import { registerDigisorption, registerDigisorptionRedirector } from "../../../cards/digisorptionDigivolve.js";
import { registerTamerOntoDigivolve } from "../../../cards/tamerOntoDigivolve.js";
import type { Action, CardDefinition, CardEffect, CompiledCard, DigivolutionRequirement } from "@aegis/shared";
import { AttackTargetScope } from "@aegis/shared/effects/ir/actions/AttackTargetScope";

type TamerBaseColor = NonNullable<DigivolutionRequirement["baseColors"]>[number];

/**
 * Build a generic EffectModule from a compiled IR record. Each CardEffect is
 * turned into one engine Effect via the matching timing builder; the builder's
 * `resolve` runs the IR actions through the interpreter. Registered exactly like
 * a hand-written module.
 *
 * Effects whose every action is unsupported still register (so the gap is
 * exercised and logged at runtime); a `RawUnparsed`-only effect resolves to a
 * single `unsupported` call.
 */
/**
 * CR §16-41-1: ＜Training＞ IS an activated [Main] ability — "By suspending this Digimon
 * during the main phase, place the top card of your deck at the bottom of this Digimon's
 * digivolution cards." The compiler emits only the keyword marker (no actions), so the
 * activated effect is synthesized at registration for every card printing the keyword
 * (EX9-016 / EX9-037 / EX9-038 ...). Appended AFTER the compiled effects so existing
 * `${cardId}/ir-<timing>-<i>` keys keep their indices.
 */
export function trainingActivatedEffect(isBreeding = false): CardEffect {
  return {
    trigger: "Main",
    description:
      "＜Training＞: by suspending this Digimon during the main phase, place the top card of your deck at the bottom of this Digimon's digivolution cards.",
    ...(isBreeding ? { isBreeding: true } : {}),
    actions: [
      {
        kind: "PlaceUnder",
        target: { filter: {}, count: 1 },
        fromDeckTop: true,
        position: "bottom",
        cost: { kind: "suspend", raw: "By suspending this Digimon" },
      } as Action,
    ],
  };
}

/**
 * ＜Engage＞ (CR §16-44): at the end of the controller's turn, this Digimon may attack.
 * Some hand-authored IR records expose the printed keyword only through root-level keyword
 * metadata (BT26-016/BT26-033), so registration must synthesize the activated effect just as
 * it does for other executable keyword markers.
 */
export function engageActivatedEffect(): CardEffect {
  return {
    trigger: "EndOfYourTurn",
    description: "＜Engage＞: at the end of this turn, this Digimon may attack.",
    actions: [
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        optional: true,
      } as Action,
    ],
  };
}

/** Printed or dynamically granted Vortex schedules an optional end-of-turn attack. */
export function vortexActivatedEffect(): CardEffect {
  return {
    trigger: "EndOfYourTurn",
    condition: { kind: "selfHasKeyword", keyword: "Vortex" },
    description: "＜Vortex＞: at the end of this turn, this Digimon may attack.",
    actions: [
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        vortex: true,
        optional: true,
        abortOnDecline: true,
      },
    ],
  };
}

/** Printed Vortex cards with an authored end-turn attack need no synthesized copy. */
export function hasExplicitVortexEndOfTurnAttack(compiled: CompiledCard): boolean {
  const rootKeywords = (compiled as CompiledCard & { keywords?: Array<{ keyword?: string }> }).keywords ?? [];
  const printsVortex =
    rootKeywords.some(({ keyword }) => keyword === "Vortex") ||
    compiled.effects.some(
      (effect) => effect.isInherited !== true && (effect.keywords ?? []).some(({ keyword }) => keyword === "Vortex"),
    );
  return (
    printsVortex &&
    compiled.effects.some(
      (effect) =>
        effect.isInherited !== true &&
        effect.trigger === "EndOfYourTurn" &&
        (effect.actions ?? []).some((action) => action.kind === "Attack"),
    )
  );
}

/** True when Engage is printed but no explicit end-of-turn attack already implements it. */
export function declaresUnimplementedEngageKeyword(compiled: CompiledCard): boolean {
  const rootKeywords = (compiled as CompiledCard & { keywords?: Array<{ keyword?: string }> }).keywords ?? [];
  const printed =
    rootKeywords.some(({ keyword }) => keyword === "Engage") ||
    compiled.effects.some(
      (effect) => effect.isInherited !== true && (effect.keywords ?? []).some(({ keyword }) => keyword === "Engage"),
    );
  if (!printed) return false;
  return !compiled.effects.some(
    (effect) =>
      effect.isInherited !== true &&
      effect.trigger === "EndOfYourTurn" &&
      (effect.actions ?? []).some(({ kind }) => kind === "Attack"),
  );
}

/**
 * ＜Overclock ([Trait])＞ (CR §16-34): at the end of your turn, by deleting 1 of your Tokens
 * or 1 of your other [Trait] Digimon, this Digimon attacks a player without suspending. Most
 * cards compile the keyword to only a marker (a `GainKeyword` action or a `keywords` entry, no
 * actions), so the activated end-of-turn attack is synthesized here — mirroring the ＜Training＞
 * synthesis above. The delete cost's `allowTokens` lets a Token satisfy the trait gate
 * (source `IsToken || ContainsTraits(trait)`). Optional with `abortOnDecline` matches the
 * source `canNoSelect` (the player may decline to overclock).
 */
export function overclockActivatedEffect(trait: string): CardEffect {
  return {
    trigger: "EndOfYourTurn",
    description: `＜Overclock [${trait}]＞: at the end of this turn, by deleting 1 of your Tokens or other [${trait}] trait Digimon, this Digimon attacks a player without suspending.`,
    actions: [
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        attackTargetScope: AttackTargetScope.PLAYER.value,
        attackMechanic: "Overclock",
        drainTimingWindowDuringAttack: true,
        withoutSuspending: true,
        optional: true,
        abortOnDecline: true,
        cost: {
          kind: "deleteOwn",
          target: {
            filter: {
              controller: "mine",
              excludeSelf: true,
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: [trait], match: "trait" }],
              allowTokens: true,
            },
            count: 1,
          },
          mechanic: "Overclock",
          raw: `by deleting 1 of your Tokens or other [${trait}] trait Digimon`,
        },
      } as Action,
    ],
  };
}

/**
 * ＜Execute＞ (CR §16-38): "At the end of your turn, the Digimon with this keyword effect may
 * attack. At the end of the attack, this Digimon is deleted. This effect also allows for
 * attacking an opponent's unsuspended Digimon." Compiles to a bare keyword marker (no actions,
 * BT20-072), so the end-of-turn attack is synthesized here, mirroring
 * ＜Training＞/＜Overclock＞'s synthesis above:
 *   1. Grant self "may attack unsuspended" for JUST this attack (`forThisAttack` ->
 *      UntilEndAttack) — the keyword's own "also allows attacking an opponent's unsuspended
 *      Digimon" clause, read by combat legality's `canAttackUnsuspended`.
 *   2. An optional self-attack tagged with the Execute mechanic. Declining means no attack and
 *      therefore no end-of-attack deletion.
 *
 */
export function executeActivatedEffect(): CardEffect {
  return {
    trigger: "EndOfYourTurn",
    description:
      "＜Execute＞: at the end of this turn, this Digimon may attack (including an unsuspended opponent's Digimon). At the end of the attack, this Digimon is deleted.",
    // A Digimon that can't attack (already suspended, or a "can't attack" effect) has no attack to
    // offer, so the keyword doesn't trigger instead of asking for an attack that can't happen.
    condition: { kind: "selfCanDeclareAttack" },
    actions: [
      {
        kind: "GrantCanAttackUnsuspended",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        duration: "forThisAttack",
      } as Action,
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        attackMechanic: "Execute",
        drainTimingWindowDuringAttack: true,
        optional: true,
        abortOnDecline: true,
      } as Action,
    ],
  };
}

/**
 * True when a single "Counter"-trigger `CardEffect` entry is only the ＜Blast Digivolve＞/
 * ＜Blast DNA Digivolve＞ keyword marker, NOT a real, resolvable [Counter] effect — mirrors
 * ＜Execute＞'s two compile shapes below (`declaresExecuteKeyword`): either a printed-keyword
 * `keywords` entry with empty `actions` (BT14-014/AD1-005/BT19-050), or a self-targeted
 * `GainKeyword` action granting the keyword instead of leaving `actions` empty (EX5-053's
 * hand-written module, whose Counter entry has `keywords: []` but a real `GainKeyword`
 * action). Used by `timingForTrigger`'s "Counter" case to keep these OFF the real §11-3
 * Counter Timing window.
 */
export function isBlastDigivolveMarker(effect: CardEffect): boolean {
  const isBlastKeyword = (name: string | undefined) => name === "BlastDigivolve" || name === "BlastDNADigivolve";
  if ((effect.keywords ?? []).some((kw) => isBlastKeyword(kw.keyword))) return true;
  return (effect.actions ?? []).some(
    (a) =>
      a.kind === "GainKeyword" &&
      isBlastKeyword((a as { keyword?: { keyword?: string } }).keyword?.keyword) &&
      ((a as { target?: { isSelf?: boolean } }).target?.isSelf ?? false),
  );
}

/**
 * True when a card's compiled IR declares the ＜Execute＞ keyword — as a printed-keyword
 * marker or a self-targeted `GainKeyword` action (mirrors ＜Training＞'s two compile shapes
 * above) — AND does not already carry an explicit `EndOfYourTurn` attack (a hand-authored
 * override; synthesizing again would declare a second attack).
 */
export function declaresExecuteKeyword(compiled: CompiledCard): boolean {
  const rootKeywords = (compiled as CompiledCard & { keywords?: Array<{ keyword?: string }> }).keywords ?? [];
  const declares =
    rootKeywords.some(({ keyword }) => keyword === "Execute") ||
    compiled.effects.some(
      (e) =>
        e.isInherited !== true &&
        ((e.keywords ?? []).some((k) => k.keyword === "Execute") ||
          (e.actions ?? []).some(
            (a) =>
              a.kind === "GainKeyword" &&
              (a as { keyword?: { keyword?: string } }).keyword?.keyword === "Execute" &&
              ((a as { target?: { isSelf?: boolean } }).target?.isSelf ?? false),
          )),
    );
  if (!declares) return false;
  const hasExplicitAttack = compiled.effects.some(
    (e) => e.trigger === "EndOfYourTurn" && (e.actions ?? []).some((a) => a.kind === "Attack"),
  );
  return !hasExplicitAttack;
}

/** The trait named in a card's ＜Overclock ([X] Trait)＞ marker, from the keyword or printed text. */
function overclockTraitFrom(compiled: CompiledCard, definition: CardDefinition | undefined): string | undefined {
  const parse = (text: string | undefined): string | undefined =>
    text?.match(/＜Overclock\s*\(\[([^\]]+)\]\s*[Tt]rait\)/)?.[1]?.trim();
  for (const effect of compiled.effects) {
    for (const kw of effect.keywords ?? []) {
      if (kw.keyword !== "Overclock") continue;
      const fromTraitFilter = kw.traitFilter?.[0];
      if (fromTraitFilter) return fromTraitFilter;
      const qualifier = (kw as { qualifier?: string }).qualifier;
      if (qualifier) return qualifier;
      const fromRaw = parse(kw.raw);
      if (fromRaw) return fromRaw;
    }
    for (const action of effect.actions ?? []) {
      if (action.kind !== "GainKeyword") continue;
      const kw = (action as { keyword?: { keyword?: string; qualifier?: string; raw?: string } }).keyword;
      if (kw?.keyword !== "Overclock") continue;
      if (kw.qualifier) return kw.qualifier;
      const fromRaw = parse(kw.raw);
      if (fromRaw) return fromRaw;
    }
  }
  return parse(definition?.effectText);
}

/**
 * The delete-cost trait for a card whose ＜Overclock＞ end-of-turn attack must be synthesized,
 * or undefined when nothing should be synthesized: the card must declare the keyword (as a
 * self-targeted `GainKeyword` action or a `keywords` marker) AND not already carry the explicit
 * `EndOfYourTurn` attack in its IR (EX7-030 / BT22-036 hand-author it — synthesizing again would
 * declare a second attack).
 */
export function synthesizedOverclockTrait(
  compiled: CompiledCard,
  definition: CardDefinition | undefined,
): string | undefined {
  const declaresOverclock = compiled.effects.some(
    (e) =>
      e.isInherited !== true &&
      ((e.keywords ?? []).some((k) => k.keyword === "Overclock") ||
        (e.actions ?? []).some(
          (a) =>
            a.kind === "GainKeyword" &&
            (a as { keyword?: { keyword?: string } }).keyword?.keyword === "Overclock" &&
            ((a as { target?: { isSelf?: boolean } }).target?.isSelf ?? false),
        )),
  );
  if (!declaresOverclock) return undefined;
  const hasExplicitAttack = compiled.effects.some(
    (e) => e.trigger === "EndOfYourTurn" && (e.actions ?? []).some((a) => a.kind === "Attack"),
  );
  if (hasExplicitAttack) return undefined;
  return overclockTraitFrom(compiled, definition);
}

/**
 * Detect the "digivolve from hand onto a <color> Tamer as if it is a level N Digimon"
 * mechanic in a card's compiled IR and record it in the side registry. Current typed IR
 * carries the Tamer filter in a `Digivolve` action's `target.filter`; legacy records may use
 * `TamerOntoDigivolve` with `onto`. A printed fixed cost that differs from the level-N evo
 * cost is carried by `costOverride`.
 */
export function registerTamerOntoFromEffects(cardId: string, effects: readonly CardEffect[]): void {
  for (const effect of effects) {
    if (effect.trigger !== "Static") continue;
    for (const action of effect.actions ?? []) {
      if ((action.kind !== "TamerOntoDigivolve" && action.kind !== "Digivolve") || typeof action.asLevel !== "number") {
        continue;
      }
      const targetFilter = action.kind === "Digivolve" ? action.target?.filter : undefined;
      const onto = action.onto as
        | {
            filter?: { kind?: unknown; colors?: readonly TamerBaseColor[] };
            kind?: unknown;
            colors?: readonly TamerBaseColor[];
          }
        | undefined;
      const ontoFilter = onto?.filter ?? onto;
      const tamerFilter =
        Array.isArray(targetFilter?.kind) && targetFilter.kind.includes("Tamer") ? targetFilter : ontoFilter;
      const tamerKind = tamerFilter?.kind;
      if (Array.isArray(tamerKind) && tamerKind.includes("Tamer")) {
        registerTamerOntoDigivolve(
          cardId,
          action.asLevel,
          tamerFilter?.colors,
          action.kind === "Digivolve" ? action.costOverride : undefined,
        );
        return;
      }
    }
  }
}

/**
 * Cards whose `wouldBePlayed` Replacement carries an `AllowDigiXrosMaterialsFromTrash`
 * in `additionalEffects` — meaning when played via DigiXros after paying the cost, the
 * player's trash is also a valid material source. Populated by `registerIrCard`.
 */
const ALLOW_DIGIXROS_FROM_TRASH = new Set<string>();
const EXTRA_DIGIXROS_MATERIALS = new Set<string>();

/** True when a card's IR declares that DigiXros materials may come from the player's trash. */
export function allowsDigiXrosMaterialsFromTrash(cardId: string): boolean {
  return ALLOW_DIGIXROS_FROM_TRASH.has(cardId) || EXTRA_DIGIXROS_MATERIALS.has(cardId);
}

export function allowsExtraDigiXrosMaterials(cardId: string): boolean {
  return EXTRA_DIGIXROS_MATERIALS.has(cardId);
}

export function detectAllowDigiXrosMaterialsFromTrash(cardId: string, effects: readonly CardEffect[]): void {
  for (const effect of effects) {
    for (const action of effect.actions ?? []) {
      if (action.kind !== "Replacement" || action.event !== "wouldBePlayed") continue;
      const extras = (action as { additionalEffects?: Array<{ kind: string }> }).additionalEffects;
      const hasExtra = extras?.some((e) => e.kind === "DigiXrosExtraMaterial");
      if (hasExtra) EXTRA_DIGIXROS_MATERIALS.add(cardId);
      if (extras?.some((e) => e.kind === "AllowDigiXrosMaterialsFromTrash") || hasExtra) {
        ALLOW_DIGIXROS_FROM_TRASH.add(cardId);
        return;
      }
      if (action.actions?.some((e) => (e as { kind?: string }).kind === "DigiXrosExtraMaterial")) {
        EXTRA_DIGIXROS_MATERIALS.add(cardId);
        ALLOW_DIGIXROS_FROM_TRASH.add(cardId);
        return;
      }
    }
  }
}

/**
 * Detect the ＜Digisorption -N＞ keyword in a card's compiled IR and record the amount in the
 * side registry (see {@link registerDigisorption}). The keyword compiles to a `wouldDigivolve`
 * `reduceCost` Replacement carrying a `suspend` cost (BT2-050 / BT3-054 / BT3-056). The amount
 * is the Replacement's `amount` (the cost reduction). This is the SOURCE OF TRUTH the digivolve
 * cost path reads, since the card being digivolved into is in hand (its Static effects are not
 * active in the live ledger).
 */
export function registerDigisorptionFromEffects(cardId: string, effects: readonly CardEffect[]): void {
  for (const effect of effects) {
    for (const action of effect.actions ?? []) {
      if (
        action.kind === "Replacement" &&
        action.event === "wouldDigivolve" &&
        action.mode === "reduceCost" &&
        action.cost?.kind === "suspend" &&
        typeof action.amount === "number"
      ) {
        registerDigisorption(cardId, action.amount);
        return;
      }
    }
  }
}

/** Register a field-only Digisorption opponent-suspend redirect declared in typed IR. */
export function registerDigisorptionRedirectorFromEffects(cardId: string, effects: readonly CardEffect[]): void {
  if (
    effects.some((effect) =>
      (effect.actions ?? []).some((action) => action.kind === "GrantStatic" && action.grant === "digisorptionRedirect"),
    )
  ) {
    registerDigisorptionRedirector(cardId);
  }
}

/**
 * The compiled Static Replacement is metadata for an intrinsic "digivolve INTO this card from
 * hand" keyword. It must feed the side registry above, but must never stay live on the resulting
 * battle-area Digimon and discount a later evolution from that Digimon.
 */
export function isIntrinsicDigisorptionMarker(effect: CardEffect): boolean {
  return (
    effect.trigger === "Static" &&
    (effect.actions ?? []).length > 0 &&
    (effect.actions ?? []).every(
      (action) =>
        action.kind === "Replacement" &&
        action.event === "wouldDigivolve" &&
        action.mode === "reduceCost" &&
        action.cost?.kind === "suspend" &&
        (effect.keywords ?? []).some((keyword) => keyword.keyword === "Digisorption"),
    )
  );
}

/** Hand keyword registries: ordinary Blast and Blast DNA have distinct material procedures. */
const BLAST_DIGIVOLVE_CARDS = new Set<string>();
const BLAST_DNA_DIGIVOLVE_CARDS = new Set<string>();

export function hasBlastDigivolveKeyword(cardId: string): boolean {
  return BLAST_DIGIVOLVE_CARDS.has(cardId);
}

export function hasBlastDnaDigivolveKeyword(cardId: string): boolean {
  return BLAST_DNA_DIGIVOLVE_CARDS.has(cardId);
}

export function registerBlastDigivolveFromEffects(cardId: string, effects: readonly CardEffect[]): void {
  BLAST_DIGIVOLVE_CARDS.delete(cardId);
  BLAST_DNA_DIGIVOLVE_CARDS.delete(cardId);
  for (const effect of effects) {
    if (effect.trigger !== "Counter") continue;
    const keywords = [
      ...(effect.keywords ?? []).map(({ keyword }) => keyword),
      ...(effect.actions ?? []).flatMap((action) =>
        action.kind === "GainKeyword" && ((action as { target?: { isSelf?: boolean } }).target?.isSelf ?? false)
          ? [(action as { keyword?: { keyword?: string } }).keyword?.keyword]
          : [],
      ),
    ];
    if (keywords.includes("BlastDigivolve")) BLAST_DIGIVOLVE_CARDS.add(cardId);
    if (keywords.includes("BlastDNADigivolve")) BLAST_DNA_DIGIVOLVE_CARDS.add(cardId);
  }
}
