// Self-cost reducers a card applies to its own play or digivolve.

import { splitPrintedClauses } from "@aegis/shared/effects/printedClauses";
import type { EffectContext } from "../../EffectContext.js";
import { evaluateCondition } from "../conditions.js";
import { canPayCost, payCost } from "../costs.js";
import { runAction } from "../dispatch.js";
import { scaleFactor } from "../scaling.js";
import {
  candidateLooseInstances,
  pickLoose,
  type LooseCandidate,
} from "#api/engine/effects/interpreter/targeting/loose";
import { candidatePermanents, resolvePermanentTargets } from "../targeting/permanents.js";
import { permanentMatchesFilter } from "../matching/permanent.js";
import { definitionMatches } from "../matching/definition.js";
import type { Action, CardEffect, CardInstance, Condition, Cost, Permanent, Scaling, ZoneRef } from "@aegis/shared";

/**
 * A self-targeted "when THIS card would be played, [gate], reduce the play cost by N" reducer.
 * Exactly one of `cost`, `costActions`, or (`condition`/`scaling`) applies:
 *   - `cost`: a structured, payable Cost (suspend/unsuspend/return/trash) — offered as a "you may"
 *     choice, paid via `payCost` (EX8-074, BT17-068, ...).
 *   - `costActions`: an "actions" cost body (place/trash/delete a card — SelectBind+PlaceUnder, or an
 *     optional Delete) — offered as a "you may" choice, paid by running the actions
 *     (BT12-112, BT8-043).
 *   - `condition`/`scaling`: no payment at all — a mandatory, automatic reduction gated by a board
 *     condition and/or scaled by a matching-card count (BT9-097, BT8-036, BT8-010, BT9-112).
 */
export interface WouldBePlayedSelfReducer {
  amount: number;
  /** Granted only after this reducer's printed payment succeeds. */
  grantsTrashDigiXros?: boolean;
  /** Cost reduction earned for each card committed by a deferred self-placement cost. */
  amountPerPaid?: number;
  raw: string;
  /**
   * Hand-written payment hook for costs whose card-selection/movement shape is not representable as
   * Cost. Returning a boolean grants `amount` once when true; returning a number reports how many
   * cards were committed and grants `amountPerPaid` for each (BT15-102's "up to 3, -4 each").
   */
  pay?: (ctx: EffectContext) => Promise<boolean | number>;
  cost?: Cost;
  costActions?: Action[];
  condition?: Condition;
  scaling?: Scaling;
  /** Applies continuously while the card is in hand, so it changes the card's cost there (Q1501). */
  whileInHand?: boolean;
}

const WOULD_BE_PLAYED_SELF_REDUCERS = new Map<string, WouldBePlayedSelfReducer[]>();

/** Register a card-local, hand-written pay-time reducer without serializing executable behavior as IR. */
export function registerWouldBePlayedSelfReducer(cardId: string, reducer: WouldBePlayedSelfReducer): void {
  const current = WOULD_BE_PLAYED_SELF_REDUCERS.get(cardId) ?? [];
  const withoutSameKey = current.filter(({ raw }) => raw !== reducer.raw);
  WOULD_BE_PLAYED_SELF_REDUCERS.set(cardId, [...withoutSameKey, reducer]);
}

const STRUCTURED_REDUCER_COSTS = new Set([
  "suspend",
  "unsuspend",
  "return",
  "trash",
  "deleteOwn",
  "trashBottomFaceDownUnderTamer",
]);

/**
 * Cards whose "When THIS card would be played, by [structured cost], reduce the play cost by N"
 * real payable cost. The runtime record under-specifies the `wouldBePlayed reduceCost` IR — it drops
 * the "this card" identity (so EX3-040's "a green Digimon" looks identical to a self-reducer) and
 * sometimes mis-parses a conditional reduction as a cost (BT16-065) — so structural detection alone
 * is unsafe. This allowlist is the gate; new entries require reading the card's effect text.
 */
