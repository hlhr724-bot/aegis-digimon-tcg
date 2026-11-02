import { describe, it, expect } from "vitest";
import { PlayerState, Zone } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { candidateLooseInstances, pickLoose } from "../../engine/effects/interpreter/targeting/loose.js";
import { compiled } from "./EX6-073.js";
import "./EX6-054.js";
import "./EX6-058.js";
import "../index.js";

const OGUDOMON = "EX6-073";
const SGDL_IDS = ["BT13-091", "BT15-081", "BT18-082", "BT19-071", "BT3-091", "BT8-111", "EX6-059"];
const OPP_DIGIMON = "BT1-024";

function autoOrderTriggers(s: EngineSetup, answered: Set<string>): void {
  for (const { seat, req } of s.decisions) {
    if (req.kind !== "orderTriggers" || answered.has(req.decisionId)) continue;
    answered.add(req.decisionId);
    const first = (req.options?.triggerKeys as string[] | undefined)?.[0] ?? "";
    s.engine.applyIntent(seat, {
      type: "respondDecision",
      decisionId: req.decisionId,
      response: { kind: "orderTriggers", order: first ? [first] : [] },
    });
  }
}

describe("EX6-073 [When Attacking] security trash is reduced by each card deleted", () => {
  it("pays the second When Attacking effect with seven distinct Demon Lords placed by the first", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: OGUDOMON, as: "ogudomon" }],
          trash: SGDL_IDS,
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: OPP_DIGIMON, suspended: true, as: "target" }],
          security: Array.from({ length: 8 }, () => "BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("ogudomon").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck.slice(-7).map((card) => card.cardId)).toEqual([...SGDL_IDS].reverse());
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("deleting 3 of 7 opponent Digimon trashes only 4 opponent security cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: OGUDOMON,
              dp: 20000,
              as: "ogudomon",
              under: SGDL_IDS.map((id) => ({ card: id })),
            },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: OPP_DIGIMON, dp: 1000, suspended: true, as: "oppOne" },
            { card: OPP_DIGIMON, dp: 1000, as: "oppTwo" },
            { card: OPP_DIGIMON, dp: 1000, as: "oppThree" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const p1 = s.state.players[1] as PlayerState;
    const ogudomon = s.perm("ogudomon");
    for (let i = 0; i < 10; i++) s.give(1, Zone.Security, OPP_DIGIMON);
    const secBefore = p1.security.length;
    const answered = new Set<string>();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: ogudomon.permanentId,
        target: { kind: "permanent", permanentId: s.perm("oppOne").permanentId },
      }),
    ).toEqual({ ok: true });

    await settle(() => {
      autoOrderTriggers(s, answered);
      return p1.security.length <= secBefore - 4;
    }, 2000);

    expect(p1.battleArea.filter((p) => p.topCard?.cardId === OPP_DIGIMON).length).toBe(0);
    const totalTrash = secBefore - p1.security.length;
    expect(totalTrash).toBe(4);
    expect(ogudomon.stack).toHaveLength(0);
    expect(s.state.players[0]!.deck.slice(-7).map((card) => card.cardId)).toEqual(SGDL_IDS);
    expect(s.state.players[0]!.deck.slice(-7).every((card) => card.faceUp === false)).toBe(true);
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "EX6-073")
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual([
      undefined,
      "[When Attacking] By returning 7 cards with different names and the [Seven Great Demon Lords] trait " +
        "from this Digimon's digivolution cards to the bottom of the deck, " +
        "delete 7 of your opponent's Digimon or Tamers.",
      "Then, trash the top 7 cards of your opponent's security stack. " +
        "For each card deleted by this effect, reduce the cards trashed by 1.",
    ]);
  });
});

