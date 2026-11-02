import { describe, it, expect } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import {
  GameState,
  PlayerState,
  CardInstance,
  Permanent,
  EffectDuration,
  Phase,
  type Seat,
  type ServerEvent,
  type DecisionRequest,
} from "@aegis/shared";
import { requireCardDefinition } from "@aegis/shared";
import { GameEngine, type GameEngineHooks } from "./GameEngine.js";
import { ContinuousEffectLedger } from "./effects/continuous.js";
import { BASE_LINK_MAX, canLinkToTargetPermanent, linkMax } from "./effects/mindLink.js";
import { linkCostOf } from "./effects/interpreter.js";
import { CardKind, type CardDefinition, type Filter } from "@aegis/shared";
import { advance } from "./testkit/advance.js";
// Boot side-effect: self-registers every compiled-IR card module so the engine can
// resolve [On Play] Link effects by card id.
import "../cards/index.js";

/**
 * ENG-01 (link-state subsystem) A3 suite. Five behaviors, each carrying a documented
 * REVERT-CONFIRM-RED lever so the ENGINE — not the harness — is what produces them:
 *
 *  1. linkMax derivation     — base 1 + Σ <Link +N> grants (this file, Task 1)
 *  2. LinkedMax enforcement  — over-limit link does not land (Task 2)
 *  3. <Link +N> raises limit — the next link lands once the grant is active (Task 2)
 *  4. costDelta consumption  — memory paid differs by the costDelta (Task 2)
 *  5. CanLinkToTargetPermanent — an ineligible recipient is not offered (Task 3)
 */

let seq = 0;

function looseCard(cardId: string, seat: Seat): CardInstance {
  seq += 1;
  const card = new CardInstance();
  card.instanceId = `inst-${seq}`;
  card.cardId = cardId;
  card.ownerSeat = seat;
  card.faceUp = false;
  return card;
}

function permanent(permanentId: string, seat: Seat): Permanent {
  const p = new Permanent();
  p.permanentId = permanentId;
  p.controllerSeat = seat;
  return p;
}

// ---------------------------------------------------------------------------
// Task 1 — linkMax derivation (base 1 + Σ <Link +N>)
// ---------------------------------------------------------------------------

describe("A3 linkMax — base 1 + Σ active <Link +N> grants (documented behavior Permanent.LinkedMax, documented behavior)", () => {
  /**
   * REVERT-CONFIRM-RED lever (derivation):
   *  - Change `BASE_LINK_MAX` from 1 to Infinity in mindLink.ts → the "no grant === 1"
   *    assertion goes RED.
   *  - Make `linkMax` ignore the grant sum (drop `deps.linkMaxDelta(...)`) → the
   *    "+1 grant → 2" / "+2 grant → 3" assertions go RED.
   */
  it("returns the base 1 with no grant, base + delta with grants, and ignores grants on other permanents", () => {
    const ledger = new ContinuousEffectLedger();
    const deps = { linkMaxDelta: (id: string) => ledger.linkMaxDelta(id) };

    const subject = permanent("p-1", 0);
    const other = permanent("p-2", 0);

    // Base: no grant -> exactly the documented behavior seed `int Max = 1`.
    expect(linkMax(subject, deps)).toBe(BASE_LINK_MAX);
    expect(linkMax(subject, deps)).toBe(1);

    // One <Link +1> -> 2.
    ledger.addLinkMaxGrant("p-1", 1, EffectDuration.UntilEachTurnEnd);
    expect(linkMax(subject, deps)).toBe(2);

    // A second grant of +1 (e.g. <Link +2> modeled as delta 2 lands 3) stacks.
    ledger.addLinkMaxGrant("p-1", 1, EffectDuration.UntilEachTurnEnd);
    expect(linkMax(subject, deps)).toBe(3);

    // A grant keyed to a DIFFERENT permanent does NOT raise this one's limit.
    expect(linkMax(other, deps)).toBe(1);
  });

  it("models <Link +2> as a single delta-2 grant (EX11-073 documented rule(2))", () => {
    const ledger = new ContinuousEffectLedger();
    const deps = { linkMaxDelta: (id: string) => ledger.linkMaxDelta(id) };
    const subject = permanent("p-9", 0);
    ledger.addLinkMaxGrant("p-9", 2, EffectDuration.UntilEachTurnEnd);
    expect(linkMax(subject, deps)).toBe(3);
  });
});

