import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import type { SeatSpec } from "../../engine/testkit/harness.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT27-002.js";
import "../index.js";
import "./BT27-002.js";

const host = "BT1-020";

async function startMainPhase(own: SeatSpec, memory: number) {
  const s = setupEngine(
    {
      0: { hand: ["BT1-009"], deck: ["BT1-010", "BT1-011", "BT1-012"], ...own },
      1: {
        battleArea: [{ card: "BT1-009" }],
        security: ["BT1-009", "BT1-010", "BT1-011"],
        hand: Array.from({ length: 8 }, () => "BT1-004"),
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  void s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);
  s.state.memory = memory;
  return s;
}

async function attackWith(s: Awaited<ReturnType<typeof startMainPhase>>, alias: string) {
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm(alias).permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle();
}

function battleTopIds(s: Awaited<ReturnType<typeof startMainPhase>>): string[] {
  return s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId);
}

function stackIds(s: Awaited<ReturnType<typeof startMainPhase>>, alias: string): string[] {
  return s.perm(alias).stack.map((card) => card.instanceId);
}

describe("BT27-002 Chapmon", () => {
  it("matches the immutable catalog identity", () => {
    expect(getCardDefinition("BT27-002")).toMatchObject({
      cardId: "BT27-002",
      nameEn: "Chapmon",
      colors: ["Blue"],
      kinds: ["DigiEgg"],
      level: 2,
      forms: ["In-Training"],
      types: ["Lesser", "DATA SQUAD"],
    });
    expect(compiled.effects).toHaveLength(1);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [{ kind: "PlayWithoutCost", payCost: true, reduceCostBy: 1, optional: true }],
    });
  });

  it.each([
    ["an Aquatic type", "BT2-024"],
    ["a rule-granted Aquatic trait", "BT26-018"],
    ["a DATA SQUAD trait", "BT26-065"],
  ])("plays %s card from this Digimon's sources with the cost reduced by 1", async (_label, card) => {
    const s = await startMainPhase(
      { battleArea: [{ card: host, as: "host", under: [{ card: "BT27-002" }, { card, as: "played" }] }] },
      5,
    );

    await attackWith(s, "host");

    expect(getCardDefinition(card)?.playCost).toBe(3);
    expect(s.state.memory).toBe(3);
    expect(battleTopIds(s)).toContain(s.inst("played").instanceId);
    expect(stackIds(s, "host")).not.toContain(s.inst("played").instanceId);
  });

  it("rejects level 5 and non-matching level 4 sources", async () => {
    const s = await startMainPhase(
      {
        battleArea: [
          {
            card: host,
            as: "host",
            under: [{ card: "BT27-002" }, { card: "BT16-023", as: "levelFive" }, { card: "ST1-07", as: "dinosaur" }],
          },
        ],
      },
      5,
    );

    await attackWith(s, "host");

    expect(getCardDefinition("BT16-023")).toMatchObject({ level: 5, types: expect.arrayContaining(["Aquatic"]) });
    expect(getCardDefinition("ST1-07")).toMatchObject({ level: 4, types: ["Dinosaur"] });
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(stackIds(s, "host")).toEqual(
      expect.arrayContaining([s.inst("levelFive").instanceId, s.inst("dinosaur").instanceId]),
    );
  });

  it("only plays from the attacking Digimon's own digivolution cards", async () => {
    const s = await startMainPhase(
      {
        battleArea: [
          { card: host, as: "host", under: [{ card: "BT27-002" }] },
          { card: host, as: "other", under: [{ card: "BT2-024", as: "elsewhere" }] },
        ],
      },
      5,
    );

    await attackWith(s, "host");

    expect(s.state.memory).toBe(5);
    expect(stackIds(s, "other")).toEqual([s.inst("elsewhere").instanceId]);
  });

  it("pays the reduced cost past zero into the opponent's memory", async () => {
    const s = await startMainPhase(
      { battleArea: [{ card: host, as: "host", under: [{ card: "BT27-002" }, { card: "BT2-024", as: "played" }] }] },
      1,
    );

    await attackWith(s, "host");

    expect(battleTopIds(s)).toContain(s.inst("played").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("does nothing while Chapmon is not in the attacker's digivolution cards", async () => {
    const s = await startMainPhase(
      {
        breeding: { card: "BT27-002" },
        battleArea: [{ card: host, as: "host", under: [{ card: "BT2-024", as: "kept" }] }],
      },
      5,
    );

    await attackWith(s, "host");

    expect(s.state.memory).toBe(5);
    expect(stackIds(s, "host")).toEqual([s.inst("kept").instanceId]);
  });

  it("resolves only once per turn across two attacks", async () => {
    const s = await startMainPhase(
      {
        battleArea: [
          {
            card: host,
            as: "host",
            under: [{ card: "BT27-002" }, { card: "BT2-024", as: "first" }, { card: "BT9-022", as: "second" }],
          },
        ],
      },
      5,
    );

    await attackWith(s, "host");
    await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
    await attackWith(s, "host");

    const played = [s.inst("first").instanceId, s.inst("second").instanceId].filter((id) =>
      battleTopIds(s).includes(id),
    );
    expect(played).toHaveLength(1);
    expect(s.state.memory).toBe(3);
  });
});