describe("EX6-073 [When Attacking] payment and deletion boundaries", () => {
  it("continues the security tail after Lucemon's immediate replacement removes Ogudomon (Q6040)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: OGUDOMON, as: "ogudomon", under: SGDL_IDS }], deck: ["BT1-009"] },
        1: {
          battleArea: [{ card: "EX6-054", as: "chaos", under: [{ card: "EX10-013", as: "lucemonSource" }] }],
          trash: [{ card: "EX6-058", as: "creepy" }],
          deck: Array.from({ length: 10 }, () => "BT1-009"),
          security: Array.from({ length: 10 }, () => "BT1-010"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const answered = new Set<string>();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => {
      autoOrderTriggers(s, answered);
      return (
        s.state.players[0]!.trash.some((card) => card.cardId === OGUDOMON) &&
        !s.state.players[1]!.battleArea.some((perm) => perm.topCard?.cardId === "EX6-054") &&
        s.state.players[1]!.security.length === 4 &&
        s.state.pendingDecision === undefined
      );
    }, 2000);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === OGUDOMON)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((perm) => perm.topCard?.cardId === "EX6-054")).toBe(false);
    expect(s.state.players[1]!.battleArea.some((perm) => perm.topCard?.cardId === "EX6-058")).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.cardId === "EX10-013")).toBe(false);
    expect(s.state.players[1]!.deck).toHaveLength(4);
    expect(s.state.players[1]!.deck.at(-1)?.cardId).toBe("EX10-013");
    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(s.inst("lucemonSource").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(4);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("rejects an incomplete or duplicate-name seven-card payment without deleting or trashing security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: OGUDOMON, as: "ogudomon", under: [...SGDL_IDS.slice(0, 6), "BT13-091"] }],
        },
        1: { battleArea: [{ card: OPP_DIGIMON, as: "victim" }], security: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("ogudomon").permanentId,
      target: { kind: "player" },
    });
    expect(result).toEqual({ ok: true });
    await settle();
    expect(s.perm("ogudomon").stack).toHaveLength(7);
    expect(s.state.players[1]!.battleArea.some((perm) => perm.permanentId === s.perm("victim").permanentId)).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("counts only actual deletions when Scapegoat prevents the selected deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: OGUDOMON, as: "ogudomon", under: SGDL_IDS }] },
        1: {
          battleArea: [
            { card: "EX6-059", as: "scapegoat" },
            { card: OPP_DIGIMON, as: "sacrifice" },
          ],
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[1]!.battleArea.some((perm) => perm.permanentId === s.perm("scapegoat").permanentId)).toBe(
      true,
    );
    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("trashes zero security cards after seven actual deletions, including Digimon and Tamers", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: OGUDOMON, as: "ogudomon", under: SGDL_IDS }] },
        1: {
          battleArea: [
            { card: OPP_DIGIMON, as: "digimon1" },
            { card: OPP_DIGIMON, as: "digimon2" },
            { card: OPP_DIGIMON, as: "digimon3" },
            { card: "BT1-085", as: "tamer1" },
            { card: "BT1-086", as: "tamer2" },
            { card: "BT1-087", as: "tamer3" },
            { card: "BT1-088", as: "tamer4" },
          ],
          security: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});

describe("EX6-073 [When Digivolving] places SGDL from trash; 4+ placed deletes 1 opp Digimon", () => {
  it("publicly digivolves from Creepymon, places four distinct SGDL sources, and deletes one opponent Digimon (KB Q3825)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX6-058", as: "base" }],
          hand: [{ card: OGUDOMON, as: "ogudomon" }],
          trash: SGDL_IDS.slice(0, 4),
        },
        1: { battleArea: [{ card: OPP_DIGIMON, dp: 2000, as: "oppPerm" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    const sourceIds = s.state.players[0]!.trash.map((card) => card.instanceId);
    const targetPermanentId = s.perm("oppPerm").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("ogudomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard?.instanceId === s.inst("ogudomon").instanceId &&
        !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetPermanentId),
    );

    expect(s.perm("base").stack).toHaveLength(5);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual(expect.arrayContaining(sourceIds));
    expect(new Set(s.perm("base").stack.map((card) => card.cardId)).size).toBe(5);
    expect(s.state.players[0]!.trash.some((card) => sourceIds.includes(card.instanceId))).toBe(false);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.filter((card) => card.instanceId === s.inst("oppPerm").instanceId)).toHaveLength(
      1,
    );
    expect(s.state.memory).toBe(0);
  });
});

