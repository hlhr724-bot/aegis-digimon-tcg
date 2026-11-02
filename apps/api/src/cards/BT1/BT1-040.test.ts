import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { compiled } from "./BT1-040.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import "../BT3/BT3-046.js";
import "../BT3/BT3-061.js";
import "../BT3/BT3-077.js";
import "../BT6/BT6-021.js";

describe("BT1-040 WereGarurumon", () => {
  it("matches the catalog and exact delayed-memory IR", () => {
    expect(getCardDefinition("BT1-040")).toMatchObject({
      cardId: "BT1-040",
      set: "BT1",
      nameEn: "WereGarurumon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 6,
      dp: 7000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Beastkin"],
      effectText: "[When Attacking] Gain 3 memory. At end of turn, lose 3 memory.",
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-040",
      nameJp: "ワーガルルモン",
    });
    expect(getCardDefinition("BT1-040")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-040")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            { kind: "GainMemory", amount: 3 },
            { kind: "GainMemory", amount: -3, at: "endOfTurn" },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gains 3 memory when attacking", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-040", as: "attacker" }] }, 1: { security: ["BT1-010"] } });
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 3);
    expect(s.state.memory).toBe(3);
  });

  it("still loses 3 memory at the real turn end after being deleted in that attack", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-040", as: "attacker" }] },
      1: { battleArea: [{ card: "BT1-084", as: "target", dp: 20000, suspended: true }] },
    });
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const turn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen);
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 3 && s.state.players[0]!.battleArea.length === 0);
    await turn;
    expect(s.state.memory).toBe(-6);
  });

  it("digivolves legally from blue level 4, draws, and retains the source card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-037", as: "base" }],
        hand: [{ card: "BT1-040", as: "weregarurumon" }],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
    });
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("weregarurumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("weregarurumon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-037"]);
    expect(s.state.players[0]!.hand[0]!.instanceId).toBe(s.inst("drawn").instanceId);
  });

  it("rejects evolution from a red level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-014", as: "base" }], hand: [{ card: "BT1-040", as: "weregarurumon" }] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("weregarurumon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});

describe("BT1-040 WereGarurumon — KB Q&A rulings", () => {
  type MemoryChange = { from: number; to: number };

  function memoryChangesSince(s: ReturnType<typeof setupEngine>, firstEventIndex: number): MemoryChange[] {
    return s.events
      .slice(firstEventIndex)
      .flatMap((event) => (event.kind === "memoryChanged" ? [{ from: event.from, to: event.to }] : []));
  }

  // Each attack may leave seat 0 with no legal Main action, which auto-passes the turn at once,
  // so the memory history is read from the event log rather than sampled between attacks.
  async function attackOnceWithEachWereGarurumon(options: {
    attackers: number;
    opponentBattleArea: string[];
    startingMemory: number;
  }) {
    const attackerAliases = Array.from({ length: options.attackers }, (_, index) => `attacker${index}`);
    const s = setupEngine({
      0: { battleArea: attackerAliases.map((alias) => ({ card: "BT1-040", as: alias })) },
      1: {
        battleArea: options.opponentBattleArea.map((card, index) => ({
          card,
          as: `opponent${index}`,
          suspended: true,
        })),
        security: attackerAliases.map(() => "BT1-010"),
      },
    });
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = options.startingMemory;
    const firstEventIndex = s.events.length;
    for (const alias of attackerAliases) {
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm(alias).permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await advance(s.engine).finishAttack();
    }
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    return { s, memoryChanges: memoryChangesSince(s, firstEventIndex) };
  }

  async function attackWithAndWithoutMemoryBlocker(blockerCardId: string) {
    const blocked = await attackOnceWithEachWereGarurumon({
      attackers: 1,
      opponentBattleArea: [blockerCardId],
      startingMemory: 0,
    });
    const unblocked = await attackOnceWithEachWereGarurumon({
      attackers: 1,
      opponentBattleArea: ["BT1-010"],
      startingMemory: 0,
    });
    return { blocked, unblocked };
  }

  const gainThenPassThenDelayedLoss: MemoryChange[] = [
    { from: 0, to: 3 },
    { from: 3, to: -3 },
    { from: -3, to: -6 },
  ];
  const passThenDelayedLoss: MemoryChange[] = [
    { from: 0, to: -3 },
    { from: -3, to: -6 },
  ];

  it("still loses 3 memory at end of turn after WereGarurumon is deleted in the battle it attacked in (Q896)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-040", as: "attacker" }] },
      1: { battleArea: [{ card: "BT1-084", as: "omnimon", suspended: true }] },
    });
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 0;
    const firstEventIndex = s.events.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("omnimon").permanentId },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-040");
    expect(memoryChangesSince(s, firstEventIndex)).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: -3 },
      { from: -3, to: -6 },
    ]);
    expect(s.state.memory).toBe(-6);
  });

  it("passing after the 3-memory gain moves memory to 3 on the opponent's side, then the end-of-turn loss moves it to 6 (Q897)", async () => {
    const { s, memoryChanges } = await attackOnceWithEachWereGarurumon({
      attackers: 1,
      opponentBattleArea: [],
      startingMemory: 0,
    });

    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(memoryChanges).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: -3 },
      { from: -3, to: -6 },
    ]);
    expect(s.state.memory).toBe(-6);
  });

  it("gains no memory while the opponent has Terriermon, but still loses 3 memory at end of turn (Q1080)", async () => {
    const { blocked, unblocked } = await attackWithAndWithoutMemoryBlocker("BT3-046");

    expect(unblocked.memoryChanges).toEqual(gainThenPassThenDelayedLoss);
    expect(blocked.memoryChanges).toEqual(passThenDelayedLoss);
    expect(blocked.s.state.memory).toBe(-6);
  });

  it("gains no memory while the opponent has Chuumon, but still loses 3 memory at end of turn (Q1087)", async () => {
    const { blocked, unblocked } = await attackWithAndWithoutMemoryBlocker("BT3-061");

    expect(unblocked.memoryChanges).toEqual(gainThenPassThenDelayedLoss);
    expect(blocked.memoryChanges).toEqual(passThenDelayedLoss);
    expect(blocked.s.state.memory).toBe(-6);
  });

  it("gains no memory while the opponent has Gazimon, but still loses 3 memory at end of turn (Q1097)", async () => {
    const { blocked, unblocked } = await attackWithAndWithoutMemoryBlocker("BT3-077");

    expect(unblocked.memoryChanges).toEqual(gainThenPassThenDelayedLoss);
    expect(blocked.memoryChanges).toEqual(passThenDelayedLoss);
    expect(blocked.s.state.memory).toBe(-6);
  });

  it("gains no memory from either attack while the opponent has ModokiBetamon, and loses 3 memory for each effect at end of turn (Q1415)", async () => {
    const { s, memoryChanges } = await attackOnceWithEachWereGarurumon({
      attackers: 2,
      opponentBattleArea: ["BT6-021"],
      startingMemory: 1,
    });

    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(memoryChanges).toEqual([
      { from: 1, to: -3 },
      { from: -3, to: -6 },
      { from: -6, to: -9 },
    ]);
    expect(s.state.memory).toBe(-9);
  });
});