const VERIFIED_SELF_REDUCER_CARDS = new Set([
  "EX2-046", // no other ADR-02 Searcher in play -> self play cost -2
  "AD1-017", // 4+ Lucemon/Witchelny-text cards in trash -> self play cost -5
  "AD1-018", // Knightmon/Lucemon in own battle area -> self play cost -5
  "BT13-045", // 8+ Chessmon-name Digimon cards in trash -> self play cost -8
  "BT13-080", // delete one own level-2 Digimon in breeding -> self play cost -2
  "BT13-083", // delete one own level-3 Digimon -> self play cost -4
  "BT13-086", // delete one own level-4 Digimon -> self play cost -6
  "BT27-075",
  "BT27-076",
  "BT27-079",
  "BT13-111", // no battle-area Digimon; -2 per 5 combined trash cards (KB Q2364; §15-1-7)
  "BT2-099", // self Option use cost -1 per yellow Tamer
  "BT2-112", // opponent has a 10000+ DP Digimon -> -6
  "ST22-14", // opponent has 10+ cards in hand or 10+ in trash -> -5 (Q5447/Q5448)
  "EX8-074", // suspend 2 Digimon -> -4
  "EX10-048", // delete 1 own Myotismon-text Digimon -> -4 (Q5130/Q5131)
  "BT17-068", // return 1 [Apocalymon] from trash -> -3
  "BT17-015", // Tai Kamiya in play -> self play cost -3
  "BT17-027", // Matt Ishida in play -> self play cost -3
  "BT17-060", // return up to 13 Unidentified/Diaboromon-text cards -> -1 each
  "BT18-073", // delete 1 own [Composite] Digimon -> -4
  "EX9-011", // trash 1 [Cyborg]/[Ver.1] from hand -> -2
  "EX9-018", // trash 1 [Cyborg]/[Ver.x] from hand -> -2
  "EX9-030", // trash 1 [Cyborg]/[Ver.x] from hand -> -2
  "EX9-064", // trash 1 [Cyborg]/[Ver.x] from hand -> -2
  "EX9-044", // suspend 1 [WG] Digimon -> -4
  "P-170", // return 3 [Three Musketeers]-text from trash -> -6
  "P-171", // face-up [Deep Savers] in security -> -4
  "P-172", // face-up [Nature Spirits] in security -> -4
  "P-174", // face-up [Nightmare Soldiers] in security -> -4
  "P-186", // 13000+ DP Digimon present -> self play cost -2 per five total trash cards
  "ST14-09", // reduce this card's play cost by 4 for every 10 cards in your trash
  "BT12-112", // place 1 [Shoutmon] as digivolution material -> -1 (KB Q2249-Q2256)
  "BT21-030", // place 1 [Shoutmon] under itself -> -1 and enable trash DigiXros materials
  "BT8-043", // delete 1 purple [Cherubimon] -> -8
  "BT9-097", // condition: you have a Digimon with [X Antibody] card name in play -> -2 (KB Q1902)
  "BT9-095", // X Antibody card name in a Digimon's stack -> -2 (KB Q1899)
  "BT8-036", // condition: you have a blue Digimon in play -> -1
  "BT8-010", // condition: you have a yellow Digimon in play -> -1 (KB Q1700; IR condition added)
  "ST9-04", // condition: you have a green Digimon in play -> -1
  "ST9-09", // condition: you have a blue Digimon in play -> -1
  "EX2-045", // condition: you have Guilmon/Terriermon/Renamon/Impmon in play -> -2
  "EX2-041", // condition: you have Alice McCoy in play -> self play cost -2
  "EX5-012", // qualifying 3+ source Light Fang/Night Claw/Galaxy stack -> self play cost -2 (Q3549)
  "EX5-020", // qualifying 3+ source Night Claw/Light Fang/Galaxy stack -> self play cost -2 (Q3569)
  "EX5-072", // -1 per distinct Deva/Four Sovereigns name in trash -> self Option cost reduction
  "EX6-018", // condition: you have no level 5 or lower Digimon -> self play cost -5 (Q3714)
  "EX6-039", // delete an Unidentified Digimon to reduce this card's play cost by 3
  "BT9-112", // scaling: -3 per opponent Digimon/Tamer in play (KB Q1928)
  "BT10-098", // condition: opponent has 2+ Digimon -> Option use cost -2
  "BT10-103", // condition: you have 2+ suspended green Digimon -> Option use cost -2
  "BT23-015", // condition: you have a Zaxon Tamer -> self play cost -5
  "BT23-031", // condition: you have LadyDevimon or Mirei Mikagura -> self play cost -3
  "BT23-034", // condition: you have a Zaxon Tamer -> self play cost -5
  "BT23-036", // condition: opponent has a 10000+ DP Digimon -> self play cost -5
  "BT23-044", // condition: you have Yuuko Kamishiro or a CS Digimon -> self play cost -3
  "BT23-057", // return exactly 3 Huckmon/Sistermon/Jesmon-name cards from trash -> self play cost -5
  "BT23-067", // condition: you have Angewomon or Mirei Mikagura -> self play cost -3
  "BT20-036", // condition: you have an [ACCEL] Digimon -> self play cost -5
  "BT20-043", // condition: you have an [ACCEL] Digimon -> self play cost -5
  "BT20-057", // condition: you have a Huckmon/Jesmon/Sistermon-named Digimon -> self play cost -4
  "BT8-097", // scaling: Option use cost -1 per opposing Digimon (floor applied by play path)
  "BT25-018", // opponent has a 12000+ DP Digimon -> self play cost -5
  "BT27-053",
  "BT25-028", // opponent has a level 6+ Digimon -> self play cost -5
  "BT25-020", // any Digimon has 13000+ DP -> self play cost -5
  "BT25-044", // 6 or fewer total security cards -> -5 (Q7004 effect-driven stacking)
  "BT25-059", // 2+ suspended Digimon -> -5 (Q6306/Q6350)
  "BT25-075", // fewer Digimon than your opponent -> -5 (Q6370-Q6372)
  "BT25-077", // condition: 12+ total Digimon levels -> -5 (Q7002 effect-driven stacking)
  "BT26-045", // fewer cards in hand than opponent -> self play cost -4 (Q7036-Q7037)
  "BT26-046", // 2+ suspended Digimon -> self play cost -4
  "BT26-059", // fewer cards in hand than opponent -> self play cost -6
  "BT24-030", // opponent has 2+ Digimon -> self play cost -5
  "BT24-040", // 3 or fewer security cards -> self play cost -5
  "BT24-041", // own Iliad Digimon or Tamer -> self play cost -5
  "BT24-051", // 3+ total Digimon -> self play cost -5
  "BT21-026", // scaling: self play cost -2 per opposing Digimon
  "BT25-096", // trash the bottom face-down card under a Tamer -> Option use cost -2 (Q6456)
  "EX10-061", // place one of each face-up Dark Masters name from security -> -4 each (Q5783/Q5784)
  "BT15-102", // place up to 3 distinct Dark Masters names from trash/battle-area top -> -4 each (Q2599/Q6241)
  "BT22-041", // condition: total cards in both security stacks <= 6 -> self play cost -6
  "BT11-096", // condition: you have a red Tamer -> Option use cost -1
  "BT11-099", // condition: you have a blue Tamer -> Option use cost -1
  "BT11-100", // condition: you have a yellow Tamer -> Option use cost -1
  "BT11-101", // condition: you have a yellow Tamer -> Option use cost -1
  "BT11-103", // condition: you have a green Tamer -> Option use cost -1
  "BT11-104", // condition: you have a green Tamer -> Option use cost -1
  "BT11-105", // condition: you have a Snatchmon -> Option use cost -1
  "BT11-106", // condition: you have a black Tamer -> Option use cost -1
  "BT11-107", // condition: you have X Antibody in play -> Option use cost -2
  "BT11-108", // condition: you have a black Tamer -> Option use cost -1
  "BT11-110", // condition: you have a purple Tamer -> Option use cost -1
]);