describe("EX6-073 activation-local distinct-name contracts", () => {
  it("requires distinct names for placement and an exact self-stack seven-card payment", () => {
    const placements =
      compiled.effects?.flatMap((effect) => effect.actions ?? []).filter((action) => action.kind === "PlaceUnder") ??
      [];
    const paidDelete = compiled.effects
      ?.flatMap((effect) => effect.actions ?? [])
      .find((action) => action.kind === "Delete" && action.cost?.kind === "return");

    expect(placements).toHaveLength(2);
    for (const placement of placements) {
      expect(placement).toMatchObject({
        target: { count: 7, upTo: true, distinctNames: true },
        trackCount: "ex6-073-placed",
        trackDistinctNames: "ex6-073-placed",
      });
    }
    expect(paidDelete).toMatchObject({
      optional: true,
      abortOnDecline: true,
      target: {
        count: 7,
        filter: { controller: "opponent", kind: ["Digimon", "Tamer"] },
      },
      cost: {
        kind: "return",
        position: "bottom",
        target: {
          count: 7,
          isSelfRef: true,
          distinctNames: true,
          filter: { zone: "digivolutionCards", sameHost: true },
        },
      },
      trackCount: "ex6-073-deleted",
    });

    const securityTrash = compiled.effects
      ?.flatMap((effect) => effect.actions ?? [])
      .find((action) => action.kind === "SecurityManipulation" && action.op === "trashTop");
    expect(securityTrash).toMatchObject({
      controller: "opponent",
      amountFromNamedCount: { base: 7, countSource: "ex6-073-deleted", per: -1, floor: 0 },
    });
  });

  it("resolves only this Digimon's stack and deduplicates a hostile duplicate-name selection", async () => {
    const self = {
      permanentId: "ogudomon-host",
      stack: [
        { instanceId: "self-a", cardId: "A", ownerSeat: 0, faceUp: true },
        { instanceId: "self-b", cardId: "B", ownerSeat: 0, faceUp: true },
      ],
      linked: [],
      topCard: { instanceId: "ogudomon-top", cardId: OGUDOMON, ownerSeat: 0 },
    };
    const unrelated = {
      permanentId: "other-host",
      stack: [{ instanceId: "other-a", cardId: "C", ownerSeat: 0, faceUp: true }],
      linked: [],
      topCard: { instanceId: "other-top", cardId: OPP_DIGIMON, ownerSeat: 0 },
    };
    const names: Record<string, string> = { A: "Belphemon", B: "Leviamon", C: "Lilithmon", D: "Belphemon" };
    const ctx = {
      source: { ownerSeat: 0, instanceId: "ogudomon-top", permanent: () => self },
      game: {
        player: (seat: number) => ({
          hand: [],
          trash: [],
          deck: [],
          security: [],
          battleArea: seat === 0 ? [self, unrelated] : [],
          breeding: undefined,
        }),
        opponentOf: () => 1,
        definitionOf: ({ cardId }: { cardId: string }) => ({
          cardId,
          nameEn: names[cardId] ?? cardId,
          kinds: [],
          colors: [],
          types: ["Seven Great Demon Lords"],
          playCost: 0,
        }),
      },
    } as never;
    const target = {
      filter: { controller: "mine", zone: "digivolutionCards", isSelfRef: true },
      count: 7,
    } as never;

    const selfStack = candidateLooseInstances(ctx, target, ["digivolutionCards"]);
    expect(selfStack.map((card) => card.instanceId)).toEqual(["self-a", "self-b"]);

    const deduped = await pickLoose(
      ctx,
      { filter: { distinctNames: true }, count: 2, upTo: true } as never,
      [...selfStack, { instanceId: "duplicate-a", cardId: "D", ownerSeat: 0 }],
      undefined,
      { selectCards: async () => ["self-a", "duplicate-a"] } as never,
    );
    expect(deduped).toEqual(["self-a"]);
  });

  it("keeps ordinary self references scoped to the source loose card outside hosted zones", () => {
    const sourceCard = { instanceId: "source-in-hand", cardId: "A", ownerSeat: 0 };
    const otherCard = { instanceId: "other-in-hand", cardId: "B", ownerSeat: 0 };
    const ctx = {
      source: { ownerSeat: 0, instanceId: sourceCard.instanceId, permanent: () => undefined },
      game: {
        player: (seat: number) => ({
          hand: seat === 0 ? [sourceCard, otherCard] : [],
          trash: [],
          deck: [],
          security: [],
          battleArea: [],
          breeding: undefined,
        }),
        opponentOf: () => 1,
        definitionOf: ({ cardId }: { cardId: string }) => ({
          cardId,
          nameEn: cardId,
          kinds: [],
          colors: [],
          playCost: 0,
        }),
      },
    } as never;

    const resolved = candidateLooseInstances(
      ctx,
      { filter: { controller: "mine", zone: "hand", isSelfRef: true }, count: 1 } as never,
      ["hand"],
    );
    expect(resolved.map((card) => card.instanceId)).toEqual(["source-in-hand"]);
  });
});

