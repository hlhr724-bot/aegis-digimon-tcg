import { getCardDefinition } from "@aegis/shared";
import { observe } from "../../engine/testkit/observe.js";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled as BT24_078 } from "./BT24-078.js";
import "../index.js";

describe("BT24-078 Creepymon (X Antibody)", () => {
  it("matches the immutable catalog identity", () => {
    expect(getCardDefinition("BT24-078")).toMatchObject({
      cardId: "BT24-078",
      nameEn: "Creepymon (X Antibody)",
      colors: ["Purple"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 13,
      dp: 13000,
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Demon Lord", "X Antibody", "Seven Great Demon Lords"],
      evoCosts: [{ color: "Purple", level: 5, memoryCost: 5 }],
    });
  });

  it("digivolves from trash before trashing security and uses a dynamic total play-cost budget", () => {
    const trash = BT24_078.effects?.find((entry) => entry.trigger === "YourTurn")?.actions?.[0];
    if (!trash || trash.kind !== "SubTrigger") throw new Error("missing trash subtrigger");
    expect(trash).toMatchObject({
      event: "whenAttacking",
      sourceFilter: { nameOrTrait: [{ tokens: ["Creepymon"], match: "nameExact" }] },
      activationCondition: { kind: "zoneCount", seat: "opponent", zone: "trash", op: "gte", value: 10 },
    });
    expect(trash).not.toHaveProperty("fireCondition");
    expect(trash.actions).toEqual([
      expect.objectContaining({
        kind: "Digivolve",
        from: ["trash"],
        payCost: false,
        abortOnDecline: true,
      }),
      expect.objectContaining({ kind: "SecurityManipulation", op: "trashTop", controller: "opponent" }),
    ]);
    expect(trash.actions[0]).not.toHaveProperty("ignoreRequirements");

    const whenDigivolving = BT24_078.effects?.find((entry) => entry.trigger === "WhenDigivolving");
    expect(whenDigivolving?.actions?.[1]).toMatchObject({
      kind: "PlayMultiple",
      from: ["trash"],
      totalCost: 4,
      totalCostScaling: { base: 4, raise: 4, per: 10, filter: { zone: "trash", controller: "opponent" } },
    });
  });

  it.each([
    ["normal purple level-5 requirement at cost 5", "BT24-075", undefined, 5],
    ["exact Creepymon alternate requirement at cost 2", "EX10-009", 0, 2],
  ])("uses the %s", async (_label, baseCard, alternateRequirementIndex, cost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: baseCard, as: "base" }],
          hand: [{ card: "BT24-078", as: "creepymonX" }],
          deck: [{ card: "BT1-010", as: "bonusDraw" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest" }] },
      },
      { autoSelectCards: true },
    );
    const lowestId = s.perm("lowest").permanentId;
    const baseId = s.inst("base").instanceId;
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("creepymonX").instanceId,
        ...(alternateRequirementIndex === undefined ? {} : { alternateRequirementIndex, useAlternateCost: true }),
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowestId));

    expect(s.state.memory).toBe(7 - cost);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
  });

  it("rejects the exact-name alternate route from Creepymon (X Antibody)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-078", as: "base" }],
        hand: [{ card: "BT24-078", as: "next" }],
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("next").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("Q5655-Q5657: public attack uses pre-existing trash, evolves before security trash, and draws", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [{ card: "BT24-078", as: "creepymonX" }],
          deck: [{ card: "BT1-009", as: "bonusDraw" }],
        },
        1: {
          security: [
            { card: "BT1-009", as: "securityEffect" },
            { card: "BT1-010", as: "securityChecked" },
            { card: "BT1-011", as: "securityRemaining" },
          ],
          trash: Array.from({ length: 10 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const sourceId = s.inst("creepymon").instanceId;
    await s.ready();
    const memoryBefore = s.state.memory;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("creepymon").topCard.instanceId === s.inst("creepymonX").instanceId && !observe(s.engine).isAttacking(),
    );

    expect(s.state.memory).toBe(memoryBefore);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    const moveEvents = s.events.filter((event) => event.kind === "cardsMoved");
    const bonusDrawEvent = moveEvents.findIndex((event) => event.instanceIds.includes(s.inst("bonusDraw").instanceId));
    const securityTrashEvent = moveEvents.findIndex((event) =>
      event.instanceIds.includes(s.inst("securityEffect").instanceId),
    );
    expect(bonusDrawEvent).toBeGreaterThanOrEqual(0);
    expect(securityTrashEvent).toBeGreaterThanOrEqual(0);
    expect(bonusDrawEvent).toBeLessThan(securityTrashEvent);
    expect(s.perm("creepymon").stack.map((card) => card.instanceId)).toEqual([sourceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("creepymonX").instanceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("securityEffect").instanceId, s.inst("securityChecked").instanceId]),
    );
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.security[0]!.instanceId).toBe(s.inst("securityRemaining").instanceId);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
  });

  it("combines a free trash evolution with Seventh Graviton and a legal SkullSatamon revival", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [
            { card: "BT24-078", as: "creepymonX" },
            { card: "BT24-096", as: "graviton" },
            { card: "EX10-049", as: "skullSatamon" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          trash: Array<string>(20).fill("BT1-009"),
          deck: Array<string>(10).fill("BT1-009"),
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    await s.ready();
    const memoryBefore = s.state.memory;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("creepymon").topCard.cardId).toBe("BT24-078");
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("skullSatamon").instanceId,
      ),
    ).toBe(true);
    expect(s.state.players[0]!.deck.at(-1)?.instanceId).toBe(s.inst("graviton").instanceId);
    expect(s.state.players[1]!.deck).toHaveLength(7);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q5658: the trash evolution condition is met with an empty deck", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [{ card: "BT24-078", as: "creepymonX" }],
        },
        1: {
          security: [
            { card: "BT1-009", as: "securityEffect" },
            { card: "BT1-010", as: "securityChecked" },
          ],
          trash: Array.from({ length: 10 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const sourceId = s.inst("creepymon").instanceId;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("creepymon").topCard.instanceId === s.inst("creepymonX").instanceId && !observe(s.engine).isAttacking(),
    );
    expect(s.perm("creepymon").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.perm("creepymon").stack.map((card) => card.instanceId)).toEqual([sourceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("creepymonX").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("securityEffect").instanceId, s.inst("securityChecked").instanceId]),
    );
  });

  it.each([
    ["BT24-078 trash evolution first", "BT24-078", false],
    ["EX10-009 attack first", "EX10-009", true],
  ] as const)("Q5656 public simultaneous order: %s", async (_label, firstCardId, candidateInBreeding) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [
            { card: "BT24-078", as: "creepymonX" },
            { card: "BT1-009", as: "breedingCandidate" },
          ],
          deck: [{ card: "BT1-010", as: "bonusDraw" }],
        },
        1: {
          security: [
            { card: "BT1-009", as: "securityEffect" },
            { card: "BT1-010", as: "securityChecked" },
            { card: "BT1-011", as: "securityRemaining" },
          ],
          trash: Array.from({ length: 10 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    const sourceId = s.inst("creepymon").instanceId;
    const candidateId = s.inst("breedingCandidate").instanceId;
    const memoryBefore = s.state.memory;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const ordering = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === ordering.decisionId)!.req;
    const triggerCardIds = request.options?.triggerCardIds ?? [];
    const triggerKeys = request.options?.triggerKeys ?? [];
    expect(triggerCardIds).toEqual(expect.arrayContaining(["EX10-009", "BT24-078"]));
    expect(triggerCardIds).toHaveLength(2);
    const firstIndex = triggerCardIds.indexOf(firstCardId);
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: ordering.decisionId,
        response: { kind: "orderTriggers", order: [triggerKeys[firstIndex]!] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() && s.events.filter((event) => event.kind === "securityChecked").length === 1,
    );
    expect(observe(s.engine).isAttacking()).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.perm("creepymon").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("securityRemaining").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("securityEffect").instanceId, s.inst("securityChecked").instanceId]),
    );
    expect(s.state.players[0]!.breeding?.topCard?.instanceId === candidateId).toBe(candidateInBreeding);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId).includes(candidateId)).toBe(!candidateInBreeding);
    expect(s.perm("creepymon").stack.map((card) => card.instanceId)).toEqual([sourceId]);
  });

  it("does not trigger from trash below 10 cards in the opponent's trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [{ card: "BT24-078", as: "creepymonX" }],
          deck: ["BT1-009"],
        },
        1: {
          security: [
            { card: "BT1-010", as: "securityA" },
            { card: "BT1-011", as: "securityB" },
          ],
          trash: Array.from({ length: 9 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("creepymon").topCard.cardId).toBe("EX10-009");
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("creepymonX").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityA").instanceId);
    expect(s.state.players[1]!.security[0]!.instanceId).toBe(s.inst("securityB").instanceId);
  });

  it("feedback #14: triggers below 10 and activates once a simultaneous When Attacking reaches 10 (CR 15-8-3-9)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon", under: ["EX10-046"] }],
          trash: [{ card: "BT24-078", as: "creepymonX" }],
          deck: ["BT1-009", { card: "BT1-010", as: "bonusDraw" }],
        },
        1: {
          security: [
            { card: "BT1-011", as: "securityTrashed" },
            { card: "BT1-011", as: "securityChecked" },
            { card: "BT1-011", as: "securityRemaining" },
          ],
          deck: [{ card: "BT1-012", as: "milled" }],
          trash: Array.from({ length: 9 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    const attackEnded = () =>
      s.events.some((event) => event.kind === "securityChecked") && !observe(s.engine).isAttacking();
    while (true) {
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers" || attackEnded());
      const ordering = s.state.pendingDecision;
      if (ordering?.kind !== "orderTriggers") break;
      const request = s.decisions.find(({ req }) => req.decisionId === ordering.decisionId)!.req;
      const cardIds = request.options?.triggerCardIds ?? [];
      const preferred = ["EX10-046", "BT24-078"].map((id) => cardIds.indexOf(id)).find((index) => index >= 0) ?? 0;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: ordering.decisionId,
          response: { kind: "orderTriggers", order: [request.options!.triggerKeys![preferred]!] },
        }),
      ).toEqual({ ok: true });
    }

    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("milled").instanceId);
    expect(s.perm("creepymon").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("securityRemaining").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("securityTrashed").instanceId, s.inst("securityChecked").instanceId]),
    );
  });

  it("Q5775: does not join a when-attacking trigger window after an inherited effect trashes it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX10-009",
              as: "creepymon",
              under: ["EX9-059", "BT2-075"],
            },
          ],
          hand: [{ card: "BT24-078", as: "creepymonX" }],
          deck: [{ card: "BT1-009", as: "inheritedDraw" }],
        },
        1: {
          security: [
            { card: "BT1-010", as: "securityA" },
            { card: "BT1-011", as: "securityB" },
          ],
          trash: Array.from({ length: 10 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const sourceIds = s.perm("creepymon").stack.map((card) => card.instanceId);
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.perm("creepymon").topCard.cardId).toBe("EX10-009");
    expect(s.perm("creepymon").stack.map((card) => card.instanceId)).toEqual(sourceIds);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("creepymonX").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("creepymonX").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("inheritedDraw").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityA").instanceId);
  });

  it("refuses the public trash evolution while still completing the ordinary security check", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [{ card: "BT24-078", as: "creepymonX" }],
        },
        1: {
          security: [
            { card: "BT1-009", as: "securityA" },
            { card: "BT1-010", as: "securityB" },
          ],
          trash: Array.from({ length: 10 }, () => "BT1-012"),
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const prompt = s.decisions.find(({ req }) => req.kind === "optional")!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: prompt.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("creepymon").topCard.cardId).toBe("EX10-009");
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("creepymonX").instanceId);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityA").instanceId);
    expect(s.state.players[1]!.security[0]!.instanceId).toBe(s.inst("securityB").instanceId);
  });

  it("digivolves an attacking Creepymon from trash for free and then trashes security at 10", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "creepymon" }],
          trash: [{ card: "BT24-078", as: "creepymonX" }],
          deck: ["BT1-009"],
        },
        1: {
          security: ["BT1-010", "BT1-011"],
          trash: Array.from({ length: 10 }, () => "BT1-012"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("creepymon").permanentId,
    });
    await settle(() => s.perm("creepymon").topCard.instanceId === s.inst("creepymonX").instanceId);

    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[0]!.hand).toHaveLength(1);
  });

  it("publicly digivolves, deletes every lowest-level Digimon, and plays 8 total cost at 10 opposing trash cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-009", as: "base" }],
          hand: [{ card: "BT24-078", as: "creepymonX" }],
          trash: [
            { card: "BT12-073", as: "firstPlay" },
            { card: "BT15-072", as: "secondPlay" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowA" },
            { card: "BT1-010", as: "lowB" },
            { card: "BT1-014", as: "high" },
          ],
          trash: Array.from({ length: 10 }, () => "BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const lowAId = s.perm("lowA").permanentId;
    const lowBId = s.perm("lowB").permanentId;
    const baseInstanceId = s.inst("base").instanceId;
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("creepymonX").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("firstPlay").instanceId,
        ) &&
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("secondPlay").instanceId,
        ),
    );

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).not.toContain(lowAId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).not.toContain(lowBId);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseInstanceId]);
    expect(s.state.memory).toBe(3);
  });

  it("publicly plays distinct Evil and Fallen Angel candidates while retaining a nonmatching card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-075", as: "base" }],
          hand: [{ card: "BT24-078", as: "creepymonX" }],
          deck: [{ card: "BT1-010", as: "bonusDraw" }],
          trash: [
            { card: "BT15-072", as: "evil" },
            { card: "EX2-014", as: "fallenAngel" },
            { card: "BT1-009", as: "nonmatching" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest" }], trash: Array.from({ length: 9 }, () => "BT1-012") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const baseId = s.inst("base").instanceId;
    const lowestId = s.perm("lowest").permanentId;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("creepymonX").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowestId) &&
        s.state.players[0]!.battleArea.filter((permanent) =>
          [s.inst("evil").instanceId, s.inst("fallenAngel").instanceId].includes(permanent.topCard.instanceId),
        ).length === 2,
    );
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("nonmatching").instanceId);
    expect(s.state.pendingDecision).toBeFalsy();
  });

  it("publicly refuses PlayMultiple with eligible candidates", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-075", as: "base" }],
          hand: [{ card: "BT24-078", as: "creepymonX" }],
          deck: [{ card: "BT1-010", as: "bonusDraw" }],
          trash: [
            { card: "BT15-072", as: "evil" },
            { card: "EX2-014", as: "fallenAngel" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest" }], trash: Array.from({ length: 9 }, () => "BT1-012") },
      },
      { autoSelectCards: true },
    );
    const lowestId = s.perm("lowest").permanentId;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("creepymonX").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const prompt = s.decisions.find(({ req }) => req.kind === "optional")!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: prompt.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.pendingDecision &&
        !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowestId),
    );
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("evil").instanceId, s.inst("fallenAngel").instanceId]),
    );
  });

  it("publicly skips PlayMultiple when no eligible trash card exists", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-075", as: "base" }],
          hand: [{ card: "BT24-078", as: "creepymonX" }],
          deck: [{ card: "BT1-010", as: "bonusDraw" }],
          trash: [{ card: "BT1-009", as: "nonmatching" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest" }], trash: Array.from({ length: 9 }, () => "BT1-012") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const lowestId = s.perm("lowest").permanentId;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("creepymonX").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.pendingDecision &&
        !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowestId),
    );
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("nonmatching").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
  });

  it("Q6028: continues the When Digivolving effect after its new source is deleted", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-075", as: "base" }],
          hand: [
            { card: "BT24-078", as: "creepymonX" },
            { card: "BT1-009", as: "spare" },
          ],
          deck: [{ card: "BT1-010", as: "bonusDraw" }],
          trash: [{ card: "BT15-072", as: "candidate" }],
        },
        1: { battleArea: [{ card: "EX10-052", as: "lucemon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    const baseId = s.perm("base").permanentId;
    const baseInstanceId = s.inst("base").instanceId;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: baseId,
        instanceId: s.inst("creepymonX").instanceId,
      }),
    ).toEqual({ ok: true });
    preferred.push(baseId);
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("creepymonX").instanceId) &&
        s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("lucemon").instanceId) &&
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("candidate").instanceId,
        ),
    );
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([baseInstanceId, s.inst("creepymonX").instanceId]),
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("lucemon").instanceId);
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("candidate").instanceId,
      ),
    ).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("candidate").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(s.state.pendingDecision).toBeFalsy();
  });

  it.each([
    [8, 1, 4],
    [9, 2, 8],
    [18, 2, 8],
    [19, 3, 12],
  ])(
    "applies the post-deletion play budget at %s opposing trash cards",
    async (initialTrash, expectedPlayed, expectedBudget) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT2-075", as: "base" }],
            hand: [{ card: "BT24-078", as: "creepymonX" }],
            deck: [{ card: "BT1-010", as: "bonusDraw" }, "BT1-011"],
            trash: [
              { card: "BT15-072", as: "candidateA" },
              { card: "BT15-072", as: "candidateB" },
              { card: "BT15-072", as: "candidateC" },
            ],
          },
          1: {
            battleArea: [{ card: "BT1-009", as: "lowest" }],
            trash: Array.from({ length: initialTrash }, () => "BT1-012"),
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const baseId = s.inst("base").instanceId;
      const lowestId = s.perm("lowest").permanentId;
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("creepymonX").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowestId) &&
          s.state.players[0]!.battleArea.filter((permanent) =>
            [
              s.inst("candidateA").instanceId,
              s.inst("candidateB").instanceId,
              s.inst("candidateC").instanceId,
            ].includes(permanent.topCard.instanceId),
          ).length === expectedPlayed,
      );
      expect(s.state.memory).toBe(5);
      expect(s.state.players[1]!.trash).toHaveLength(initialTrash + 1);
      expect(s.perm("base").topCard.instanceId).toBe(s.inst("creepymonX").instanceId);
      expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseId]);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
      expect(
        s.state.players[0]!.battleArea.filter((permanent) =>
          [s.inst("candidateA").instanceId, s.inst("candidateB").instanceId, s.inst("candidateC").instanceId].includes(
            permanent.topCard.instanceId,
          ),
        ),
      ).toHaveLength(expectedPlayed);
      expect(
        s.state.players[0]!.trash.filter((card) =>
          [s.inst("candidateA").instanceId, s.inst("candidateB").instanceId, s.inst("candidateC").instanceId].includes(
            card.instanceId,
          ),
        ),
      ).toHaveLength(3 - expectedPlayed);
      expect(expectedBudget).toBe(4 * expectedPlayed);
    },
  );
});
