import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { type EngineSetup, setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT8/BT8-082.js";
import "../BT9/BT9-040.js";
import "../BT9/BT9-082.js";
import "../EX6/EX6-074.js";
import "./ST10-04.js";
import "./ST10-06.js";

describe("ST10-04 Gatomon", () => {
  it("adds one yellow and one purple Digimon from the revealed top 3", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "ST10-04", as: "gatomon" }],
          deck: [
            { card: "ST10-02", as: "yellow" },
            { card: "ST10-07", as: "purple" },
            { card: "ST10-14", as: "rest" },
          ],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gatomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 2);
    expect(s.state.players[0]!.hand.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining([s.inst("yellow").instanceId, s.inst("purple").instanceId]),
    );
    expect(s.state.players[0]!.deck.map((c) => c.instanceId)).toEqual([s.inst("rest").instanceId]);
  });

  it("requires a choice when a mandatory reveal slot has multiple matches", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "ST10-04", as: "gatomon" }],
          deck: [
            { card: "ST10-02", as: "yellowA" },
            { card: "BT1-048", as: "yellowB" },
            { card: "ST10-07", as: "purple" },
          ],
        },
      },
      { autoOrderTriggers: false },
    );
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("gatomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(s.decisions.at(-1)?.req.sourceCardId).toBe("ST10-04");
    const pending = s.state.pendingDecision!;
    const payload = JSON.parse(pending.payloadJson) as { min: number; max: number };
    expect(payload).toMatchObject({ min: 1, max: 1 });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: false, reason: "decision-pending" });
  });

  it("shows the full reveal and confirms even a single eligible card", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "ST10-04", as: "gatomon" }],
          deck: [
            { card: "ST10-02", as: "yellow" },
            { card: "ST10-07", as: "purple" },
            { card: "ST10-14", as: "ineligible" },
          ],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: false },
    );
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("gatomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const first = s.decisions.at(-1)!.req;
    expect(first.sourceCardId).toBe("ST10-04");
    expect(first.options?.candidateInstanceIds).toEqual([s.inst("yellow").instanceId]);
    expect(first.options?.visibleInstanceIds).toEqual(
      expect.arrayContaining([
        s.inst("yellow").instanceId,
        s.inst("purple").instanceId,
        s.inst("ineligible").instanceId,
      ]),
    );
    expect(first.options).toMatchObject({ min: 1, max: 1 });

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: first.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("yellow").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards" && s.decisions.length >= 2);

    const second = s.decisions.at(-1)!.req;
    expect(second.sourceCardId).toBe("ST10-04");
    expect(second.options?.candidateInstanceIds).toEqual([s.inst("purple").instanceId]);
    expect(second.options?.visibleInstanceIds).toEqual(
      expect.arrayContaining([
        s.inst("yellow").instanceId,
        s.inst("purple").instanceId,
        s.inst("ineligible").instanceId,
      ]),
    );
  });

  it("reduces its digivolution cost by 2 into an Archangel", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "ST10-04", as: "gatomon" }], hand: [{ card: "ST10-05", as: "angewomon" }] } },
      { autoOrderTriggers: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gatomon").permanentId,
        instanceId: s.inst("angewomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("gatomon").topCard.instanceId === s.inst("angewomon").instanceId);
    expect(s.state.memory).toBe(2);
  });

  it("may DNA digivolve its host and another Digimon at end of turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST10-05", as: "yellow", under: ["ST10-04"] },
            { card: "ST10-12", as: "purple" },
          ],
          hand: [{ card: "ST10-06", as: "mastemon" }],
        },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
    );
    await advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("yellow").stack.find((c) => c.cardId === "ST10-04")!,
    );
    const result = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("mastemon").instanceId);
    expect(result).toBeDefined();
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(result!.stack.map((card) => card.cardId)).toEqual(expect.arrayContaining(["ST10-04", "ST10-05", "ST10-12"]));
  });

  it("DNA digivolves two dual-color Ophanimon Falldown Mode into Ordinemon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT8-082", as: "host", under: ["ST10-04"] },
            { card: "BT8-082", as: "partner" },
          ],
          hand: [{ card: "BT9-082", as: "ordinemon" }],
        },
      },
      {
        autoAcceptOptional: true,
        autoOrderTriggers: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("host").permanentId, s.perm("partner").permanentId, s.inst("ordinemon").instanceId);

    await advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("host").stack.find((card) => card.cardId === "ST10-04")!,
    );

    const ordinemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
    );
    expect(ordinemon).toBeDefined();
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(ordinemon!.stack.map((card) => card.cardId)).toEqual(["BT8-082", "ST10-04", "BT8-082"]);
  });

  it("DNA digivolves the two Falldown Mode during the real end-of-turn flow", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT8-082", as: "host", under: ["ST10-04"] },
            { card: "BT8-082", as: "partner" },
          ],
          hand: [{ card: "BT9-082", as: "ordinemon" }],
          deck: ["ST10-01"],
        },
        1: { deck: ["ST10-01"] },
      },
      {
        autoAcceptOptional: true,
        autoOrderTriggers: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("host").permanentId, s.perm("partner").permanentId, s.inst("ordinemon").instanceId);
    s.state.memory = 3;

    const turn = s.engine.runOneTurn();
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    await settle(() => mainPhase.isOpen);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
      ),
    );
    await turn;

    const ordinemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
    );
    expect(ordinemon).toBeDefined();
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(ordinemon!.stack.map((card) => card.cardId)).toEqual(["BT8-082", "ST10-04", "BT8-082"]);
  });

  it("DNA digivolves the two Falldown Mode when memory crossing ends the turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT8-082", as: "host", under: ["ST10-04"] },
            { card: "BT8-082", as: "partner" },
          ],
          hand: [
            { card: "BT9-082", as: "ordinemon" },
            { card: "BT1-010", as: "memoryPass" },
          ],
          deck: ["ST10-01"],
        },
        1: { deck: ["ST10-01"] },
      },
      {
        autoAcceptOptional: true,
        autoOrderTriggers: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("host").permanentId, s.perm("partner").permanentId, s.inst("ordinemon").instanceId);
    s.state.memory = 2;

    const turn = s.engine.runOneTurn();
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    await settle(() => mainPhase.isOpen);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("memoryPass").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
      ),
    );
    await turn;

    const ordinemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
    );
    expect(ordinemon).toBeDefined();
    expect(ordinemon!.stack.map((card) => card.cardId)).toEqual(["BT8-082", "ST10-04", "BT8-082"]);
  });

  it("keeps Gatomon's inherited DNA after Angewomon X evolves into Falldown Mode", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT9-040",
              as: "angewomonX",
              under: ["ST10-04", "ST10-05"],
            },
            { card: "BT8-082", as: "partner" },
          ],
          hand: [
            { card: "BT8-082", as: "hostOphanimon" },
            { card: "BT9-082", as: "ordinemon" },
          ],
          deck: ["BT1-010", "ST10-01"],
          security: ["BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015"],
        },
        1: { deck: ["ST10-01"] },
      },
      {
        autoAcceptOptional: true,
        autoOrderTriggers: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("angewomonX").permanentId, s.perm("partner").permanentId, s.inst("ordinemon").instanceId);
    s.state.memory = 2;

    const turn = s.engine.runOneTurn();
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    await settle(() => mainPhase.isOpen);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("angewomonX").permanentId,
        instanceId: s.inst("hostOphanimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("angewomonX").topCard.instanceId === s.inst("hostOphanimon").instanceId);
    expect(s.state.memory).toBe(-2);
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
      ),
    );
    await turn;

    const ordinemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("ordinemon").instanceId,
    );
    expect(ordinemon).toBeDefined();
    expect(ordinemon!.stack.map((card) => card.cardId)).toEqual([
      "BT8-082",
      "ST10-04",
      "ST10-05",
      "BT9-040",
      "BT8-082",
    ]);
  });

  it("does not offer Ordinemon for two mono-yellow Ophanimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT2-040", as: "host", under: ["ST10-04"] },
            { card: "P-053", as: "partner" },
          ],
          hand: [{ card: "BT9-082", as: "ordinemon" }],
        },
      },
      {
        autoAcceptOptional: true,
        autoOrderTriggers: true,
        autoSelectCards: true,
      },
    );

    await advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("host").stack.find((card) => card.cardId === "ST10-04")!,
    );

    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("ordinemon").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("performs the inherited DNA during the real end-of-turn flow", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST10-05", as: "yellow", under: ["ST10-04"] },
            { card: "ST10-12", as: "purple" },
          ],
          hand: [
            { card: "ST10-06", as: "mastemon" },
            { card: "ST10-05", as: "normalEvolution" },
          ],
          deck: ["ST10-01"],
        },
        1: { deck: ["ST10-01"] },
      },
      {
        autoAcceptOptional: true,
        autoOrderTriggers: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("yellow").permanentId, s.perm("purple").permanentId, s.inst("mastemon").instanceId);
    s.state.memory = 3;

    const turn = s.engine.runOneTurn();
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    await settle(() => mainPhase.isOpen);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("mastemon").instanceId,
      ),
    );
    await turn;

    const mastemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("mastemon").instanceId,
    );
    expect(mastemon).toBeDefined();
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(mastemon!.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["ST10-04", "ST10-05", "ST10-12"]),
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("normalEvolution").instanceId)).toBe(
      true,
    );
  });

  it("does not fall back to a normal digivolution without a second DNA material", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST10-05", as: "host", under: ["ST10-04"] }],
          hand: [{ card: "ST10-05", as: "normalEvolution" }],
        },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
    );

    await advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("host").stack.find((card) => card.cardId === "ST10-04")!,
    );

    expect(s.perm("host").topCard.cardId).toBe("ST10-05");
    expect(s.perm("host").stack.map((card) => card.cardId)).toContain("ST10-04");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("normalEvolution").instanceId)).toBe(
      true,
    );
  });

  it("does not consume two valid materials for a non-DNA result", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST10-05", as: "yellow", under: ["ST10-04"] },
            { card: "ST10-12", as: "purple" },
          ],
          hand: [{ card: "BT9-112", as: "normalLevel7" }],
        },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    await advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("yellow").stack.find((card) => card.cardId === "ST10-04")!,
    );

    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("normalLevel7").instanceId)).toBe(true);
  });

  it("does not open a pending-effect or material modal when no DNA card is in hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST10-05", as: "yellow", under: ["ST10-04"] },
            { card: "ST10-12", as: "purple" },
          ],
          hand: [{ card: "ST10-05", as: "normalEvolution" }],
        },
      },
      { autoOrderTriggers: false },
    );

    await advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("yellow").stack.find((card) => card.cardId === "ST10-04")!,
    );

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.decisions).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("normalEvolution").instanceId)).toBe(
      true,
    );
  });

  it("leaves both materials untouched when the optional DNA is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST10-05", as: "yellow", under: ["ST10-04"] },
            { card: "ST10-12", as: "purple" },
          ],
          hand: [{ card: "ST10-06", as: "mastemon" }],
        },
      },
      { autoOrderTriggers: true },
    );

    const firing = advance(s.engine).fireForInstance(
      EffectTiming.OnEndTurn,
      s.perm("yellow").stack.find((card) => card.cardId === "ST10-04")!,
    );
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await firing;

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toEqual(
      expect.arrayContaining([s.perm("yellow").permanentId, s.perm("purple").permanentId]),
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("mastemon").instanceId)).toBe(true);
  });
});

