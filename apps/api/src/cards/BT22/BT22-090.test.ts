import { describe, expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT22-090.js";

describe("BT22-090 Rie Kishibe", () => {
  it("gains memory only when the opponent has a Digimon at the start of the main phase", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "StartOfYourMainPhase");
    expect(effect?.actions).toMatchObject([
      {
        kind: "GainMemory",
        amount: 1,
        condition: {
          kind: "opponentHas",
          filter: { controllerDefault: "opponent", kind: ["Digimon"] },
        },
      },
    ]);
  });

  it("requires deleting one other Knightmon-text/CS permanent before the once-per-turn digivolution", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "EndOfYourTurn");
    expect(effect).toMatchObject({ frequency: "OncePerTurn" });
    expect(effect?.actions[0]).toMatchObject({
      kind: "Digivolve",
      optional: true,
      from: ["hand"],
      into: {
        controllerDefault: "mine",
        nameOrTrait: [{ tokens: ["LordKnightmon"], match: "name" }],
      },
      reduceCost: 3,
      payCost: true,
      useAlternateCost: true,
      cost: {
        kind: "deleteOwn",
        target: {
          filter: {
            controller: "mine",
            excludeSelf: true,
            kind: ["Digimon", "Tamer"],
            nameOrTrait: [
              { tokens: ["Knightmon"], match: "text" },
              { tokens: ["CS"], match: "trait" },
            ],
          },
          count: 1,
        },
      },
      abortOnDecline: true,
    });
  });

  it("plays itself from security without paying its play cost", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "Security");
    expect(effect).toMatchObject({ isSecurity: true });
    expect(effect?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      payCost: false,
      target: { isSelf: true, filter: { isSelfRef: true } },
    });
  });

  it("observably gains exactly 1 memory only with an opposing Digimon", async () => {
    const positive = setupEngine({
      0: { battleArea: [{ card: "BT22-090", as: "rie" }] },
      1: { battleArea: ["BT1-009"] },
    });
    const before = positive.state.memory;
    await (
      positive.engine as unknown as { fireTiming(timing: EffectTiming, trigger: Record<string, never>): Promise<void> }
    ).fireTiming(EffectTiming.OnStartMainPhase, {});
    await settle(() => positive.state.memory !== before);
    expect(positive.state.memory).toBe(before + 1);

    const negative = setupEngine({ 0: { battleArea: [{ card: "BT22-090", as: "rie" }] } });
    await (
      negative.engine as unknown as { fireTiming(timing: EffectTiming, trigger: Record<string, never>): Promise<void> }
    ).fireTiming(EffectTiming.OnStartMainPhase, {});
    await settle(() => false, 40);
    expect(negative.state.memory).toBe(0);
  });

  it("deletes another CS permanent and pays the reduced legal LordKnightmon cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-090", as: "rie" },
            { card: "BT22-083", as: "cost" },
          ],
          hand: [{ card: "BT22-067", as: "lordknightmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await (
      s.engine as unknown as { fireTiming(timing: EffectTiming, trigger: Record<string, never>): Promise<void> }
    ).fireTiming(EffectTiming.OnEndTurn, {});
    await settle(() => s.perm("rie").topCard?.cardId === "BT22-067");

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT22-083")).toBe(false);
  });

  it("does not offer a LordKnightmon print without the Rie alternate route", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-090", as: "rie" },
            { card: "BT22-010", as: "sacrifice" },
          ],
          hand: ["BT5-045", "BT22-067"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    await (
      s.engine as unknown as { fireTiming(timing: EffectTiming, trigger: Record<string, never>): Promise<void> }
    ).fireTiming(EffectTiming.OnEndTurn, {});
    await settle(() => s.perm("rie").topCard?.cardId === "BT22-067", 300);

    expect(s.perm("rie").topCard?.cardId).toBe("BT22-067");
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT5-045")).toBe(true);
  });

  describe("Discord bug 1554653115695759391: deletion without a legal LordKnightmon", () => {
    const DECK = Array<string>(10).fill("BT1-009");
    const SECURITY = ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"];

    function layBoard(options: { autoAcceptOptional: true } | { autoDeclineOptional: true }) {
      return setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT22-090", as: "rie" },
              { card: "EX13-074", as: "cost" },
            ],
            hand: [{ card: "BT19-073", as: "lordknightmon" }],
            deck: [...DECK],
            security: [...SECURITY],
          },
          1: { hand: ["BT1-009"], deck: [...DECK], security: [...SECURITY] },
        },
        { ...options, autoSelectCards: true },
      );
    }

    it("still lets the player pay the printed By-deletion at end of turn (CR 15-7-5, Q4959)", async () => {
      const s = layBoard({ autoAcceptOptional: true });
      const costId = s.inst("cost").instanceId;
      const lordId = s.inst("lordknightmon").instanceId;

      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);

      expect(s.decisions.some(({ req }) => req.sourceCardId === "BT22-090" && req.kind === "optional")).toBe(true);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(costId);
      expect(s.perm("rie").topCard?.cardId).toBe("BT22-090");
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(lordId);

      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    });

    it("keeps the other CS Tamer when the deletion is declined", async () => {
      const s = layBoard({ autoDeclineOptional: true });
      const costId = s.inst("cost").instanceId;

      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);

      expect(s.decisions.some(({ req }) => req.sourceCardId === "BT22-090" && req.kind === "optional")).toBe(true);
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === costId)).toBe(true);

      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    });
  });
});

