import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { internalsOf } from "../../engine/testkit/internals.js";
import { compiled as BT25_027 } from "./BT25-027.js";
import "../index.js";

describe("BT25-027 MachGaogamon", () => {
  it("matches the printed identity and alternate evolution requirement", () => {
    expect(getCardDefinition("BT25-027")).toMatchObject({
      colors: ["Blue", "Black"],
      level: 5,
      playCost: 7,
      dp: 7000,
      types: ["Cyborg", "DATA SQUAD"],
    });
    expect(digivolutionRequirementsFor("BT25-027")).toEqual([
      { level: 4, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
    ]);
  });

  it("shares the Once Per Turn return-and-unsuspend sequence", () => {
    for (const trigger of ["WhenDigivolving", "WhenAttacking"] as const) {
      const effect = BT25_027.effects?.find((entry) => entry.trigger === trigger);
      expect(effect).toMatchObject({ frequency: "OncePerTurn", sharedUseKey: "ir-shared-0" });
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "Return",
        optional: true,
        to: "hand",
        target: {
          filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
          count: 1,
        },
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "Unsuspend",
        optional: true,
        abortOnDecline: true,
        cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine" },
      });
    }
  });

  it("naturally pays the mandatory follow-up cost after a digivolution return", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-023", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-027", as: "mach" }],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "levelFourTarget" },
            { card: "BT25-027", as: "levelFiveTarget" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mach").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT25-027" &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("levelFourTarget").instanceId) &&
        s.state.pendingDecision === undefined &&
        s.perm("tamer").stack.length === 0 &&
        !s.perm("base").isSuspended,
    );
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("levelFourTarget").instanceId }),
    );
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard?.instanceId)).toContain(
      s.inst("levelFiveTarget").instanceId,
    );
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
    expect(s.state.memory).toBe(0);
  });

  it("resolves the paired When Attacking timing with the same return and cost sequence", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "mach" },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-016", as: "target" }], security: ["BT1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("mach").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("target").instanceId));

    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("target").instanceId }),
    );
    expect(s.perm("mach").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("shares the Once Per Turn gate across a digivolution and a second attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-023", as: "base", suspended: true },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-001", as: "firstCost", faceUp: false },
                { card: "BT1-002", as: "secondCost", faceUp: false },
              ],
            },
          ],
          hand: [{ card: "BT25-027", as: "mach" }],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "firstTarget" },
            { card: "BT1-010", as: "secondTarget" },
          ],
          security: ["BT1-001"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mach").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("firstTarget").instanceId }),
    );
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("firstCost").instanceId }),
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard?.instanceId)).toContain(
      s.inst("secondTarget").instanceId,
    );
    expect(s.state.players[0]!.trash).not.toContainEqual(
      expect.objectContaining({ instanceId: s.inst("secondCost").instanceId }),
    );
    expect(s.perm("base").isSuspended).toBe(true);
  });

  it("rejects evolution over a level 4 without DATA SQUAD", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-016", as: "invalidBase" }],
        hand: [{ card: "BT25-027", as: "mach" }],
      },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("invalidBase").permanentId,
        instanceId: s.inst("mach").instanceId,
        useAlternateCost: true,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("mach").instanceId);
  });

  it("does not pay the processing cost when the follow-up is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-023", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-027", as: "mach" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mach").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const firstDecision = s.state.pendingDecision!;
    expect(firstDecision.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: firstDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.decisionId !== firstDecision.decisionId,
    );
    const costDecision = s.state.pendingDecision!;
    expect(costDecision.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: costDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT25-027" &&
        s.state.pendingDecision === undefined &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("target").instanceId),
    );
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("target").instanceId }),
    );
    expect(s.perm("base").isSuspended).toBe(true);
    expect(s.perm("tamer").stack).toHaveLength(1);
    expect(s.state.players[0]!.trash).not.toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("can decline the optional return and still accept the paid unsuspend", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-023", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-027", as: "mach" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: false },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mach").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const wholeEffectDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: wholeEffectDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const returnDecision = s.state.pendingDecision!;
    const returnRequest = s.decisions.find(({ req }) => req.decisionId === returnDecision.decisionId)!.req;
    expect(returnRequest.options).toMatchObject({ min: 0, max: 1, purpose: "optionalTarget" });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: returnDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const unsuspendDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: unsuspendDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && !s.perm("base").isSuspended);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
    expect(internalsOf(s.engine).tracker.count(s.inst("mach").instanceId, "BT25-027/ir-shared-0")).toBe(1);
  });

  it("declining the whole When Digivolving effect preserves the same-turn When Attacking opportunity", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-023", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-027", as: "mach" }],
          security: ["BT1-001"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }], security: ["BT1-001"] },
      },
      { autoSelectCards: false },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mach").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const wd = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: wd.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.perm("base").topCard.cardId === "BT25-027");
    await advance(s.engine).verb.unsuspend([s.perm("base").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const wa = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: wa.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const ret = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === ret.decisionId)!.req;
    expect(request.options).toMatchObject({ min: 0, max: 1, purpose: "optionalTarget" });
    expect(request.options?.candidateInstanceIds).toContain(s.perm("target").permanentId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: ret.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("target").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const cost = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: cost.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && !s.perm("base").isSuspended);
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("target").instanceId }),
    );
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("protects the source and the inherited Gaogamon/DATA SQUAD target", () => {
    const main = BT25_027.effects?.find((entry) => entry.trigger === "AllTurns" && !entry.isInherited);
    expect(main?.frequency).toBe("OncePerTurn");
    expect(main?.actions?.[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      mode: "prevent",
      sourceFilter: { isSelfRef: true },
      cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine" },
    });
    const inherited = BT25_027.effects?.find((entry) => entry.isInherited);
    expect(inherited?.actions?.[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      mode: "prevent",
      sourceFilter: {
        controllerDefault: "mine",
        kind: ["Digimon"],
        nameOrTrait: [
          { tokens: ["Gaogamon"], match: "name" },
          { tokens: ["DATA SQUAD"], match: "trait" },
        ],
      },
      cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine" },
    });
  });

  it("prevents the source from leaving by trashing the bottom face-down Tamer card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "source" },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(0);
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId));
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).toContain("BT25-027");
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("cost").instanceId);
  });

  it("lets the player choose the bottom face-down card under any eligible Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "source" },
            {
              card: "BT1-085",
              as: "eligible",
              under: [
                { card: "BT1-001", as: "bottomFaceDown", faceUp: false },
                { card: "BT1-002", as: "faceUpAbove", faceUp: true },
              ],
            },
            {
              card: "BT1-085",
              as: "secondTamer",
              under: [
                { card: "BT1-003", as: "secondBottomFaceDown", faceUp: false },
                { card: "BT1-004", as: "secondFaceUpAbove", faceUp: true },
              ],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: false },
    );
    await s.ready();

    const deleting = advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("secondTamer").instanceId] },
      }),
    ).toEqual({ ok: true });
    expect(await deleting).toBe(0);

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(
      s.inst("secondBottomFaceDown").instanceId,
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("bottomFaceDown").instanceId);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).toContain("BT25-027");
  });

  it("does not treat a non-Gaogamon, non-DATA SQUAD inherited host as protected", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-044", as: "host", under: [{ card: "BT25-027", as: "inherited" }] },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    await settle();
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).not.toContain("BT25-018");
    expect(s.state.players[0]!.trash).not.toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("allows the source to leave when the replacement is declined or unpayable", async () => {
    const declined = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "source" },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    await declined.ready();
    const declinedLeave = advance(declined.engine).verb.deletePermanent(
      [declined.perm("source").permanentId],
      "byEffect",
    );
    await settle(() => declined.state.pendingDecision?.kind === "optional");
    const declineDecision = declined.state.pendingDecision!;
    expect(declineDecision.kind).toBe("optional");
    expect(
      declined.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: declineDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    expect(await declinedLeave).toBe(1);
    await settle();
    expect(declined.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).not.toContain("BT25-027");
    expect(declined.state.players[0]!.trash).not.toContainEqual(
      expect.objectContaining({ instanceId: declined.inst("cost").instanceId }),
    );

    const unpayable = setupEngine({ 0: { battleArea: [{ card: "BT25-027", as: "source" }] } });
    await unpayable.ready();
    expect(
      await advance(unpayable.engine).verb.deletePermanent([unpayable.perm("source").permanentId], "byEffect"),
    ).toBe(1);
    await settle();
    expect(unpayable.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).not.toContain("BT25-027");
  });

  it("exposes the face-up-bottom boundary for the printed face-down cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "source" },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-003", as: "faceUpBottom", faceUp: true },
                { card: "BT1-004", as: "faceDownAbove", faceUp: false },
              ],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(0);
    await settle();
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("faceDownAbove").instanceId }),
    );
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).toContain("BT25-027");
  });

  it("allows the protected source to leave after its once-per-turn replacement is consumed", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "source" },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
            { card: "BT1-085", as: "secondTamer", under: [{ card: "BT1-002", as: "secondCost", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(0);
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId));
    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(1);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).not.toContain("BT25-027");
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("secondCost").instanceId);
  });

  it("applies inherited protection to a DATA SQUAD Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-029", as: "host", suspended: true, under: [{ card: "BT25-027", as: "inherited" }] },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(0);
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId));
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).toContain("BT25-029");
    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("cost").instanceId);
  });
});
