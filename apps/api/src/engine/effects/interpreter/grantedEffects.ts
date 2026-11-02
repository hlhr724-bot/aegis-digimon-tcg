// The library of effects a card can grant by name.

import type { CardSource } from "../CardSource.js";
import type { Effect } from "../Effect.js";
import { describeEffect } from "./describe.js";
import { runEffect } from "./dispatch.js";
import { builderForTrigger, canActivateEffect, timingsForTrigger, turnOwnerGuard } from "./effect.js";
import { executeActivatedEffect } from "./registration/keywords.js";
import { EffectTiming } from "@aegis/shared";
import type { Action, CardEffect } from "@aegis/shared";

// ---------------------------------------------------------------------------
// Granted named-effect library (GrantStatic grant:"effects" with tokens)
// ---------------------------------------------------------------------------

/**
 * The built-in effects a `grantCustomEffect` token confers. Each token resolves to an IR
 * `CardEffect`, compiled on demand to a real Effect anchored on the GRANTED permanent (the
 * recipient of the grant), so the granted ability fires through the same EffectTiming window
 * and trigger gate as a printed effect — never a parallel/inert path.
 *
 * A token normally resolves to one `CardEffect`; a keyword such as Execute can resolve to
 * multiple timing effects that share one idempotent ledger entry. Every token actually
 * installed by a `ctx.fx.grantCustomEffect` call site (audited across
 * `apps/api/src/cards/**`) MUST have an entry here — see `grantedTokenEffectsForTiming`'s
 * loud failure for an unknown token, added alongside this library so a new call site with a
 * typo'd or unregistered token is a crash, not a silent no-op (this class of bug: BT5-091's
 * "[When Attacking] Lose 1 memory." token sat here unconsumed for the granted effect's whole
 * lifetime before this fix).
 *
 * `OnDeletionDeleteLowest` — RB1-030's "[On Deletion] Delete 1 of your opponent's Digimon with
 * the lowest level" (documented behavior: an OnDestroyedAnyone rule implementation whose target is
 * `IsPermanentExistsOnOpponentBattleAreaDigimon` ∧ `IsMinLevel(enemy)`). The Delete target's
 * `superlative:"lowestLevel"` narrows the opponent's battle-area Digimon pool to minimum printed
 * level (ties: all extrema), matching IsMinLevel.
 *
 * `OnDeletionLose1Memory` — a generic "[On Deletion] Lose 1 memory" grant (not currently
 * installed by any card; kept as a library primitive other future ports can reuse).
 *
 * `[When Attacking] Lose 1 memory.` — BT5-091 Takumi Aiba's "[All Turns] all level 3 Digimon
 * gain '[When Attacking] Lose 1 memory'" (KB Q1369/Q1370: fires on the granted Digimon's own
 * attack; two copies of the granting Tamer are separate activations). The literal printed-text
 * string is the token (BT5-091 has no shorter semantic name for it).
 *
 * `OnDeletionPlaySelfNoOnPlay` — BT3-109's "[On Deletion] Play back without cost, [On Play]
 * effects don't activate" grant (a Black Option's [Main]: 1 of your Digimon gains this for the
 * turn). `suppressOnPlayEffects` skips the played permanent's own [On Play] window — this is
 * the ONE library entry that needs it (the others playing themselves back, below, do NOT
 * suppress [On Play]).
 *
 * `OnPlayBlitzIfHasDigivolutionCard` — BT9-102's granted "[On Play] If this Digimon has a
 * digivolution card, ＜Blitz＞" (printed text granted to Digimon already on the field; per
 * Comprehensive Rules §16-16 <Blitz> lets the granted Digimon attack while the opponent has
 * memory — a keyword grant `[On Play]`-timed and re-evaluated should the granted Digimon later
 * re-enter as a new card this turn, e.g. via a bounce-and-replay).
 *
 * `OnDeletionPlaySelf` — EX4-059 Jijimon's "[On Deletion] You may play this card without paying
 * the cost" grant ([When Digivolving]: this Digimon and 1 of your level <=5 Digimon gain it
 * until opponent's turn end). `optional: true` — "you MAY play".
 *
 * The following four entries are keyed by the LITERAL printed granted-effect text (the RB1-030
 * "quotedEffect" convention, not a semantic slug) because the `GrantAuraToOpponents` malformed-
 * shape route above (Q1f) supplies `action.effectText` verbatim as the token, and that text is
 * the only thing the compiler recovers deterministically for these clauses:
 *
 * `"[On Deletion] Lose 1 memory."` — BT15-068, BT20-065, BT9-014's granted "1 of your
 * opponent's Digimon gains '[On Deletion] Lose 1 memory.'". Same body as the semantic
 * `OnDeletionLose1Memory` entry above; kept as a separate key rather than reused because the
 * two entries are addressed by different call sites (a hand-authored module choosing the
 * semantic name vs. the generic malformed-shape route echoing the printed text back).
 *
 * `"[On Deletion] Lose 2 memory"` — BT6-102's "1 of your opponent's Digimon gains '[On
 * Deletion] Lose 2 memory' until the end of their next turn."
 *
 * `"[On Deletion] Gain 3 memory."` — BT11-106's "1 of your Digimon ... gains '[On Deletion]
 * Gain 3 memory.'" (granted to the CONTROLLER's own Digimon, not the opponent's — the amount
 * is positive because the grantee's own owner gains memory on its own deletion).
 *
 * Q1f second pass — more literal-printed-text entries, same convention (every "your"/"this
 * Digimon" in the granted text resolves relative to the GRANTED permanent's own owner/self,
 * never the granter):
 *
 * `"[On Deletion] Trash the top card of your security stack."` — BT12-105/BT15-095's granted
 * "1 of your opponent's Digimon gains ...". `SecurityManipulation`'s `controller` defaults to
 * `ctx.source.ownerSeat` when omitted (`runSecurityManipulation`: `seat = action.controller ===
 * "opponent" ? opp : mine`), so leaving it unset makes the GRANTEE trash their own top security
 * — matching KB Q2241 (deleting the grantee mid-attack, before its own security check, can drop
 * its security count to 0 and win the game).
 *
 * `"[When Attacking] Lose 2 memory"` — EX1-068/EX4-018's granted "1 of your opponent's Digimon
 * gains ...". Same body as `"[When Attacking] Lose 1 memory."` above at a different magnitude;
 * KB Q3255 confirms the OPPONENT (the grantee's own controller) loses the memory, matching
 * `GainMemory`'s seatless form resolving via `ctx.source.ownerSeat`.
 *
 * `"[On Deletion] Trash 1 card in your hand."` — EX8-059's granted "1 of your opponent's Digimon
 * gains ...". "your hand" = the grantee's own hand (self-referential), mirroring the card's own
 * unrelated `[When Attacking]` `Trash` clause shape (`{controller:"mine", zone:"hand"}`).
 *
 * `"[When Attacking] Trash the bottom digivolution card of this Digimon."` — BT8-031's granted
 * "All of your opponent's Digimon gain ..." (the outer `[Opponent's Turn]` wrapper only gates
 * WHEN the grant is (re-)installed each continuous recompute — idempotent — not the granted
 * body's own timing, which is the ordinary discrete `WhenAttacking` window).
 *
 * `"[End of Attack] Delete this Digimon."` — EX7-058/EX6-048's granted "1 of your opponent's
 * Digimon gains ...". `EndOfAttack` maps to the discrete `EffectTiming.OnEndAttack` window
 * (`timingForTrigger`), so this reaches the grantee exactly once, at that Digimon's own
 * attack's end.
 *
 * `"[Start of Your Main Phase] Attack with this Digimon."` and `"[Start of Your Main Phase]
 * This Digimon attacks."` — two literal printed phrasings of the same forced-self-attack grant
 * (BT12-107; BT16-058/BT18-099/EX6-042/ST15-16/BT23-032/P-183), kept as separate keys per the
 * literal-text convention. `StartOfYourMainPhase` maps to the discrete `EffectTiming
 * .OnStartMainPhase` window (fired by `fireTiming` for every candidate instance, `turnOwnerGuard`
 * gating it to the GRANTEE's own main phase) — distinct from, but sitting alongside, the System B
 * `startOfYourMainPhase` SubTrigger bus `fireTiming` ALSO fires at the same physical point
 * (GameEngine.ts:1263) for the unrelated hand-installed-SubTrigger encoding BT12-065 uses; either
 * mechanism reaches the same instant, and the discrete library route needs no SubTrigger install
 * at all.
 */