function gatomonUnder(s: EngineSetup, alias: string) {
  return s.perm(alias).stack.find((card) => card.cardId === "ST10-04")!;
}

async function fireInheritedDna(hostCard: string, partnerCard: string, handCard: string) {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: hostCard, as: "host", under: ["ST10-04"] },
          { card: partnerCard, as: "partner" },
        ],
        hand: [{ card: handCard, as: "candidate" }],
      },
    },
    { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
  );
  s.state.memory = 10;
  await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, gatomonUnder(s, "host"));
  const candidateInHand = s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("candidate").instanceId);
  return { s, candidateInHand };
}

describe("ST10-04 Gatomon — KB Q&A rulings", () => {
  it("reveals as many cards as the deck holds when fewer than 3 remain (Q727)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "ST10-04", as: "gatomon" }],
          deck: [
            { card: "ST10-02", as: "yellow" },
            { card: "ST10-14", as: "option" },
          ],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: false },
    );
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gatomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const reveal = s.decisions.at(-1)!.req;
    expect(reveal.sourceCardId).toBe("ST10-04");
    expect(reveal.options?.visibleInstanceIds).toHaveLength(2);
    expect(reveal.options?.visibleInstanceIds).toEqual(
      expect.arrayContaining([s.inst("yellow").instanceId, s.inst("option").instanceId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: reveal.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("yellow").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.deck.length === 1 && s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("yellow").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("option").instanceId]);
  });

  it("must add both a revealed yellow and a revealed purple Digimon to hand (Q728)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "ST10-04", as: "gatomon" }],
          deck: [
            { card: "ST10-02", as: "yellow" },
            { card: "ST10-07", as: "purple" },
            { card: "ST10-14", as: "option" },
          ],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: false },
    );
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gatomon").instanceId })).toEqual({
      ok: true,
    });
    for (const alias of ["yellow", "purple"]) {
      await settle(
        () =>
          s.state.pendingDecision?.kind === "selectCards" &&
          s.decisions.at(-1)!.req.options?.candidateInstanceIds?.includes(s.inst(alias).instanceId) === true,
      );
      const pick = s.decisions.at(-1)!.req;
      expect(pick.sourceCardId).toBe("ST10-04");
      expect(pick.options).toMatchObject({ min: 1, max: 1 });
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pick.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }),
      ).toEqual({ ok: false, reason: "decision-pending" });
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pick.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst(alias).instanceId] },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => s.state.players[0]!.hand.length === 2);

    expect(s.decisions.some((decision) => decision.req.kind === "optional")).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("yellow").instanceId, s.inst("purple").instanceId]),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("option").instanceId]);
  });

  it("DNA digivolves its host with another Digimon at end of turn, before the opponent's turn begins (Q729)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST10-05", as: "host", under: ["ST10-04"] },
            { card: "ST10-12", as: "partner" },
          ],
          hand: [{ card: "ST10-06", as: "mastemon" }],
          deck: ["ST10-01"],
        },
        1: { deck: ["ST10-01"] },
      },
      { autoOrderTriggers: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("host").permanentId, s.perm("partner").permanentId, s.inst("mastemon").instanceId);
    s.state.memory = 3;

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const turnCount = s.state.turnCount;
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    const offer = s.decisions.at(-1)!.req;
    expect(offer.sourceCardId).toBe("ST10-04");
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.turnCount).toBe(turnCount);
    expect(s.events.some((event) => event.kind === "turnEnded")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: offer.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("mastemon").instanceId,
      ),
    );
    await turn;

    const mastemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("mastemon").instanceId,
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(mastemon!.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["ST10-04", "ST10-05", "ST10-12"]),
    );
  });

  it("cannot DNA digivolve into a hand Digimon that has no [DNA Digivolution] (Q730)", async () => {
    const withoutDna = await fireInheritedDna("ST10-05", "ST10-12", "BT2-040");
    expect(withoutDna.candidateInHand).toBe(true);
    expect(withoutDna.s.state.players[0]!.battleArea).toHaveLength(2);
    expect(withoutDna.s.perm("host").topCard.cardId).toBe("ST10-05");
    expect(withoutDna.s.perm("partner").topCard.cardId).toBe("ST10-12");

    const withDna = await fireInheritedDna("ST10-05", "ST10-12", "ST10-06");
    expect(withDna.candidateInHand).toBe(false);
    expect(withDna.s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("cannot DNA digivolve with a partner that the [DNA Digivolution] does not specify (Q731)", async () => {
    const twoYellow = await fireInheritedDna("ST10-05", "ST10-05", "ST10-06");
    expect(twoYellow.candidateInHand).toBe(true);
    expect(twoYellow.s.state.players[0]!.battleArea).toHaveLength(2);
    expect(twoYellow.s.perm("host").topCard.cardId).toBe("ST10-05");
    expect(twoYellow.s.perm("partner").topCard.cardId).toBe("ST10-05");

    const yellowAndPurple = await fireInheritedDna("ST10-05", "ST10-12", "ST10-06");
    expect(yellowAndPurple.candidateInHand).toBe(false);
    expect(yellowAndPurple.s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("stacks its own -2 reduction on Mirei Mikagura's -1 when digivolving into Angewomon from trash (Q3812)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX6-074", as: "mirei" }],
          hand: [{ card: "ST10-04", as: "gatomon" }],
          trash: [{ card: "ST10-05", as: "angewomon" }],
          deck: ["ST10-14", "ST10-14", "ST10-14", "ST10-14", "ST10-14"],
        },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gatomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("angewomon").instanceId,
      ),
    );
    await settle(() => s.state.pendingDecision === undefined);

    const angewomon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("angewomon").instanceId,
    );
    expect(angewomon!.stack.map((card) => card.cardId)).toEqual(["ST10-04"]);
    expect(s.perm("mirei").isSuspended).toBe(true);
    // 10 - 5 (play Gatomon) + 1 (Mirei) - max(0, 3 - 1 - 2) (digivolve) = 6; Mirei's -1 alone would leave 4.
    expect(s.state.memory).toBe(6);
  });

  it("names the color each reveal selection asks for when a dual-color card fills the yellow pick", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "ST10-04", as: "gatomon" }],
          deck: [
            { card: "BT23-102", as: "mastemon" },
            { card: "BT23-067", as: "ladyDevimonA" },
            { card: "BT23-067", as: "ladyDevimonB" },
          ],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: false },
    );
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gatomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const yellow = s.decisions.at(-1)!.req;
    expect(yellow.options?.effectTextPart).toBe("Add 1 yellow Digimon card");
    expect(yellow.options?.candidateInstanceIds).toEqual([s.inst("mastemon").instanceId]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: yellow.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("mastemon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.decisionId !== yellow.decisionId);

    const purple = s.decisions.at(-1)!.req;
    expect(purple.options?.effectTextPart).toBe("1 purple Digimon card among them to your hand.");
    expect(purple.options?.candidateInstanceIds).toEqual([
      s.inst("ladyDevimonA").instanceId,
      s.inst("ladyDevimonB").instanceId,
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: purple.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("ladyDevimonA").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === 2);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("mastemon").instanceId, s.inst("ladyDevimonA").instanceId]),
    );
  });
});