describe("GitHub #5290 / #5398: Rie Kishibe end-of-turn digivolution through public intents", () => {
  it.each([
    { into: "BT22-067", security: 3, sacrifice: "BT22-083", accept: true, evolves: true, deletes: true },
    { into: "EX13-064", security: 3, sacrifice: "BT22-083", accept: true, evolves: true, deletes: true },
    { into: "EX13-064", security: 0, sacrifice: "BT22-083", accept: true, evolves: true, deletes: true },
    { into: "BT22-067", security: 4, sacrifice: "BT22-083", accept: true, evolves: false, deletes: true },
    { into: "BT22-067", security: 5, sacrifice: "BT7-063", accept: true, evolves: false, deletes: true },
    { into: "EX13-064", security: 4, sacrifice: "BT22-083", accept: true, evolves: false, deletes: true },
    { into: "BT19-073", security: 3, sacrifice: "BT22-083", accept: true, evolves: false, deletes: true },
    { into: "EX13-064", security: 3, sacrifice: "BT1-009", accept: true, evolves: false, deletes: false },
    { into: "EX13-064", security: 3, sacrifice: "BT22-083", accept: false, evolves: false, deletes: false },
  ])(
    "$into at $security security with $sacrifice and accept=$accept: evolves=$evolves, deletes=$deletes",
    async ({ into, security, sacrifice, accept, evolves, deletes }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT22-090", as: "rie" },
              { card: sacrifice, as: "payment" },
            ],
            hand: [{ card: into, as: "lord" }],
            eggDeck: ["BT1-001"],
            deck: Array<string>(10).fill("BT1-009"),
            security,
          },
          1: { deck: Array<string>(10).fill("BT1-009"), security: 5 },
        },
        { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true, declinePrompts: ["Attack"] },
      );
      const paymentId = s.inst("payment").instanceId;
      const lordId = s.inst("lord").instanceId;
      s.state.memory = 5;
      const loop = s.engine.startTurnLoop();
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding && !s.state.pendingDecision);

      expect(s.perm("rie").topCard.cardId).toBe(evolves ? into : "BT22-090");
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === paymentId)).toBe(deletes);
      expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === lordId)).toBe(!evolves);
      const evolutionPayments = s.events.flatMap((event) =>
        event.kind === "memoryChanged" && event.reason === "digivolve" ? [{ from: event.from, to: event.to }] : [],
      );
      expect(evolutionPayments).toEqual(evolves ? [{ from: -3, to: -5 }] : []);
      // Feedback #40 follow-up: the "Digivolve" yes/no appears only when a legal LordKnightmon exists.
      const offersDigivolve = s.decisions.some(
        ({ req }) => req.sourceCardId === "BT22-090" && req.kind === "optional" && req.promptText === "Digivolve",
      );
      expect(offersDigivolve).toBe(evolves);
      expect(s.state.pendingDecision).toBeUndefined();

      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
});

describe("BT22-090 Rie Kishibe — KB Q&A rulings", () => {
  async function endTurnWithRie(sacrifice: string, lordKnightmon: string, security: number) {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-090", as: "rie" },
            { card: sacrifice, as: "sacrifice" },
          ],
          hand: [{ card: lordKnightmon, as: "lordKnightmon" }],
          deck: ["BT1-010"],
          security,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    await advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    await settle(() => s.state.pendingDecision === undefined);
    return s.perm("rie").topCard.cardId;
  }

  it.each([
    { requirement: "met", lordKnightmon: "BT22-067", security: 3, top: "BT22-067" },
    { requirement: "unmet with 4 security cards", lordKnightmon: "BT22-067", security: 4, top: "BT22-090" },
    { requirement: "absent from another LordKnightmon", lordKnightmon: "BT5-045", security: 3, top: "BT22-090" },
  ])(
    "digivolves into LordKnightmon only when its digivolution requirement is $requirement (Q4959)",
    async ({ lordKnightmon, security, top }) => {
      expect(await endTurnWithRie("BT22-083", lordKnightmon, security)).toBe(top);
    },
  );

  it.each([
    { sacrifice: "BT7-063", text: "[Knightmon] in its name", top: "BT22-067" },
    { sacrifice: "BT18-058", text: "[Knightmon] in its effect", top: "BT22-067" },
    { sacrifice: "BT1-009", text: "no [Knightmon] and no [CS] trait", top: "BT22-090" },
  ])("counts a card with $text as a card with [Knightmon] in its text (Q4960)", async ({ sacrifice, top }) => {
    expect(await endTurnWithRie(sacrifice, "BT22-067", 3)).toBe(top);
  });
});