/**
 * The runtime record compiles "When this card would be played, by [cost], reduce the play cost by N"
 * into a `wouldBePlayed reduceCost` Replacement — but the play path consumes pay-time reductions
 * only through `BeforePayCost`/`playCostDelta`, leaving these self-reducers inert (EX8-074, BT17-068).
 * Collect the unambiguous self-targeted ones (an explicit "this card" raw + a STRUCTURED cost, no
 * cross-card target/condition/place-actions) so the play path can run them at BeforePayCost. The
 * gate is deliberately tight: cross-card reducers (BT13-007: "when a [Royal Knight] would be
 * played") and conditional/raw-cost forms are NOT matched and stay as-is.
 */
/** A sourceFilter that gates which PLAYED card a wouldBePlayed reaction watches. */
type SourceFilter = {
  isSelfRef?: boolean;
  names?: unknown;
  nameOrTrait?: unknown;
  traits?: unknown;
  kind?: unknown;
  kinds?: unknown;
  colors?: unknown;
  levels?: unknown;
  levelComparison?: unknown;
};

/**
 * True when a wouldBePlayed `sourceFilter` discriminates by something OTHER than controller — i.e.
 * it targets a SUBSET of cards ("a [Royal Knight] Digimon"), making the reducer cross-card. A filter
 * with only `controllerDefault`/`controller` (or none) is the self/"this card" form the runtime record
 * under-specifies — we restrict it to the bearer by keying the reducer on the bearer's cardId.
 */
function sourceFilterDiscriminates(sf: SourceFilter | undefined): boolean {
  if (sf === undefined) return false;
  return (
    sf.names !== undefined ||
    sf.nameOrTrait !== undefined ||
    sf.traits !== undefined ||
    sf.kind !== undefined ||
    sf.kinds !== undefined ||
    sf.colors !== undefined ||
    sf.levels !== undefined ||
    sf.levelComparison !== undefined
  );
}

/**
 * Capture a `reduceCost` Replacement item as a self-reducer, given its own gate (`cost`/`condition`)
 * plus whatever sibling "cost" actions accompany it (`costActionsRaw` — a Delete/SelectBind body that
 * pays the reduction, empty when there is none) and the outer action's `scaling` (if any). Exactly
 * one payment shape wins, in priority order:
 *   1. A structured, payable `cost` (suspend/unsuspend/return/trash) — the ORIGINAL verified shape
 *      (EX8-074, BT17-068, ...). A `condition` alongside it is unsupported and rejects the capture
 *      (preserves the pre-existing strict behavior for these cards).
 *   2. A non-empty `costActionsRaw` body (BT12-112, BT8-043) — same condition restriction.
 *   3. Neither: a `condition` and/or `scaling` gate with NO payment at all — a mandatory, automatic
 *      reduction (BT9-097, BT8-036, BT8-010, BT9-112).
 */
function captureReducer(
  costActionsRaw: readonly unknown[],
  a: {
    kind?: string;
    event?: string;
    mode?: string;
    cost?: Cost;
    amount?: unknown;
    raw?: string;
    condition?: unknown;
    target?: unknown;
    amountFromPaidCost?: boolean;
    additionalEffects?: Array<{ kind: string }>;
    whileInHand?: true;
  },
  scaling: Scaling | undefined,
  fallbackRaw: string,
  out: WouldBePlayedSelfReducer[],
): void {
  if (a.kind !== "Replacement" || a.event !== "wouldBePlayed" || a.mode !== "reduceCost") return;
  if (a.target !== undefined) return;
  if (typeof a.amount !== "number") return;
  const amount = a.amount;
  const raw = a.raw && a.raw.length > 4 ? a.raw : fallbackRaw;
  const condition = a.condition as Condition | undefined;
  if (a.cost !== undefined) {
    if (condition !== undefined) return;
    if (!STRUCTURED_REDUCER_COSTS.has(a.cost.kind)) return;
    out.push({
      cost: a.cost,
      amount: a.amountFromPaidCost === true ? 0 : amount,
      raw,
      ...(a.amountFromPaidCost === true ? { amountPerPaid: amount } : {}),
    });
    return;
  }
  if (costActionsRaw.length > 0) {
    if (condition !== undefined) return;
    out.push({
      costActions: costActionsRaw as Action[],
      amount,
      raw,
      grantsTrashDigiXros: a.additionalEffects?.some((extra) => extra.kind === "AllowDigiXrosMaterialsFromTrash"),
    });
    return;
  }
  if (condition !== undefined || scaling !== undefined) {
    out.push({ condition, scaling, amount, raw, ...(a.whileInHand === true ? { whileInHand: true } : {}) });
  }
}