export const GRANTED_EFFECT_LIBRARY: Record<string, CardEffect | readonly CardEffect[]> = {
  "Execute deletion": {
    trigger: "EndOfAttack",
    description: "＜Execute＞: at the end of the attack, this Digimon is deleted.",
    condition: {
      kind: "allOf",
      conditions: [{ kind: "triggerAttackBy", keyword: "Execute" }, { kind: "triggerAttackerIsSelf" }],
    },
    actions: [{ kind: "Delete", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } }],
  },
  Execute: [
    {
      ...executeActivatedEffect(),
      condition: {
        kind: "allOf",
        conditions: [{ kind: "selfHasKeyword", keyword: "Execute" }, { kind: "selfCanDeclareAttack" }],
      },
    },
  ],
  "[All Turns] When this Digimon becomes suspended, lose 1 memory.": {
    trigger: "AllTurns",
    actions: [
      {
        kind: "SubTrigger",
        event: "whenSuspended",
        sourceFilter: { isSelfRef: true },
        actions: [
          {
            kind: "GainMemory",
            amount: -1,
          } as Action,
        ],
      } as Action,
    ],
  },
  "[All Turns] When this Digimon becomes suspended, lose 2 memory.": {
    trigger: "AllTurns",
    actions: [
      {
        kind: "SubTrigger",
        event: "whenSuspended",
        // "THIS Digimon becomes suspended": scope the watcher to the card the grant sits on.
        // `whenSuspended` fires the whole bus with no source, so an unscoped watcher would
        // charge 2 memory for every suspension on the board, not just the grantee's.
        sourceFilter: { isSelfRef: true },
        actions: [
          {
            kind: "GainMemory",
            amount: -2,
          } as Action,
        ],
      } as Action,
    ],
  },
  "[Your Turn] When attacking an opponent's Digimon with no digivolution cards, delete that Digimon": {
    trigger: "WhenAttacking",
    actions: [
      {
        kind: "Delete",
        target: { sourceRef: "triggerDefender", filter: {}, count: 1 },
        condition: {
          kind: "attackTargetMatchesFilter",
          filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "none" },
        },
      } as Action,
    ],
  },
  OnDeletionDeleteLowest: {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "Delete",
        target: {
          filter: {
            controller: "opponent",
            kind: ["Digimon"],
            superlative: "lowestLevel",
          },
          count: 1,
        },
      } as Action,
    ],
  },
  OnDeletionLose1Memory: {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "GainMemory",
        amount: -1,
      } as Action,
    ],
  },
  OnDeletionGain2Memory: {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "GainMemory",
        amount: 2,
      } as Action,
    ],
  },
  OnDeletionGain2MemoryAndReturn3000DP: {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "GainMemory",
        amount: 2,
      } as Action,
      {
        kind: "Return",
        target: {
          filter: {
            zone: "trash",
            controller: "mine",
            kind: ["Digimon"],
            dp: { op: "lte", value: 3000 },
          },
          count: 1,
        },
        from: ["trash"],
        to: "hand",
      } as Action,
    ],
  },
  "[On Deletion] Lose 1 memory.": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "GainMemory",
        amount: -1,
      } as Action,
    ],
  },
  "[On Deletion] Lose 2 memory": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "GainMemory",
        amount: -2,
      } as Action,
    ],
  },
  "[On Deletion] Gain 3 memory.": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "GainMemory",
        amount: 3,
      } as Action,
    ],
  },
  "[On Deletion] You may play 1 [Biyomon] from your hand or trash without paying the cost.": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "PlayWithoutCost",
        target: {
          filter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Biyomon"], match: "nameExact" }],
          },
          count: 1,
        },
        from: ["hand", "trash"],
        payCost: false,
        optional: true,
      } as Action,
    ],
  },
  "[On Deletion] You may play 1 Digimon card with [Numemon] in its name from your trash without paying the cost.": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "PlayWithoutCost",
        target: {
          filter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Numemon"], match: "name" }],
          },
          count: 1,
        },
        from: ["trash"],
        payCost: false,
        optional: true,
      } as Action,
    ],
  },
  "[When Attacking] Lose 1 memory.": {
    trigger: "WhenAttacking",
    actions: [
      {
        kind: "GainMemory",
        amount: -1,
      } as Action,
    ],
  },
  GRANTEFFECT23TOKEN: {
    trigger: "StartOfYourMainPhase",
    actions: [
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      } as Action,
    ],
  },
  OnDeletionPlaySelfNoOnPlay: {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "PlayWithoutCost",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        payCost: false,
        suppressOnPlayEffects: true,
      } as Action,
    ],
  },
  OnPlayBlitzIfHasDigivolutionCard: {
    trigger: "OnPlay",
    actions: [
      {
        kind: "GainKeyword",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        keyword: { keyword: "Blitz" },
        duration: "forTheTurn",
        condition: { kind: "selfDigivolutionCountAtLeast", value: 1 },
      } as Action,
    ],
  },
  OnDeletionPlaySelf: {
    trigger: "OnDeletion",
    optional: true,
    actions: [
      {
        kind: "PlayWithoutCost",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        payCost: false,
      } as Action,
    ],
  },
  OnDeletionPlaySelfMandatory: {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "PlayWithoutCost",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        payCost: false,
      } as Action,
    ],
  },
  "[On Deletion] Trash the top card of your security stack.": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "SecurityManipulation",
        op: "trashTop",
        amount: 1,
      } as Action,
    ],
  },
  "[When Attacking] Lose 2 memory": {
    trigger: "WhenAttacking",
    actions: [
      {
        kind: "GainMemory",
        amount: -2,
      } as Action,
    ],
  },
  "[When Attacking] Lose 4 memory": {
    trigger: "WhenAttacking",
    actions: [
      {
        kind: "GainMemory",
        amount: -4,
      } as Action,
    ],
  },
  "[On Deletion] Trash 1 card in your hand.": {
    trigger: "OnDeletion",
    actions: [
      {
        kind: "Trash",
        target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
      } as Action,
    ],
  },
  "[When Attacking] Trash the bottom digivolution card of this Digimon.": {
    trigger: "WhenAttacking",
    actions: [
      {
        kind: "TrashDigivolution",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        amount: 1,
        fromTop: false,
      } as Action,
    ],
  },
  "[End of Attack] Delete this Digimon.": {
    trigger: "EndOfAttack",
    actions: [
      {
        kind: "Delete",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      } as Action,
    ],
  },
  // EX6-070's compiler token represents the quoted ability granted to the
  // opponent's chosen Digimon. The source is rebound to the recipient, so
  // "Your Turn" and "this Digimon" use that Digimon's controller and identity.
  GRANTEFFECT51TOKEN: {
    trigger: "EndOfYourTurn",
    actions: [
      {
        kind: "Delete",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      } as Action,
    ],
  },
  "[Start of Your Main Phase] Attack with this Digimon.": {
    trigger: "StartOfYourMainPhase",
    actions: [
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      } as Action,
    ],
  },
  "[Start of Your Main Phase] This Digimon attacks.": {
    trigger: "StartOfYourMainPhase",
    actions: [
      {
        kind: "Attack",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      } as Action,
    ],
  },
  "[Opponent's Turn] When this Digimon becomes suspended, delete all of your opponent's Digimon with a play cost less than or equal to this Digimon's":
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "SelectBind",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true, bindAs: "grantSource" },
            } as Action,
            {
              kind: "Delete",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  relativeTo: { attr: "playCost", op: "lte", selectionRef: "grantSource" },
                },
                count: "all",
              },
            } as Action,
          ],
        } as Action,
      ],
    },
  "[Opponent's Turn] This Digimon isn't affected by your opponent's Option cards.": {
    trigger: "OpponentsTurn",
    actions: [
      {
        kind: "Restrict",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        restriction: "beAffected",
        fromSourceKind: ["Option"],
        byOpponentEffectsOnly: true,
        duration: "untilOpponentTurnEnd",
      } as Action,
    ],
  },
};

