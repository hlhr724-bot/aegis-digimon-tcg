import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import {
  type CardSpec,
  type EngineSetup,
  type PermanentSpec,
  assertNoLoudGap,
  drainMicrotasks,
  setupEngine,
  settle,
} from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./BT18-015.js";
import "./BT18-019.js";
import "../BT2/BT2-077.js";
import "../BT2/BT2-083.js";
import "../BT11/BT11-072.js";
import { compiled } from "./BT18-073.js";

describe("BT18-073 Machinedramon", () => {
  it("matches the catalog and carries the reduction, DNA, inherited redirect, and Rule trait in full IR", () => {
    expect(getCardDefinition("BT18-073")).toMatchObject({
      cardId: "BT18-073",
      nameEn: "Machinedramon",
      colors: ["Black", "Purple"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [
        { color: "Black", level: 5, memoryCost: 3 },
        { color: "Purple", level: 5, memoryCost: 3 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Machine", "Composite"],
      inheritedEffectText:
        "[Opponent's Turn] [Once Per Turn] When any of your opponent's Digimon attack, you may change the attack target to 1 of your Digimon with the [Composite]/[Wicked God]\u00a0trait.",
    });
    expect(compiled).toMatchObject({
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              actions: [
                {
                  kind: "Replacement",
                  event: "wouldBePlayed",
                  mode: "reduceCost",
                  amount: 4,
                  cost: { kind: "deleteOwn" },
                },
              ],
            },
          ],
        },
        ...["OnPlay", "WhenDigivolving"].map((trigger) => ({
          trigger,
          actions: [
            {
              kind: "DeDigivolve",
              amount: 1,
              target: { count: "all", filter: { controller: "opponent", kind: ["Digimon"] } },
            },
          ],
        })),
        {
          trigger: "OnDeletion",
          actions: [
            {
              kind: "DnaDigivolve",
              materials: { count: 1, filter: { nameOrTrait: [{ tokens: ["Kimeramon"], match: "nameExact" }] } },
              looseMaterials: {
                count: 1,
                from: ["trash"],
                filter: { nameOrTrait: [{ tokens: ["Machinedramon"], match: "nameExact" }] },
              },
              into: { hasDnaDigivolutionRequirement: true },
            },
          ],
        },
        { trigger: "Rule", actions: [{ kind: "GrantStatic", grant: "trait", tokens: ["Composite"] }] },
        {
          trigger: "OpponentsTurn",
          isInherited: true,
          frequency: "OncePerTurn",
          actions: [{ kind: "SubTrigger", event: "whenOpponentAttacks" }],
        },
      ],
      coverage: "full",
      residual: [],
      digivolutionRequirement: [{ level: 5, traits: ["Composite"], cost: 3, isAlternate: true }],
    });
  });

  it("naturally plays with the Composite deletion cost, reduces by 4, and de-digivolves all opponents", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-015", as: "costComposite" }],
          hand: [{ card: "BT18-073", as: "machine" }],
        },
        1: {
          battleArea: [
            { card: "BT1-060", as: "first", under: ["BT1-030"] },
            { card: "BT1-060", as: "second", under: ["BT1-032"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("machine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("first").stack.length === 0 && s.perm("second").stack.length === 0);

    expect(s.perm("first").stack).toHaveLength(0);
    expect(s.perm("second").stack).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT18-015")).toBe(false);
    expect(s.state.memory).toBe(3);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("machine"), "Composite")).toBe(true);
    assertNoLoudGap(s);
  });

  it("naturally evolves from a Composite level 5 for 3 and resolves When Digivolving De-Digivolve1", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-015", as: "base" }],
          hand: [{ card: "BT18-073", as: "machine" }],
        },
        1: { battleArea: [{ card: "BT1-060", as: "target", under: ["BT1-030"] }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("machine").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT18-073" && s.perm("target").stack.length === 0);

    expect(s.state.memory).toBe(2);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toContain("BT18-015");
    expect(s.perm("target").stack).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("naturally DNA-digivolves Kimeramon with this card from trash into a Millenniummon after battle deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-073", as: "machine", dp: 5000, suspended: true },
            { card: "BT18-015", as: "kimeramon" },
          ],
          hand: [{ card: "BT18-019", as: "millennium" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 7000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("machine").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT18-019"));

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT18-019")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT18-015")).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT18-073")).toBe(false);
    assertNoLoudGap(s);
  });

  it("naturally redirects an opponent attack to an own Composite Digimon once", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-030", as: "host", under: ["BT18-073"] },
            { card: "BT18-013", as: "redirect", suspended: true },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const redirectId = s.perm("redirect").permanentId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.events.some(
        (event) =>
          event.kind === "attackDeclared" &&
          event.target.kind === "permanent" &&
          event.target.permanentId === redirectId,
      ),
    );

    expect(s.events).toContainEqual(
      expect.objectContaining({ kind: "attackDeclared", target: { kind: "permanent", permanentId: redirectId } }),
    );
    assertNoLoudGap(s);
  });
});

