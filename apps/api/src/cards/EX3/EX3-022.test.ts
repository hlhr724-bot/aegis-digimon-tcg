import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./EX3-022.js";

describe("EX3-022 MegaSeadramon", () => {
  it("has the official errata identity, evolution cost, and inherited OPT", () => {
    const definition = getCardDefinition("EX3-022")!;
    expect(definition).toMatchObject({
      cardId: "EX3-022",
      nameEn: "MegaSeadramon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Data"],
      types: ["Aquatic"],
      rarity: "R",
      imageId: "EX3-022-Errata",
    });
    expect(definition.effectText).toBe(
      "[When Attacking] You may play 1 blue level 3 Digimon card from 1 of your blue Digimon's digivolution cards without paying its memory cost.",
    );
    expect(definition.inheritedEffectText).toBe(
      "[When Attacking] [Once Per Turn] You may play 1 blue level 3 Digimon card from 1 of your blue Digimon's digivolution cards without paying its memory cost.",
    );
  });

  it("digivolves normally from a blue level 4 for 3 memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-019", as: "base" }],
        hand: [{ card: "EX3-022", as: "megaSeadramon" }],
        deck: ["BT1-030"],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("megaSeadramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX3-022");

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["EX3-019"]);
  });

  it("Aquatic family: offers only blue level 3 sources under blue Digimon and plays the chosen card for free", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX3-022", as: "attacker" },
          {
            card: "EX3-017",
            under: [
              { card: "BT1-029", as: "aquaticLineGabumon" },
              { card: "EX3-019", as: "invalidBlueLevel4" },
              { card: "BT1-086", as: "invalidBlueTamer" },
            ],
            as: "aquaticHost",
          },
          { card: "BT1-033", under: [{ card: "BT1-030", as: "otherEligible" }], as: "otherBlueHost" },
          { card: "BT1-010", under: [{ card: "BT1-031", as: "invalidBlueUnderRed" }], as: "redHost" },
          { card: "BT1-033", under: [{ card: "BT1-009", as: "invalidRedLevel3" }], as: "blueHostRedSource" },
        ],
      },
      1: { battleArea: ["BT1-072"], security: ["BT1-009", "BT1-009", "BT1-009"] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optionalDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("EX3-022");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optionalDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decision = s.state.pendingDecision!;
    const payload = JSON.parse(decision.payloadJson) as {
      candidateInstanceIds: string[];
      visibleInstanceIds: string[];
      min: number;
      max: number;
    };
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("EX3-022");
    expect(payload).toMatchObject({ min: 0, max: 1 });
    expect(payload.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("aquaticLineGabumon").instanceId, s.inst("otherEligible").instanceId]),
    );
    expect(payload.candidateInstanceIds).not.toContain(s.inst("invalidBlueLevel4").instanceId);
    expect(payload.candidateInstanceIds).not.toContain(s.inst("invalidBlueTamer").instanceId);
    expect(payload.candidateInstanceIds).not.toContain(s.inst("invalidBlueUnderRed").instanceId);
    expect(payload.candidateInstanceIds).not.toContain(s.inst("invalidRedLevel3").instanceId);
    expect(payload.candidateInstanceIds.sort()).toEqual(
      [s.inst("aquaticLineGabumon").instanceId, s.inst("otherEligible").instanceId].sort(),
    );
    expect(payload.visibleInstanceIds).toEqual(
      expect.arrayContaining(
        ["aquaticLineGabumon", "otherEligible", "invalidBlueLevel4", "invalidBlueTamer", "invalidRedLevel3"].map(
          (alias) => s.inst(alias).instanceId,
        ),
      ),
    );
    expect(payload.visibleInstanceIds).not.toContain(s.inst("invalidBlueUnderRed").instanceId);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "EX3-022",
      options: {
        min: 0,
        max: 1,
        timing: "WhenAttacking",
        effectText: expect.stringContaining("play 1 blue level 3"),
      },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("aquaticLineGabumon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "securityChecked"));

    expect(s.state.memory).toBe(0);
    expect(s.perm("aquaticHost").stack.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("aquaticLineGabumon").instanceId,
    );
    expect(
      s.state.players[0]!.battleArea.some(
        ({ topCard }) => topCard.instanceId === s.inst("aquaticLineGabumon").instanceId,
      ),
    ).toBe(true);
  });

  it("allows the optional play to be declined with one prompt and leaves the source in place", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX3-022", as: "attacker" },
          { card: "BT1-033", under: [{ card: "BT1-029", as: "eligible" }], as: "sourceHost" },
        ],
      },
      1: { battleArea: ["BT1-072"], security: ["BT1-009"] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "securityChecked"));

    expect(s.perm("sourceHost").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("eligible").instanceId);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-022")).toHaveLength(1);
  });

  it("its own When Attacking can resolve twice from the same copy in one turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX3-022", as: "attacker" },
            {
              card: "BT1-033",
              under: [
                { card: "BT1-029", as: "first" },
                { card: "BT1-030", as: "second" },
              ],
              as: "sourceHost",
            },
          ],
          deck: ["BT1-029", "BT1-030", "BT1-031"],
        },
        1: {
          battleArea: ["BT1-072"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("first").instanceId);
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("first").instanceId),
    );
    await settle(() => s.events.filter(({ kind }) => kind === "blockWindowOpened").length === 1);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.filter(({ kind }) => kind === "securityChecked").length === 1);
    await settle(() => s.state.phase === "Main");
    await advance(s.engine).verb.unsuspend([s.perm("attacker").permanentId]);
    expect(s.perm("attacker").isSuspended).toBe(false);
    preferred.splice(0, preferred.length, s.inst("second").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("second").instanceId),
    );
    await settle(() => s.events.filter(({ kind }) => kind === "blockWindowOpened").length === 2);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });

    expect(s.perm("sourceHost").stack).toHaveLength(0);
  });

  it("two inherited copies each activate once during the same attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-033", under: ["EX3-022", "EX3-022"], as: "inheritedHost" },
            {
              card: "BT1-033",
              under: [
                { card: "BT1-029", as: "first" },
                { card: "BT1-030", as: "second" },
                { card: "BT1-031", as: "third" },
              ],
              as: "sourceHost",
            },
          ],
        },
        1: { battleArea: ["BT1-072"], security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("inheritedHost").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("sourceHost").stack.length === 1);
    expect(s.perm("sourceHost").stack).toHaveLength(1);
    expect(
      s.state.players[0]!.battleArea.filter(
        ({ permanentId }) =>
          permanentId !== s.perm("inheritedHost").permanentId && permanentId !== s.perm("sourceHost").permanentId,
      ),
    ).toHaveLength(2);
    await settle(() => s.events.filter(({ kind }) => kind === "blockWindowOpened").length === 1);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.filter(({ kind }) => kind === "securityChecked").length === 1);
    await settle(() => s.state.phase === "Main");
    expect(s.perm("sourceHost").stack).toHaveLength(1);
  });

  it("inherited OPT resets through two public turn transitions and resolves on the next own turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-033", under: ["EX3-022"], as: "inheritedHost" },
            {
              card: "BT1-033",
              under: [
                { card: "BT1-029", as: "first" },
                { card: "BT1-030", as: "second" },
              ],
              as: "sourceHost",
            },
          ],
          deck: ["BT1-029", "BT1-030", "BT1-031"],
        },
        1: {
          battleArea: ["BT1-072"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("first").instanceId);
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    const attackPlayer = () =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("inheritedHost").permanentId,
        target: { kind: "player" },
      });

    expect(attackPlayer()).toEqual({ ok: true });
    await settle(() => s.perm("sourceHost").stack.length === 1);
    await settle(() => s.events.filter(({ kind }) => kind === "blockWindowOpened").length === 1);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.filter(({ kind }) => kind === "securityChecked").length === 1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = 0;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await opponentTurn;

    s.state.turnSeat = 0;
    s.state.memory = 0;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    preferred.splice(0, preferred.length, s.inst("second").instanceId);
    expect(attackPlayer()).toEqual({ ok: true });
    await settle(() => s.perm("sourceHost").stack.length === 0);
    await settle(() => s.events.filter(({ kind }) => kind === "blockWindowOpened").length === 2);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.filter(({ kind }) => kind === "securityChecked").length === 2);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await nextTurn;
  });
});