/**
 * Compile a granted token to the engine Effects it contributes at `timing`, anchored on the
 * granted permanent's `source`. Mirrors `irCardModule.effectsForTiming` for a single synthetic
 * CardEffect: pick the timing builder, gate per turn-owner, and run the IR actions on resolve.
 * The builder's own base guard applies — for [On Deletion] (`onDeletion`) that gate is "the
 * SOURCE (granted) permanent is in this window's deleted set", so the granted effect fires only
 * when the granted Digimon itself is deleted, exactly like a printed [On Deletion].
 *
 * Throws for a token with NO library entry — this is a `grantCustomEffect`/`GrantStatic
 * grant:"effects"` call site naming an effect the library cannot express, which used to
 * silently return `[]` (the grant installs, the ledger records it, but nothing ever fires).
 * Failing loudly at the point the grant is actually consulted turns that class of bug into an
 * immediate, attributable crash instead of a card that quietly does nothing forever. Known
 * genuine gaps that are NOT yet expressible as a triggered CardEffect (e.g. BT17-008/BT17-010/
 * BT19-007/BT19-009/BT19-011/EX7-066's "DeleteCap+2000"/"DeleteCap+3000" — a cross-effect DP-cap
 * BOOST for an already-resolving Delete action, not a self-contained triggered ability) are left
 * unresolved by design; this throw is what will surface them the moment their grant condition
 * actually becomes live, rather than leaving them silently inert forever.
 */