export function collectWouldBePlayedSelfReducers(cardId: string, effects: readonly CardEffect[]): void {
  if (!VERIFIED_SELF_REDUCER_CARDS.has(cardId)) return;
  const out: WouldBePlayedSelfReducer[] = [];
  for (const effect of effects) {
    for (const action of effect.actions ?? []) {
      const a = action as {
        kind?: string;
        event?: string;
        mode?: string;
        sourceFilter?: SourceFilter;
        actions?: unknown[];
        cost?: Cost;
        scaling?: Scaling;
        raw?: string;
      } & Record<string, unknown>;
      if (a.kind !== "Replacement" || a.event !== "wouldBePlayed") continue;
      if (sourceFilterDiscriminates(a.sourceFilter)) continue;
      // Flat form (BT12-112): the reduceCost mode/amount AND its own cost-actions body live on
      // this same action object.
      if (a.mode === "reduceCost") {
        captureReducer(a.actions ?? [], a, a.scaling, "Reduce the play cost.", out);
        continue;
      }
      // Nested form (EX8-074, BT17-068, BT8-043, BT9-097, BT8-036, BT8-010, BT9-112): an outer
      // wouldBePlayed reaction (sourceFilter = "mine", no card discriminator) wraps an inner
      // reduceCost Replacement (amount/condition) alongside sibling "cost" actions (a Delete, a
      // SelectBind+TrashDigivolution+PlaceUnder chain) that pay for the reduction. Isolate the
      // inner reduceCost item; everything else in the same array is the cost payload.
      if (Array.isArray(a.actions)) {
        const inner = a.actions.find(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            (item as { kind?: string }).kind === "Replacement" &&
            (item as { event?: string }).event === a.event &&
            (item as { mode?: string }).mode === "reduceCost",
        ) as Record<string, unknown> | undefined;
        if (inner === undefined) continue;
        const placementCost =
          a.cost?.kind === "place"
            ? a.cost
            : (inner.cost as Cost | undefined)?.kind === "place"
              ? (inner.cost as Cost)
              : undefined;
        if (
          placementCost !== undefined &&
          placementCost.target !== undefined &&
          (a.sourceFilter?.isSelfRef === true ||
            placementCost.host === "self" ||
            placementCost.underFilter?.isSelfRef === true) &&
          typeof inner.amountPerPlaced === "number"
        ) {
          out.push({
            amount: 0,
            amountPerPaid: inner.amountPerPlaced,
            cost: placementCost,
            raw: placementCost.raw ?? a.raw ?? "Place cards under this card to reduce its play cost.",
          });
          continue;
        }
        const costActions = a.actions.filter((item) => item !== inner);
        // Some generated records put the eligibility gate on the OUTER wouldBePlayed
        // wrapper and leave the nested reduceCost item unconditional (EX2-045).  The
        // pay-time self-reducer bypasses runAction on that wrapper, so carry its condition
        // into the captured reducer unless the nested item supplies a more specific gate.
        const innerWithGate = {
          ...inner,
          condition: inner.condition ?? a.condition,
        };
        captureReducer(
          costActions,
          innerWithGate as never,
          (inner.scaling as Scaling | undefined) ?? a.scaling,
          "Reduce the play cost.",
          out,
        );
      }
    }
  }
  if (out.length > 0) WOULD_BE_PLAYED_SELF_REDUCERS.set(cardId, out);
}

export function isIntrinsicWouldBePlayedSelfReducerMarker(cardId: string, effect: CardEffect): boolean {
  if (effect.trigger !== "Static" || wouldBePlayedSelfReducersFor(cardId).length === 0) return false;
  const actions = effect.actions ?? [];
  return (
    actions.length > 0 &&
    actions.every((action) => {
      if (action.kind !== "Replacement" || action.event !== "wouldBePlayed") return false;
      if (sourceFilterDiscriminates(action.sourceFilter as SourceFilter | undefined)) return false;
      return (
        action.mode === "reduceCost" ||
        (action.actions ?? []).some(
          (inner) => inner.kind === "Replacement" && inner.event === "wouldBePlayed" && inner.mode === "reduceCost",
        )
      );
    })
  );
}

/** The self-targeted pay-time cost reducers for a played card (empty when none). */
export function wouldBePlayedSelfReducersFor(cardId: string): WouldBePlayedSelfReducer[] {
  return WOULD_BE_PLAYED_SELF_REDUCERS.get(cardId) ?? [];
}

export interface WouldDigivolveSelfReducer {
  cost?: Cost;
  condition?: Condition;
  scaling?: Scaling;
  sourceFilter?: import("@aegis/shared").Filter;
  sourceStackFilter?: import("@aegis/shared").Filter;
  amount: number;
  raw: string;
}