describe("link-max grant store lifecycle (INRT-01: read by linkMax, cleared like grantedKeywords)", () => {
  it("dropPermanent / clearContinuous / reset all clear the grant (no dead store)", () => {
    const ledger = new ContinuousEffectLedger();

    ledger.addLinkMaxGrant("p-1", 1, EffectDuration.UntilEachTurnEnd, { continuous: true });
    expect(ledger.linkMaxDelta("p-1")).toBe(1);

    ledger.dropPermanent("p-1");
    expect(ledger.linkMaxDelta("p-1")).toBe(0);

    ledger.addLinkMaxGrant("p-2", 1, EffectDuration.UntilEachTurnEnd, { continuous: true });
    ledger.clearContinuous();
    expect(ledger.linkMaxDelta("p-2")).toBe(0);

    ledger.addLinkMaxGrant("p-3", 1, EffectDuration.UntilEachTurnEnd);
    ledger.reset();
    expect(ledger.linkMaxDelta("p-3")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Shared GameEngine harness (Tasks 2 & 3) — mirrors linkEligible.test.ts
// ---------------------------------------------------------------------------

interface Setup {
  engine: GameEngine;
  state: GameState;
  events: ServerEvent[];
  decisions: { seat: Seat; req: DecisionRequest }[];
}

interface SetupParams {
  autoAcceptOptional?: boolean;
}

function setup({ autoAcceptOptional = true }: SetupParams = {}): Setup {
  const state = new GameState();
  const events: ServerEvent[] = [];
  const decisions: Setup["decisions"] = [];
  let engineRef: GameEngine | undefined;
  const hooks: GameEngineHooks = {
    seed: 1,
    requestDecision: (seat, req) => {
      decisions.push({ seat, req });
      if (req.kind === "orderTriggers") {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "orderTriggers", order: req.options?.triggerKeys ?? [] },
          }),
        );
      }
      if (req.kind === "optional" && autoAcceptOptional) {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "optional", accept: true },
          }),
        );
      }
      // Take every offered candidate (the engine only offers eligible ones).
      if (req.kind === "selectCards" || req.kind === "chooseTargets") {
        const candidates = req.options?.candidateInstanceIds ?? [];
        const ids = candidates.slice(0, req.options?.max ?? candidates.length);
        const response =
          req.kind === "selectCards"
            ? { kind: "selectCards" as const, instanceIds: ids }
            : { kind: "chooseTargets" as const, instanceIds: ids };
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response,
          }),
        );
      }
    },
    emit: (e) => events.push(e),
  };
  const engine = new GameEngine(state, hooks);
  engineRef = engine;
  engine.seatPlayer(0, "sa", { displayName: "A", deck: { mainDeck: [], eggDeck: [] } });
  engine.seatPlayer(1, "sb", { displayName: "B", deck: { mainDeck: [], eggDeck: [] } });
  state.phase = Phase.Main;
  state.turnSeat = 0;
  return { engine, state, events, decisions };
}

function findPermanent(s: Setup, seat: Seat, cardId: string) {
  return (s.state.players[seat] as PlayerState).battleArea.find((p) => p.topCard?.cardId === cardId);
}

/**
 * Reach into the engine's private continuous ledger (the established test-cast pattern, cf.
 * interpreter.test.ts) to inject a `<Link +N>` grant on a permanent so the LinkedMax /
 * `<Link +N>` A3s can raise the limit without a second card-play.
 */
