import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import {
  type CardSpec,
  type EngineSetup,
  type PermanentSpec,
  drainMicrotasks,
  setupEngine,
  settle,
} from "../../engine/testkit/harness.js";
import { compiled } from "./BT18-015.js";
import "./BT18-019.js";
import "./BT18-073.js";
import "../BT2/BT2-077.js";
import "../BT2/BT2-083.js";
import "../BT11/BT11-072.js";

describe("BT18-015 Kimeramon", () => {
  it("retains its lowest-DP deletion clauses, DNA deletion trigger, and inherited Security Attack", async () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Delete",
          cost: { kind: "deleteOwn" },
          target: { filter: { controller: "opponent", superlative: "lowestDP" } },
        },
      ],
    });
    expect(compiled.effects[1]).toMatchObject({
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Delete",
          cost: { kind: "deleteOwn" },
          target: { filter: { controller: "opponent", superlative: "lowestDP" } },
        },
      ],
    });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "OnDeletion",
      actions: [
        {
          kind: "DnaDigivolve",
          optional: true,
          looseMaterials: { filter: { zone: "trash", nameOrTrait: [{ tokens: ["Kimeramon"], match: "nameExact" }] } },
          into: { zone: "hand", kind: ["Digimon"], hasDnaDigivolutionRequirement: true },
        },
      ],
    });
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-030", as: "kimeramon", under: ["BT18-015"] }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("kimeramon"), "SecurityAttack")).toBe(true);
  });

  it("pays one own deletion to delete exactly one lowest-DP opponent when digivolving", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-013", as: "base" },
            { card: "BT1-030", as: "cost" },
          ],
          hand: [{ card: "BT18-015", as: "source" }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-030", dp: 3000, as: "low" },
            { card: "BT1-030", dp: 4000, as: "high" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("cost").topCard!.instanceId);
    s.state.memory = 10;
    const costId = s.perm("cost").permanentId;
    const lowId = s.perm("low").permanentId;
    const highId = s.perm("high").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowId));
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(costId);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(lowId);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(highId);
  });

  it("pays one own deletion to delete exactly one lowest-DP opponent when attacking", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-015", as: "source" },
            { card: "BT1-030", as: "cost" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-030", dp: 3000, as: "low" },
            { card: "BT1-030", dp: 4000, as: "high" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("cost").topCard!.instanceId);
    const costId = s.perm("cost").permanentId;
    const lowId = s.perm("low").permanentId;
    const highId = s.perm("high").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowId));

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(costId);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(lowId);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(highId);
  });

  it("may decline without deleting either player's Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-013", as: "base" },
            { card: "BT1-030", as: "cost" },
          ],
          hand: [{ card: "BT18-015", as: "source" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-030", dp: 3000, as: "target" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(s.perm("cost").permanentId);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("target").permanentId,
    );
  });

  it("digivolves from a level 4 Composite for 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-013", as: "deltamon" }],
          hand: [{ card: "BT18-015", as: "kimeramon" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: false },
    );
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("deltamon").permanentId,
        instanceId: s.inst("kimeramon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("deltamon").topCard.cardId === "BT18-015");
    expect(s.state.memory).toBe(2);
    expect(s.perm("deltamon").stack.at(-1)?.cardId).toBe("BT18-013");
  });

  it("uses the deleted Kimeramon from trash with Machinedramon for Millenniummon DNA digivolution", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-015", as: "kimeramon" },
            { card: "BT11-072", as: "machinedramon" },
            { card: "BT1-030", as: "cost" },
          ],
          hand: [{ card: "BT18-019", as: "millenniummon" }],
        },
        1: {
          battleArea: [
            { card: "BT1-030", dp: 1000, as: "effectTarget" },
            { card: "BT1-030", dp: 15000, suspended: true, as: "defender" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("cost").topCard!.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("kimeramon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT18-019"));
    const result = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT18-019")!;
    expect(result.stack.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT11-072", "BT18-015"]));
  });
});

async function deleteKimeramonInBattle(mine: { battleArea?: PermanentSpec[]; hand?: CardSpec[]; trash?: CardSpec[] }) {
  const s = setupEngine(
    {
      0: {
        ...mine,
        battleArea: [{ card: "BT18-015", as: "kimeramon", suspended: true }, ...(mine.battleArea ?? [])],
      },
      1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 9000 }] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  s.state.turnSeat = 1;
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "permanent", permanentId: s.perm("kimeramon").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT18-015"));
  await drainMicrotasks();
  return s;
}

