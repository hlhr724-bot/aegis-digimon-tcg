import { digivolutionRequirementsFor, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { effectsOf } from "../../engine/effects/collect.js";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "#api/engine/testkit/observe";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";
import "../EX7/EX7-031.js";
import "../BT19/BT19-013.js";
import "../BT19/BT19-079.js";
import "./EX11-062.js";
import "./EX11-074.js";
import "./EX11-048.js";
import "../BT16/BT16-033.js";
import {
  attackPermanent,
  attackPlayer,
  eventIndex,
  isDeletionOf,
  suspendOneDigimonFrom,
} from "./qaRulings.testSupport.js";

const cardId = "EX11-032";

describe("EX11-032 GrandGalemon", () => {
  it("preserves printed stats and the hand, digivolving, and inherited effects", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "GrandGalemon",
      colors: ["Green"],
      level: 5,
      playCost: 8,
      dp: 8000,
      evoCosts: [{ color: "Green", level: 4, memoryCost: 3 }],
      types: ["Bird Dragon", "Vortex Warriors", "LIBERATOR"],
    });
    const compiled = runtimeCompiledCard(cardId)!;
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([]);
    expect(digivolutionRequirementsFor(cardId)).toEqual([]);
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Main",
        isFromHand: true,
        actions: [
          expect.objectContaining({
            kind: "Digivolve",
            costOverride: 3,
            ignoreRequirements: true,
            cost: expect.objectContaining({ kind: "place", position: "bottom" }),
          }),
        ],
      }),
    );
    const digivolving = compiled.effects.find((effect) => effect.trigger === "WhenDigivolving")!;
    expect(digivolving.actions[0]).toMatchObject({
      kind: "Suspend",
      target: { filter: { controllerDefault: "any", kind: ["Digimon"] } },
    });
    expect(digivolving.actions[1]).toMatchObject({
      kind: "PlayWithoutCost",
      dpCeilingModifier: { mode: "raiseCeiling", amount: 1000 },
    });
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "YourTurn",
        isInherited: true,
        frequency: "OncePerTurn",
        actions: [expect.objectContaining({ kind: "SubTrigger", event: "whenBattleWon" })],
      }),
    );
  });

  it("publicly resolves When Digivolving through the hand Main route", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-026", as: "pteromon" },
            { card: "EX11-062", as: "shoto" },
          ],
          hand: [
            { card: "BT16-007", as: "bird" },
            { card: "BT1-009", as: "plain" },
            { card: cardId, as: "grand" },
          ],
          trash: [{ card: "EX11-028", as: "galemon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("opponent").topCard.instanceId, s.inst("bird").instanceId);
    s.state.memory = 3;
    await s.ready();
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("grand"));
    const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
      entry.effectKey.startsWith(`${cardId}/`),
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("pteromon").topCard.cardId === cardId);
    expect(s.perm("opponent").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT16-007")).toBe(true);
    expect(s.state.players[0]!.hand.map(({ cardId: id }) => id)).toContain("BT1-009");
    assertNoLoudGap(s);
  });

  it("counts a card whose trait only contains [Bird] (e.g. [Ancient Bird])", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "grand" }],
          hand: [{ card: "ST18-06", as: "ancientBird" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("opponent").topCard.instanceId, s.inst("ancientBird").instanceId);
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("grand"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "ST18-06")).toBe(true);
  });

  it("uses the hand Main route by placing Galemon under a Pteromon, then digivolving for 3", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX11-026", as: "pteromon" },
          { card: "EX11-062", as: "shoto" },
        ],
        hand: [{ card: cardId, as: "grand" }],
        trash: [{ card: "EX11-028", as: "galemon" }],
      },
    });
    await s.ready();
    s.state.memory = 3;
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("grand"));
    const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
      entry.effectKey.startsWith(`${cardId}/`),
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("pteromon").topCard.cardId === cardId);
    expect(s.perm("pteromon").stack.map(({ cardId: id }) => id)).toEqual(["EX11-028", "EX11-026"]);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it.each(["missing", "opponent", "hand"])(
    "refuses the hand Main warp when Shoto Kazama is %s instead of in your battle area",
    async (location) => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: "EX11-026", as: "pteromon" }],
          hand: [{ card: cardId, as: "grand" }, ...(location === "hand" ? ["EX11-062"] : [])],
          trash: [{ card: "EX11-028", as: "galemon" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: location === "opponent" ? ["EX11-062"] : [] },
      });
      s.state.memory = 3;
      await s.ready();
      const source = observe(s.engine).cardSource(s.inst("grand"));
      const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
        entry.effectKey.startsWith(`${cardId}/`),
      )!;
      expect(effect).toBeDefined();
      expect(s.inst("grand").activatableEffectsJson).toBe("");
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("grand").instanceId,
          effectKey: effect.effectKey,
        }).ok,
      ).toBe(false);
      expect(s.perm("pteromon").topCard.cardId).toBe("EX11-026");
      expect(s.perm("pteromon").stack).toHaveLength(0);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("galemon").instanceId]);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("grand").instanceId);
      expect(s.state.memory).toBe(3);
      expect(s.state.pendingDecision).toBeUndefined();
      assertNoLoudGap(s);
    },
  );

  it.each(["EX11-028", "P-132"])(
    "takes the ordinary green level-4 evolution route from %s without Shoto Kazama",
    async (base) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: base, as: "base" }],
            hand: [{ card: cardId, as: "grand" }],
            deck: ["BT1-009"],
          },
        },
        { autoDeclineOptional: true },
      );
      s.state.memory = 3;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("grand").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === cardId && !s.state.pendingDecision);
      expect(s.perm("base").stack.map((card) => card.cardId)).toEqual([base]);
      expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-009"]);
      expect(s.state.players[0]!.deck).toHaveLength(0);
      expect(s.state.turnSeat).toBe(0);
      expect(s.state.memory).toBe(0);
      assertNoLoudGap(s);
    },
  );

  it("applies the EX7-031 inherited cost reduction to the hand Main route", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX7-031", as: "pteromon" },
            { card: "EX11-062", as: "shoto" },
          ],
          hand: [{ card: cardId, as: "grand" }],
          trash: [{ card: "EX11-028", as: "galemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("pteromon").permanentId);
    s.state.memory = 2;
    await s.ready();
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("grand"));
    const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
      entry.effectKey.startsWith(`${cardId}/`),
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("pteromon").topCard.cardId === cardId);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("inherits an optional once-per-turn unsuspend when its own host wins a battle", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX7-034", as: "host", under: [cardId] }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: "BT1-012", as: "firstTarget", suspended: true },
            { card: "BT1-012", as: "secondTarget", suspended: true },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("firstTarget").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.perm("host").isSuspended);
    expect(s.perm("host").isSuspended).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("secondTarget").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("host").isSuspended).toBe(true);
    assertNoLoudGap(s);
  });

  it("leaves a host without the Vortex Warriors trait suspended after it wins a battle", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX11-033", as: "host", under: [cardId], suspended: true }] } },
      { autoAcceptOptional: true },
    );
    s.state.turnSeat = 0;
    await s.ready();
    expect(s.perm("host").isSuspended).toBe(true);
    assertNoLoudGap(s);
  });

  it("unsuspends after winning a battle against a Security Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX7-034", as: "host", under: [cardId] }], security: ["BT1-009"] },
        1: { security: ["BT1-012"], deck: ["BT1-013", "BT1-014", "BT1-015"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && s.state.pendingDecision === undefined);
    await settle(() => !s.perm("host").isSuspended);
    expect(s.perm("host").isSuspended).toBe(false);
    assertNoLoudGap(s);
  });

  it("Q5843 resolves the turn player's battle-win watcher before the loser's On Deletion effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX7-034", as: "host", under: [cardId] }] },
        1: {
          battleArea: [{ card: "BT1-012", as: "target", under: ["EX11-048"], suspended: true }],
          security: ["BT1-013"],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.battleArea.length === 0 &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === cardId) &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX11-048"),
    );
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toContain("BT1-012");
    const resolved = s.events.filter((event) => event.kind === "effectResolved");
    const battleWinIndex = resolved.findIndex((event) => event.sourceCardId === cardId);
    const deletionIndex = resolved.findIndex((event) => event.sourceCardId === "EX11-048");
    expect(battleWinIndex).toBeGreaterThanOrEqual(0);
    expect(deletionIndex).toBeGreaterThan(battleWinIndex);
    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.memory).toBe(-1);
    assertNoLoudGap(s);
  });

  it("Q5845 resolves the inherited battle-win watcher when Armor Purge prevents the loser's deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX7-034", as: "host", under: [cardId] }] },
        1: {
          battleArea: [{ card: "BT16-033", as: "target", under: ["BT1-009"], suspended: true }],
          security: ["BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "BT1-009");
    await settle(() => !s.perm("host").isSuspended);

    expect(s.perm("target").topCard.cardId).toBe("BT1-009");
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toContain("BT16-033");
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("target").permanentId,
    );
    expect(s.perm("host").isSuspended).toBe(false);
    assertNoLoudGap(s);
  });

  it("resolves the loser's would-leave replacement before the inherited battle-win watcher (Q5844)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "base" },
            { card: "EX11-062", as: "shoto" },
          ],
          hand: [{ card: "EX11-074", as: "vortexdramon" }],
        },
        1: {
          battleArea: [
            { card: "BT19-013", as: "x5", under: ["BT19-008"], suspended: true },
            { card: "BT19-079", as: "taiki" },
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declinePrompts: ["Battle"],
      },
    );
    s.state.turnSeat = 0;
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("vortexdramon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX11-074");
    expect(s.state.memory).toBe(0);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "permanent", permanentId: s.perm("x5").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-008") &&
        s.state.pendingDecision === undefined,
    );

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-013")).toBe(false);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-008")).toBe(true);
    expect(s.perm("taiki").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toContain("BT19-013");
    expect(s.perm("base").isSuspended).toBe(false);
    assertNoLoudGap(s);
  });
});

