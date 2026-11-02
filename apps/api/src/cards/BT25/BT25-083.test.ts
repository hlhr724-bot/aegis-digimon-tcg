import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

const CARD_ID = "BT25-083";

describe("BT25-083 LadyDevimon", () => {
  it("legally alternate-digivolves for 3 from an off-color level 4 with the TS trait", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT24-022", as: "blueTs" }], hand: [{ card: CARD_ID, as: "lady" }] } },
      { autoDeclineOptional: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blueTs").permanentId,
        instanceId: s.inst("lady").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("blueTs").topCard.instanceId === s.inst("lady").instanceId);
    expect(s.state.memory).toBe(0);
  });

  it("publicly ordinary-digivolves from purple level 4 for 3 and rejects a blue source on that route", async () => {
    const legal = setupEngine({
      0: { battleArea: [{ card: "BT25-081", as: "purpleBase" }], hand: [{ card: CARD_ID, as: "lady" }] },
    });
    legal.state.memory = 3;
    await legal.ready();
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("purpleBase").permanentId,
        instanceId: legal.inst("lady").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => legal.perm("purpleBase").topCard?.cardId === CARD_ID);
    expect(legal.state.memory).toBe(0);
    expect(legal.perm("purpleBase").stack.map((card) => card.cardId)).toEqual(["BT25-081"]);

    const wrongColor = setupEngine({
      0: { battleArea: [{ card: "AD1-010", as: "blueSource" }], hand: [{ card: CARD_ID, as: "lady" }] },
    });
    wrongColor.state.memory = 3;
    await wrongColor.ready();
    expect(
      wrongColor.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: wrongColor.perm("blueSource").permanentId,
        instanceId: wrongColor.inst("lady").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(wrongColor.perm("blueSource").topCard.cardId).toBe("AD1-010");
    expect(wrongColor.state.memory).toBe(3);
  });

  it("places a Three Musketeers trait card from trash at the true bottom, then draws", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "lady", under: [{ card: "BT25-081", as: "oldBottom" }] }],
          trash: [{ card: "BT25-085", as: "musketeer" }],
          deck: [{ card: "AD1-002", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("lady"));
    expect(s.perm("lady").stack.map((card) => card.instanceId)).toEqual([
      s.inst("musketeer").instanceId,
      s.inst("oldBottom").instanceId,
    ]);
    expect(s.perm("lady").stack[0]!.faceUp).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("drawn").instanceId);
  });

  it("declining the placement leaves every zone unchanged and does not draw", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "lady" }],
          hand: [{ card: "BT25-085", as: "musketeer" }],
          deck: [{ card: "AD1-002", as: "top" }],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("lady"));
    expect(s.perm("lady").stack.some((card) => card.instanceId === s.inst("musketeer").instanceId)).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("musketeer").instanceId]);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("top").instanceId);
  });

  it("Q6395 trashes and uses the same physical dual Option from sources, paying cost minus 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "lady" },
            { card: "BT25-081", as: "other" },
          ],
          hand: [{ card: "BT25-085", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    s.state.memory = 5;
    await s.ready();
    await advance(s.engine).verb.placeUnder(s.perm("other").permanentId, [s.inst("option").instanceId]);
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("lady"), {
      attackerPermanentId: s.perm("lady").permanentId,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId));
    expect(s.state.memory).toBe(2);
    expect(s.perm("other").stack.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(false);
    expect(s.state.players[0]!.trash.filter((card) => card.instanceId === s.inst("option").instanceId)).toHaveLength(1);
  });

  it("Q6394 offers both simultaneous When Digivolving effects to the controller for ordering", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "lady", under: [{ card: "BT25-081", as: "base" }] }],
          hand: [
            { card: "BT25-085", as: "sourceOption" },
            { card: "BT25-085", as: "placementCard" },
          ],
          deck: ["AD1-001"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    await advance(s.engine).verb.placeUnder(s.perm("lady").permanentId, [s.inst("sourceOption").instanceId]);
    const resolving = advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("lady"));
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const pending = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    const keys = request.options?.triggerKeys ?? [];
    expect(keys).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${CARD_ID}/when-digivolving-place-draw`),
        expect.stringContaining(`${CARD_ID}/trash-source-use-option`),
      ]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [keys[0]!] },
      }),
    ).toEqual({ ok: true });
    await resolving;
  });

  it("shares one physical Once Per Turn between When Digivolving and When Attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: CARD_ID,
              as: "lady",
              under: [{ card: "BT25-081", as: "base" }],
            },
          ],
          hand: [
            { card: "BT25-085", as: "first" },
            { card: "BT25-085", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    s.state.memory = 10;
    await s.ready();
    await advance(s.engine).verb.placeUnder(s.perm("lady").permanentId, [
      s.inst("first").instanceId,
      s.inst("second").instanceId,
    ]);
    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("lady"));
    const sourcesAfterFirst = s.perm("lady").stack.map((card) => card.instanceId);
    const memoryAfterFirst = s.state.memory;
    expect(memoryAfterFirst).toBeLessThan(10);
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("lady"), {
      attackerPermanentId: s.perm("lady").permanentId,
    });
    expect(s.perm("lady").stack.map((card) => card.instanceId)).toEqual(sourcesAfterFirst);
    expect(s.state.memory).toBe(memoryAfterFirst);
  });

  it("inherited On Deletion plays a level 4 card whose full text contains Three Musketeers", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-084", as: "host", under: [{ card: CARD_ID, as: "ladySource" }] }],
          trash: [{ card: "EX7-043", as: "textMatch" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("textMatch").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("textMatch").instanceId)).toBe(
      true,
    );
    expect(s.state.memory).toBe(0);
  });

  it("highlights the cost, then the optional Option use, and lets the player decline the just-trashed Option", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "lady", under: [{ card: "EX7-071", as: "trashedCopy" }] }] },
      },
      { autoAcceptOptional: true, declinePrompts: ["LadyDevimon", "By placing 1 [Three Musketeers]"] },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("lady"));
    await settle(() => s.state.memory === 6);
    await drainMicrotasks();

    const activation = s.decisions.find(
      ({ req }) => req.kind === "optional" && req.options?.effectKey === `${CARD_ID}/trash-source-use-option`,
    );
    expect(activation?.req.options?.effectTextEmphasis).toBe(
      "By trashing 1 Option card from any of your Digimon's digivolution cards",
    );
    const optionPick = s.decisions.find(
      ({ req }) =>
        req.kind === "selectCards" && req.options?.candidateInstanceIds?.includes(s.inst("trashedCopy").instanceId),
    );
    expect(optionPick?.req.options).toMatchObject({
      min: 0,
      effectTextEmphasis:
        "you may use 1 [Three Musketeers] trait Option card from your trash with the cost reduced by 3",
    });
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("trashedCopy").instanceId]);
    expect(s.state.memory).toBe(6);
  });

  it("leaves the activation question unhighlighted when the cost has its own selection", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "lady", under: [{ card: "EX7-071" }, { card: "EX7-071" }] }],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declinePrompts: ["LadyDevimon", "By placing 1 [Three Musketeers]"],
      },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("lady"));
    await settle(() => s.state.memory === 6);
    await drainMicrotasks();

    const prompts = s.decisions
      .map(({ req }) => req)
      .filter((req) => req.options?.effectKey === `${CARD_ID}/trash-source-use-option`);
    expect(prompts.map((req) => [req.kind, req.options?.min, req.options?.effectTextEmphasis])).toEqual([
      ["optional", undefined, undefined],
      ["selectCards", 1, "By trashing 1 Option card from any of your Digimon's digivolution cards"],
      [
        "selectCards",
        0,
        "you may use 1 [Three Musketeers] trait Option card from your trash with the cost reduced by 3",
      ],
    ]);
  });
});

describe("BT25-083 LadyDevimon — KB Q&A rulings", () => {
  it.each([
    ["effect text names [Three Musketeers]", "BT6-060", { ok: true }],
    ["no [Three Musketeers] anywhere in its text", "BT1-043", { ok: false, reason: "invalid-evolution" }],
  ] as const)(
    "reads a Lv.4 card's full printed text for the alternate route: %s (Q6393)",
    async (_case, base, result) => {
      const s = setupEngine(
        { 0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: CARD_ID, as: "lady" }] } },
        { autoDeclineOptional: true },
      );
      s.state.memory = 3;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("lady").instanceId,
          alternateRequirementIndex: 0,
        }),
      ).toEqual(result);
      if (result.ok) await settle(() => s.perm("base").topCard.cardId === CARD_ID);

      expect(s.perm("base").topCard.cardId).toBe(result.ok ? CARD_ID : base);
      expect(s.state.memory).toBe(result.ok ? 0 : 3);
    },
  );

  it("Arts Digivolves into the BeelStarmon it just used as Fly Bullet without paying the cost (Q6390)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "lady" },
            { card: "BT25-092", as: "tamer" },
          ],
          hand: [{ card: "BT25-085", as: "flyBullet" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const flyBulletId = s.inst("flyBullet").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: flyBulletId, useAs: "option" })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("lady").topCard.instanceId === flyBulletId);

    expect(s.perm("lady").stack.map((card) => card.cardId)).toEqual([CARD_ID]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).not.toContain("BT25-085");
    expect(s.state.memory).toBe(4);
  });

  /**
   * LadyDevimon's [When Digivolving] trashes the Hurricane Screw Shot under it, then uses a
   * Hurricane Screw Shot from the trash: the trashed copy itself, or a second copy.
   */
  async function trashSourceThenUseOption(useTrashedCopy: boolean) {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "lady", under: [{ card: "EX7-071", as: "trashedCopy" }] }],
          trash: [{ card: "EX7-071", as: "otherCopy" }],
        },
        1: { battleArea: [{ card: "BT1-009", dp: 1000, as: "victim" }] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        declinePrompts: ["By placing 1 [Three Musketeers]"],
      },
    );
    preferred.push(s.inst(useTrashedCopy ? "trashedCopy" : "otherCopy").instanceId);
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("lady"));
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await drainMicrotasks();

    expect(s.perm("lady").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["EX7-071", "EX7-071"]);
    // Feedback #60: provenance survives while this copy stays in trash, but clears on reuse.
    expect(s.inst("trashedCopy").trashOriginCardId).toBe(useTrashedCopy ? "" : CARD_ID);
    expect(s.inst("otherCopy").trashOriginCardId).toBe("");
    return s;
  }

  it("still activates the trashed copy's gain-memory effect when a different Option is used", async () => {
    const s = await trashSourceThenUseOption(false);

    expect(s.state.memory).toBe(5 - 3 + 1);
  });

  it("does not activate a used Option's own trashed-from-sources effect (Q6396)", async () => {
    const s = await trashSourceThenUseOption(true);

    expect(s.state.memory).toBe(5 - 3);
  });
});