async function deleteMachinedramonInBattle(mine: {
  battleArea?: PermanentSpec[];
  hand?: CardSpec[];
  trash?: CardSpec[];
}) {
  const s = setupEngine(
    {
      0: {
        ...mine,
        battleArea: [{ card: "BT18-073", as: "machinedramon", dp: 5000, suspended: true }, ...(mine.battleArea ?? [])],
      },
      1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 7000 }] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  s.state.turnSeat = 1;
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "permanent", permanentId: s.perm("machinedramon").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT18-073"));
  await drainMicrotasks();
  return s;
}

function millenniummonOf(s: EngineSetup) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT18-019");
}

describe("BT18-073 Machinedramon — KB Q&A rulings", () => {
  it("triggers [On Play] together with Kimeramon's [On Deletion]; resolving Kimeramon first DNA digivolves this card away before its [On Play] (Q3014)", async () => {
    async function playByDeletingKimeramon(firstTrigger: string) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT18-015", as: "kimeramon" }],
            hand: [
              { card: "BT18-073", as: "machinedramon" },
              { card: "BT18-019", as: "millenniummon" },
            ],
          },
          1: {
            battleArea: [
              { card: "BT1-060", as: "opponentFirst", under: ["BT1-030"] },
              { card: "BT1-060", as: "opponentSecond", under: ["BT1-032"] },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferTriggerKeys: [firstTrigger] },
      );
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("machinedramon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => millenniummonOf(s) !== undefined);
      await drainMicrotasks();
      const orderedTogether = s.decisions.some(
        ({ req }) =>
          req.kind === "orderTriggers" &&
          (req.options?.triggerCardIds ?? []).includes("BT18-015") &&
          (req.options?.triggerCardIds ?? []).includes("BT18-073"),
      );
      const materialIds = millenniummonOf(s)!.stack.map(({ instanceId }) => instanceId);
      const opponentStackSizes = s.state.players[1]!.battleArea.map(({ stack }) => stack.length);
      return { s, orderedTogether, materialIds, opponentStackSizes };
    }

    const kimeramonFirst = await playByDeletingKimeramon("BT18-015");
    expect(kimeramonFirst.orderedTogether).toBe(true);
    expect(kimeramonFirst.materialIds).toContain(kimeramonFirst.s.inst("machinedramon").instanceId);
    expect(kimeramonFirst.opponentStackSizes).toEqual([1]);

    const machinedramonFirst = await playByDeletingKimeramon("BT18-073");
    expect(machinedramonFirst.orderedTogether).toBe(true);
    expect(machinedramonFirst.opponentStackSizes).toEqual([0]);
  });

  it("cannot DNA digivolve into a [Millenniummon] that has no DNA digivolution requirement (Q3015)", async () => {
    const withoutDna = await deleteMachinedramonInBattle({
      battleArea: [{ card: "BT2-077", as: "kimeramon" }],
      hand: [{ card: "BT2-083", as: "millenniummon" }],
    });
    expect(withoutDna.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      withoutDna.inst("millenniummon").instanceId,
    );
    expect(withoutDna.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT2-077"]);
    expect(withoutDna.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT18-073");

    const withDna = await deleteMachinedramonInBattle({
      battleArea: [{ card: "BT2-077", as: "kimeramon" }],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
    });
    expect(millenniummonOf(withDna)).toBeDefined();
  });

  it("uses the deleted Machinedramon itself from the trash as a DNA material (Q3016)", async () => {
    const s = await deleteMachinedramonInBattle({
      battleArea: [{ card: "BT2-077", as: "kimeramon" }],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
    });
    const millenniummon = millenniummonOf(s);
    expect(millenniummon).toBeDefined();
    const materialIds = millenniummon!.stack.map(({ instanceId }) => instanceId);
    expect(materialIds).toContain(s.inst("machinedramon").instanceId);
    expect(materialIds).toContain(s.inst("kimeramon").instanceId);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT18-073")).toBe(false);
  });

  it("DNA digivolves only a [Kimeramon] in the battle area with a [Machinedramon] in the trash (Q3017)", async () => {
    const kimeramonInTrash = await deleteMachinedramonInBattle({
      battleArea: [{ card: "BT11-072", as: "otherMachinedramon" }],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
      trash: [{ card: "BT2-077", as: "kimeramon" }],
    });
    expect(millenniummonOf(kimeramonInTrash)).toBeUndefined();
    expect(kimeramonInTrash.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT18-019");

    const kimeramonInPlay = await deleteMachinedramonInBattle({
      battleArea: [
        { card: "BT2-077", as: "kimeramon" },
        { card: "BT11-072", as: "otherMachinedramon" },
      ],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
    });
    const millenniummon = millenniummonOf(kimeramonInPlay);
    expect(millenniummon).toBeDefined();
    const materialIds = millenniummon!.stack.map(({ instanceId }) => instanceId);
    expect(materialIds).toContain(kimeramonInPlay.inst("kimeramon").instanceId);
    expect(materialIds).toContain(kimeramonInPlay.inst("machinedramon").instanceId);
    expect(materialIds).not.toContain(kimeramonInPlay.inst("otherMachinedramon").instanceId);
    expect(kimeramonInPlay.perm("otherMachinedramon").topCard.cardId).toBe("BT11-072");
  });
});
