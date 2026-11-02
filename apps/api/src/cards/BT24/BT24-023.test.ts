import { EffectTiming, Zone, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT24-023.js";
import "../index.js";

describe("BT24-023 Calmaramon", () => {
  it.each([{ under: [] }, { under: ["BT1-009"] }])(
    "does not offer Decode with an ineligible own stack $under",
    async ({ under }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT24-023", as: "calmaramon", under },
              { card: "BT1-040", as: "other", under: ["BT24-027"] },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).verb.deletePermanent([s.perm("calmaramon").permanentId], "byEffect");
      expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(0);
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT24-023");
    },
  );

  it.each([Zone.Hand, Zone.Trash] as const)(
    "restricts suspension after Dark Field plays it from %s even with no return target",
    async (zone) => {
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "BT26-100", as: "darkField" }],
            security: ["BT1-009"],
          },
          1: { battleArea: [{ card: "BT1-040", as: "restricted" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.give(0, zone, { card: "BT24-023", as: "calmaramon" });
      s.state.memory = 3;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("darkField").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => observe(s.engine).isRestricted(s.perm("restricted"), "suspend"));
      expect(observe(s.engine).isRestricted(s.perm("restricted"), "suspend")).toBe(true);
      await s.engine.recomputeContinuousEffects();
      expect(s.perm("restricted")).toMatchObject({ cannotSuspend: true });
    },
  );

  it("matches the immutable catalog identity", () => {
    expect(getCardDefinition("BT24-023")).toMatchObject({
      cardId: "BT24-023",
      nameEn: "Calmaramon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 6,
      dp: 7000,
      forms: ["Hybrid"],
      attributes: ["Variable"],
      types: ["Aquatic", "Titan", "TS"],
      evoCosts: [{ color: "Blue", level: 3, memoryCost: 3 }],
    });
  });

  it("gates the follow-up suspend restriction on effect-played entry", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "OnPlay")).toMatchObject({
      actions: [{}, { condition: { kind: "triggerEnteredByEffect" }, restriction: "suspend" }],
    });
    expect(compiled.effects.find((effect) => effect.trigger === "WhenDigivolving")?.actions).toHaveLength(1);
  });

  it("does not restrict suspension when digivolved by an effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-023", as: "calmaramon" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "returned" },
            { card: "BT1-040", as: "unrestricted" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("calmaramon"), {
      enteredByEffect: 0,
    });

    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(s.inst("returned").instanceId);
    expect(observe(s.engine).isRestricted(s.perm("unrestricted"), "suspend")).toBe(false);
  });

  it("implements Decode by playing Lanamon from the stack on non-battle removal", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")).toMatchObject({
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          actions: [
            {
              kind: "PlayWithoutCost",
              from: ["digivolutionCards"],
              optional: true,
              target: { filter: { nameOrTrait: [{ tokens: ["Lanamon"], match: "nameExact" }] } },
            },
          ],
        },
      ],
    });
  });

  it("uses an exact Lanamon evolution requirement", () => {
    expect(compiled.digivolutionRequirement).toContainEqual({
      namesExact: ["Lanamon"],
      cost: 1,
      isAlternate: true,
    });
  });

  it("bottom-decks a level 4 Digimon but does not restrict suspension after a normal play", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-023", as: "calmaramon" }] },
        1: {
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          battleArea: [
            { card: "BT24-022", as: "returned" },
            { card: "BT24-083", as: "tamer" },
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("returned").topCard.instanceId, s.perm("tamer").topCard.instanceId);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("calmaramon"));

    expect(s.state.players[1]!.deck.map((card) => card.instanceId)).toContain(s.inst("returned").instanceId);
    expect(observe(s.engine).isRestricted(s.perm("tamer"), "suspend")).toBe(false);
  });

  it("restricts an opposing Digimon or Tamer when played by an effect", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-010", as: "host", under: ["BT24-007"] }],
          hand: [
            { card: "BT24-026", as: "discarder" },
            { card: "BT24-023", as: "calmaramon" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT24-022", as: "returned", under: [{ card: "BT24-019", as: "returnedSource" }] },
            { card: "BT1-040", as: "restricted" },
          ],
          deck: [
            { card: "BT1-009", as: "topA" },
            { card: "BT1-010", as: "topB" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.inst("calmaramon").instanceId,
      s.perm("returned").topCard.instanceId,
      s.perm("restricted").topCard.instanceId,
    );

    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("discarder").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-023"));

    expect(s.state.players[1]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("topA").instanceId,
      s.inst("topB").instanceId,
      s.inst("returned").instanceId,
    ]);
    expect(observe(s.engine).isRestricted(s.perm("restricted"), "suspend")).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("calmaramon").instanceId);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("calmaramon").instanceId)).toBe(
      true,
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("returnedSource").instanceId);
    expect(s.state.memory).toBe(2);
  });

  it("runs the return without effect-play restriction from a public play", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT24-023", as: "calmaramon" }] },
        1: {
          battleArea: [
            { card: "BT24-022", as: "returned" },
            { card: "BT24-083", as: "restricted" },
          ],
          deck: [
            { card: "BT1-009", as: "topA" },
            { card: "BT1-010", as: "topB" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("returned").permanentId, s.perm("restricted").permanentId);
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("calmaramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("calmaramon").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("calmaramon").instanceId)).toBe(
      true,
    );
    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(s.inst("returned").instanceId);
    expect(s.state.memory).toBe(4);
    expect(observe(s.engine).isRestricted(s.perm("restricted"), "suspend")).toBe(false);
  });

  it("expires the effect-play suspension restriction at the real opponent turn end", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT24-023", as: "calmaramon" }] },
        1: {
          battleArea: [
            { card: "BT24-022", as: "returned" },
            { card: "BT1-085", as: "restricted" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("returned").topCard.instanceId, s.perm("restricted").topCard.instanceId);
    await s.ready();
    await advance(s.engine).verb.playInstances([s.inst("calmaramon").instanceId], "BT24-016");
    await settle(() => observe(s.engine).isRestricted(s.perm("restricted"), "suspend"));
    expect(observe(s.engine).isRestricted(s.perm("restricted"), "suspend")).toBe(true);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).isRestricted(s.perm("restricted"), "suspend")).toBe(false);
  });

  it("Decodes Lanamon from its stack on non-battle removal and still leaves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-023", as: "calmaramon", dp: 1000, under: [{ card: "BT24-027", as: "lanamon" }] },
            { card: "BT24-028", as: "other", dp: 13000, under: [{ card: "BT24-027", as: "otherLanamon" }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "redSource" }], hand: [{ card: "BT6-095", as: "option" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const optionId = s.inst("option").instanceId;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-027"));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
      s.inst("lanamon").instanceId,
    );
    expect(s.perm("other").stack.map((card) => card.instanceId)).toContain(s.inst("otherLanamon").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT24-023");
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(optionId);
  });

  it("keeps a public Lanamon evolution stack through Decode and leaves the host", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT24-027", as: "lanamon" }], hand: [{ card: "BT24-023", as: "calmaramon" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("lanamon").permanentId,
        instanceId: s.inst("calmaramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("lanamon").topCard.cardId === "BT24-023");
    expect(s.perm("lanamon").stack.map((card) => card.cardId)).toEqual(["BT24-027"]);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("lanamon").permanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT24-027"));
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT24-027")).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT24-023");
  });

  it("does not Decode from battle deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT24-023",
              as: "calmaramon",
              dp: 1000,
              suspended: true,
              under: [{ card: "BT24-027", as: "lanamon" }],
            },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "attacker", dp: 2000 }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("calmaramon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("calmaramon").instanceId));
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("calmaramon").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("lanamon").instanceId);
  });

  it("declining public Happy Bullet leaves Calmaramon and its Lanamon stack in trash", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-023", as: "calmaramon", under: [{ card: "BT24-027", as: "lanamon" }] }] },
        1: { battleArea: [{ card: "BT1-009", as: "redSource" }], hand: [{ card: "BT6-095", as: "option" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const optionId = s.inst("option").instanceId;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("calmaramon").instanceId));
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("calmaramon").instanceId, s.inst("lanamon").instanceId]),
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(optionId);
  });

  it("exposes Blocker and inherited Jamming", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT24-023", as: "calmaramon" },
          { card: "BT1-040", as: "host", under: ["BT24-023"] },
        ],
        deck: [],
      },
      1: {
        security: [{ card: "BT24-051", as: "security" }],
      },
    });
    s.state.memory = 10;
    await s.ready();
    const hostPermanentId = s.perm("host").permanentId;
    expect(getCardDefinition("BT24-051")!.dp).toBeGreaterThan(getCardDefinition("BT1-040")!.dp!);

    expect(observe(s.engine).hasKeyword(s.perm("calmaramon"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Jamming")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked") && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("security").instanceId);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === hostPermanentId)).toBe(true);
  });

  it.each([
    ["Lanamon", "BT24-027", 1],
    ["level 3 TS", "BT24-020", 3],
  ])("digivolves from %s for cost %i", async (_label, baseCard, cost) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: baseCard, as: "base" }],
        hand: [{ card: "BT24-023", as: "calmaramon" }],
        deck: [{ card: "BT1-013", as: "draw" }],
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("calmaramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("calmaramon").instanceId);

    expect(s.state.memory).toBe(5 - cost);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([s.inst("base").instanceId]);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("calmaramon").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("draw").instanceId);
  });
});
