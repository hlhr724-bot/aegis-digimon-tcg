import { describe, expect, it } from "vitest";
import { dnaDigivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { type CardSpec, type SetupEngineOptions, setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT18-019.js";
import "../BT24/BT24-018.js";

describe("BT18-019 Millenniummon", () => {
  it("deletes one opposing Digimon on play and retains the DNA-only return clause", async () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.dnaDigivolveRequirement).toEqual([
      {
        cost: 0,
        materials: [{ namesExact: ["Kimeramon"] }, { namesExact: ["Machinedramon"] }],
      },
    ]);
    expect(dnaDigivolutionRequirementsFor("BT18-019")).toEqual(compiled.dnaDigivolveRequirement);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "OnPlay",
      actions: [
        { kind: "Delete", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 } },
        {
          kind: "GainMemory",
          condition: { kind: "isDnaDigivolving" },
          cost: { to: "deckTop" },
          scaling: { unit: "namedCount", countSource: "returnedDistinctLevels" },
        },
      ],
    });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "OnDeletion",
      actions: [
        {
          kind: "PlayWithoutCost",
          cost: {
            kind: "return",
            target: {
              filter: {
                nameOrTrait: [
                  { tokens: ["Kimeramon"], match: "name" },
                  { tokens: ["Machinedramon"], match: "name" },
                ],
              },
              count: 2,
              distinctNames: true,
            },
            to: "deckBottom",
          },
        },
      ],
    });
    const s = setupEngine(
      { 0: { hand: [{ card: "BT18-019", as: "millennium" }] }, 1: { battleArea: [{ card: "BT1-030", as: "target" }] } },
      { autoSelectCards: true },
    );
    s.state.memory = 20;
    const targetId = s.perm("target").permanentId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("millennium").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.state.players[1]!.battleArea.some((p) => p.permanentId === targetId));
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === targetId)).toBe(false);
  });

  it("DNA digivolves, returns every available distinct opposing level, and gains 1 memory each", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-015", as: "kimeramon" },
            { card: "BT11-072", as: "machinedramon" },
          ],
          hand: [{ card: "BT18-019", as: "millennium" }],
        },
        1: {
          trash: [
            { card: "BT1-030", as: "level3" },
            { card: "BT1-032", as: "level4" },
            { card: "BT1-021", as: "level5" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("kimeramon").permanentId, s.perm("machinedramon").permanentId],
        instanceId: s.inst("millennium").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 3);

    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(
      s.state.players[1]!.deck.slice(-3)
        .map((card) => card.cardId)
        .sort(),
    ).toEqual(["BT1-021", "BT1-030", "BT1-032"]);
    expect(s.state.players[0]!.battleArea[0]!.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT18-015", "BT11-072"]),
    );
  });

  it("accepts the printed named DNA route regardless of material colors", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT8-084", as: "kimeramon" },
          { card: "BT11-072", as: "machinedramon" },
        ],
        hand: [{ card: "BT18-019", as: "millennium" }],
      },
    });
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("kimeramon").permanentId, s.perm("machinedramon").permanentId],
        instanceId: s.inst("millennium").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT18-019"));
  });

  it("rejects a Red Lv.5 plus Black Lv.6 pair without the printed names", () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT18-016", as: "wrongRed" },
          { card: "BT11-072", as: "machinedramon" },
        ],
        hand: [{ card: "BT18-019", as: "millennium" }],
      },
    });
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("wrongRed").permanentId, s.perm("machinedramon").permanentId],
        instanceId: s.inst("millennium").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("may decline the DNA-only distinct-level return and gain no memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-015", as: "kimeramon" },
            { card: "BT11-072", as: "machinedramon" },
          ],
          hand: [{ card: "BT18-019", as: "millennium" }],
        },
        1: { trash: [{ card: "BT1-032", as: "level4" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("kimeramon").permanentId, s.perm("machinedramon").permanentId],
        instanceId: s.inst("millennium").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT1-032"]);
  });

  it("uses its just-trashed Kimeramon and Machinedramon sources to replay Millenniummon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-019", as: "millennium", under: ["BT18-015", "BT11-072"] }],
          trash: [{ card: "BT18-019", as: "replacement" }],
        },
        1: { battleArea: [{ card: "BT1-030", dp: 15000, suspended: true, as: "defender" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("millennium").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT18-019"));

    expect(
      s.state.players[0]!.deck.slice(0, 2)
        .map((card) => card.cardId)
        .sort(),
    ).toEqual(["BT11-072", "BT18-015"]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT18-019")).toBe(true);
  });

  it("cannot pay the On Deletion condition with only Kimeramon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-019", as: "millennium", under: ["BT18-015"] }],
          trash: [{ card: "BT18-019", as: "replacement" }],
        },
        1: { battleArea: [{ card: "BT1-030", dp: 15000, suspended: true, as: "defender" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("millennium").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("replacement").instanceId));

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).not.toContain("BT18-015");
  });

  it("DigiXroses with distinct Kimeramon and Machinedramon slots for 2 less each", async () => {
    expect(compiled.digiXrosRequirement).toEqual([
      { materials: [{ names: ["Kimeramon"] }, { names: ["Machinedramon"] }], count: 2 },
    ]);
    const s = setupEngine({
      0: {
        hand: [
          { card: "BT18-019", as: "millennium" },
          { card: "BT18-015", as: "kimeramon" },
          { card: "BT11-072", as: "machinedramon" },
        ],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("millennium").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("kimeramon").instanceId, s.inst("machinedramon").instanceId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea[0]?.stack.length === 2);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea[0]!.stack.map((card) => card.cardId).sort()).toEqual([
      "BT11-072",
      "BT18-015",
    ]);
  });

  it("rejects two Kimeramon as materials for the distinct DigiXros slots", () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "BT18-019", as: "millennium" },
          { card: "BT18-015", as: "kimeramonA" },
          { card: "BT18-015", as: "kimeramonB" },
        ],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("millennium").instanceId,
        digiXros: { materialInstanceIds: [s.inst("kimeramonA").instanceId, s.inst("kimeramonB").instanceId] },
      }),
    ).toEqual({ ok: false, reason: "invalid-material" });
  });
});

