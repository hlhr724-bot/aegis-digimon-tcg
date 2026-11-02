import { Zone, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, settleAcrossTimers, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./BT23-017.js";

describe("BT23-017 Betamon", () => {
  it("matches the catalog and carries every main, inherited, and evolution clause", () => {
    expect(getCardDefinition("BT23-017")).toMatchObject({
      colors: ["Blue", "Purple"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [
        { color: "Blue", level: 2, memoryCost: 1 },
        { color: "Purple", level: 2, memoryCost: 1 },
      ],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Amphibian", "Hudie", "CS"],
    });
    const main = compiled.effects.find((entry) => entry.trigger === "OnPlay") as any;
    expect(main.actions[0]).toMatchObject({
      kind: "Return",
      target: {
        filter: {
          zone: "trash",
          kind: ["Digimon", "Tamer", "Option"],
          nameOrTrait: [{ tokens: ["CS"], match: "trait" }],
        },
        count: 1,
      },
      to: "hand",
      cost: {
        kind: "trash",
        optional: true,
        target: { filter: { zone: "hand", controller: "mine" }, count: 1 },
      },
      optional: true,
      abortOnDecline: true,
    });
    const inherited = compiled.effects.find((entry) => entry.trigger === "WhenAttacking") as any;
    expect(inherited).toMatchObject({ isInherited: true, frequency: "OncePerTurn" });
    expect(inherited.actions).toMatchObject([
      {
        kind: "PlayWithoutCost",
        from: ["hand"],
        payCost: false,
        optional: true,
        bindResultAs: "playedHudie",
        target: { filter: { kind: ["Digimon"], playCostLte: 5, nameOrTrait: [{ tokens: ["Hudie"] }] } },
      },
      { kind: "Restrict", restriction: "digivolve", duration: "permanent" },
      { kind: "DelayedDelete", timing: "endOfOpponentTurn" },
    ]);
    expect(compiled.digivolutionRequirement).toEqual([{ level: 2, traits: ["CS"], cost: 0, isAlternate: true }]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("allows the On Play cost-and-return effect to be refused", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT23-017", as: "betamon" },
            { card: "BT1-009", as: "cost" },
          ],
          trash: [{ card: "BT23-086", as: "target" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("betamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("betamon").instanceId),
    );
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("cost").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
  });

  it("plays Betamon publicly, pays the hand-trash cost, and recovers the exact CS card", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT23-017", as: "betamon" },
            { card: "BT1-009", as: "cost" },
          ],
          trash: [
            { card: "BT23-086", as: "csTamer" },
            { card: "BT23-001", as: "csEgg" },
            { card: "BT1-009", as: "nonCs" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    const betamonId = s.inst("betamon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: betamonId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === betamonId));
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("csTamer").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("cost").instanceId, s.inst("csEgg").instanceId, s.inst("nonCs").instanceId]),
    );
  });

  it("evolves from a breeding CS egg with the exact source stack and zero memory cost", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT23-002", as: "sourceEgg" },
        hand: [{ card: "BT23-017", as: "betamon" }],
        deck: ["BT1-009", "BT1-010"],
      },
    });
    s.state.memory = 3;
    const sourceId = s.inst("sourceEgg").instanceId;
    const betamonId = s.inst("betamon").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("sourceEgg").permanentId,
        instanceId: betamonId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("sourceEgg").topCard.instanceId === betamonId);
    expect(s.perm("sourceEgg").stack).toHaveLength(1);
    expect(s.perm("sourceEgg").stack[0]!.instanceId).toBe(sourceId);
    expect(s.perm("sourceEgg").topCard.instanceId).toBe(betamonId);
    expect(s.state.memory).toBe(3);
  });

  it("publicly evolves the legal Betamon host into BT23-018 before the attack window", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT23-002", as: "sourceEgg" },
        hand: [
          { card: "BT23-017", as: "betamon" },
          { card: "BT23-018", as: "garurumon" },
        ],
      },
    });
    s.state.memory = 3;
    const sourceId = s.inst("sourceEgg").instanceId;
    const betamonId = s.inst("betamon").instanceId;
    const garurumonId = s.inst("garurumon").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("sourceEgg").permanentId,
        instanceId: betamonId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("sourceEgg").topCard.instanceId === betamonId);
    expect(s.perm("sourceEgg").stack[0]!.instanceId).toBe(sourceId);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("sourceEgg").permanentId,
        instanceId: garurumonId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("sourceEgg").topCard.instanceId === garurumonId);
    expect(s.perm("sourceEgg").stack.map((card) => card.instanceId)).toEqual([sourceId, betamonId]);
    expect(s.perm("sourceEgg").topCard.instanceId).toBe(garurumonId);
    expect(s.state.memory).toBe(1);
  });

  it("publicly plays a cost-5 Hudie on attack, locks digivolution, and deletes it at the opponent turn end", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT23-018", as: "host", under: ["BT23-017"], dp: 20_000 }],
          hand: [
            { card: "BT23-050", as: "eligible" },
            { card: "BT23-055", as: "tooExpensive" },
            { card: "BT23-019", as: "evolutionCandidate" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
        1: {
          deck: ["BT1-017", "BT1-018", "BT1-019", "BT1-020", "BT1-021", "BT1-022", "BT1-023", "BT1-024"],
          security: ["BT1-009", "BT1-013", "BT1-027", "BT1-028"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("eligible").instanceId),
    );
    const played = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("eligible").instanceId,
    );
    expect(played).toBeDefined();
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("tooExpensive").instanceId);
    expect(observe(s.engine).isRestricted(played!, "digivolve")).toBe(true);
    s.state.memory = 8;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: played!.permanentId,
        instanceId: s.inst("evolutionCandidate").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolutionCandidate").instanceId);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === played!.permanentId)).toBe(true);
    expect(observe(s.engine).isRestricted(played!, "digivolve")).toBe(true);

    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === played!.permanentId)).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("eligible").instanceId);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("refuses a public DNA declaration naming the Digimon this inherited effect played, per Q5256 and Q5318", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT23-018", as: "host", under: ["BT23-017"], dp: 20_000 },
            { card: "BT23-027", as: "yellowMaterial" },
          ],
          hand: [
            { card: "BT23-020", as: "blueMaterial" },
            { card: "BT23-032", as: "shakkoumon" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: { security: ["BT1-009", "BT1-013", "BT1-027"], deck: ["BT1-014", "BT1-015", "BT1-016"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    const yellowPermanentId = s.perm("yellowMaterial").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("blueMaterial").instanceId),
    );
    const played = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("blueMaterial").instanceId,
    )!;
    await settle(() => !observe(s.engine).isAttacking());

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [yellowPermanentId, played.permanentId],
        instanceId: s.inst("shakkoumon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("shakkoumon").instanceId);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === played.permanentId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === yellowPermanentId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT23-032")).toBe(false);
  });

  it("refuses an effect-driven DNA offer that would consume the Digimon this inherited effect played, per Q5256 and Q5318", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-041", as: "host", under: ["BT23-017"], dp: 20_000 },
            { card: "BT23-027", as: "yellowMaterial" },
          ],
          hand: [
            { card: "BT23-050", as: "blackMaterial" },
            { card: "BT23-032", as: "shakkoumon" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: { security: ["BT1-009", "BT1-013", "BT1-027"], deck: ["BT1-014", "BT1-015", "BT1-016"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    s.state.memory = 5;
    await s.ready();
    const yellowPermanentId = s.perm("yellowMaterial").permanentId;
    preferInstanceIds.push(s.perm("yellowMaterial").topCard.instanceId, s.inst("blackMaterial").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("blackMaterial").instanceId),
    );
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT23-032")).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("shakkoumon").instanceId);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === yellowPermanentId)).toBe(true);
    expect(
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("blackMaterial").instanceId),
    ).toBe(true);
  });

  it("uses an alternate legal DNA pair while preserving the Digimon locked by this inherited effect", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT23-018", as: "host", under: ["BT23-017"], dp: 20_000 },
            { card: "BT23-027", as: "yellowMaterial" },
          ],
          hand: [
            { card: "BT23-050", as: "blackMaterial" },
            { card: "BT23-032", as: "shakkoumon" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: { security: ["BT1-009", "BT1-013", "BT1-027"], deck: ["BT1-014", "BT1-015", "BT1-016"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    s.state.memory = 5;
    await s.ready();
    const yellowPermanentId = s.perm("yellowMaterial").permanentId;
    const hostPermanentId = s.perm("host").permanentId;
    const materialInstanceIds = [s.perm("host").topCard.instanceId, s.perm("yellowMaterial").topCard.instanceId];
    preferInstanceIds.push(s.perm("yellowMaterial").topCard.instanceId, s.inst("blackMaterial").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("blackMaterial").instanceId),
    );
    await settle(() => !observe(s.engine).isAttacking());

    const result = s.state.players[0]!.battleArea.find(
      (p) => p.topCard?.instanceId === s.inst("shakkoumon").instanceId,
    );
    const locked = s.state.players[0]!.battleArea.find(
      (p) => p.topCard?.instanceId === s.inst("blackMaterial").instanceId,
    );
    expect(result).toBeDefined();
    expect(result!.stack.map((card) => card.instanceId)).toEqual(expect.arrayContaining(materialInstanceIds));
    expect(result!.stack.map((card) => card.instanceId)).not.toContain(s.inst("blackMaterial").instanceId);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === yellowPermanentId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === hostPermanentId)).toBe(false);
    expect(locked).toBeDefined();
    expect(observe(s.engine).isRestricted(locked!, "digivolve")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("lets the same DNA recipe succeed when neither material was played by the inherited effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT23-027", as: "yellowMaterial" },
          { card: "BT23-050", as: "blackMaterial" },
        ],
        hand: [{ card: "BT23-032", as: "shakkoumon" }],
        deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
      },
      1: { battleArea: [{ card: "BT1-041", as: "victim" }], deck: ["BT1-014", "BT1-015"] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("yellowMaterial").permanentId, s.perm("blackMaterial").permanentId],
        instanceId: s.inst("shakkoumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("shakkoumon").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT23-032")).toBe(true);
  });

  it("lets <Alliance> suspend the Digimon this inherited effect played, per Q5235", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT23-020", as: "host", under: ["BT23-017"], dp: 20_000 }],
          hand: [{ card: "BT23-050", as: "eligible" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
        1: { security: ["BT1-009", "BT1-013", "BT1-027"], deck: ["BT1-014", "BT1-015", "BT1-016"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    const combat = (s.engine as unknown as { combat: { hasOpenAllianceDecision: boolean } }).combat;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("eligible").instanceId),
    );
    const played = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("eligible").instanceId,
    )!;
    await settle(() => combat.hasOpenAllianceDecision);
    expect(s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: played.permanentId })).toEqual({
      ok: true,
    });
    await settle(() => !combat.hasOpenAllianceDecision);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === played.permanentId)!.isSuspended).toBe(true);
  });

  it("digivolves for 0 from an off-color level-2 CS card and rejects a non-CS card", async () => {
    const legal = setupEngine({
      0: { breeding: { card: "BT23-002", as: "base" }, hand: [{ card: "BT23-017", as: "betamon" }], deck: ["BT1-009"] },
    });
    const sourceId = legal.inst("base").instanceId;
    const betamonId = legal.inst("betamon").instanceId;
    legal.state.memory = 3;
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("base").permanentId,
        instanceId: betamonId,
      }),
    ).toEqual({ ok: true });
    await settle(() => legal.perm("base").topCard.instanceId === betamonId);
    expect(legal.perm("base").stack[0]!.instanceId).toBe(sourceId);
    expect(legal.perm("base").topCard.instanceId).toBe(betamonId);
    expect(legal.state.memory).toBe(3);
    const illegal = setupEngine({
      0: { breeding: { card: "BT1-007", as: "base" }, hand: [{ card: "BT23-017", as: "betamon" }] },
    });
    expect(
      illegal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: illegal.perm("base").permanentId,
        instanceId: illegal.inst("betamon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("caps the inherited attack play per turn and resets on the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT23-018", under: ["BT23-017"], as: "host" }],
          hand: [
            { card: "BT23-050", as: "firstHudie" },
            { card: "BT23-050", as: "secondHudie" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
        1: {
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
          security: ["BT1-009", "BT1-013", "BT1-027", "BT1-028", "BT1-045"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const attack = () =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      });
    expect(attack()).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("firstHudie").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("firstHudie").instanceId)).toBe(
      true,
    );
    await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
    expect(attack()).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("secondHudie").instanceId);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(attack()).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("secondHudie").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("secondHudie").instanceId)).toBe(
      true,
    );
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT23-017 Betamon — KB Q&A rulings", () => {
  const NEUTRAL_DECK = Array(12).fill("BT1-010");

  async function attackAndPlayHudie(s: ReturnType<typeof setupEngine>): Promise<string> {
    const playedId = s.inst("played").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === playedId) &&
        !observe(s.engine).isAttacking(),
    );
    await advance(s.engine).finishAttack();
    return playedId;
  }

  async function playHudieAndReachOpponentTurnEnd(withEaterBit: boolean) {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT23-018", as: "host", under: ["BT23-017"], dp: 20_000 },
            ...(withEaterBit ? [{ card: "BT23-073", as: "bit" }] : []),
          ],
          hand: [{ card: "BT23-037", as: "played" }],
          deck: NEUTRAL_DECK,
        },
        1: { security: ["BT1-009", "BT1-013"], deck: NEUTRAL_DECK },
      },
      { autoAcceptOptional: true, autoChooseOption: true, autoSelectCards: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const playedId = await attackAndPlayHudie(s);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === playedId)).toBe(true);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const close = async () => {
      expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    };
    return { s, playedId, close };
  }

  it("deletes the Digimon its inherited effect played at the end of the opponent's turn (Q5561)", async () => {
    const { s, playedId, close } = await playHudieAndReachOpponentTurnEnd(false);

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === playedId)).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(playedId);
    await close();
  });

  it("keeps the digivolve lock on the played Digimon when another effect stops that deletion (Q5561)", async () => {
    const { s, playedId, close } = await playHudieAndReachOpponentTurnEnd(true);

    const survivor = s.state.players[0]!.battleArea.find((p) => p.topCard?.instanceId === playedId)!;
    expect(survivor).toBeDefined();
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT23-073"]);
    s.give(0, Zone.Hand, { card: "BT23-041", as: "evolution" });
    s.state.memory = 5;
    expect(observe(s.engine).isRestricted(survivor, "digivolve")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: survivor.permanentId,
        instanceId: s.inst("evolution").instanceId,
      }).ok,
    ).toBe(false);
    expect(survivor.topCard.instanceId).toBe(playedId);

    const control = s.putOnBoard(0, { card: "BT23-037", as: "control" });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: control.permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await close();
  });

  it.each([
    { first: "the delayed deletion", pattern: /Delete this Digimon/i },
    { first: "Kaguyamon's end-of-turn play", pattern: /End of Your Turn/i },
  ])("lets the opponent, as turn player, resolve $first first at their turn end (Q5562)", async ({ pattern }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT23-018", as: "host", under: ["BT23-017"], dp: 20_000 }],
          hand: [{ card: "BT23-050", as: "played" }],
          deck: NEUTRAL_DECK,
        },
        1: {
          battleArea: [{ card: "EX9-033", as: "kaguyamon" }],
          trash: [{ card: "EX9-027", as: "puppet" }],
          security: ["BT1-009"],
          deck: NEUTRAL_DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const playedId = await attackAndPlayHudie(s);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });

    await settleAcrossTimers(() => s.state.pendingDecision?.kind === "orderTriggers");
    const pending = s.state.pendingDecision!;
    expect(pending.seat).toBe(1);
    const payload = JSON.parse(pending.payloadJson) as { triggerKeys: string[]; triggerDescriptions: string[] };
    expect(payload.triggerKeys).toHaveLength(2);
    const chosenKey = payload.triggerKeys[payload.triggerDescriptions.findIndex((text) => pattern.test(text))]!;
    expect(chosenKey).toBeDefined();
    const eventsBefore = s.events.length;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [chosenKey] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    const firstTriggered = s.events.slice(eventsBefore).find((event) => event.kind === "effectTriggered");
    expect(firstTriggered?.kind === "effectTriggered" && pattern.test(firstTriggered.description ?? "")).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(playedId);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("puppet").instanceId)).toBe(
      true,
    );
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