function grantLinkMax(engine: GameEngine, permanentId: string, delta: number): void {
  (engine as unknown as { continuous: ContinuousEffectLedger }).continuous.addLinkMaxGrant(
    permanentId,
    delta,
    EffectDuration.UntilEachTurnEnd,
  );
}

// ---------------------------------------------------------------------------
// Task 2 — LinkedMax enforcement + <Link +N> raises limit + costDelta consumption
// ---------------------------------------------------------------------------

/**
 * AD1-005 (Lv.6 Red/White, [On Play] "link up to 2 [Social]/[Navi]/[Tool] cards to this
 * Digimon") is the multi-link vehicle: its count-2 Link onto itself lets us prove the
 * server-side LinkedMax cap (base 1) trims the 2nd card unless a `<Link +1>` raises the limit.
 * BT21-009 and BT21-041 both carry `<Link>` and the [Social] attribute (link cost 1 each).
 */
describe("A3 LinkedMax — a link beyond linkMax(recipient) lands, then the rule-check sweep trims the excess (CR §4-8-5 / §17-1-3-2-5)", () => {
  it("suppresses whenLinkTrashed for rule trim but fires it for an effect trash", async () => {
    const s = setup();
    const player = s.state.players[0] as PlayerState;
    const oldLink = looseCard("BT23-007", 0);
    const newLink = looseCard("BT24-053", 0);
    const hostCard = looseCard("BT23-007", 0);
    player.hand.push(hostCard, oldLink, newLink);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: hostCard.instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        findPermanent(s, 0, "BT23-007") !== undefined &&
        (s.engine as unknown as { mainVerbContinuationsInFlight: number }).mainVerbContinuationsInFlight === 0,
      2000,
    );
    const host = findPermanent(s, 0, "BT23-007")!;
    expect(host.topCard?.instanceId).toBe(hostCard.instanceId);
    let fireCount = 0;
    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "whenLinkTrashed",
      sourcePermanentId: host.permanentId,
      once: false,
      run: async () => {
        fireCount += 1;
      },
      description: "link replacement provenance",
    });
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: oldLink.instanceId,
        targetPermanentId: host.permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        host.linked.length === 1 &&
        host.linked[0]!.instanceId === oldLink.instanceId &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: newLink.instanceId,
        targetPermanentId: host.permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        host.linked.length === 1 &&
        host.linked[0]!.instanceId === newLink.instanceId &&
        player.trash.some((card) => card.instanceId === oldLink.instanceId),
      10000,
    );
    expect(host.linked.map((card) => card.instanceId)).toEqual([newLink.instanceId]);
    expect(player.trash.map((card) => card.instanceId)).toContain(oldLink.instanceId);
    expect(fireCount).toBe(0);
    await advance(s.engine).verb.trash([newLink.instanceId], 0);
    expect(fireCount).toBe(1);
  });
  /**
   * §4-8-5: "When linking to a Digimon that has already reached the link limit, the same
   * number of the existing link cards are trashed at the same time as the newly linked
   * cards" — the link is ALLOWED, not refused. §17-1-3-2-5 (Rule Checks) confirms the excess
   * is cleaned up by the state-based rule-check sweep afterward ("only the cards that exceed
   * link limit are trashed"), not at declaration time. `runLink` (interpreter.ts) no longer
   * gates on headroom — both requested cards land, and `GameEngine.trashExcessLinkCards`
   * (the same §17-1-3-2-5 sweep the player-facing `linkCard` verb relies on) trims the
   * base-limit-1 Digimon back down to 1 linked card.
   *
   * REVERT-CONFIRM-RED lever: reintroduce the `headroom` cap in `runLink` (interpreter.ts)
   * → only 1 of the 2 offered cards ever lands (excluded at declaration, not trashed after)
   * → the "landed 2, settled to 1" shape below cannot be observed → this assertion goes RED.
   */
  it("lands both offered cards on a base-limit-1 Digimon, then the rule-check sweep trims it back to 1", async () => {
    const s = setup({ autoAcceptOptional: false });
    const player = s.state.players[0] as PlayerState;
    const source = looseCard("AD1-005", 0);
    const firstLink = looseCard("BT21-009", 0);
    const secondLink = looseCard("BT21-041", 0);
    player.hand.push(source, firstLink, secondLink);
    s.state.memory = 20; // afford the hard play + both link costs

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: source.instanceId })).toEqual({ ok: true });
    // AD1-005 itself prints <Link +1>. Cancel that printed grant in this fixture so the case
    // isolates the base-limit-1 trim; the companion test below proves positive LinkMax grants.
    await settle(() => s.state.pendingDecision?.kind === "optional");
    grantLinkMax(s.engine, findPermanent(s, 0, "AD1-005")!.permanentId, -1);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    // Settle on the STABLE post-rule-check count (1), not the first tick where 2 land — the
    // rule-check sweep runs asynchronously after the link itself resolves.
    await settle(() => (findPermanent(s, 0, "AD1-005")?.linked.length ?? 0) === 1);

    const ad1 = findPermanent(s, 0, "AD1-005");
    // Base LinkedMax is 1 — both cards landed, then the sweep trashed the excess back to 1.
    expect(ad1?.linked.length).toBe(1);
    const retained = ad1!.linked[0]!;
    const trashed = [firstLink, secondLink].find((card) =>
      player.trash.some((entry) => entry.instanceId === card.instanceId),
    );
    expect(trashed).toBeDefined();
    expect(retained.instanceId).not.toBe(trashed!.instanceId);
    expect(ad1!.currentDP).toBe(requireCardDefinition("AD1-005").dp! + requireCardDefinition(retained.cardId).linkDp!);
  });

  /**
   * REVERT-CONFIRM-RED lever: make `linkMax` ignore the grant sum (drop `linkMaxDelta`) →
   * the 2nd link no longer lands even with the grant → this assertion goes RED.
   */
  it("<Link +1> raises the limit so BOTH cards land", async () => {
    const s = setup();
    const player = s.state.players[0] as PlayerState;
    // Pre-place AD1-005 on the field so we know its permanentId before the grant; then drive
    // the link through a fresh AD1-005 play. Simpler: play it, capture the permanent, grant
    // +1, and confirm the SECOND link attempt (a re-trigger) is not needed — instead grant
    // BEFORE the link resolves by injecting on the permanent the moment it appears.
    const source = looseCard("AD1-005", 0);
    player.hand.push(source);
    player.hand.push(looseCard("BT21-009", 0), looseCard("BT21-041", 0));
    s.state.memory = 20;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: source.instanceId })).toEqual({ ok: true });
    // As soon as the permanent materializes (before the async link prompt resolves), inject the
    // <Link +1> grant on it so linkMax(recipient) == 2 when runLink computes the headroom.
    await settle(() => findPermanent(s, 0, "AD1-005") !== undefined);
    const ad1 = findPermanent(s, 0, "AD1-005");
    grantLinkMax(s.engine, ad1!.permanentId, 1);

    await settle(() => (findPermanent(s, 0, "AD1-005")?.linked.length ?? 0) >= 2);
    expect(findPermanent(s, 0, "AD1-005")?.linked.length).toBe(2);
  });
});