const OPPONENT_DECK = ["BT1-009", "BT1-013"];
const OWN_DECK = ["BT1-009", "BT1-013"];

async function dnaDigivolveIntoMillenniummon(opponentTrash: CardSpec[], options: SetupEngineOptions) {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT18-015", as: "kimeramon" },
          { card: "BT11-072", as: "machinedramon" },
        ],
        hand: [{ card: "BT18-019", as: "millennium" }],
      },
      1: { trash: opponentTrash, deck: [...OPPONENT_DECK] },
    },
    options,
  );
  s.state.memory = 0;
  expect(
    s.engine.applyIntent(0, {
      type: "dnaDigivolve",
      materialPermanentIds: [s.perm("kimeramon").permanentId, s.perm("machinedramon").permanentId],
      instanceId: s.inst("millennium").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.battleArea.length === 1);
  await settle();
  return s;
}

async function deleteMillenniummonInBattle(sources: CardSpec[], trash: CardSpec[]) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT18-019", as: "millennium", under: sources }],
        trash: [{ card: "BT18-019", as: "replacement" }, ...trash],
        deck: [...OWN_DECK],
      },
      1: { battleArea: [{ card: "BT1-030", dp: 15000, suspended: true, as: "defender" }] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("millennium").permanentId,
      target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("millennium").permanentId));
  await settle();
  return s;
}

function cardIds(cards: Iterable<{ cardId: string }>) {
  return Array.from(cards, (card) => card.cardId);
}

