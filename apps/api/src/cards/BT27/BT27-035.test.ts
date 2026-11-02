import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("MirageGaogamon: Burst Mode", () => {
  it("returns hidden hand cards down to seven and moves only the top security to deck bottom", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { hand: Array(9).fill("BT1-009"), security: [{ card: "BT1-015", as: "security" }, "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const top = s.state.players[1]!.security[0]!.instanceId;
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.state.players[1]!.hand).toHaveLength(7);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.deck.at(-1)!.instanceId).toBe(top);
  });
  it("does not touch security below the eight-card threshold", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { hand: Array(7).fill("BT1-009"), security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.state.players[1]!.hand).toHaveLength(7);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
  it("evaluates the unsuspend threshold after the Option returns the opponent Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-035", as: "source", suspended: true }],
          hand: [{ card: "BT27-035", as: "option" }],
        },
        1: { hand: Array(7).fill("BT1-009"), battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    expect(s.state.players[1]!.hand).toHaveLength(8);
    expect(s.perm("source").isSuspended).toBe(false);
  });
  it("burst digivolves for zero by returning Thomas and preserving the source stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT4-035", as: "base", under: ["ST2-03"] },
            { card: "BT4-093", as: "thomas" },
          ],
          hand: [{ card: "BT27-035", as: "burst" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-035");
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toContain("BT4-093");
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["ST2-03", "BT4-035"]);
    expect(observe(s.engine).canUseInheritedEffect(s.perm("base"), "ST2-03")).toBe(true);
    expect(s.state.memory).toBe(0);
  });
});

describe("MirageGaogamon: Burst Mode boundaries", () => {
  it("allows declining the hand return cost without moving security", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { hand: Array(8).fill("BT1-009"), security: ["BT1-009"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.state.players[1]!.hand).toHaveLength(8);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
  it("returns exactly one hand card when the opponent has eight", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { hand: Array(8).fill("BT1-009"), security: ["BT1-015"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.state.players[1]!.hand).toHaveLength(7);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.deck.map((c) => c.cardId)).toEqual(["BT1-009", "BT1-015"]);
  });
  it("does not unsuspend after bouncing an opponent to a seven-card hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-035", as: "source", suspended: true }],
          hand: [{ card: "BT27-035", as: "option" }],
        },
        1: { hand: Array(6).fill("BT1-009"), battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    expect(s.state.players[1]!.hand).toHaveLength(7);
    expect(s.perm("source").isSuspended).toBe(true);
  });
  it("rejects Burst Digivolve without Thomas and preserves the hand and base", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT4-035", as: "base" }], hand: [{ card: "BT27-035", as: "burst" }] } },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
        alternateRequirementIndex: 1,
      }).ok,
    ).toBe(false);
    expect(s.perm("base").topCard.cardId).toBe("BT4-035");
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toEqual(["BT27-035"]);
    expect(s.state.memory).toBe(10);
  });
});

describe("MirageGaogamon: Burst Mode complete effects", () => {
  it("hides all opponent hand identities while its controller chooses the returned cards", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { hand: Array(9).fill("BT1-009"), security: ["BT1-015"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    const selection = s.decisions.find(({ req }) => req.kind === "selectCards" && req.options?.max === 2);
    expect(selection).toBeDefined();
    expect(selection!.seat).toBe(0);
    expect(selection!.req.options?.visibleInstanceIds).toEqual([]);
    expect(selection!.req.options?.visibleCards ?? []).toEqual([]);
    expect(s.state.players[1]!.hand).toHaveLength(7);
  });

  it("shares Option activation between evolution and attack but repeats the hand cost on another attack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: {
          hand: Array(8).fill("BT1-009"),
          security: ["BT1-015", "BT1-015", "BT1-015"],
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.hand).toHaveLength(7);
    await advance(s.engine).verb.draw(1, 1);
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("source"));
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.hand).toHaveLength(7);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("allows declining the optional unsuspend while still returning the enemy", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-035", as: "source", suspended: true }],
          hand: [{ card: "BT27-035", as: "option" }],
        },
        1: { hand: Array(7).fill("BT1-009"), battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }).ok,
    ).toBe(true);
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-035"));
    expect(s.perm("source").isSuspended).toBe(true);
    expect(s.state.players[1]!.hand).toHaveLength(8);
    expect(s.state.memory).toBe(4);
  });

  it.each([
    ["BT1-009", false],
    ["BT4-035", true],
    ["BT12-043", false],
    ["ST24-04", true],
  ])("checks Option color or DATA SQUAD use requirement with %s", async (card, allowed) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card }], hand: [{ card: "BT27-035", as: "option" }] },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }).ok,
    ).toBe(allowed);
    if (allowed) {
      await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-035"));
    }
    expect(s.state.memory).toBe(allowed ? 4 : 10);
    expect(s.state.players[0]!.hand).toHaveLength(allowed ? 0 : 1);
  });

  it("Arts Digivolves after using the Option without paying the evolution cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT4-035", as: "base" }],
          hand: [{ card: "BT27-035", as: "option" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }).ok,
    ).toBe(true);
    await settle(() => s.perm("base").topCard.cardId === "BT27-035" && s.state.pendingDecision === undefined);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT4-035"]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(4);
  });

  it("exposes all three defensive keywords on the battlefield", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT27-035", as: "source" }] } });
    await s.ready();
    for (const keyword of ["Reboot", "Blocker", "Evade"]) {
      expect(observe(s.engine).hasKeyword(s.perm("source"), keyword)).toBe(true);
    }
  });

  it("uses Evade to prevent deletion by suspending", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { battleArea: [{ card: "BT1-010" }], hand: [{ card: "ST1-16", as: "gaia" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaia").instanceId }).ok).toBe(true);
    await settle(() => s.events.some((event) => event.kind === "evadePrompt"));
    expect(
      s.engine.applyIntent(0, { type: "respondEvade", permanentId: s.perm("source").permanentId, accept: true }).ok,
    ).toBe(true);
    await settle(() => s.state.players[1]!.trash.some((c) => c.cardId === "ST1-16"));
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("source").isSuspended).toBe(true);
  });
});