describe("EX6-073 Ogudomon — KB Q&A rulings", () => {
  async function digivolveWithTrash(trash: string[]) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX6-058", as: "base" }],
          hand: [{ card: OGUDOMON, as: "ogudomon" }],
          trash: trash.map((card, index) => ({ card, as: `trash${index}` })),
        },
        1: { battleArea: [{ card: OPP_DIGIMON, dp: 2000, as: "oppPerm" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("ogudomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard?.instanceId === s.inst("ogudomon").instanceId && s.state.pendingDecision === undefined,
    );
    return s;
  }

  it("treats [Beelzemon] and [Beelzemon (X Antibody)] as different names (Q3823)", async () => {
    const s = await digivolveWithTrash(["EX6-056", "BT12-085"]);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX6-058", "EX6-056", "BT12-085"]),
    );
    expect(s.perm("base").stack).toHaveLength(3);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("treats [Beelzemon] and [Beelzemon] ACE as the same name (Q3824)", async () => {
    const s = await digivolveWithTrash(["EX6-056", "EX10-074"]);

    const placed = s.perm("base").stack.filter((card) => card.cardId === "EX6-056" || card.cardId === "EX10-074");
    expect(placed).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(1);
  });

  it("cannot pay the seven-card return with just 1 digivolution card (Q3826)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: OGUDOMON, as: "ogudomon", under: [{ card: "EX6-059", as: "onlySource" }] }] },
        1: { battleArea: [{ card: OPP_DIGIMON, as: "victim" }], security: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.perm("ogudomon").stack.map((card) => card.instanceId)).toEqual([s.inst("onlySource").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[1]!.battleArea.some((perm) => perm.permanentId === s.perm("victim").permanentId)).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("still trashes 7 security cards when the one chosen deletion is prevented (Q3827)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: OGUDOMON, as: "ogudomon", under: SGDL_IDS }] },
        1: {
          battleArea: [{ card: "BT14-062", as: "undeletable" }],
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length <= 1);
    await advance(s.engine).finishAttack();

    expect(s.state.players[1]!.battleArea.map((perm) => perm.permanentId)).toEqual([s.perm("undeletable").permanentId]);
    expect(s.state.players[1]!.security).toHaveLength(0);
  });
});