const WOULD_DIGIVOLVE_SELF_REDUCERS = new Map<string, WouldDigivolveSelfReducer[]>();

const VERIFIED_DIGIVOLVE_SELF_REDUCER_CARDS = new Set([
  "BT21-020", // Agunimon/BurningGreymon in the source stack -> self digivolution cost -1 (Q4524)
  "EX3-054", // return up to 5 [D-Brigade] cards from trash to deck top -> -1 each (KB Q3423)
  "BT22-038", // -1 for each face-down digivolution card on the Ver.1 base (KB Q4884/Q5196)
  "BT8-112", // return a white level 7 from trash to the deck bottom -> -4
  "BT3-111", // Paildramon/Dinobeemon would digivolve into this card -> -2 (KB card ruling)
  "BT7-025", // Beowolfmon: this card's own digivolution cost -2 with a Tamer source
  "BT7-051", // RhinoKabuterimon: this card's own digivolution cost -2 with a Tamer source
  "BT11-059", // -1 per green/black Tamer when one of your Digimon digivolves into this card (Q2092)
  "EX5-012", // qualifying 3+ source Light Fang/Night Claw/Galaxy stack -> self evo cost -2 (Q3549)
  "EX5-020", // qualifying 3+ source Night Claw/Light Fang/Galaxy stack -> self evo cost -2 (Q3569)
  "BT17-048", // suspend up to 5 Tamers to reduce this card's own evo cost per Tamer
  "EX9-063", // Ver.4 base: this card's own evolution costs -1 per face-down source
  "EX9-031", // Ver.3 base: this card's own evolution costs -1 per face-down source
  "EX9-041", // Ver.5 base: this card's own evolution costs -1 per face-down source
  "BT18-085",
]);

/**
 * A Static nested wouldDigivolve reducer whose source card is the imminent hand target. The
 * reducer is consumed by the digivolve pay-time path below, so leaving the marker in the
 * ordinary continuous ledger would arm the same reduction again after BT17-048 is already on
 * the field. This mirrors the intrinsic Digisorption marker path.
 */
export function isIntrinsicWouldDigivolveSelfReducerMarker(cardId: string, effect: CardEffect): boolean {
  if (effect.trigger !== "Static" || !VERIFIED_DIGIVOLVE_SELF_REDUCER_CARDS.has(cardId)) return false;
  const actions = effect.actions ?? [];
  return (
    actions.length > 0 &&
    actions.every(
      (outer) =>
        outer.kind === "Replacement" &&
        outer.event === "wouldDigivolve" &&
        (outer.actions ?? []).some(
          (inner) =>
            inner.kind === "Replacement" &&
            inner.event === "wouldDigivolve" &&
            inner.mode === "reduceCost" &&
            typeof inner.amount === "number",
        ),
    )
  );
}

export function collectWouldDigivolveSelfReducers(cardId: string, effects: readonly CardEffect[]): void {
  if (!VERIFIED_DIGIVOLVE_SELF_REDUCER_CARDS.has(cardId)) return;
  const reducers: WouldDigivolveSelfReducer[] = [];
  for (const effect of effects) {
    for (const outer of effect.actions) {
      if (outer.kind !== "Replacement" || outer.event !== "wouldDigivolve") continue;
      for (const action of outer.actions ?? []) {
        if (
          action.kind === "Replacement" &&
          action.event === "wouldDigivolve" &&
          action.mode === "reduceCost" &&
          typeof action.amount === "number"
        ) {
          reducers.push({
            ...(action.cost !== undefined ? { cost: action.cost } : {}),
            ...(action.condition !== undefined ? { condition: action.condition } : {}),
            ...((action.scaling ?? outer.scaling) !== undefined ? { scaling: action.scaling ?? outer.scaling } : {}),
            ...(outer.sourceFilter !== undefined ? { sourceFilter: outer.sourceFilter } : {}),
            ...(outer.condition?.kind === "selfDigivolutionStackMatchesFilter" && outer.condition.filter !== undefined
              ? { sourceStackFilter: outer.condition.filter }
              : {}),
            amount: action.amount,
            raw: action.cost?.raw ?? action.raw ?? "Reduce the digivolution cost.",
          });
        }
      }
    }
  }
  if (reducers.length > 0) WOULD_DIGIVOLVE_SELF_REDUCERS.set(cardId, reducers);
}

export function wouldDigivolveSelfReducersFor(cardId: string): WouldDigivolveSelfReducer[] {
  return WOULD_DIGIVOLVE_SELF_REDUCERS.get(cardId) ?? [];
}

function digivolveReducerScale(ctx: EffectContext, reducer: WouldDigivolveSelfReducer, target?: Permanent): number {
  if (reducer.scaling === undefined) return 1;
  if (target !== undefined && reducer.scaling.unit === "digivolutionCards") {
    const filter = reducer.scaling.filter ?? {};
    const count = target.stack.filter(
      (card) => (filter.faceDown !== true || card.faceUp !== true) && (filter.faceUp !== true || card.faceUp === true),
    ).length;
    return Math.floor(count / Math.max(1, reducer.scaling.per));
  }
  return scaleFactor(ctx, reducer.scaling);
}