describe("BT18-019 Millenniummon — KB Q&A rulings", () => {
  it("cannot return a Digi-Egg card from the opponent's trash with the DNA return clause (Q2928)", async () => {
    expect(getCardDefinition("BT1-001")).toMatchObject({ kinds: ["DigiEgg"], level: 2 });
    const s = await dnaDigivolveIntoMillenniummon(["BT1-001", "BT1-030"], {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });

    expect(cardIds(s.state.players[1]!.trash)).toEqual(["BT1-001"]);
    expect(cardIds(s.state.players[1]!.deck)).toEqual(["BT1-030", ...OPPONENT_DECK]);
    expect(s.state.memory).toBe(1);
  });

  it("cannot return a Lv.- Digimon card from the opponent's trash with the DNA return clause (Q2929)", async () => {
    expect(getCardDefinition("BT19-077")).toMatchObject({ kinds: ["Digimon"] });
    expect(getCardDefinition("BT19-077")?.level).toBeUndefined();
    const s = await dnaDigivolveIntoMillenniummon(["BT19-077", "BT1-030"], {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });

    expect(cardIds(s.state.players[1]!.trash)).toEqual(["BT19-077"]);
    expect(cardIds(s.state.players[1]!.deck)).toEqual(["BT1-030", ...OPPONENT_DECK]);
    expect(s.state.memory).toBe(1);
  });

  it("can return Kimeramon and Machinedramon that were its own digivolution cards when deleted (Q2930)", async () => {
    const s = await deleteMillenniummonInBattle(["BT18-015", "BT11-072"], []);

    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.instanceId)).toEqual([
      s.inst("replacement").instanceId,
    ]);
    const deck = cardIds(s.state.players[0]!.deck);
    expect(deck.slice(0, OWN_DECK.length)).toEqual(OWN_DECK);
    expect(deck.slice(OWN_DECK.length).sort()).toEqual(["BT11-072", "BT18-015"]);
    expect(cardIds(s.state.players[0]!.trash)).not.toContain("BT18-015");
    expect(cardIds(s.state.players[0]!.trash)).not.toContain("BT11-072");
  });

  it("cannot pay the On Deletion condition by returning only 1 Kimeramon (Q2931)", async () => {
    const s = await deleteMillenniummonInBattle([], [{ card: "BT18-015", as: "kimeramon" }]);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("replacement").instanceId, s.inst("kimeramon").instanceId]),
    );
    expect(cardIds(s.state.players[0]!.deck)).toEqual(OWN_DECK);

    const control = await deleteMillenniummonInBattle([], ["BT18-015", "BT11-072"]);
    expect(control.state.players[0]!.battleArea.map((p) => p.topCard?.instanceId)).toEqual([
      control.inst("replacement").instanceId,
    ]);
  });

  it("returns the only level 3 Digimon card in the opponent's trash and gains 1 memory (Q5779)", async () => {
    const s = await dnaDigivolveIntoMillenniummon([{ card: "BT1-030", as: "level3" }], {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });

    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.players[1]!.deck[0]!.instanceId).toBe(s.inst("level3").instanceId);
    expect(s.state.memory).toBe(1);
  });

  it("must return both the level 3 and level 4 cards, or none when the effect is declined (Q5780)", async () => {
    const accepted = await dnaDigivolveIntoMillenniummon(
      [
        { card: "BT1-030", as: "level3" },
        { card: "BT1-032", as: "level4" },
      ],
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const trashIds = [accepted.inst("level3").instanceId, accepted.inst("level4").instanceId];
    const returnPickers = accepted.decisions.filter(
      ({ seat, req }) =>
        seat === 0 &&
        (req.kind === "selectCards" || req.kind === "chooseTargets") &&
        (req.options?.candidateInstanceIds ?? []).some((id) => trashIds.includes(id)),
    );
    // autoSelectCards always takes the maximum, so a picker with a floor below 2 would hide a partial return.
    expect(returnPickers.filter(({ req }) => (req.options?.min ?? 0) < 2)).toEqual([]);
    expect(accepted.decisions.some(({ seat, req }) => seat === 0 && req.kind === "optional")).toBe(true);
    expect(accepted.state.players[1]!.trash).toHaveLength(0);
    expect(cardIds(accepted.state.players[1]!.deck.slice(0, 2)).sort()).toEqual(["BT1-030", "BT1-032"]);
    expect(accepted.state.memory).toBe(2);

    const declined = await dnaDigivolveIntoMillenniummon(["BT1-030", "BT1-032"], { autoDeclineOptional: true });
    expect(cardIds(declined.state.players[1]!.trash).sort()).toEqual(["BT1-030", "BT1-032"]);
    expect(cardIds(declined.state.players[1]!.deck)).toEqual(OPPONENT_DECK);
    expect(declined.state.memory).toBe(0);
  });

  it("still returns the opponent's cards and gains memory after a would-leave effect removes it mid-effect (Q6013)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-015", as: "kimeramon" },
            { card: "BT11-072", as: "machinedramon" },
          ],
          hand: [{ card: "BT18-019", as: "millennium" }],
        },
        1: {
          battleArea: [{ card: "BT24-018", as: "styracomon" }],
          trash: [
            { card: "BT1-030", as: "level3" },
            { card: "BT1-032", as: "level4" },
          ],
          deck: [...OPPONENT_DECK],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        // Keeps Millenniummon in the trash so its [On Deletion] replay does not muddy the board.
        declinePrompts: ["1 [Kimeramon] and 1 [Machinedramon]"],
      },
    );
    s.state.memory = 0;
    const millenniumInstanceId = s.inst("millennium").instanceId;
    const styracomonId = s.perm("styracomon").permanentId;
    // Snapshots player 0's field when the "then" return prompt is issued, proving the source already left.
    const fieldAtReturnPrompt: string[][] = [];
    const recordDecision = s.decisions.push.bind(s.decisions);
    s.decisions.push = (...entries) => {
      for (const { seat, req } of entries) {
        if (seat === 0 && (req.promptText ?? "").includes("different levels from your opponent's trash")) {
          fieldAtReturnPrompt.push(
            s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.instanceId ?? ""),
          );
        }
      }
      return recordDecision(...entries);
    };

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("kimeramon").permanentId, s.perm("machinedramon").permanentId],
        instanceId: millenniumInstanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.length === 0);
    await settle();

    const prompts = s.decisions.map(({ seat, req }) => `${seat}:${req.promptText ?? ""}`);
    const preventIndex = prompts.findIndex((prompt) => prompt.startsWith("1:Prevent leaving the battle area"));
    const returnIndex = prompts.findIndex(
      (prompt) => prompt.startsWith("0:") && prompt.includes("different levels from your opponent's trash"),
    );
    expect(preventIndex).toBeGreaterThanOrEqual(0);
    expect(returnIndex).toBeGreaterThan(preventIndex);
    expect(fieldAtReturnPrompt).toEqual([[]]);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(millenniumInstanceId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([styracomonId]);

    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(
      s.state.players[1]!.deck.slice(0, 2)
        .map((card) => card.instanceId)
        .sort(),
    ).toEqual([s.inst("level3").instanceId, s.inst("level4").instanceId].sort());
    expect(s.state.memory).toBe(2);
  });
});

