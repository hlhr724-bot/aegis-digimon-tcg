import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { compiled } from "./EX13-067.js";
import "../index.js";

describe("EX13-067 Nokia Shiramine", () => {
  it("matches the catalog and encodes start, digivolution, and security clauses", () => {
    expect(getCardDefinition("EX13-067")).toMatchObject({
      cardId: "EX13-067",
      nameEn: "Nokia Shiramine",
      colors: ["Red", "Blue"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["CS"],
      effectText: expect.stringContaining("When any of your Digimon digivolve"),
      securityEffectText: "[Security] Play this card without paying the cost.",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trigger: "StartOfYourMainPhase" }),
        expect.objectContaining({ trigger: "YourTurn" }),
        expect.objectContaining({ trigger: "Security", isSecurity: true }),
      ]),
    );
    const watchers = compiled.effects.find(({ trigger }) => trigger === "YourTurn")!.actions;
    expect(watchers).toEqual([
      expect.objectContaining({
        kind: "SubTrigger",
        event: "whenOneOfYoursDigivolves",
        cost: expect.objectContaining({ kind: "suspend" }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            kind: "PlayWithoutCost",
            condition: expect.objectContaining({ kind: "triggerSubjectMatchesFilter" }),
          }),
        ]),
      }),
    ]);
  });

  it("gains 1 memory at each of its real main-phase starts while the opponent has a Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX13-067", as: "nokia" }],
        hand: [{ card: "BT1-014", as: "ownMainAction" }],
        deck: Array(8).fill("BT1-009"),
        security: ["BT1-011"],
      },
      1: {
        battleArea: [{ card: "BT1-009", as: "opponentDigimon" }],
        hand: [{ card: "BT1-014", as: "opponentMainAction" }],
        deck: Array(8).fill("BT1-011"),
        security: ["BT1-012"],
      },
    });
    s.state.memory = 3;
    await s.ready();
    s.engine.startTurnLoop();

    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(4);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(4);
    await settle();
  });

  it("does not gain memory when the opponent has no Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX13-067", as: "nokia" }],
        hand: [{ card: "BT1-014", as: "ownMainAction" }],
        deck: Array(8).fill("BT1-009"),
        security: ["BT1-011"],
      },
      1: {
        hand: [{ card: "BT1-014", as: "opponentMainAction" }],
        deck: Array(8).fill("BT1-011"),
        security: ["BT1-012"],
      },
    });
    s.state.memory = 3;
    await s.ready();
    s.engine.startTurnLoop();

    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(3);
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle();
  });

  it("suspends Nokia after a legal Greymon digivolution and plays Gabumon from trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-067", as: "nokia" },
            { card: "BT1-010", as: "agumon" },
          ],
          hand: [{ card: "BT1-015", as: "greymon" }],
          trash: [{ card: "BT1-029", as: "gabumon" }, "BT1-029"],
          deck: Array(8).fill("BT1-009"),
          security: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: Array(8).fill("BT1-011"), security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("agumon").permanentId,
        instanceId: s.inst("greymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-015"));

    expect(s.perm("agumon").stack.map(({ cardId }) => cardId)).toEqual(["BT1-010"]);
    expect(s.perm("nokia").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-029")).toBe(true);
    expect(s.state.players[0]!.trash.filter(({ cardId }) => cardId === "BT1-029")).toHaveLength(1);
    expect(s.state.memory).toBe(4);
    const prompts = s.decisions
      .map(({ req }) => req)
      .filter((req) => req.sourceCardId === "EX13-067" && req.options?.timing === "YourTurn");
    expect(prompts.map((req) => req.kind)).toEqual(["optional", "optional", "selectCards"]);
    expect(prompts.map((req) => req.options?.effectTextEmphasis)).toEqual([
      "by suspending this Tamer",
      "you may play 1 [Gabumon] if that Digimon has [Greymon] in its name or 1 [Agumon] if it has [Garurumon] in its name from your hand or trash without paying the cost.",
      "you may play 1 [Gabumon] if that Digimon has [Greymon] in its name or 1 [Agumon] if it has [Garurumon] in its name from your hand or trash without paying the cost.",
    ]);
    expect(prompts.every((req) => req.options?.effectText?.includes("by suspending this Tamer"))).toBe(true);
  });

  it("plays Agumon from hand after a legal Garurumon digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-067", as: "nokia" },
            { card: "BT1-029", as: "gabumon" },
          ],
          hand: [
            { card: "AD1-010", as: "garurumon" },
            { card: "BT1-010", as: "agumon" },
          ],
          deck: Array(8).fill("BT1-009"),
          security: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: Array(8).fill("BT1-011"), security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gabumon").permanentId,
        instanceId: s.inst("garurumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "AD1-010"));

    expect(s.perm("gabumon").stack.map(({ cardId }) => cardId)).toEqual(["BT1-029"]);
    expect(s.perm("nokia").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-010")).toBe(true);
    expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("agumon").instanceId)).toBe(false);
    expect(s.state.memory).toBe(4);
  });

  it("does not pay Nokia's suspend cost when digivolution leaves two own Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-067", as: "nokia" },
            { card: "BT1-010", as: "agumon" },
            { card: "BT1-009", as: "extra" },
          ],
          hand: [
            { card: "BT1-015", as: "greymon" },
            { card: "BT1-029", as: "gabumon" },
          ],
          deck: Array(8).fill("BT1-011"),
          security: ["BT1-012"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: Array(8).fill("BT1-011"), security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("agumon").permanentId,
        instanceId: s.inst("greymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("agumon").topCard.cardId === "BT1-015");

    expect(s.perm("nokia").isSuspended).toBe(false);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-029")).toBe(false);
    expect(s.state.memory).toBe(4);
  });

  it("Q7435 lets only the first of two Nokias activate after its play raises the Digimon count", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-067", as: "nokiaA" },
            { card: "EX13-067", as: "nokiaB" },
            { card: "BT1-010", as: "agumon" },
          ],
          hand: [
            { card: "BT1-015", as: "greymon" },
            { card: "BT1-029", as: "gabumonA" },
            { card: "BT1-029", as: "gabumonB" },
          ],
          deck: Array(8).fill("BT1-009"),
          security: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: Array(8).fill("BT1-011"), security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.memory = 5;
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("agumon").permanentId,
        instanceId: s.inst("greymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("agumon").topCard.cardId === "BT1-015" &&
        s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT1-029").length >= 1,
    );
    await settle();

    expect([s.perm("nokiaA").isSuspended, s.perm("nokiaB").isSuspended].filter(Boolean)).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT1-029")).toHaveLength(1);
    expect(
      s.state.players[0]!.hand.filter(({ cardId }) => cardId === "BT1-029").concat(
        s.state.players[0]!.trash.filter(({ cardId }) => cardId === "BT1-029"),
      ),
    ).toHaveLength(1);
  });

  it("does not suspend Nokia or play Gabumon when its optional watcher is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-067", as: "nokia" },
            { card: "BT1-010", as: "agumon" },
          ],
          hand: [{ card: "BT1-015", as: "greymon" }],
          trash: [{ card: "BT1-029", as: "gabumon" }],
          deck: Array(8).fill("BT1-009"),
          security: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: Array(8).fill("BT1-011"), security: ["BT1-012"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("agumon").permanentId,
        instanceId: s.inst("greymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("agumon").topCard.cardId === "BT1-015");

    expect(s.perm("nokia").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("gabumon").instanceId)).toBe(true);
  });

  it("plays Nokia from security through a public security attack", async () => {
    const s = setupEngine({
      0: { deck: Array(8).fill("BT1-009"), security: [{ card: "EX13-067", as: "securityNokia" }, "BT1-011"] },
      1: { battleArea: [{ card: "BT19-020", as: "attacker" }], deck: Array(8).fill("BT1-011"), security: ["BT1-012"] },
    });
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX13-067"));
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-011"]);
  });
});