export function potentialWouldDigivolveSelfReduction(
  ctx: EffectContext,
  reducer: WouldDigivolveSelfReducer,
  target?: Permanent,
): number {
  if (reducer.condition !== undefined && !evaluateCondition(ctx, reducer.condition)) return 0;
  if (
    reducer.sourceFilter !== undefined &&
    (target === undefined || !permanentMatchesFilter(ctx, target, reducer.sourceFilter, ctx.source))
  ) {
    return 0;
  }
  if (
    reducer.sourceStackFilter !== undefined &&
    (target === undefined ||
      !target.stack.some((card) => definitionMatches(reducer.sourceStackFilter!, ctx.game.definitionOf(card))))
  ) {
    return 0;
  }
  const scale = digivolveReducerScale(ctx, reducer, target);
  if (reducer.cost === undefined) return Math.max(0, reducer.amount * scale);
  if (reducer.cost.target?.upTo !== true || typeof reducer.cost.target.count !== "number") {
    return reducer.amount * scale;
  }
  if (reducer.cost.kind === "suspend") {
    const candidates = candidatePermanents(ctx, reducer.cost.target).filter((permanent) => !permanent.isSuspended);
    return reducer.amount * scale * Math.min(reducer.cost.target.count, candidates.length);
  }
  const zones: ZoneRef[] = reducer.cost.target.filter.zone === "trash" ? ["trash"] : [];
  if (zones.length === 0) return 0;
  const candidates = candidateLooseInstances(ctx, reducer.cost.target, zones);
  return reducer.amount * Math.min(reducer.cost.target.count, candidates.length);
}

export async function applyWouldDigivolveSelfReducer(
  ctx: EffectContext,
  reducer: WouldDigivolveSelfReducer,
  target?: Permanent,
): Promise<number> {
  if (potentialWouldDigivolveSelfReduction(ctx, reducer, target) === 0) return 0;
  if (reducer.cost === undefined) return potentialWouldDigivolveSelfReduction(ctx, reducer, target);
  if (!(await ctx.ask.optional(ctx, reducer.raw))) return 0;
  const receipt = { paidCount: 0 };
  if (!(await payCost(ctx, reducer.cost, receipt))) return 0;
  return Math.max(0, reducer.amount * receipt.paidCount);
}

/**
 * Run a `costActions` self-reducer's cost body (BT12-112's SelectBind+PlaceUnder,
 * BT8-043's optional Delete) AFTER the controller has already agreed to pay it via the reducer-level
 * "you may" prompt in {@link applyWouldBePlayedSelfReducer}. Per-action `optional` flags are stripped
 * before running — the single reducer-level prompt already IS that choice; re-asking would double-
 * prompt for one clause. Returns whether the cost actually resolved: a SelectBind that bound nothing
 * (no valid target) or a Delete that removed nothing means the cost could not be paid, so the caller
 * must not grant the discount (mirrors the structured-`cost` path's `payCost` failing silently).
 */
async function runWouldBePlayedCostActions(ctx: EffectContext, actions: readonly Action[]): Promise<boolean> {
  const selectBindNames: string[] = [];
  let sawDelete = false;
  let sawDeferredRelocation = false;
  for (const raw of actions) {
    const bindAs = (raw as { target?: { bindAs?: string } }).target?.bindAs;
    if (raw.kind === "SelectBind" && bindAs !== undefined) selectBindNames.push(bindAs);
    if (raw.kind === "Delete") sawDelete = true;
    // "Place [this permanent] as this card's OWN bottom digivolution card" (BT12-112): the card
    // being played has no permanent yet at pay-time (`fireBeforePayCost` runs BEFORE the played
    // permanent is created), so `relocatePermanent` cannot run now — there is no destination. Since
    // this action is running inside a SELF reducer's cost body, "under this card" unambiguously
    // means "under the permanent this same play is about to create". Resolve the SOURCE now (already
    // selected via the preceding SelectBind) and stash it on `ctx.pendingSelfReducerRelocations` for
    // the engine to relocate once that permanent exists.
    // The placed permanent's own cards are trashed by rule on relocation (§7-2-2-7, Q2250/Q2251),
    // matching `relocateByEffect`'s default; only an explicit `shedOwnCards: false` keeps them.
    if (raw.kind === "PlaceUnder" && raw.targetIsPermanent === true) {
      const sourceIds = await resolvePermanentTargets(ctx, raw.target);
      if (sourceIds.length === 0) return false;
      const shedOwnCards = raw.shedOwnCards !== false;
      ctx.pendingSelfReducerRelocations = [
        ...(ctx.pendingSelfReducerRelocations ?? []),
        ...sourceIds.map((permanentId) => ({ permanentId, shedOwnCards })),
      ];
      sawDeferredRelocation = true;
      continue;
    }
    const a = (raw as { optional?: boolean }).optional === true ? { ...raw, optional: false } : raw;
    const abort = await runAction(ctx, a as Action);
    if (abort) break;
  }
  if (selectBindNames.length > 0) {
    return selectBindNames.every((name) => ctx.selections?.has(name));
  }
  if (sawDeferredRelocation) return true;
  if (sawDelete) return (ctx.lastDeleteCount ?? 0) > 0;
  return true;
}

/**
 * Digivolution cards that paying this reducer may trash by rule: its cost places one of these
 * battle-area permanents under the played card, which sheds the permanent's own cards (§7-2-2-7).
 */