describe("MirageGaogamon Burst evolution requirements", () => {
  it.each([
    ["BT4-035", "BT1-087"],
    ["BT12-043", "BT4-093"],
  ])("rejects a wrong named base or return Tamer (%s, %s)", async (base, tamer) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "base" }, { card: tamer }], hand: [{ card: "BT27-035", as: "burst" }] } },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
        alternateRequirementIndex: 1,
      }).ok,
    ).toBe(false);
    expect(s.perm("base").topCard.cardId).toBe(base);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.memory).toBe(10);
  });
  it.each([
    ["ST24-07", true],
    ["BT12-043", false],
    ["ST24-06", false],
  ])("checks exact level six DATA SQUAD alternate evolution from %s", async (base, allowed) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-035", as: "burst" }], deck: ["BT1-009"] } },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
        alternateRequirementIndex: 0,
      }).ok,
    ).toBe(allowed);
    if (allowed) {
      await settle(() => s.perm("base").topCard.cardId === "BT27-035");
    }
    expect(s.perm("base").topCard.cardId).toBe(allowed ? "BT27-035" : base);
    expect(s.state.memory).toBe(allowed ? 5 : 10);
  });
});

describe("MirageGaogamon defensive keywords", () => {
  it("blocks an attack and preserves security", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(true);
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("source").permanentId }).ok).toBe(
      true,
    );
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.perm("source").isSuspended).toBe(true);
  });
  it("Reboots during the opponent active phase while ordinary Digimon stay suspended", async () => {
    const s = setupEngine({
      0: { deck: Array(10).fill("BT1-009"), eggDeck: ["BT1-001"] },
      1: {
        battleArea: [
          { card: "BT27-035", as: "source", suspended: true },
          { card: "BT1-009", as: "ordinary", suspended: true },
        ],
      },
    });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => !s.perm("source").isSuspended);
      expect(s.perm("ordinary").isSuspended).toBe(true);
      expect(s.state.turnSeat).toBe(0);
    } finally {
      s.engine.applyIntent(0, { type: "endPhase" });
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});

