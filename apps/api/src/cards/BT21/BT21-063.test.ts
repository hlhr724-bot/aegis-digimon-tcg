import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT21-063.js";
import "../index.js";

describe("BT21-063 Gumdramon", () => {
  it("preserves both zero-cost alternate Digivolution requirements and inherited DP gain", () => {
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 2, texts: ["Save"], cost: 0, isAlternate: true },
      { traits: ["Hero"], cost: 0, isAlternate: true, level: 2 },
    ]);
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "YourTurn",
        isInherited: true,
        actions: [
          {
            kind: "ModifyDP",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            amount: 2000,
            duration: "permanent",
          },
        ],
      }),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual ?? []).toEqual([]);
  });

  it("requires trashing a Save-text or Hero card to draw two", () => {
    const onPlay = compiled.effects.find((entry) => entry.trigger === "OnPlay");
    const action = onPlay?.actions[0] as { cost?: unknown } | undefined;

    expect(action).toMatchObject({ kind: "Draw", controller: "mine", amount: 2, optional: true, abortOnDecline: true });
    expect(action?.cost).toMatchObject({
      kind: "trash",
      target: {
        filter: {
          zone: "hand",
          controller: "mine",
          nameOrTrait: [{ tokens: ["Hero"], match: "trait" }],
        },
        orFilters: [{ zone: "hand", controller: "mine", keywords: ["Save"] }],
        count: 1,
      },
    });
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "OnDeletion",
        actions: [
          {
            kind: "PlaceUnder",
            underFilter: { controller: "mine", kind: ["Tamer"], excludeToken: true },
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            optional: true,
          },
        ],
        keywords: [{ keyword: "Save", raw: "＜Save＞" }],
      }),
    );
  });

  it.each([
    ["Save-text", "BT21-011"],
    ["Hero", "BT21-040"],
  ])("pays with a %s card and draws exactly two", async (_label, costCard) => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-063", as: "gumdramon" },
            { card: costCard, as: "cost" },
          ],
          deck: [
            { card: "BT1-009", as: "drawA" },
            { card: "BT1-010", as: "drawB" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gumdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawB").instanceId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("does not draw or trash a nonmatching hand card", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-063", as: "gumdramon" },
            { card: "BT1-009", as: "nonmatching" },
          ],
          deck: ["BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gumdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("gumdramon").instanceId),
    );

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("nonmatching").instanceId)).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.memory).toBe(1);
  });

  it("publicly uses the zero-cost Save-text alternate evolution route", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT12-005", as: "saveEgg" },
        hand: [{ card: "BT21-063", as: "gumdramon" }],
      },
    });
    s.state.memory = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("saveEgg").permanentId,
        instanceId: s.inst("gumdramon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("saveEgg").topCard.cardId === "BT21-063");
    expect(s.state.memory).toBe(1);
    expect(s.perm("saveEgg").stack.map((card) => card.cardId)).toEqual(["BT12-005"]);
  });

  it("refuses both zero-cost alternates from a neutral level-2 without Save text or Hero trait", async () => {
    for (const alternateRequirementIndex of [0, 1] as const) {
      const s = setupEngine({
        0: { breeding: { card: "BT1-001", as: "unqualifiedEgg" }, hand: [{ card: "BT21-063", as: "gumdramon" }] },
      });
      s.state.memory = 1;
      await s.ready();
      const handId = s.inst("gumdramon").instanceId;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("unqualifiedEgg").permanentId,
          instanceId: handId,
          alternateRequirementIndex,
        }),
      ).toMatchObject({ ok: false });
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === handId)).toBe(true);
      expect(s.perm("unqualifiedEgg").topCard.cardId).toBe("BT1-001");
      expect(s.state.memory).toBe(1);
    }
  });

  it("publicly uses the zero-cost Hero alternate evolution route", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT21-002", as: "heroEgg" },
        hand: [{ card: "BT21-063", as: "gumdramon" }],
      },
    });
    s.state.memory = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("heroEgg").permanentId,
        instanceId: s.inst("gumdramon").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("heroEgg").topCard.cardId === "BT21-063");
    expect(s.state.memory).toBe(1);
  });

  it("executes Save by placing itself under an own Tamer on deletion", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-063", as: "gumdramon" },
            { card: "BT1-085", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    const gumdramonId = s.perm("gumdramon").topCard.instanceId;
    preferred.push(s.perm("tamer").permanentId);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("gumdramon").permanentId], "byEffect")).toBe(1);
    await settle(() => s.perm("tamer").stack.some((card) => card.instanceId === gumdramonId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === gumdramonId)).toBe(false);
  });

  it("executes Save after a public losing battle and preserves the card under its Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-063", as: "gumdramon", suspended: true },
            { card: "BT1-085", as: "tamer" },
          ],
        },
        1: { battleArea: [{ card: "BT21-068", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const gumdramonId = s.perm("gumdramon").topCard.instanceId;
    const gumdramonPermanentId = s.perm("gumdramon").permanentId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: gumdramonPermanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.some((card) => card.instanceId === gumdramonId));
    expect(s.perm("tamer").stack.some((card) => card.instanceId === gumdramonId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === gumdramonId)).toBe(false);
  });

  it("publicly declines eligible Save after the losing battle and leaves Gumdramon in trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-063", as: "gumdramon", suspended: true },
            { card: "BT1-085", as: "tamer" },
          ],
        },
        1: { battleArea: [{ card: "BT21-068", as: "attacker" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const gumdramonId = s.perm("gumdramon").topCard.instanceId;
    const gumdramonPermanentId = s.perm("gumdramon").permanentId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: gumdramonPermanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === gumdramonId) && !observe(s.engine).isAttacking(),
    );

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === gumdramonId)).toBe(true);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === gumdramonPermanentId)).toBe(
      false,
    );
  });

  it("gives its evolution host +2000 DP only during its controller's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT21-066", as: "host", under: [{ card: "BT21-063", as: "source" }] }] },
    });
    await s.ready();
    const boosted = s.perm("host").currentDP;
    expect(boosted).toBe(8000);

    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(6000);
  });

  it("confirms inherited DP through the public owner-to-opponent turn lifecycle", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-066", as: "host", under: [{ card: "BT21-063", as: "source" }] }],
        deck: ["BT1-001", "BT1-002", "BT1-003"],
        security: ["BT1-004"],
      },
      1: { deck: ["BT1-005", "BT1-006", "BT1-007"], security: ["BT1-008"] },
    });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(8000);

    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 0;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("host").currentDP).toBe(6000);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
  });
});

describe("BT21-063 Gumdramon — KB Q&A rulings", () => {
  it("pays its On Play cost with a card that only mentions <Save> in its effect text (Q4572)", async () => {
    async function playGumdramonWithCostCandidate(candidate: string) {
      const s = setupEngine(
        {
          0: {
            hand: [
              { card: "BT21-063", as: "gumdramon" },
              { card: candidate, as: "candidate" },
            ],
            deck: [
              { card: "BT1-009", as: "drawA" },
              { card: "BT1-010", as: "drawB" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 4;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gumdramon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("gumdramon").instanceId),
      );
      await settle(() => s.state.pendingDecision === undefined);
      return s;
    }

    const saveReference = await playGumdramonWithCostCandidate("BT12-087");
    expect(saveReference.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([
      saveReference.inst("candidate").instanceId,
    ]);
    expect(saveReference.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([saveReference.inst("drawA").instanceId, saveReference.inst("drawB").instanceId]),
    );

    const noSaveText = await playGumdramonWithCostCandidate("BT1-045");
    expect(noSaveText.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([
      noSaveText.inst("candidate").instanceId,
    ]);
    expect(noSaveText.state.players[0]!.deck).toHaveLength(2);
  });
});