export function wouldBePlayedRuleTrashCandidates(
  ctx: EffectContext,
  reducer: WouldBePlayedSelfReducer,
): CardInstance[] {
  const actions = reducer.costActions ?? [];
  return actions.flatMap((action) => {
    if (action.kind !== "PlaceUnder" || action.targetIsPermanent !== true || action.shedOwnCards === false) return [];
    const reference = action.target.fromSelectionRef;
    const selectBind =
      reference === undefined
        ? undefined
        : actions.find((candidate) => candidate.kind === "SelectBind" && candidate.target.bindAs === reference);
    if (reference !== undefined && selectBind === undefined) return [];
    const target = selectBind?.kind === "SelectBind" ? selectBind.target : action.target;
    return candidatePermanents(ctx, target).flatMap((permanent) => [...permanent.stack, ...permanent.linked]);
  });
}

/**
 * A leading SelectBind is the payment gate for the action-body reducers that use it (BT12-112
 * and BT21-030). If its mandatory battle-area target is absent, the reducer is not payable and
 * must not open a "you may" prompt. This mirrors the activation gate in effect.ts; the reducer
 * path runs outside canActivateEffect because it is consumed by the pay-time replacement seam.
 */
function hasPayableLeadingSelectBind(ctx: EffectContext, actions: readonly Action[]): boolean {
  const leading = actions[0];
  if (leading?.kind !== "SelectBind" || leading.target.bindAs === undefined || leading.target.upTo === true) {
    return true;
  }
  if (ctx.selections?.get(leading.target.bindAs) !== undefined || ctx.boundPlayed?.has(leading.target.bindAs)) {
    return true;
  }
  return candidatePermanents(ctx, leading.target).length > 0;
}

/**
 * Apply one self-targeted `wouldBePlayed` cost reducer at pay-time (called from
 * `GameEngine.fireBeforePayCost`). A `cost`/`costActions` reducer is a "you may" choice — decline,
 * or an unpayable cost, earns nothing; a `condition`/`scaling` reducer has no payment at all and
 * applies automatically (mandatory) whenever its gate holds, scaled by the matching-card count.
 *
 * `mandatory` skips the "you may" prompt when the play is only payable through this reduction:
 * the player must perform as much of the processing as needed to pay the cost (§1-3-11-3).
 */
export async function applyWouldBePlayedSelfReducer(
  ctx: EffectContext,
  reducer: WouldBePlayedSelfReducer,
  mandatory = false,
): Promise<void> {
  const previousEffectTextPart = ctx.activeEffectTextPart;
  ctx.activeEffectTextPart = printedSelfReducerClause(ctx, reducer) ?? previousEffectTextPart;
  try {
    await resolveWouldBePlayedSelfReducer(ctx, reducer, mandatory);
  } finally {
    ctx.activeEffectTextPart = previousEffectTextPart;
  }
}

/**
 * The printed line a self reducer came from, so its prompts show the card text rather than
 * only the compiled `raw` fragment ("reduce the play cost by 2").
 */
