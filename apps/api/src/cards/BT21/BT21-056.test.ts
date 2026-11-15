import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT21-056.js";
import "../index.js";

describe("BT21-056 Vemmon", () => {
  it("preserves full coverage with no residual clauses", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual ?? []).toEqual([]);
  });

  it("publicly evolves from a black Digi-Egg in breeding for zero memory", async () => {
    const s = setupEngine({
      0: { breeding: { card: "BT21-006", as: "egg" }, hand: [{ card: "BT21-056", as: "vemmon" }] },
    });
    s.state.memory = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("vemmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === "BT21-056");
    expect(s.state.memory).toBe(1);
    expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual(["BT21-006"]);
  });

  it("does not reduce an inherited host's evolution into a card without Vemmon in its text", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-058", as: "host", under: ["BT21-056"] }],
        hand: [{ card: "BT2-060", as: "megadramon" }],
      },
    });
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("megadramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT2-060");
    expect(s.state.memory).toBe(1);
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT21-056", "BT21-058"]);
  });

  it("trashes a Vemmon-text card to return a non-Digi-Egg Vemmon-text card", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "OnPlay");
    const action = effect?.actions[0] as { target?: unknown; cost?: unknown } | undefined;

    expect(action).toMatchObject({ optional: true, abortOnDecline: true });
    expect(action?.target).toEqual({
      filter: {
        controller: "mine",
        kind: ["Digimon", "Option", "Tamer"],
        zone: "trash",
        nameOrTrait: [{ tokens: ["Vemmon"], match: "text" }],
      },
      count: 1,
      upTo: true,
    });
    expect(action?.cost).toEqual({
      kind: "trash",
      target: {
        filter: { controller: "mine", zone: "hand", nameOrTrait: [{ tokens: ["Vemmon"], match: "text" }] },
        count: 1,
      },
      raw: "By trashing 1 card with [Vemmon] in its text from your hand",
    });
  });

  it("restricts inherited cost reduction to this Digimon and Vemmon-text Digimon", () => {
    const effect = compiled.effects.find((entry) => entry.isInherited);
    expect(effect?.frequency).toBe("OncePerTurn");
    expect(effect?.actions[0]).toMatchObject({
      kind: "Replacement",
      sourceFilter: { isSelfRef: true },
      into: { kind: ["Digimon"], nameOrTrait: [{ tokens: ["Vemmon"], match: "text" }] },
      actions: [{ kind: "Replacement", mode: "reduceCost", amount: 1 }],
    });
  });

  it("pays with a Vemmon-text hand card and returns a non-Digi-Egg Vemmon-text card", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-056", as: "played" },
            { card: "BT11-061", as: "cost" },
            { card: "BT1-009", as: "invalidCost" },
          ],
          trash: [
            { card: "BT21-058", as: "returned" },
            { card: "BT21-006", as: "egg" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("cost").instanceId, s.inst("returned").instanceId);
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("returned").instanceId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("invalidCost").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("egg").instanceId)).toBe(true);
  });

  it("refuses the optional recovery through a public play while preserving both zones", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-056", as: "played" },
            { card: "BT11-061", as: "cost" },
          ],
          trash: [{ card: "BT21-058", as: "target" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-056"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("target").instanceId)).toBe(true);
  });

  it("offers the effect with an empty trash because the trashed cost card becomes the target", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-056", as: "played" },
            { card: "BT11-061", as: "cost" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    const costId = s.inst("cost").instanceId;
    await settle(
      () =>
        s.events.some(
          (event) => event.kind === "cardsMoved" && event.to === "hand" && event.instanceIds.includes(costId),
        ) && s.state.pendingDecision === undefined,
    );
    expect(
      s.events.some(
        (event) => event.kind === "cardsMoved" && event.to === "trash" && event.instanceIds.includes(costId),
      ),
    ).toBe(true);
    expect(
      s.events.some(
        (event) => event.kind === "cardsMoved" && event.to === "hand" && event.instanceIds.includes(costId),
      ),
    ).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === costId)).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("pays the hand cost and may still return nothing, leaving the cost card in the trash (Q5082)", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "BT21-056", as: "played" },
          { card: "BT11-061", as: "cost" },
        ],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(s.decisions.at(-1)!.req.options).toMatchObject({
      min: 0,
      max: 1,
      candidateInstanceIds: [s.inst("cost").instanceId],
      purpose: "cost",
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("cost").instanceId] },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards" && s.decisions.length === 2);
    expect(s.decisions.at(-1)!.req.options).toMatchObject({
      min: 0,
      max: 1,
      candidateInstanceIds: [s.inst("cost").instanceId],
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    const player = s.state.players[0]!;
    expect(player.hand).toHaveLength(0);
    expect(player.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(player.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT21-056"]);
    expect(s.state.memory).toBe(1);
  });

  it("declining recovery after public play leaves the hand cost and trash target in place", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-056", as: "vemmon" },
            { card: "BT11-061", as: "cost" },
          ],
          trash: [{ card: "BT21-058", as: "target" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("vemmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-056"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("target").instanceId)).toBe(true);
    expect(s.state.memory).toBe(7);
  });

  it("reduces only the first Vemmon-text evolution each turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-058", as: "host", under: [{ card: "BT21-056", as: "source" }] }],
        hand: [
          { card: "BT21-060", as: "destromon" },
          { card: "BT21-062", as: "galacticmon" },
        ],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("destromon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.instanceId === s.inst("destromon").instanceId);
    expect(s.state.memory).toBe(6);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("galacticmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.instanceId === s.inst("galacticmon").instanceId);
    expect(s.state.memory).toBe(0);
  });

  it("carries the inherited reduction through public evolutions of a legal Vemmon stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-056", as: "host", under: ["BT21-006"] }],
          hand: [
            { card: "BT21-058", as: "snatchmon" },
            { card: "BT21-060", as: "destromon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("snatchmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT21-058");

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("destromon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT21-060");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT21-006", "BT21-056", "BT21-058"]);
    expect(s.perm("host").stack.filter((card) => card.cardId === "BT21-056")).toHaveLength(1);
    expect(s.perm("host").stack.some((card) => card.cardId === "BT21-058")).toBe(true);
    expect(s.state.memory).toBe(3);
  });

  it("reduces a second qualifying evolution after the next own turn resets Once Per Turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-056", as: "host", under: ["BT21-006"] }],
          hand: [
            { card: "BT21-058", as: "snatchmon" },
            { card: "BT21-060", as: "destromon" },
            { card: "BT21-062", as: "galacticmon" },
          ],
          deck: [
            "BT1-001",
            "BT1-002",
            "BT1-003",
            "BT1-004",
            "BT1-005",
            "BT1-006",
            "BT1-007",
            "BT1-008",
            "BT1-009",
            "BT1-010",
            "BT1-011",
            "BT1-012",
          ],
        },
        1: {
          deck: ["BT1-001", "BT1-002", "BT1-003", "BT1-004", "BT1-005", "BT1-006"],
          security: [{ card: "BT1-009" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    for (const alias of ["snatchmon", "destromon"] as const) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("host").permanentId,
          instanceId: s.inst(alias).instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("host").topCard.cardId === s.inst(alias).cardId);
    }
    const memoryAfterFirstTurnReduction = s.state.memory;

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
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("galacticmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.instanceId === s.inst("galacticmon").instanceId);
    expect(memoryAfterFirstTurnReduction).toBe(3);
    expect(s.state.memory).toBe(5);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });
});

