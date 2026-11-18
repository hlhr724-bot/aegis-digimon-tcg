import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine, settle } from "../testkit/harness.js";

const automatic = { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true };
const protectedTargets = [
  { card: "BT24-019", as: "level3" },
  { card: "BT24-024", as: "level4" },
  { card: "BT24-028", as: "level5" },
  { card: "BT24-030", as: "protector" },
];

describe("removal reports", () => {
  it("sweep: BT8-106 deletes for both Mamemon in one Neptunemon protection window", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-063" }],
          hand: [{ card: "BT8-106", as: "senbon" }],
          deck: ["BT6-063", "BT6-063", "BT1-009", "BT1-009"],
        },
        1: { battleArea: protectedTargets },
      },
      automatic,
    );
    s.state.memory = 9;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("senbon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT8-106") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.state.players[0]!.battleArea.filter((p) => p.topCard.cardId === "BT6-063")).toHaveLength(2);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(protectedTargets.map((p) => p.card));
    expect(
      s.events.filter(
        (e) =>
          e.kind === "cardsMoved" &&
          e.from === "unsuspended" &&
          e.to === "suspended" &&
          e.instanceIds.includes(s.perm("protector").permanentId),
      ),
    ).toHaveLength(1);
  });

  for (const card of ["BT26-083", "EX7-071", "LM-067"] as const) {
    it(`${card} retains all targets during Armor Purge, then deletes the other two before Leviamon observes them`, async () => {
      const atPurge: string[][] = [];
      const atWatcher: string[][] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              {
                card: card === "EX7-071" ? "EX7-059" : "LM-067",
                as: "attacker",
                under: card === "LM-067" ? ["BT25-078", "BT25-082", "BT6-068"] : [],
              },
              { card: "EX5-063" },
            ],
            hand: card === "LM-067" ? [] : [{ card, as: "removal" }],
            security: ["BT1-009", "BT1-010", "BT1-011"],
            deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          },
          1: {
            battleArea: [
              { card: "BT1-009", as: "first" },
              { card: "BT8-038", as: "armor", under: ["BT1-036"] },
              { card: "BT1-022", as: "third" },
            ],
            security: ["BT1-009"],
          },
        },
        {
          ...automatic,
          onEvent(event) {
            const board = () => s.state.players[1]!.battleArea.map((p) => p.topCard.cardId);
            if (event.kind === "cardsMoved" && event.strippedStackTops?.reason === "armorPurge") atPurge.push(board());
            if (event.kind === "effectTriggered" && event.sourceCardId === "EX5-063") atWatcher.push(board());
          },
        },
      );
      s.state.memory = 10;
      await s.ready();
      const intent =
        card === "LM-067"
          ? {
              type: "attack" as const,
              attackerPermanentId: s.perm("attacker").permanentId,
              target: { kind: "player" as const },
            }
          : { type: "playCard" as const, instanceId: s.inst("removal").instanceId };
      expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === card) &&
          s.state.pendingDecision === undefined &&
          s.engine.mainVerbContinuationsInFlight === 0,
      );
      expect(atPurge).toEqual([["BT1-009", "BT1-036", "BT1-022"]]);
      expect(atWatcher.length).toBeGreaterThan(0);
      expect(atWatcher.every((board) => JSON.stringify(board) === JSON.stringify(["BT1-036"]))).toBe(true);
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-036"]);
      const deletion = s.events.filter((e) => e.kind === "cardsMoved" && e.deletedPermanents !== undefined);
      expect(deletion).toHaveLength(1);
      expect(deletion[0]).toMatchObject({ deletedPermanents: [{ cardId: "BT1-009" }, { cardId: "BT1-022" }] });
      expect(s.events.filter((e) => e.kind === "effectResolved" && e.sourceCardId === "EX5-063")).toHaveLength(2);
    });
  }

  it("one De-Digivolve 2 continues through Rie and preserves her underlying Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT13-063" }], hand: [{ card: "BT25-100", as: "ironSlash" }] },
        1: { battleArea: [{ card: "EX13-064", as: "host", under: ["BT1-009", "EX13-074"] }] },
      },
      automatic,
    );
    s.state.memory = 3;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ironSlash").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT25-100") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("host").topCard.cardId).toBe("BT1-009");
    expect(s.state.players[1]!.trash.map((c) => c.cardId)).toEqual(expect.arrayContaining(["EX13-064", "EX13-074"]));
    expect(s.perm("host").stack).toHaveLength(0);
  });

  it("separate De-Digivolve 1 instances continue through Rie and preserve her underlying Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-019" }], hand: [{ card: "BT24-041", as: "minerva" }] },
        1: { battleArea: [{ card: "EX13-064", as: "host", under: ["BT1-009", "EX13-074"] }] },
      },
      automatic,
    );
    s.state.memory = 7;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("minerva").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT24-041") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("host").topCard.cardId).toBe("BT1-009");
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((c) => c.cardId)).toEqual(["EX13-064", "EX13-074"]);
  });

  for (const discounted of [true, false]) {
    it(`Neptunemon bottom-deck applies Overflow 5 after ${discounted ? "7" : "12"} play cost`, async () => {
      const s = setupEngine(
        {
          0: { hand: [{ card: "BT24-030", as: "neptune" }] },
          1: {
            battleArea: [
              { card: "BT20-060", as: "ace" },
              ...(discounted ? [{ card: "BT1-020", under: ["BT1-009"] }] : []),
            ],
          },
        },
        automatic,
      );
      s.state.memory = 7;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("neptune").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT24-030") &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.players[1]!.deck.at(-1)?.cardId).toBe("BT20-060");
      expect(s.state.players[1]!.battleArea).toHaveLength(discounted ? 1 : 0);
      expect(s.state.memory).toBe(discounted ? 5 : 0);
      expect(s.events.filter((e) => e.kind === "memoryChanged" && e.reason === "overflow")).toHaveLength(1);
    });
  }

  for (const card of ["BT26-083", "EX7-071", "LM-067"] as const) {
    it(`${card} offers Neptunemon one protection for the complete simultaneous deletion batch`, async () => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              {
                card: card === "EX7-071" ? "EX7-059" : "LM-067",
                as: "attacker",
                under: card === "LM-067" ? ["BT25-078", "BT25-082", "BT6-068"] : [],
              },
            ],
            hand: card === "LM-067" ? [] : [{ card, as: "removal" }],
            security: ["BT1-009", "BT1-010", "BT1-011"],
            deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          },
          1: { battleArea: protectedTargets, security: ["BT1-009"] },
        },
        automatic,
      );
      s.state.memory = 10;
      await s.ready();
      const intent =
        card === "LM-067"
          ? {
              type: "attack" as const,
              attackerPermanentId: s.perm("attacker").permanentId,
              target: { kind: "player" as const },
            }
          : { type: "playCard" as const, instanceId: s.inst("removal").instanceId };
      expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === card) &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(protectedTargets.map((p) => p.card));
      expect(s.state.players[1]!.trash.some((c) => ["BT24-019", "BT24-024", "BT24-028"].includes(c.cardId))).toBe(
        false,
      );
    });
  }
});