function millenniummonOf(s: EngineSetup) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT18-019");
}

describe("BT18-015 Kimeramon — KB Q&A rulings", () => {
  it("cannot DNA digivolve into a [Millenniummon] that has no DNA digivolution requirement (Q2922)", async () => {
    const withoutDna = await deleteKimeramonInBattle({
      battleArea: [{ card: "BT11-072", as: "machinedramon" }],
      hand: [{ card: "BT2-083", as: "millenniummon" }],
    });
    expect(withoutDna.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      withoutDna.inst("millenniummon").instanceId,
    );
    expect(withoutDna.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT11-072"]);
    expect(withoutDna.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT18-015");

    const withDna = await deleteKimeramonInBattle({
      battleArea: [{ card: "BT11-072", as: "machinedramon" }],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
    });
    expect(millenniummonOf(withDna)).toBeDefined();
  });

  it("uses the deleted Kimeramon itself from the trash as a DNA material (Q2923)", async () => {
    const s = await deleteKimeramonInBattle({
      battleArea: [{ card: "BT11-072", as: "machinedramon" }],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
    });
    const millenniummon = millenniummonOf(s);
    expect(millenniummon).toBeDefined();
    const materialIds = millenniummon!.stack.map(({ instanceId }) => instanceId);
    expect(materialIds).toContain(s.inst("kimeramon").instanceId);
    expect(materialIds).toContain(s.inst("machinedramon").instanceId);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT18-015")).toBe(false);
  });

  it("DNA digivolves only a [Machinedramon] in the battle area with a [Kimeramon] in the trash (Q2924)", async () => {
    const machinedramonInTrash = await deleteKimeramonInBattle({
      battleArea: [{ card: "BT2-077", as: "otherKimeramon" }],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
      trash: [{ card: "BT11-072", as: "machinedramon" }],
    });
    expect(millenniummonOf(machinedramonInTrash)).toBeUndefined();
    expect(machinedramonInTrash.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT18-019");

    const machinedramonInPlay = await deleteKimeramonInBattle({
      battleArea: [
        { card: "BT11-072", as: "machinedramon" },
        { card: "BT2-077", as: "otherKimeramon" },
      ],
      hand: [{ card: "BT18-019", as: "millenniummon" }],
    });
    const millenniummon = millenniummonOf(machinedramonInPlay);
    expect(millenniummon).toBeDefined();
    const materialIds = millenniummon!.stack.map(({ instanceId }) => instanceId);
    expect(materialIds).toContain(machinedramonInPlay.inst("machinedramon").instanceId);
    expect(materialIds).toContain(machinedramonInPlay.inst("kimeramon").instanceId);
    expect(materialIds).not.toContain(machinedramonInPlay.inst("otherKimeramon").instanceId);
    expect(machinedramonInPlay.perm("otherKimeramon").topCard.cardId).toBe("BT2-077");
  });

  it("triggers simultaneously with Machinedramon's [On Play], which fizzles once Kimeramon's DNA digivolution removes it (Q3014)", async () => {
    async function playMachinedramonByDeletingKimeramon(firstTrigger: string) {
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
      await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT18-019"));
      await drainMicrotasks();
      const orderedTogether = s.decisions.some(
        ({ req }) =>
          req.kind === "orderTriggers" &&
          (req.options?.triggerCardIds ?? []).includes("BT18-015") &&
          (req.options?.triggerCardIds ?? []).includes("BT18-073"),
      );
      const opponentStackSizes = s.state.players[1]!.battleArea.map(({ stack }) => stack.length);
      return { orderedTogether, opponentStackSizes };
    }

    const kimeramonFirst = await playMachinedramonByDeletingKimeramon("BT18-015");
    expect(kimeramonFirst.orderedTogether).toBe(true);
    expect(kimeramonFirst.opponentStackSizes).toEqual([1]);

    const machinedramonFirst = await playMachinedramonByDeletingKimeramon("BT18-073");
    expect(machinedramonFirst.orderedTogether).toBe(true);
    expect(machinedramonFirst.opponentStackSizes).toEqual([0]);
  });
});