describe("BT21-056 Vemmon — KB Q&A rulings", () => {
  it("treats a card that mentions [Vemmon] only in its effect text as a card with [Vemmon] in its text (Q4560)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-056", as: "played" },
            { card: "BT21-087", as: "zenithCost" },
            { card: "BT1-009", as: "plainHandCard" },
          ],
          trash: [
            { card: "P-244", as: "emblemTarget" },
            { card: "BT2-060", as: "plainTrashCard" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("zenithCost").instanceId, s.inst("emblemTarget").instanceId);
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("emblemTarget").instanceId) &&
        s.state.pendingDecision === undefined,
    );

    const candidateSets = s.decisions
      .filter(({ req }) => req.kind === "selectCards" || req.kind === "chooseTargets")
      .map(({ req }) => req.options?.candidateInstanceIds ?? []);
    const costCandidates = candidateSets.find((ids) => ids.includes(s.inst("zenithCost").instanceId));
    const returnCandidates = candidateSets.find((ids) => ids.includes(s.inst("emblemTarget").instanceId));
    expect(costCandidates).not.toContain(s.inst("plainHandCard").instanceId);
    expect(returnCandidates).not.toContain(s.inst("plainTrashCard").instanceId);

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("zenithCost").instanceId, s.inst("plainTrashCard").instanceId]),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("plainHandCard").instanceId, s.inst("emblemTarget").instanceId]),
    );
  });
});