describe("MirageGaogamon decision stage text", () => {
  it.each(["digivolve", "option"])(
    "highlights the Option bounce and unsuspend stages during %s resolution",
    async (mode) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT27-035", as: "source", suspended: true }],
            hand: [{ card: "BT27-035", as: "option" }],
          },
          1: {
            hand: Array(7).fill("BT1-009"),
            battleArea: [
              { card: "BT1-009", as: "enemy" },
              { card: "BT1-010", as: "otherEnemy" },
            ],
            security: ["BT1-015"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
      );
      await s.ready();
      s.state.memory = 10;
      if (mode === "digivolve") {
        await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
      } else {
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" });
        await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT27-035"));
      }
      const bounce = s.decisions.find(
        ({ req }) => req.options?.effectTextPart === "Return 1 of your opponent's Digimon to the hand.",
      );
      const unsuspend = s.decisions.find(
        ({ req }) =>
          req.options?.effectTextPart === "Then, if their hand has 8 or more cards, 1 of your Digimon may unsuspend.",
      );
      for (const stage of [bounce, unsuspend]) {
        expect(stage).toBeDefined();
        expect(stage!.req.options?.timing).toBe("Main");
        expect(stage!.req.options?.effectTextEmphasis).toBe(stage!.req.options?.effectTextPart);
        expect(stage!.req.options?.effectText).toBe(
          "[Main] Return 1 of your opponent's Digimon to the hand. Then, if their hand has 8 or more cards, 1 of your Digimon may unsuspend.\n＜Arts Digivolve＞",
        );
      }
      expect(s.perm("source").isSuspended).toBe(false);
    },
  );

  it("highlights the hand payment and security return without revealing the chosen hand cards", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-035", as: "source" }] },
        1: { hand: Array(9).fill("BT1-009"), security: ["BT1-015"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    const payment = s.decisions.find(({ req }) => req.kind === "selectCards" && req.options?.max === 2);
    expect(payment).toBeDefined();
    expect(payment!.req.options?.effectTextEmphasis).toBe(
      "by returning cards without looking to the bottom of the deck so that it has 7 left, return their top security card to the bottom of the deck.",
    );
    expect(payment!.req.options?.effectText).toBe(
      "[When Digivolving] [When Attacking] If your opponent's hand has 8 or more cards, by returning cards without looking to the bottom of the deck so that it has 7 left, return their top security card to the bottom of the deck.",
    );
    expect(payment!.req.options?.visibleInstanceIds).toEqual([]);
    expect(payment!.req.options?.visibleCards ?? []).toEqual([]);
  });
});

describe("MirageGaogamon security return privacy", () => {
  it.each([
    { seat: 0, opponent: 1, faceUp: false },
    { seat: 1, opponent: 0, faceUp: false },
    { seat: 0, opponent: 1, faceUp: true },
    { seat: 1, opponent: 0, faceUp: true },
  ] as const)(
    "returns security without revealing it with controller $seat and faceUp $faceUp",
    async ({ seat, opponent, faceUp }) => {
      const s = setupEngine(
        {
          [seat]: { battleArea: [{ card: "BT27-035", as: "source" }] },
          [opponent]: {
            hand: Array(8).fill("BT1-009"),
            security: [{ card: "BT1-015", as: "returnedSecurity", faceUp }, "BT1-010"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = seat;
      await s.ready();
      await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
      expect(
        s.events.filter(
          (event) =>
            event.kind === "cardRevealed" || event.kind === "securityRevealed" || event.kind === "securityChecked",
        ),
      ).toEqual([]);
      const movement = s.events.find(
        (event) =>
          event.kind === "cardsMoved" &&
          event.to === "deckBottom" &&
          event.instanceIds.includes(s.inst("returnedSecurity").instanceId),
      );
      expect(movement).toMatchObject({ kind: "cardsMoved", seat: opponent });
      if (movement?.kind !== "cardsMoved") {
        throw new Error("Missing returned security movement");
      }
      expect(movement.cardIds).toEqual(faceUp ? ["BT1-015"] : undefined);
      expect(JSON.stringify(s.decisions)).not.toContain("BT1-015");
      expect(s.state.players[opponent]!.deck.at(-1)!.cardId).toBe("BT1-015");
      expect(s.state.players[opponent]!.deck.at(-1)!.faceUp).toBe(false);
      expect(s.state.players[opponent]!.security[0]!.cardId).toBe("BT1-010");
    },
  );
});

describe("MirageGaogamon dual card lifecycle", () => {
  it("cannot play its Digimon face directly to the field", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT27-035", as: "dual" }] } });
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dual").instanceId }).ok).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT27-035"]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(10);
  });

  it("can unsuspend with eight opposing hand cards even when there is no Digimon to return", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-035", as: "source", suspended: true }],
          hand: [{ card: "BT27-035", as: "option" }],
        },
        1: { hand: Array(8).fill("BT1-009"), battleArea: [{ card: "BT1-087", as: "tamer" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }).ok,
    ).toBe(true);
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId));
    expect(s.perm("source").isSuspended).toBe(false);
    expect(s.state.players[1]!.hand).toHaveLength(8);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT1-087"]);
    expect(s.state.memory).toBe(4);
  });

  it("trashes only the Burst top at turn end and restores the previous evolution stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT4-035", as: "base", under: ["ST2-03"] },
            { card: "BT4-093", as: "thomas" },
          ],
          hand: [{ card: "BT27-035", as: "burst" }],
          deck: Array(5).fill("BT1-009"),
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const priorTopId = s.perm("base").topCard.instanceId;
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const memoryBefore = s.state.memory;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
        alternateRequirementIndex: 1,
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("base").topCard.cardId === "BT27-035");
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["ST2-03", "BT4-035"]);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("thomas").instanceId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
    expect(s.perm("base").topCard.instanceId).toBe(priorTopId);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["ST2-03"]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("burst").instanceId]);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Evade")).toBe(false);
  });
});