/** A granted clause that makes its recipient attack when its controller's Main phase starts. */
export function grantForcesAttackAtStartOfMainPhase(token: string): boolean {
  const libraryEntry = GRANTED_EFFECT_LIBRARY[token];
  if (libraryEntry === undefined) return false;
  const effects: readonly CardEffect[] = Array.isArray(libraryEntry) ? libraryEntry : [libraryEntry as CardEffect];
  return effects.some(
    (effect) =>
      effect.trigger === "StartOfYourMainPhase" &&
      effect.actions.some((action) => action.kind === "Attack" && action.target?.isSelf === true),
  );
}

export function grantedTokenEffectsForTiming(token: string, timing: EffectTiming, source: CardSource): Effect[] {
  const libraryEntry = GRANTED_EFFECT_LIBRARY[token];
  if (libraryEntry === undefined) {
    throw new Error(
      `grantedTokenEffectsForTiming: unknown granted-effect token "${token}" (source ` +
        `${source.cardId}) — add it to GRANTED_EFFECT_LIBRARY in interpreter.ts, or fix the ` +
        `grantCustomEffect/GrantStatic call site naming it. This grant would otherwise install ` +
        `into the ledger and silently never fire.`,
    );
  }
  const effects: readonly CardEffect[] = Array.isArray(libraryEntry) ? libraryEntry : [libraryEntry as CardEffect];
  return effects.flatMap((effect, index) => {
    if (!timingsForTrigger(effect, false).includes(timing)) return [];
    const build = builderForTrigger(effect);
    // A literal-text token is the printed granted clause. Without an explicit description, the
    // resolution context would quote the HOST card's own printed text in its decisions.
    const description = `[Granted] ${token.startsWith("[") ? token : describeEffect(effect)}`;
    const describedEffect: CardEffect = { ...effect, description };
    return [
      build({
        source,
        effectKey: `granted/${token}${effects.length > 1 ? `/${index}` : ""}/${timing}`,
        description,
        optional: effect.optional ?? false,
        when: turnOwnerGuard(effect.trigger),
        // The granted effect's own IR condition gates COLLECTION, exactly as it does for a
        // printed effect (`irCardModule`'s `canActivate`). Without this the window collects and
        // ANNOUNCES an effect whose condition is false — ＜Execute＞'s "at the end of the attack,
        // this Digimon is deleted" read out at the end of an ordinary attack, with `runEffect`
        // then silently skipping the deletion.
        canActivate: (ctx) => canActivateEffect(ctx, effect, { collectsTriggeredEffect: true }),
        resolve: async (ctx) => {
          await runEffect(ctx, describedEffect);
        },
      }),
    ];
  });
}