describe("EX11-032 GrandGalemon — KB Q&A rulings", () => {
  function activateHandMain(s: ReturnType<typeof setupEngine>) {
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("grand"));
    const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
      entry.effectKey.startsWith(`${cardId}/`),
    );
    expect(effect).toBeDefined();
    return s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: source.instanceId,
      effectKey: effect!.effectKey,
    });
  }

  it("combines with EX7-031 Pteromon's reduction so the hand route costs 2 (Q5838)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX7-031", as: "pteromon" },
            { card: "EX11-062", as: "shoto" },
          ],
          hand: [{ card: cardId, as: "grand" }],
          trash: [{ card: "EX11-028", as: "galemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(activateHandMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("pteromon").topCard.cardId === cardId);

    expect(s.perm("pteromon").stack.map(({ cardId: id }) => id)).toEqual(["EX11-028", "EX7-031"]);
    expect(s.state.memory).toBe(3);
  });

  it("cannot ride P-106 Agility Training's digivolution, so that effect finds no GrandGalemon route (Q5839)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-106", as: "delay" },
            { card: "EX11-026", as: "pteromon" },
            { card: "EX11-062", as: "shoto" },
          ],
          hand: [{ card: cardId, as: "grand" }],
          trash: [{ card: "EX11-028", as: "galemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    s.state.turnCount = 1;
    await s.ready();
    const ability = JSON.parse(s.perm("delay").activatableEffectsJson) as { effectKey: string }[];
    expect(ability).toHaveLength(1);

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("delay").instanceId,
        effectKey: ability[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        !s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "P-106"),
    );

    expect(s.perm("pteromon").topCard.cardId).toBe("EX11-026");
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("grand").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("galemon").instanceId);
    expect(s.state.memory).toBe(10);
  });

  it.each(["ally", "opponent"] as const)(
    "offers both players' Digimon to its [When Digivolving] suspension and suspends the chosen one (%s) (Q5840)",
    async (pick) => {
      const { s, offeredAlly, offeredOpponent } = await suspendOneDigimonFrom(
        cardId,
        EffectTiming.WhenDigivolving,
        pick,
      );

      expect(offeredAlly).toBe(true);
      expect(offeredOpponent).toBe(true);
      expect(s.perm(pick).isSuspended).toBe(true);
    },
  );

  it("unsuspends for the battle win only after the losing Digimon is deleted (Q5841)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX7-034", as: "host", under: [cardId] }] },
        1: { battleArea: [{ card: "BT1-012", as: "target", suspended: true }] },
      },
      { autoAcceptOptional: true },
    );
    await s.ready();
    const targetId = s.perm("target").permanentId;

    await attackPermanent(s, 0, "host", "target");

    const deletion = eventIndex(s, isDeletionOf(targetId));
    const battleWin = eventIndex(s, (event) => event.kind === "effectResolved" && event.sourceCardId === cardId);
    expect(deletion).toBeGreaterThanOrEqual(0);
    expect(battleWin).toBeGreaterThan(deletion);
    expect(s.perm("host").isSuspended).toBe(false);
  });

  it("unsuspends after beating a Security Digimon (Q5842)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX7-034", as: "host", under: [cardId] }] },
        1: { security: [{ card: "BT1-012", as: "securityDigimon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await attackPlayer(s, 0, "host");

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(
      s.inst("securityDigimon").instanceId,
    );
    expect(s.perm("host").isSuspended).toBe(false);
  });
});
