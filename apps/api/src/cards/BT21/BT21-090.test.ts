import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT21-090.js";
import "../BT17/BT17-030.js";
import "../BT17/BT17-086.js";
import "../index.js";

describe("BT21-090 The Strongest of Brothers", () => {
  it("nests the free evolution inside the intrinsic reactive Delay watcher", () => {
    const allTurns = compiled.effects.filter((entry) => entry.trigger === "AllTurns");
    expect(allTurns).toHaveLength(1);
    expect(allTurns[0]?.actions[0]).toMatchObject({ kind: "SubTrigger", event: "onAddDigivolutionCards" });
    expect(allTurns[0]?.actions[0]).toMatchObject({
      sourceFilter: { controller: "mine", kind: ["Digimon"], byEffect: true },
    });
    expect(allTurns[0]?.keywords).toEqual([{ keyword: "Delay", raw: "＜Delay＞" }]);
    expect(allTurns[0]?.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "onAddDigivolutionCards",
    });
    const placementWatcher = allTurns[0]?.actions[0];
    if (placementWatcher?.kind !== "SubTrigger") throw new Error("expected reactive placement watcher");
    expect(placementWatcher.actions[0]).toMatchObject({
      kind: "Digivolve",
      payCost: false,
      from: ["hand"],
      optional: true,
      into: { nameOrTrait: [{ tokens: ["Gammamon"], match: "text" }] },
    });
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Main",
        actions: [
          expect.objectContaining({ kind: "RevealAdd" }),
          { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
        ],
      }),
    );
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Security",
        isSecurity: true,
        actions: [
          expect.objectContaining({ kind: "PlayWithoutCost", optional: true }),
          { kind: "PlaceInBattleAreaSelf" },
        ],
      }),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("preserves the same-turn Option after a public Mind Link source placement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "color" },
            { card: "BT17-086", as: "leon" },
            { card: "BT17-030", as: "pulsemon" },
          ],
          hand: [{ card: "BT21-090", as: "option" }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));

    const [effect] = observe(s.engine).activatableEffects(s.perm("leon")) as { effectKey: string }[];
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("leon").topCard.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("pulsemon").stack.some((card) => card.cardId === "BT17-086"));

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
  });

  it("reacts only to a later public Canoweissmon placement and free-evolves a legal host", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "color" }],
          hand: [
            { card: "BT21-090", as: "option" },
            { card: "BT21-022", as: "cano1" },
            { card: "BT21-010", as: "source1" },
            { card: "BT21-022", as: "cano2" },
            { card: "BT21-010", as: "source2" },
            { card: "BT21-019", as: "destination" },
          ],
          deck: ["BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "victim1", dp: 3000 },
            { card: "BT1-009", as: "victim2", dp: 3000 },
          ],
          deck: ["BT1-015", "BT1-016"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds: preferred },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;
    preferred.push(s.inst("source1").instanceId, s.inst("source2").instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));
    expect(s.state.memory).toBe(7);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cano1").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("cano1").stack.some((card) => card.instanceId === s.inst("source1").instanceId));
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("destination").instanceId)).toBe(true);

    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cano2").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("cano2").stack.some((card) => card.instanceId === s.inst("source2").instanceId));
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === optionId));
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("destination").instanceId),
    );

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("destination").instanceId)).toBe(
      true,
    );
    expect(s.perm("color").stack.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.perm("color").topCard.cardId).toBe("BT21-019");
    expect(s.perm("cano1").stack.some((card) => card.instanceId === s.inst("source1").instanceId)).toBe(true);
    expect(s.perm("cano2").stack.some((card) => card.instanceId === s.inst("source2").instanceId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("does not react to an ordinary public Gammamon evolution that places its source by rule", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-010", as: "gammamon" }],
          hand: [
            { card: "BT21-090", as: "option" },
            { card: "BT21-019", as: "betel" },
            { card: "BT21-022", as: "candidate" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: { deck: ["BT1-013", "BT1-014", "BT1-015"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));
    expect(s.state.memory).toBe(7);

    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gammamon").permanentId,
        instanceId: s.inst("betel").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("gammamon").topCard.instanceId === s.inst("betel").instanceId);

    expect(s.perm("gammamon").stack.map((card) => card.cardId)).toEqual(["BT21-010"]);
    expect(s.perm("gammamon").topCard.cardId).toBe("BT21-019");
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("candidate").instanceId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("does not react to an opponent's public Canoweissmon source placement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-084", as: "host" },
            { card: "BT1-009", as: "color" },
          ],
          hand: [
            { card: "BT21-090", as: "option" },
            { card: "BT21-019", as: "candidate" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: {
          hand: [
            { card: "BT21-022", as: "cano" },
            { card: "BT21-010", as: "source" },
          ],
          deck: ["BT1-013", "BT1-014", "BT1-015"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));
    expect(s.state.memory).toBe(7);

    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("cano").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("cano").stack.some((card) => card.instanceId === s.inst("source").instanceId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("host").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("candidate").instanceId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
  });

  it("lets the aged public Delay opportunity be declined without trashing the Option", async () => {
    const opts = { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "color" }],
          hand: [
            { card: "BT21-090", as: "option" },
            { card: "BT21-022", as: "cano" },
            { card: "BT21-010", as: "source" },
            { card: "BT21-019", as: "betel" },
          ],
          deck: ["BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
        1: { deck: ["BT1-015", "BT1-016"] },
      },
      opts,
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));
    expect(s.state.memory).toBe(7);

    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    opts.autoAcceptOptional = false;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cano").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const placementCost = s.state.pendingDecision!;
    expect(placementCost.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: placementCost.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("cano").stack.some((card) => card.instanceId === s.inst("source").instanceId));
    expect(s.perm("cano").stack.map((card) => card.instanceId)).toEqual([s.inst("source").instanceId]);
    await settle(
      () =>
        s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.decisionId !== placementCost.decisionId,
    );

    const pending = s.state.pendingDecision;
    expect(pending?.kind).toBe("optional");
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("betel").instanceId)).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("betel").instanceId)).toBe(true);
    expect(s.state.memory).toBe(3);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("reveals three cards, adds a Gammamon-text card, and places itself", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "color" }],
          hand: [{ card: "BT21-090", as: "option" }],
          deck: ["BT21-010", "BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "BT21-010"));

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT21-010")).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-090")).toBe(true);
  });

  it("Q4733 waives the color requirement for a Gammamon-text card in breeding", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT21-069", as: "gulus" },
        hand: [{ card: "BT21-090", as: "option" }],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-090"));
    expect(s.state.memory).toBe(0);
  });

  it("does not waive the color requirement without a Gammamon-text card on the field", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT21-090", as: "option" }], deck: ["BT1-009", "BT1-010", "BT1-011"] },
    });
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("does not use an opponent's Gammamon-text card for the color waiver", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT21-090", as: "option" }], deck: ["BT1-009", "BT1-010", "BT1-011"] },
      1: { battleArea: [{ card: "BT21-069", as: "opponentGulus" }] },
    });
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(true);
    expect(s.perm("opponentGulus").topCard.cardId).toBe("BT21-069");
    expect(s.state.memory).toBe(3);
  });

  it("Security may play a cost-4 Gammamon-text card from trash, then places itself", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT21-090", as: "option" }],
          trash: [{ card: "BT21-010", as: "gammamon" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
      expect.arrayContaining(["BT21-010", "BT21-090"]),
    );
    expect(s.state.memory).toBe(0);
  });

  it("Security may choose the hand source for its cost-4-or-less Gammamon-text play", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT21-090", as: "option" }],
          hand: [{ card: "BT21-010", as: "gammamon" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
      expect.arrayContaining(["BT21-010", "BT21-090"]),
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("gammamon").instanceId)).toBe(false);
    expect(s.state.memory).toBe(0);
  });

  it("Security may decline an eligible Gammamon-text play and still places the Option", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT21-090", as: "option" }],
          hand: [{ card: "BT21-010", as: "gammamon" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("option").instanceId,
        ) && !observe(s.engine).isAttacking(),
    );

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("gammamon").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-090")).toBe(true);
  });

  it("Security does not offer a Gammamon-text card above the printed cost-4 limit", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT21-090", as: "option" }],
          hand: [{ card: "BT21-022", as: "overCap" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("option").instanceId,
        ) && !observe(s.engine).isAttacking(),
    );

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("overCap").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-090")).toBe(true);
  });
});

describe("BT21-090 The Strongest of Brothers — KB Q&A rulings", () => {
  it("treats a card with Gammamon inside its name or [Gammamon] in its effects as a card with [Gammamon] in its text (Q4604)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "color" }],
          hand: [{ card: "BT21-090", as: "option" }],
          deck: [
            { card: "BT8-013", as: "nameMention" },
            { card: "BT21-077", as: "effectMention" },
            { card: "BT1-011", as: "noMention" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    preferred.push(s.inst("effectMention").instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-090"));

    const reveal = s.decisions.find(({ req }) => req.kind === "selectCards")?.req;
    expect(reveal?.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("nameMention").instanceId, s.inst("effectMention").instanceId]),
    );
    expect(reveal?.options?.candidateInstanceIds).not.toContain(s.inst("noMention").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("effectMention").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("nameMention").instanceId, s.inst("noMention").instanceId]),
    );
  });
});