function printedSelfReducerClause(ctx: EffectContext, reducer: WouldBePlayedSelfReducer): string | undefined {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  const text = ctx.source.definition.effectText ?? "";
  const clauses = splitPrintedClauses(text);
  const firstClause = clauses[0];
  const prefix = firstClause === undefined ? text : text.slice(0, text.indexOf(firstClause.text));
  const lines = [prefix, ...clauses.map((clause) => clause.text)]
    .flatMap((clause) => clause.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
  const raw = normalize(reducer.raw);
  return (
    lines.find((line) => normalize(line).includes(raw)) ??
    lines.find((line) => /when this card would be played/i.test(line))
  );
}

async function resolveWouldBePlayedSelfReducer(
  ctx: EffectContext,
  reducer: WouldBePlayedSelfReducer,
  mandatory: boolean,
): Promise<void> {
  const accepts = async () => mandatory || (await ctx.ask.optional(ctx, reducer.raw));
  if (reducer.pay !== undefined) {
    if (!(await accepts())) return;
    const paid = await reducer.pay(ctx);
    const reduction =
      typeof paid === "number"
        ? Math.max(0, paid) * Math.max(0, reducer.amountPerPaid ?? 0)
        : paid
          ? Math.max(0, reducer.amount)
          : 0;
    if (reduction > 0) {
      ctx.playCostDelta = (ctx.playCostDelta ?? 0) + reduction;
    }
    return;
  }
  if (reducer.cost !== undefined) {
    const paysByPlacingUnderSelf =
      reducer.amountPerPaid !== undefined &&
      reducer.cost.kind === "place" &&
      reducer.cost.target !== undefined &&
      (reducer.cost.host === "self" || reducer.cost.underFilter?.isSelfRef === true);
    if (!paysByPlacingUnderSelf && !canPayCost(ctx, reducer.cost)) return;
    if (!(await accepts())) return;
    if (
      reducer.amountPerPaid !== undefined &&
      reducer.cost.kind === "place" &&
      reducer.cost.target !== undefined &&
      (reducer.cost.host === "self" || reducer.cost.underFilter?.isSelfRef === true)
    ) {
      const target = reducer.cost.target;
      const declaredZones = [
        ...(target.from ?? []),
        ...((Array.isArray(target.filter.zone) ? target.filter.zone : [target.filter.zone]).filter(
          (zone): zone is ZoneRef => zone !== undefined,
        ) ?? []),
      ];
      const sourceZones = new Set(
        declaredZones.flatMap((zone) => (zone === "trashOrBattleArea" ? ["trash", "battleArea"] : [zone])),
      );
      const candidateFilter = { ...target.filter, zone: undefined };
      const candidates: (LooseCandidate & { permanentId?: string })[] = [];
      if (sourceZones.has("trash")) {
        candidates.push(
          ...candidateLooseInstances(ctx, { ...target, filter: { ...candidateFilter, zone: "trash" } }, ["trash"]),
        );
      }
      if (sourceZones.has("battleArea")) {
        for (const permanent of candidatePermanents(ctx, {
          ...target,
          filter: { ...candidateFilter, zone: "battleArea" },
        })) {
          if (permanent.topCard !== undefined) {
            candidates.push({
              instanceId: permanent.topCard.instanceId,
              cardId: permanent.topCard.cardId,
              ownerSeat: permanent.topCard.ownerSeat,
              permanentId: permanent.permanentId,
            });
          }
        }
      }
      const looseZones = [...sourceZones].filter((zone) => zone !== "trash" && zone !== "battleArea") as ZoneRef[];
      if (looseZones.length > 0) {
        candidates.push(...candidateLooseInstances(ctx, { ...target, filter: candidateFilter }, looseZones));
      }
      if (candidates.length === 0) return;

      const chosenIds = await pickLoose(
        ctx,
        target,
        candidates,
        undefined,
        ctx.ask,
        candidates.map(({ instanceId }) => instanceId),
      );
      const chosenPlacements: string[] = [];
      const chosenRelocations: { permanentId: string; shedOwnCards?: boolean }[] = [];
      for (const chosenId of chosenIds) {
        const selected = candidates.find(({ instanceId }) => instanceId === chosenId);
        if (selected === undefined) {
          return;
        }
        if (selected.permanentId !== undefined) {
          chosenRelocations.push({ permanentId: selected.permanentId, shedOwnCards: true });
        } else {
          chosenPlacements.push(selected.instanceId);
        }
      }
      if (chosenPlacements.length > 0) {
        ctx.pendingSelfReducerPlacements = [...(ctx.pendingSelfReducerPlacements ?? []), ...chosenPlacements];
      }
      if (chosenRelocations.length > 0) {
        ctx.pendingSelfReducerRelocations = [...(ctx.pendingSelfReducerRelocations ?? []), ...chosenRelocations];
      }
      const placedCount = chosenPlacements.length + chosenRelocations.length;
      ctx.playCostDelta = (ctx.playCostDelta ?? 0) + placedCount * reducer.amountPerPaid;
      return;
    }
    const receipt = { paidCount: 0 };
    if (await payCost(ctx, reducer.cost, receipt)) {
      const reduction =
        reducer.amountPerPaid === undefined ? reducer.amount : reducer.amountPerPaid * receipt.paidCount;
      ctx.playCostDelta = (ctx.playCostDelta ?? 0) + Math.max(0, reduction);
    }
    return;
  }
  if (reducer.costActions !== undefined) {
    if (!hasPayableLeadingSelectBind(ctx, reducer.costActions)) return;
    if (!(await accepts())) return;
    if (await runWouldBePlayedCostActions(ctx, reducer.costActions)) {
      ctx.playCostDelta = (ctx.playCostDelta ?? 0) + Math.max(0, reducer.amount);
    }
    return;
  }
  if (reducer.condition !== undefined && !evaluateCondition(ctx, reducer.condition)) return;
  const scale = reducer.scaling !== undefined ? scaleFactor(ctx, reducer.scaling) : 1;
  ctx.playCostDelta = (ctx.playCostDelta ?? 0) + Math.max(0, reducer.amount * scale);
}

/**
 * Read the reduction which automatically applies while this card remains in hand.
 *
 * This deliberately excludes every reducer with a payment or choice: targeting effects such
 * as LM-023 need the card's current use cost, not a speculative cost after a player might pay
 * an optional reducer. It is therefore the read-only counterpart to the final automatic branch
 * of {@link applyWouldBePlayedSelfReducer}.
 */
export function potentialWouldBePlayedSelfReduction(ctx: EffectContext, reducer: WouldBePlayedSelfReducer): number {
  if (reducer.pay !== undefined || reducer.cost !== undefined || reducer.costActions !== undefined) return 0;
  if (reducer.condition !== undefined && !evaluateCondition(ctx, reducer.condition)) return 0;
  const scale = reducer.scaling !== undefined ? scaleFactor(ctx, reducer.scaling) : 1;
  return Math.max(0, reducer.amount * scale);
}

/** Read-only availability of a paid action-body self reducer, before offering its clause. */
export function canPayWouldBePlayedSelfReducer(ctx: EffectContext, reducer: WouldBePlayedSelfReducer): boolean {
  return reducer.costActions !== undefined
    ? hasPayableLeadingSelectBind(ctx, reducer.costActions)
    : reducer.cost !== undefined
      ? canPayCost(ctx, reducer.cost)
      : false;
}

export function wouldBePlayedSelfReducerPaymentCandidates(
  ctx: EffectContext,
  reducer: WouldBePlayedSelfReducer,
): Permanent[] {
  const leading = reducer.costActions?.[0];
  return leading?.kind === "SelectBind" ? candidatePermanents(ctx, leading.target) : [];
}
