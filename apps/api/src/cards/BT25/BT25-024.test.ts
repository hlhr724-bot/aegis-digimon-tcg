import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled as BT25_024 } from "./BT25-024.js";
import "../index.js";

describe("BT25-024 Lekismon", () => {
  it("draws one on an actual On Play", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT25-024", as: "lekismon" }], deck: [{ card: "BT1-009", as: "drawn" }] },
    });
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("lekismon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("draws one on an actual When Digivolving", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-019", as: "base" }],
        hand: [{ card: "BT25-024", as: "lekismon" }],
        deck: [{ card: "BT1-009", as: "bonus" }, { card: "BT1-010", as: "drawn" }, "BT1-011"],
      },
    });
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lekismon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([
      s.inst("bonus").instanceId,
      s.inst("drawn").instanceId,
    ]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-011"]);
  });

  it("offers Crescemon from trash only for red own Digimon events", () => {
    const effect = BT25_024.effects?.find((entry) => entry.trigger === "YourTurn");
    for (const event of ["whenPlayed", "whenOneOfYoursDigivolves"] as const) {
      const watcher = effect?.actions?.find((action) => action.kind === "SubTrigger" && action.event === event);
      expect(watcher).toMatchObject({
        sourceFilter: { controller: "mine", kind: ["Digimon"] },
        fireCondition: { kind: "triggerSubjectHasColor", filter: { colors: ["Red"] } },
      });
      const subTrigger = watcher as { actions?: unknown[] } | undefined;
      expect(subTrigger?.actions?.[0]).toMatchObject({
        kind: "Digivolve",
        into: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Crescemon"], match: "nameExact" }] },
        from: ["trash"],
        reduceCost: 1,
        payCost: true,
        optional: true,
      });
    }
  });

  it("preserves inherited Jamming", () => {
    expect(BT25_024.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isInherited: true, keywords: [{ keyword: "Jamming", raw: "＜Jamming＞" }] }),
      ]),
    );
  });

  it("grants inherited Jamming to a realistic evolution stack and survives higher-DP security", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-038", under: ["BT25-024"], as: "host" }] },
      1: { security: ["BT25-027"] },
    });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("host"), "Jamming")).toBe(true);
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT25-024"]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId)).toContain("BT1-038");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT25-024"]);
  });

  it.each(["whenPlayed", "whenOneOfYoursDigivolves"] as const)(
    "digivolves into Crescemon for 2 memory after a red own-Digimon %s event",
    async (event) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT25-024", as: "lekismon" },
              { card: "BT1-010", as: "redSubject" },
            ],
            trash: [{ card: "BT25-026", as: "crescemon" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 0 },
      );
      s.state.memory = 2;
      await s.ready();

      await advance(s.engine).fireSubTrigger(event, { subjectPermanentId: s.perm("redSubject").permanentId });
      await settle(() => s.perm("lekismon").topCard.cardId === "BT25-026");

      expect(s.perm("lekismon").topCard.cardId).toBe("BT25-026");
      expect(s.state.memory).toBe(0);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("crescemon").instanceId);
    },
  );

  it("uses Crescemon from trash after an actual red Digimon play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-024", as: "lekismon" }],
          hand: [{ card: "BT1-009", as: "redSubject" }],
          trash: [{ card: "BT25-026", as: "crescemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("redSubject").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("lekismon").topCard.cardId === "BT25-026");
    expect(s.perm("lekismon").topCard.cardId).toBe("BT25-026");
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("crescemon").instanceId);
  });

  it("checks the post-digivolution color for a real own-Digimon evolution event", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-024", as: "lekismon" },
            { card: "BT24-019", as: "blueBase" },
          ],
          hand: [{ card: "BT24-011", as: "redEvo" }],
          trash: [{ card: "BT25-026", as: "crescemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 0 },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blueBase").permanentId,
        instanceId: s.inst("redEvo").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("lekismon").topCard.cardId === "BT25-026");

    expect(s.perm("blueBase").topCard.cardId).toBe("BT24-011");
    expect(s.perm("lekismon").topCard.cardId).toBe("BT25-026");
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("crescemon").instanceId);
  });

  it("uses a Crescemon in the trash for the optional digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-024", as: "lekismon" },
            { card: "BT1-010", as: "redSubject" },
          ],
          trash: [{ card: "BT25-026", as: "trashedCrescemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 2;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenPlayed", { subjectPermanentId: s.perm("redSubject").permanentId });
    await settle(() => s.perm("lekismon").topCard.cardId === "BT25-026");
    expect(s.perm("lekismon").topCard.cardId).toBe("BT25-026");
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(
      s.inst("trashedCrescemon").instanceId,
    );
  });

  it("does not activate when the resulting Digimon is blue", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-024", as: "lekismon" },
            { card: "BT25-008", as: "redBase" },
          ],
          hand: [{ card: "BT25-024", as: "blueResult" }],
          trash: [{ card: "BT25-026", as: "crescemon" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("blueResult").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
    expect(s.perm("redBase").topCard.cardId).toBe("BT25-024");
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("crescemon").instanceId);
  });

  it("does not trigger from a blue played Digimon even when a legal Crescemon is in the trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-024", as: "lekismon" },
            { card: "BT25-021", as: "blueSubject" },
          ],
          trash: [{ card: "BT25-026", as: "crescemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 2;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenPlayed", { subjectPermanentId: s.perm("blueSubject").permanentId });
    expect(s.perm("lekismon").topCard.cardId).toBe("BT25-024");
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("crescemon").instanceId);
  });

  it("does not use a Crescemon in hand for the printed trash-source effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-024", as: "lekismon" },
            { card: "BT1-010", as: "redSubject" },
          ],
          hand: [{ card: "BT25-026", as: "crescemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 2;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenPlayed", { subjectPermanentId: s.perm("redSubject").permanentId });
    expect(s.perm("lekismon").topCard.cardId).toBe("BT25-024");
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("crescemon").instanceId);
  });

  it("allows declining the optional Crescemon digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-024", as: "lekismon" },
            { card: "BT1-010", as: "redSubject" },
          ],
          trash: [{ card: "BT25-026", as: "crescemon" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenPlayed", { subjectPermanentId: s.perm("redSubject").permanentId });

    expect(s.perm("lekismon").topCard.cardId).toBe("BT25-024");
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("crescemon").instanceId);
  });

  it("keeps the printed TS alternate evolution requirement", () => {
    expect(getCardDefinition("BT25-024")).toMatchObject({
      colors: ["Blue"],
      level: 4,
      playCost: 4,
      dp: 5000,
      types: ["Beastkin", "Iliad", "TS"],
    });
    expect(digivolutionRequirementsFor("BT25-024")).toEqual([{ level: 3, traits: ["TS"], cost: 2, isAlternate: true }]);
  });
});

