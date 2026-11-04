import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./EX3-007.js";
import "./EX3-049.js";
import { compiled } from "./EX3-052.js";
import "./EX3-053.js";
import "./EX3-065.js";

interface DecisionPayload {
  candidateInstanceIds?: string[];
  visibleCards?: { instanceId: string; cardId: string }[];
  min?: number;
  max?: number;
  timing?: string;
  effectText?: string;
}

function payload(decision: { payloadJson: string }): DecisionPayload {
  return JSON.parse(decision.payloadJson) as DecisionPayload;
}

async function respond({
  s,
  kind,
  instanceIds,
}: {
  s: ReturnType<typeof setupEngine>;
  kind: "chooseTargets" | "selectCards";
  instanceIds: string[];
}): Promise<void> {
  await settle(() => s.state.pendingDecision?.kind === kind);
  const decision = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: { kind, instanceIds },
    }),
  ).toEqual({ ok: true });
}

describe("EX3-052 Jazarichmon", () => {
  it("has the official metadata and digivolves from either a black or red level 4 for 3", async () => {
    expect(getCardDefinition("EX3-052")).toMatchObject({
      cardId: "EX3-052",
      nameEn: "Jazarichmon",
      colors: ["Black"],
      level: 5,
      playCost: 8,
      dp: 7000,
      evoCosts: [
        { color: "Black", level: 4, memoryCost: 3 },
        { color: "Red", level: 4, memoryCost: 3 },
      ],
      forms: ["Ultimate"],
      attributes: ["Data"],
      types: ["Machine Dragon"],
      rarity: "R",
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "DeDigivolve",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: 1,
              stopAtLevel: 3,
            },
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  nameOrTrait: [{ tokens: ["Hina Kurihara"], match: "nameExact" }],
                },
                count: 1,
              },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
        },
        {
          trigger: "YourTurn",
          isInherited: true,
          actions: [
            {
              kind: "Aura",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              effect: { kind: "keyword", keyword: { keyword: "SecurityAttack", amount: 1 } },
              while: { kind: "selfHasOnPlayEffect" },
            },
          ],
        },
      ],
    });

    for (const [baseCardId, alias] of [
      ["EX3-049", "blackBase"],
      ["EX3-007", "redBase"],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: baseCardId, under: ["BT1-010"], as: alias }],
          hand: [{ card: "EX3-052", as: "jazarichmon" }],
          deck: ["BT1-011"],
        },
      });
      s.state.memory = 3;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm(alias).permanentId,
          instanceId: s.inst("jazarichmon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm(alias).topCard.cardId === "EX3-052");

      expect(s.state.memory).toBe(0);
      expect(s.perm(alias).topCard.cardId).toBe("EX3-052");
      expect(s.perm(alias).stack.map(({ cardId }) => cardId)).toEqual(["BT1-010", baseCardId]);
    }
  });

  it("rejects an invalid level-3 evolution source without payment or movement", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-072", as: "wrongSource" }],
        hand: [{ card: "EX3-052", as: "jazarichmon" }],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongSource").permanentId,
        instanceId: s.inst("jazarichmon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(3);
    expect(s.perm("wrongSource").topCard.cardId).toBe("BT1-072");
    expect(s.inst("jazarichmon").cardId).toBe("EX3-052");
  });

  it("On Play chooses 1 opposing stack, De-Digivolves exactly 1, then may play Hina for free", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "EX3-052", as: "jazarichmon" },
          { card: "EX3-065", as: "hina" },
        ],
      },
      1: {
        battleArea: [
          { card: "EX3-053", under: ["EX3-049", "EX3-052"], as: "chosen" },
          { card: "EX3-053", under: ["EX3-052"], as: "untouched" },
        ],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jazarichmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");

    const targetDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "chooseTargets",
      sourceCardId: "EX3-052",
      options: { timing: "OnPlay", min: 1, max: 1 },
    });
    expect(payload(targetDecision).candidateInstanceIds).toEqual(
      expect.arrayContaining([s.perm("chosen").permanentId, s.perm("untouched").permanentId]),
    );
    expect(payload(targetDecision).effectText).toContain("De-Digivolve 1");

    await respond({ s, kind: "chooseTargets", instanceIds: [s.perm("chosen").permanentId] });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    expect(s.perm("chosen").topCard.cardId).toBe("EX3-052");
    expect(s.perm("chosen").stack).toHaveLength(1);
    expect(s.perm("untouched").topCard.cardId).toBe("EX3-053");
    const hinaDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "optional",
      sourceCardId: "EX3-052",
      options: { timing: "OnPlay" },
    });
    expect(payload(hinaDecision).effectText).toContain("play 1 [Hina Kurihara]");

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: hinaDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(payload(s.state.pendingDecision!).candidateInstanceIds).toEqual([s.inst("hina").instanceId]);
    await respond({ s, kind: "selectCards", instanceIds: [s.inst("hina").instanceId] });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-065"),
    );

    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-065")).toBe(true);
  });

  it("may decline Hina after the mandatory De-Digivolve", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "EX3-052", as: "jazarichmon" },
          { card: "EX3-065", as: "hina" },
        ],
      },
      1: { battleArea: [{ card: "EX3-053", under: ["EX3-052"], as: "target" }] },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jazarichmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const hinaDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: hinaDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("target").topCard.cardId).toBe("EX3-052");
    expect(
      s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === "EX3-052"),
    ).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("hina").instanceId);
    expect(s.state.memory).toBe(2);
  });

  it("stops at level 3 or the last card and still continues to the Hina clause", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-052", as: "jazarichmon" },
            { card: "EX3-065", as: "hina" },
          ],
        },
        1: { battleArea: [{ card: "EX3-049", under: ["EX3-046"], as: "levelThree" }] },
      },
      { autoSelectCards: false },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jazarichmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    expect(
      s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === "EX3-052"),
    ).toHaveLength(0);
    expect(s.perm("levelThree").topCard.cardId).toBe("EX3-046");
    expect(s.perm("levelThree").stack).toHaveLength(0);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "optional",
      sourceCardId: "EX3-052",
      options: { timing: "OnPlay" },
    });
  });

  it("does not offer a non-Hina card for the free play", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "EX3-052", as: "jazarichmon" },
          { card: "BT1-010", as: "otherCard" },
        ],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jazarichmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-052"));

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("otherCard").instanceId);
  });

  it("Machine Dragon family: grants Security Attack +1 to Metallicdramon only on its controller's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-053", under: ["EX3-052"], as: "metallicdramon" }],
      },
      1: { security: ["BT1-010", "BT1-011", "BT1-012"] },
    });
    s.state.turnCount = 1;
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("metallicdramon"), "SecurityAttack")).toBe(1);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("metallicdramon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.security).toHaveLength(1);
    const opponentTurn = setupEngine({
      0: { battleArea: [{ card: "EX3-053", under: ["EX3-052"], as: "metallicdramon" }] },
    });
    opponentTurn.state.turnSeat = 1;
    opponentTurn.state.turnCount = 1;
    await opponentTurn.ready();
    expect(observe(opponentTurn.engine).keywordAmount(opponentTurn.perm("metallicdramon"), "SecurityAttack")).toBe(0);
  });

  it("does not grant Security Attack +1 when the live top card lacks an On Play effect", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX3-049", under: ["EX3-052"], as: "plainHost" }] },
    });
    s.state.turnCount = 1;
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("plainHost"), "SecurityAttack")).toBe(0);
  });
});
