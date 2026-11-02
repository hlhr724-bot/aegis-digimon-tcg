import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./LM-068.js";
import "../index.js";

const FILLER = "BT1-010";

describe("LM-068 HeavyMetaldramon / Black Sabbath", () => {
  it("plays the trash Digimon into an empty breeding area when the printed field destination is chosen", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-076", as: "base" }],
          hand: [{ card: "LM-068", as: "heavy" }, FILLER, FILLER, FILLER],
          trash: [{ card: "BT11-079", as: "revived" }],
          deck: [FILLER, FILLER],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferOptionIndex: 1,
      },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("heavy").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.breeding?.topCard.cardId === "BT11-079" && s.state.pendingDecision === undefined,
    );

    expect(s.state.players[0]!.breeding?.inBreeding).toBe(true);
    expect(s.state.players[0]!.breeding?.stack).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["LM-068"]);
    expect(s.state.memory).toBe(0);
  });

  it("matches the catalog record", () => {
    expect(getCardDefinition("LM-068")).toMatchObject({
      nameEn: "HeavyMetaldramon",
      colors: ["Purple", "Red"],
      kinds: ["Digimon", "Option"],
      level: 6,
      playCost: 6,
      dp: 13000,
      types: ["Evil Dragon", "LIBERATOR"],
      isDualCard: true,
      optionColorRequirements: ["Purple"],
    });
  });

  it("compiles to full coverage with the printed digivolve header and Security A. +1", () => {
    const runtime = runtimeCompiledCard("LM-068")!;
    expect(runtime.coverage).toBe("full");
    expect(runtime.residual).toEqual([]);
    expect(runtime.keywords).toEqual([{ keyword: "SecurityAttack", amount: 1, raw: "＜Security A. +1＞" }]);
    expect(runtime.digivolutionRequirement).toEqual([
      { level: 5, traits: ["Dark Dragon", "Evil Dragon"], cost: 4, isAlternate: true },
    ]);
    expect(runtime.effects.map((effect) => effect.trigger)).toEqual([
      "WhenDigivolving",
      "EndOfAttack",
      "WhenDigivolving",
      "OnDeletion",
      "Trash",
      "Main",
    ]);
    expect(runtime.effects.find((effect) => effect.trigger === "Trash")).toMatchObject({
      isFromTrash: true,
      actions: [
        {
          kind: "SubTrigger",
          event: "whenAttacking",
          fireCondition: { kind: "isYourTurn" },
          activationCondition: { kind: "zoneCount", seat: "mine", zone: "hand", op: "lte", value: 4 },
          actions: [{ kind: "UseOptionWithoutCost", from: ["trash"], payCost: true, reduceCostBy: 3 }],
        },
      ],
    });
  });

  it("digivolves for the printed alternate cost of 4 from a Lv.5 [Dark Dragon]", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT7-076", as: "orochimon" }],
        hand: [{ card: "LM-068", as: "heavy" }, FILLER, FILLER, FILLER],
        deck: [FILLER, FILLER],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("orochimon").permanentId,
        instanceId: s.inst("heavy").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("orochimon").topCard.cardId === "LM-068");

    expect(s.state.memory).toBe(0);
  });

  it("refuses the alternate cost of 4 from a Lv.5 without the [Dark Dragon] or [Evil Dragon] trait", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-020", as: "groundramon" }],
        hand: [{ card: "LM-068", as: "heavy" }, FILLER, FILLER, FILLER],
        deck: [FILLER, FILLER],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("groundramon").permanentId,
        instanceId: s.inst("heavy").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).not.toEqual({ ok: true });

    expect(s.perm("groundramon").topCard.cardId).toBe("BT1-020");
    expect(s.state.memory).toBe(4);
  });

  it("checks 2 security cards in one attack with <Security A. +1>", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "LM-068", as: "heavy", under: ["BT7-076"] }],
          hand: [FILLER, FILLER, FILLER, FILLER, FILLER],
          deck: [FILLER, FILLER],
        },
        1: { security: [FILLER, FILLER], deck: [FILLER, FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    await s.ready();

    expect(s.state.players[1]!.security).toHaveLength(2);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("heavy").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.filter(({ cardId }) => cardId === FILLER)).toHaveLength(2);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["LM-068"]);
  });

  it("plays an [Evil Dragon] Digimon from trash and deletes through the Option side when the hand is small", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-076", as: "orochimon" }],
          hand: [{ card: "LM-068", as: "heavy" }, FILLER, FILLER, FILLER],
          trash: [{ card: "BT11-079", as: "darkLizardmon" }],
          deck: [FILLER, FILLER, FILLER],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }], deck: [FILLER, FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("orochimon").permanentId,
        instanceId: s.inst("heavy").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(
      expect.arrayContaining(["LM-068", "BT11-079"]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("skips the trash play above 4 cards in hand and deletes only a Digimon at or above the hand count", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-076", as: "orochimon" }],
          hand: [{ card: "LM-068", as: "heavy" }, FILLER, FILLER, FILLER, FILLER, FILLER, FILLER],
          trash: [{ card: "BT11-079", as: "darkLizardmon" }],
          deck: [FILLER, FILLER, FILLER],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "levelThree" },
            { card: "BT1-020", as: "levelFive" },
          ],
          deck: [FILLER, FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("orochimon").permanentId,
        instanceId: s.inst("heavy").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[0]!.hand).toHaveLength(5);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT11-079");
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["LM-068"]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-009"]);
  });

  it("plays an [Evil Dragon] Digimon from trash at the end of its own attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "LM-068", as: "heavy", under: ["BT7-076"] }],
          hand: [FILLER],
          trash: [{ card: "BT11-079", as: "darkLizardmon" }],
          deck: [FILLER, FILLER],
        },
        1: { security: [FILLER, FILLER], deck: [FILLER, FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("heavy").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT11-079"));

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(
      expect.arrayContaining(["LM-068", "BT11-079"]),
    );
  });

  it("uses its Option side from trash for 3 less when an [Evil Dragon] Digimon attacks", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-079", as: "attacker" }],
          hand: [FILLER],
          trash: [{ card: "LM-068", as: "blackSabbath" }],
          deck: [FILLER, FILLER],
        },
        1: {
          battleArea: [{ card: "BT1-020", as: "levelFive" }],
          security: [FILLER],
          deck: [FILLER, FILLER],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: true,
        declinePrompts: ["digivolve"],
      },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });

  it("leaves the trash Digimon alone at the end of an attack while the hand holds 5 cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "LM-068", as: "heavy", under: ["BT7-076"] }],
          // Orochimon's inherited [When Attacking] trashes 1 hand card during this attack, so the
          // hand has to start at 6 for the End of Attack check to see the 5 this case is about.
          hand: [FILLER, FILLER, FILLER, FILLER, FILLER, FILLER],
          trash: [{ card: "BT11-079", as: "darkLizardmon" }],
          deck: [FILLER, FILLER],
        },
        1: { security: [FILLER, FILLER], deck: [FILLER, FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("heavy").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT11-079");
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["LM-068"]);
  });

  it("trashes 2 cards and resolves the Option-side delete when it is deleted in battle", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "LM-068", as: "heavy", under: ["BT7-076"] }],
          // Orochimon's inherited [When Attacking] trashes 1 hand card before the battle, so the
          // hand starts at 4 and the [On Deletion] "trash 2" below leaves the asserted 1.
          hand: [FILLER, FILLER, FILLER, FILLER],
          deck: [FILLER, FILLER, FILLER],
        },
        1: {
          battleArea: [{ card: "BT1-080", as: "wall", dp: 20000, suspended: true }],
          deck: [FILLER, FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("heavy").permanentId,
        target: { kind: "permanent", permanentId: s.perm("wall").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("stays in trash while the opponent attacks with their own [Evil Dragon] Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-020", as: "bystander" }],
          hand: [FILLER],
          trash: [{ card: "LM-068", as: "blackSabbath" }],
          security: [FILLER],
          deck: [FILLER, FILLER],
        },
        1: { battleArea: [{ card: "BT11-079", as: "attacker" }], deck: [FILLER, FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0);

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("LM-068");
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-020"]);
  });

  it("stays in trash when an [Evil Dragon] Digimon attacks while the hand holds 5 cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-079", as: "attacker" }],
          hand: [FILLER, FILLER, FILLER, FILLER, FILLER],
          trash: [{ card: "LM-068", as: "blackSabbath" }],
          deck: [FILLER, FILLER],
        },
        1: {
          battleArea: [{ card: "BT1-020", as: "levelFive" }],
          security: [FILLER],
          deck: [FILLER, FILLER],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: true,
        declinePrompts: ["digivolve"],
      },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("LM-068");
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-020"]);
  });

  it("feedback #29: triggers at 5 cards in hand and activates after a simultaneous When Attacking trashes to 3 (CR 15-8-3-9)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX11-049", as: "punkmon" }],
          hand: [FILLER, FILLER, FILLER, FILLER, FILLER],
          trash: [{ card: "LM-068", as: "blackSabbath" }],
          deck: [FILLER, FILLER],
        },
        1: {
          battleArea: [{ card: "BT1-020", as: "levelFive" }],
          security: [FILLER],
          deck: [FILLER, FILLER],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: true,
        declinePrompts: ["digivolve"],
      },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("punkmon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackEnded"));

    const effectEvents = s.events.flatMap((event) =>
      event.kind === "effectTriggered" || event.kind === "effectResolved"
        ? [`${event.kind}:${event.sourceCardId}`]
        : [],
    );
    expect(effectEvents.indexOf("effectResolved:EX11-049")).toBeLessThan(
      effectEvents.indexOf("effectTriggered:LM-068"),
    );
    expect(s.state.players[0]!.hand).toHaveLength(3);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("LM-068");
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });

  it("stays in trash when the attacker carries none of the three traits", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "attacker" }],
          hand: [FILLER],
          trash: [{ card: "LM-068", as: "blackSabbath" }],
          deck: [FILLER, FILLER],
        },
        1: {
          battleArea: [{ card: "BT1-020", as: "levelFive" }],
          security: [FILLER],
          deck: [FILLER, FILLER],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: true,
        declinePrompts: ["digivolve"],
      },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("LM-068");
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-020"]);
  });

  it("cannot play a level 5 [Dark Dragon] Digimon out of the trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-076", as: "orochimon" }],
          hand: [{ card: "LM-068", as: "heavy" }, FILLER, FILLER, FILLER],
          trash: [{ card: "BT7-076", as: "trashedOrochimon" }],
          deck: [FILLER, FILLER, FILLER],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }], deck: [FILLER, FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("orochimon").permanentId,
        instanceId: s.inst("heavy").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["LM-068"]);
    expect(s.state.players[0]!.trash.filter(({ cardId }) => cardId === "BT7-076")).toHaveLength(1);
  });
});