it("Discord 1557034399055216700: the activating player orders all distinct levels returned to the opposing deck top", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT18-015", as: "kimera" },
          { card: "BT11-072", as: "machine" },
        ],
        hand: [{ card: "BT18-019", as: "millennium" }],
      },
      1: {
        trash: [
          { card: "BT1-030", as: "three" },
          { card: "BT1-032", as: "four" },
          { card: "BT1-021", as: "five" },
        ],
        deck: [{ card: "BT1-009", as: "originalTop" }],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: false },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "dnaDigivolve",
      materialPermanentIds: [s.perm("kimera").permanentId, s.perm("machine").permanentId],
      instanceId: s.inst("millennium").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle();
  expect(s.state.pendingDecision?.kind).toBe("orderCards");
  expect(s.state.pendingDecision?.seat).toBe(0);
  const order = [s.inst("five").instanceId, s.inst("three").instanceId, s.inst("four").instanceId];
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "orderCards", order },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision === undefined);
  expect(s.state.players[1]!.deck.map((c) => c.instanceId)).toEqual([...order, s.inst("originalTop").instanceId]);
  expect(s.state.memory).toBe(3);
});

it("returns the reported Machinedramon and Kimeramon to the deck instead of stacking the revival cost", async () => {
  const s = setupEngine(
    {
      0: {
        deck: ["BT1-009", "BT1-009"],
        battleArea: [{ card: "BT18-019", as: "millennium", under: ["BT18-073", "BT19-070"] }],
      },
      1: { battleArea: [{ card: "BT1-030", dp: 15000, suspended: true, as: "defender" }] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("millennium").permanentId,
      target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      s.events.some(
        (e) =>
          e.kind === "effectResolved" &&
          e.sourceCardId === "BT18-019" &&
          (e.timing === "OnDeletion" || e.timing === "OnDestroyedAnyone"),
      ) && !s.state.pendingDecision,
  );
  const revived = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT18-019");
  expect(revived).toBeDefined();
  expect(revived!.stack).toHaveLength(0);
  expect(
    s.state.players[0]!.deck.slice(-2)
      .map(({ cardId }) => cardId)
      .sort(),
  ).toEqual(["BT18-073", "BT19-070"]);
});
