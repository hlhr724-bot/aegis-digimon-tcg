import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { placeAtStartOfMain } from "#api/cards/BT26/tamerStack.testSupport";
import { identityVisibility, stackIds } from "#api/cards/ST24/tamerStack.testSupport";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, settle, setupEngine } from "#api/engine/testkit/harness";
import { compiled } from "#api/cards/BT27/BT27-091";
import "#api/cards/index";

function setupSuspendWatcher(options: { tomoroSuspended?: boolean; decline?: boolean } = {}) {
  return setupEngine(
    {
      0: {
        battleArea: [
          {
            card: "BT27-091",
            as: "tomoro",
            suspended: options.tomoroSuspended === true,
            under: [{ card: "BT1-011", as: "existing", faceUp: false }],
          },
          { card: "BT1-009", as: "ownDigimon" },
          { card: "BT1-085", as: "ownTamer" },
        ],
        deck: [
          { card: "BT1-010", as: "topCard" },
          { card: "BT1-012", as: "nextCard" },
        ],
      },
      1: { battleArea: [{ card: "BT1-013", as: "opponentDigimon" }] },
    },
    options.decline === true
      ? { autoDeclineOptional: true, autoSelectCards: true }
      : { autoAcceptOptional: true, autoSelectCards: true },
  );
}

describe("BT27-091 Tomoro Tenma", () => {
  it("preserves the printed card and complete compiled coverage", () => {
    expect(getCardDefinition("BT27-091")).toMatchObject({
      nameEn: "Tomoro Tenma",
      colors: ["Green"],
      kinds: ["Tamer"],
      playCost: 3,
      types: ["Glowing Dawn", "BEATBREAK"],
      rarity: "U",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["StartOfYourMainPhase", "AllTurns", "Security"]);
  });

  it("places a BEATBREAK hand card face down at the bottom, draws 1, and gains 1 memory", async () => {
    const { s, placedId, priorIds, finish } = await placeAtStartOfMain("BT27-091", "P-236", {
      0: {
        hand: [
          { card: "BT25-035", as: "beatbreakDigimon" },
          { card: "BT26-094", as: "dataSquad" },
          { card: "BT1-009", as: "noTrait" },
        ],
      },
    });

    const offered = s.decisions
      .filter(({ req }) => req.kind === "selectCards")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(new Set(offered)).toEqual(new Set([placedId, s.inst("beatbreakDigimon").instanceId]));
    expect(stackIds(s.perm("tamer"))).toEqual([placedId, ...priorIds]);
    expect(s.perm("tamer").stack[0]).toMatchObject({ faceUp: false });
    expect(identityVisibility(s, s.inst("placed"))).toEqual({ owner: true, opponent: false });
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(placedId);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    await finish();
  });

  it("skips the draw and memory without a BEATBREAK card to place", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-091", as: "tomoro" }],
          hand: [{ card: "BT26-094", as: "dataSquad" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: { deck: ["BT1-013", "BT1-014"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(s.state.memory).toBe(0);
    expect(s.perm("tomoro").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("dataSquad").instanceId);
    expect(s.state.players[0]!.deck).toHaveLength(4);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each([
    ["its owner's", "ownDigimon", 0],
    ["the opponent's", "opponentDigimon", 1],
  ] as const)(
    "suspends to place the top deck card face down at the bottom when %s Digimon suspends",
    async (_, alias, seat) => {
      const s = setupSuspendWatcher();
      await s.ready();

      await advance(s.engine).verb.suspend([s.perm(alias).permanentId], seat);
      await settle(() => s.perm("tomoro").stack.length === 2);

      expect(s.perm("tomoro").isSuspended).toBe(true);
      expect(stackIds(s.perm("tomoro"))).toEqual([s.inst("topCard").instanceId, s.inst("existing").instanceId]);
      expect(s.perm("tomoro").stack.every((card) => card.faceUp === false)).toBe(true);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("nextCard").instanceId]);
      assertNoLoudGap(s);
    },
  );

  it("stays active and places nothing when the suspend reaction is declined", async () => {
    const s = setupSuspendWatcher({ decline: true });
    await s.ready();

    await advance(s.engine).verb.suspend([s.perm("opponentDigimon").permanentId], 1);
    await settle(() => s.perm("opponentDigimon").isSuspended);

    expect(s.perm("tomoro").isSuspended).toBe(false);
    expect(s.perm("tomoro").stack).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("cannot pay the suspension while already suspended", async () => {
    const s = setupSuspendWatcher({ tomoroSuspended: true });
    await s.ready();

    await advance(s.engine).verb.suspend([s.perm("ownDigimon").permanentId], 0);
    await settle(() => s.perm("ownDigimon").isSuspended);

    expect(s.decisions.some(({ req }) => req.kind === "optional")).toBe(false);
    expect(s.perm("tomoro").stack).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("does not react when a Tamer suspends", async () => {
    const s = setupSuspendWatcher();
    await s.ready();

    await advance(s.engine).verb.suspend([s.perm("ownTamer").permanentId], 0);
    await settle(() => s.perm("ownTamer").isSuspended);

    expect(s.perm("tomoro").isSuspended).toBe(false);
    expect(s.perm("tomoro").stack).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("reacts to a Digimon suspending to attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-091", as: "tomoro" },
            { card: "BT25-035", as: "attacker" },
          ],
          deck: [{ card: "BT1-010", as: "topCard" }],
        },
        1: { security: ["BT1-013", "BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tomoro").stack.length === 1);

    expect(s.perm("tomoro").isSuspended).toBe(true);
    expect(stackIds(s.perm("tomoro"))).toEqual([s.inst("topCard").instanceId]);
  });

  it("plays itself from security without paying the cost", async () => {
    const s = setupEngine({ 0: { security: [{ card: "BT27-091", as: "securityTomoro" }] } });
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityTomoro"));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("securityTomoro").instanceId,
    ]);
    expect(s.state.memory).toBe(0);
  });
});