describe("BT25-024 Lekismon — KB Q&A rulings", () => {
  it.each([
    { color: "blue", played: "BT25-021", digivolves: false },
    { color: "red", played: "BT1-010", digivolves: true },
  ])(
    "triggers on any of your Digimon being played but only activates for a red one ($color) (Q6287)",
    async ({ played, digivolves }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT25-024", as: "lekismon" }],
            hand: [{ card: played, as: "played" }],
            trash: [{ card: "BT25-026", as: "crescemon" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 5;
      await s.ready();
      expect(observe(s.engine).subscriptions("whenPlayed", s.perm("lekismon").permanentId)).toHaveLength(1);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
      await drainMicrotasks();

      expect(s.perm("lekismon").topCard.cardId).toBe(digivolves ? "BT25-026" : "BT25-024");
      expect(s.state.memory).toBe(digivolves ? 0 : 2);
    },
  );

  it.each([
    { from: "blue", into: "red", base: "BT25-022", evolution: "BT25-014", offersCrescemon: true },
    { from: "red", into: "blue", base: "BT25-008", evolution: "BT25-024", offersCrescemon: false },
  ])(
    "checks the digivolved Digimon's color after it digivolves ($from into $into) (Q6288)",
    async ({ base, evolution, offersCrescemon }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT25-024", as: "lekismon" },
              { card: base, as: "eventBase" },
            ],
            hand: [{ card: evolution, as: "evolution" }],
            trash: [{ card: "BT25-026", as: "crescemon" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 5;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("eventBase").permanentId,
          instanceId: s.inst("evolution").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("eventBase").topCard.instanceId === s.inst("evolution").instanceId);
      await settle(() => s.state.pendingDecision === undefined);
      await drainMicrotasks();

      expect(s.perm("lekismon").topCard.cardId).toBe(offersCrescemon ? "BT25-026" : "BT25-024");
    },
  );
});