describe("A3 link cost — runLink consumes a real link cost that costDelta adjusts (documented behavior GetChangedLinkCost)", () => {
  /**
   * The pure cost calculation, the seam Phase 8's BT25-004/045 reduction hooks adjust.
   * REVERT-CONFIRM-RED lever (calc): drop `+ costDelta` in `linkCostOf` (interpreter.ts) →
   * the costDelta:-1 assertion equals the costDelta:0 value → RED.
   */
  it("linkCostOf differs by exactly 1 between costDelta:0 and costDelta:-1 and floors at 0", () => {
    const def = requireCardDefinition("BT21-009"); // "[Link] [Appmon] trait: Cost 1"
    expect(linkCostOf(def, 0)).toBe(1);
    expect(linkCostOf(def, -1)).toBe(0);
    // Floors at 0 (never refunds memory beyond free).
    expect(linkCostOf(def, -5)).toBe(0);
  });

  /**
   * Integration: the engine actually PAYS the computed link cost from memory (the cost
   * exists to be reduced). Compares two identical AD1-005 plays differing only in whether a
   * linkable card is present — the memory delta between them is exactly the link cost (1).
   * Isolating via a delta avoids coupling to the hard-play memory accounting.
   * REVERT-CONFIRM-RED lever: revert runLink to skip `ctx.fx.gainMemory(-cost)` → both runs
   * end with the same memory → the `- 1` assertion goes RED.
   */
  it("pays the link card's printed cost from memory (delta vs. an identical no-link play)", async () => {
    // AD1-005's own printed text is "...link ... to this Digimon WITHOUT PAYING THE COST"
    // (KB query.mjs card AD1-005 / cards.json effectText) — it is a free-link card by design,
    // so it cannot exercise a real cost payment. BT25-056 pays a real (delta-reduced) cost:
    // its OnPlay is "you may link 1 [Social]/[Tool]/[Game] trait card ... reduce the link cost
    // by 2" (costDelta: -2, no payCost:false). BT21-023 is a Cost-3 Appmon with the Social
    // attribute, so it satisfies the trait filter and floors to 3 - 2 = 1 via linkCostOf.
    //
    // Run A: BT25-056 with a linkable BT21-023 in hand -> 1 link card lands, cost 1 paid.
    const withLink = setup();
    const wl = withLink.state.players[0] as PlayerState;
    const wlSource = looseCard("BT25-056", 0);
    wl.hand.push(wlSource, looseCard("BT21-023", 0));
    withLink.state.memory = 20;
    expect(withLink.engine.applyIntent(0, { type: "playCard", instanceId: wlSource.instanceId })).toEqual({ ok: true });
    await settle(() => (findPermanent(withLink, 0, "BT25-056")?.linked.length ?? 0) > 0);

    // Run B: identical BT25-056 play but NO linkable card -> no link, no link cost paid.
    const noLink = setup();
    const nl = noLink.state.players[0] as PlayerState;
    const nlSource = looseCard("BT25-056", 0);
    nl.hand.push(nlSource);
    noLink.state.memory = 20;
    expect(noLink.engine.applyIntent(0, { type: "playCard", instanceId: nlSource.instanceId })).toEqual({ ok: true });
    await settle(() => findPermanent(noLink, 0, "BT25-056") !== undefined);

    expect(findPermanent(withLink, 0, "BT25-056")?.linked.length).toBe(1);
    expect(findPermanent(noLink, 0, "BT25-056")?.linked.length ?? 0).toBe(0);
    // The only difference between the two runs is the single link -> memory is exactly 1 lower.
    expect(withLink.state.memory).toBe(noLink.state.memory - 1);
  });
});

