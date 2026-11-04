import { getCardDefinition, getCompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT2/BT2-018.js";
import "./EX3-011.js";
import "./EX3-065.js";

describe("EX3-011 Lavogaritamon", () => {
  it("has its official identity and both printed evolution colors", () => {
    expect(getCardDefinition("EX3-011")).toMatchObject({
      cardId: "EX3-011",
      nameEn: "Lavogaritamon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 8,
      dp: 7000,
      evoCosts: [
        { color: "Red", level: 4, memoryCost: 3 },
        { color: "Black", level: 4, memoryCost: 3 },
      ],
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Rock Dragon"],
      rarity: "R",
      imageId: "EX3-011",
      effectText:
        "[On Play] Delete 1 of your opponent's Digimon with 5000 DP or less. Then, you may play 1 [Hina Kurihara] from your hand without paying the cost.",
      inheritedEffectText:
        "[All Turns][Once Per Turn] When an opponent's Digimon is deleted, if this Digimon has an [On Play] effect, gain 1 memory.",
    });
  });

  it("publishes both printed clauses as complete compiled IR", () => {
    expect(getCompiledCard("EX3-011")).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 5000 } },
                count: 1,
              },
            },
            {
              kind: "PlayWithoutCost",
              target: {
                filter: { controller: "mine", nameOrTrait: [{ tokens: ["Hina Kurihara"], match: "nameExact" }] },
                count: 1,
              },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
        },
        {
          trigger: "AllTurns",
          isInherited: true,
          frequency: "OncePerTurn",
          actions: [
            {
              kind: "SubTrigger",
              event: "onDeletionOf",
              sourceFilter: { controller: "opponent", kind: ["Digimon"] },
              actions: [
                {
                  kind: "GainMemory",
                  amount: 1,
                  condition: { kind: "selfHasOnPlayEffect" },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it.each([
    ["red", "BT1-014"],
    ["black", "BT10-061"],
  ])("evolves from a %s level 4 for the printed cost", async (_color, baseCardId) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: baseCardId, as: "base" }],
        hand: [{ card: "EX3-011", as: "lavogaritamon" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lavogaritamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX3-011");
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual([baseCardId]);
    expect(s.state.memory).toBe(1);
  });

  it("rejects a blue level 4 source and keeps the card in hand", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-032", as: "base" }],
        hand: [{ card: "EX3-011", as: "lavogaritamon" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lavogaritamon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("EX3-011");
    expect(s.state.memory).toBe(4);
  });

  it("publishes a sourced mandatory choice containing only opposing Digimon at 5000 DP or less", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "EX3-011", as: "lavogaritamon" }] },
      1: {
        battleArea: [
          { card: "BT1-009", as: "belowLimit" },
          { card: "BT1-013", as: "atLimit" },
          { card: "BT1-019", as: "aboveLimit" },
        ],
      },
    });
    s.state.memory = 8;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("lavogaritamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision !== undefined);
    const payload = JSON.parse(s.state.pendingDecision!.payloadJson) as {
      candidateInstanceIds: string[];
      visibleInstanceIds: string[];
      min: number;
      max: number;
    };
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "EX3-011",
      options: { timing: "OnPlay", min: 1, max: 1 },
    });
    expect(payload.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.perm("belowLimit").permanentId, s.perm("atLimit").permanentId]),
    );
    expect(payload.visibleInstanceIds).toEqual(payload.candidateInstanceIds);
    expect(payload.candidateInstanceIds).not.toContain(s.perm("aboveLimit").permanentId);
  });

  it("deletes one opposing 5000 DP Digimon, preserves 6000 DP, and may play Hina from hand", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-011", as: "lavogaritamon" },
            { card: "EX3-065", as: "hina" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "atLimit", dp: 5000 },
            { card: "BT1-010", as: "aboveLimit", dp: 6000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 12;
    await s.ready();
    const atLimitInstanceId = s.perm("atLimit").topCard.instanceId;
    const aboveLimitPermanentId = s.perm("aboveLimit").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("lavogaritamon").instanceId,
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.players[1]!.trash.some(({ instanceId }) => instanceId === atLimitInstanceId));
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-065"));
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(aboveLimitPermanentId);
    expect(s.state.memory).toBe(4);
  });

  it("resolves the mandatory deletion before offering the optional Hina play", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "EX3-011", as: "lavogaritamon" },
          { card: "EX3-065", as: "hina" },
        ],
      },
      1: {
        battleArea: [
          { card: "BT1-013", as: "target", dp: 5000 },
          { card: "BT1-010", as: "otherTarget", dp: 4000 },
        ],
      },
    });
    s.state.memory = 8;
    await s.ready();
    const targetId = s.perm("target").permanentId;
    const targetInstanceId = s.perm("target").topCard.instanceId;
    const hinaId = s.inst("hina").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("lavogaritamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision !== undefined);
    expect(s.state.pendingDecision).toMatchObject({ kind: "chooseTargets" });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [targetId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(targetInstanceId);
    expect(s.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-010")).toBe(true);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(hinaId);
    expect(s.state.pendingDecision).toMatchObject({ kind: "optional" });

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(s.state.pendingDecision).toMatchObject({ kind: "selectCards" });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [hinaId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-065")).toBe(true);
  });

  it("gains memory only once when Hina reactivates its Dragon carrier's On Play deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX3-011", as: "base" },
            { card: "EX3-065", as: "hina" },
          ],
          hand: [{ card: "BT2-018", as: "volcanicdramon" }],
        },
        1: {
          battleArea: [
            { card: "BT1-010", dp: 3000 },
            { card: "BT1-010", dp: 3000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("volcanicdramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("hina").isSuspended);
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(3);
    expect(s.perm("hina").isSuspended).toBe(true);
  });

  it("resets the inherited once-per-turn memory gain after public turn completion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-018", under: ["EX3-011"], as: "carrier" }],
          hand: [
            { card: "EX3-011", as: "firstDeletion" },
            { card: "EX3-011", as: "secondDeletion" },
            { card: "EX3-011", as: "thirdDeletion" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "firstTarget", dp: 3000 },
            { card: "BT1-010", as: "secondTarget", dp: 3000 },
            { card: "BT1-010", as: "thirdTarget", dp: 3000 },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.state.memory).toBe(20);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstDeletion").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 2);
    expect(s.state.memory).toBe(10);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondDeletion").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    expect(s.state.memory).toBe(2);

    const completeTurn = async (seat: 0 | 1): Promise<void> => {
      s.state.turnSeat = seat;
      s.state.memory = 0;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(seat);
      expect(s.engine.applyIntent(seat, { type: "endPhase" })).toEqual({ ok: true });
      await turn;
    };
    await completeTurn(0);
    await completeTurn(1);

    s.state.turnSeat = 0;
    s.state.memory = 0;
    const nextControllerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 8;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("thirdDeletion").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.memory).toBe(1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await nextControllerTurn;
  });

  it("does not gain memory when the carrier has no On Play effect", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", under: ["EX3-011"], as: "carrier", dp: 12_000 }] },
      1: { battleArea: [{ card: "BT1-010", as: "target", dp: 5000, suspended: true }] },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("carrier").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.memory).toBe(0);
  });

  it("allows the optional Hina play to be declined without moving it from hand", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-011", as: "lavogaritamon" },
            { card: "EX3-065", as: "hina" },
          ],
        },
        1: { battleArea: [{ card: "BT1-013", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();
    const hinaId = s.inst("hina").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("lavogaritamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.pendingDecision?.kind === "optional" && s.decisions.at(-1)?.req.sourceCardId === "EX3-011",
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(hinaId);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-065")).toBe(false);
  });
});