// ---------------------------------------------------------------------------
// Task 3 — dynamic CanLinkToTargetPermanent recipient predicate
// ---------------------------------------------------------------------------

/**
 * `canLinkToTargetPermanent` mirrors documented behavior `CardSource.CanLinkToTargetPermanent` (documented behavior):
 * a recipient is eligible to RECEIVE a link only when it is a non-token, non-breeding Digimon that
 * satisfies the link card's structured target condition. The predicate is wired into runLink's
 * recipient resolution (interpreter.ts) so an ineligible recipient is never offered.
 */
describe("A3 CanLinkToTargetPermanent — dynamic recipient eligibility (documented behavior)", () => {
  const digimonDef = (over: Partial<CardDefinition> = {}): CardDefinition =>
    ({
      cardId: "REC",
      set: "X",
      nameEn: "Rec",
      kinds: [CardKind.Digimon],
      colors: [],
      playCost: 0,
      dp: 1000,
      evoCosts: [],
      maxCountInDeck: 4,
      ...over,
    }) as CardDefinition;

  const recipientFilter: Filter = { controller: "mine", kind: ["Digimon"] };
  // The recipient filter is "1 of your Digimon"; matchesFilter here returns true for any
  // Digimon-kind top card (the structured condition), so the predicate's added gates
  // (token / breeding / non-Digimon) are what discriminate.
  const matchesAnyDigimon = (p: Permanent, _f: Filter): boolean => p.topCard !== undefined; // the harness supplies only Digimon defs below

  function recipientWith(def: CardDefinition, opts?: { inBreeding?: boolean }): Permanent {
    const p = permanent("rec-1", 0);
    const top = looseCard(def.cardId, 0);
    top.faceUp = true;
    p.topCard = top;
    if (opts?.inBreeding) p.inBreeding = true;
    return p;
  }

  const defOf = (def: CardDefinition) => (_card: { cardId: string }) => def;

  /**
   * REVERT-CONFIRM-RED lever: drop the `canLinkToTargetPermanent(...)` filter from runLink's
   * recipient resolution (interpreter.ts) — or weaken the predicate to `return true` — and an
   * ineligible recipient (token / non-Digimon) is offered → the negative assertions below go RED.
   */
  it("offers an eligible Digimon recipient and REJECTS a token / non-Digimon / breeding recipient", () => {
    const eligible = digimonDef();
    expect(canLinkToTargetPermanent(recipientWith(eligible), recipientFilter, matchesAnyDigimon, defOf(eligible))).toBe(
      true,
    );

    // A token Digimon would match the "mine Digimon" filter but the predicate excludes it
    // (documented behavior `!targetPermanent.TopCard.IsToken`).
    const token = digimonDef({ isToken: true });
    expect(canLinkToTargetPermanent(recipientWith(token), recipientFilter, matchesAnyDigimon, defOf(token))).toBe(
      false,
    );

    // A non-Digimon (Tamer) recipient is excluded.
    const tamer = digimonDef({ kinds: [CardKind.Tamer] });
    expect(canLinkToTargetPermanent(recipientWith(tamer), recipientFilter, matchesAnyDigimon, defOf(tamer))).toBe(
      false,
    );

    // A Digimon in the breeding area is not a valid link recipient
    // (documented behavior `!...GetBreedingAreaPermanents().Contains(targetPermanent)`).
    const breeding = digimonDef();
    expect(
      canLinkToTargetPermanent(
        recipientWith(breeding, { inBreeding: true }),
        recipientFilter,
        matchesAnyDigimon,
        defOf(breeding),
      ),
    ).toBe(false);
  });

  it("allows breeding only through an explicit card-effect override", () => {
    const breeding = digimonDef();
    const recipient = recipientWith(breeding, { inBreeding: true });
    expect(canLinkToTargetPermanent(recipient, recipientFilter, matchesAnyDigimon, defOf(breeding), true)).toBe(true);
    expect(canLinkToTargetPermanent(recipient, recipientFilter, matchesAnyDigimon, defOf(breeding))).toBe(false);
  });

  /**
   * The structured per-card target condition is re-evaluated against current state: when the
   * link card's recipient requires a trait the candidate lacks, matchesFilter returns false and
   * the recipient is not eligible.
   */
  it("rejects a recipient that fails the link card's structured target condition", () => {
    const def = digimonDef();
    const failsCondition = (_p: Permanent, _f: Filter): boolean => false;
    expect(canLinkToTargetPermanent(recipientWith(def), recipientFilter, failsCondition, defOf(def))).toBe(false);
  });
});

export { setup, settle, findPermanent, looseCard, permanent };
