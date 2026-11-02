import { describe, expect, it } from "vitest";
import { getCardArts } from "@aegis/shared/cards/arts";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

const QUEEN = "BT27-069";
const PAWN = "BT27-036";
const KNIGHT = "BT27-039";
const BISHOP = "BT27-041";
const OLD_KNIGHT = "BT13-068";
const OLD_QUEEN = "BT13-073";
const FILLER = "BT1-009";
const ARMADILLOMON = "BT1-027";
const TAMER = "BT12-092";

const queenIn = (s: ReturnType<typeof setupEngine>) =>
  s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === QUEEN);

describe("QueenChessmon", () => {
  it("offers the Japanese art under the canonical card", () => {
    expect(getCardArts(QUEEN).map((art) => art.artId)).toEqual([QUEEN, `${QUEEN}-J`]);
  });

  it("plays by Assembly for 5 less and De-Digivolves an opponent's Digimon by 3 on play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: QUEEN, as: "queen" }],
          trash: [
            { card: BISHOP, as: "lv5" },
            { card: OLD_KNIGHT, as: "lv4" },
            { card: PAWN, as: "lv3" },
          ],
        },
        1: { battleArea: [{ card: OLD_QUEEN, under: [PAWN, KNIGHT, BISHOP], as: "target" }] },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 7;
    const materials = ["lv5", "lv4", "lv3"].map((alias) => s.inst(alias).instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("queen").instanceId,
        assembly: { materialInstanceIds: materials },
      }),
    ).toEqual({ ok: true });
    await settle(() => queenIn(s) !== undefined && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
    expect(
      queenIn(s)!
        .stack.map(({ instanceId }) => instanceId)
        .sort(),
    ).toEqual([...materials].sort());
    expect(
      s.decisions.find(({ req }) => req.kind === "chooseOption" && req.sourceCardId === QUEEN)?.req.options?.choices,
    ).toEqual(["3 cards", "2 cards", "1 card"]);
    expect(s.perm("target").topCard.cardId).toBe(PAWN);
    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId).sort()).toEqual([BISHOP, KNIGHT, OLD_QUEEN].sort());
  });

  it("digivolves from a DATA SQUAD Lv.5 for 3 and De-Digivolves when digivolving", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: BISHOP, as: "host" }], hand: [{ card: QUEEN, as: "queen" }] },
        1: { battleArea: [{ card: KNIGHT, under: [PAWN], as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("queen").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === QUEEN && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
    expect(s.perm("target").topCard.cardId).toBe(PAWN);
  });

  it("has Rush and Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: QUEEN, as: "queen" }] }, 1: {} });
    await s.ready();

    expect([...s.perm("queen").keywords]).toEqual(expect.arrayContaining(["Rush", "Blocker", "Overclock"]));
  });

  it("attacks an opponent's suspended Digimon the turn it is played", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: QUEEN, as: "queen" }], deck: [FILLER, FILLER, FILLER] },
        1: {
          battleArea: [{ card: OLD_QUEEN, under: [PAWN, KNIGHT, BISHOP], as: "target", suspended: true }],
          security: [TAMER, TAMER],
          deck: [FILLER, FILLER, FILLER],
        },
      },
      { autoSelectCards: true, autoChooseOption: true, autoDeclineOptional: true },
    );
    void s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 15;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("queen").instanceId })).toEqual({ ok: true });
    await settle(() => queenIn(s) !== undefined && s.state.pendingDecision === undefined);
    const targetId = s.perm("target").permanentId;

    expect(s.perm("target").isSuspended).toBe(true);
    expect([...queenIn(s)!.attackablePermanentIds]).toEqual([targetId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: queenIn(s)!.permanentId,
        target: { kind: "permanent", permanentId: targetId },
      }),
    ).toEqual({ ok: true });
  });

  it("Overclock deletes another Chessmon to attack a player without suspending", async () => {
    const s = setupEngine(
      {
        0: {
          deck: [FILLER, FILLER],
          battleArea: [
            { card: QUEEN, as: "queen" },
            { card: PAWN, as: "fodder" },
          ],
        },
        1: { deck: [FILLER, FILLER], security: [TAMER, TAMER, TAMER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const fodderId = s.perm("fodder").permanentId;

    await advance(s.engine).runTurn(0);

    expect(s.events.find((event) => event.kind === "attackDeclared")).toMatchObject({
      attackerPermanentId: s.perm("queen").permanentId,
      target: { kind: "player" },
    });
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === fodderId)).toBe(false);
    expect(s.perm("queen").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("Overclock cannot delete a Digimon without [Chessmon] in its name", async () => {
    const s = setupEngine(
      {
        0: {
          deck: [FILLER, FILLER],
          battleArea: [
            { card: QUEEN, as: "queen" },
            { card: FILLER, as: "bystander" },
          ],
        },
        1: { deck: [FILLER, FILLER], security: [TAMER, TAMER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();

    await advance(s.engine).runTurn(0);

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.perm("bystander")).toBeDefined();
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("deletes the opponent's lowest play cost Digimon when another Chessmon is deleted, once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: QUEEN, as: "queen" },
            { card: PAWN, as: "pawn" },
            { card: KNIGHT, as: "knight" },
          ],
        },
        1: {
          battleArea: [
            { card: BISHOP, as: "bishop" },
            { card: FILLER, as: "cheap" },
            { card: ARMADILLOMON, as: "second" },
          ],
          security: [TAMER, TAMER],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds: [] },
    );
    await s.ready();
    const lowCost = [s.perm("cheap").permanentId, s.perm("second").permanentId];

    await advance(s.engine).verb.deletePermanent([s.perm("pawn").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    const remaining = s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
    expect(remaining).toContain(s.perm("bishop").permanentId);
    expect(lowCost.filter((id) => remaining.includes(id))).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(2);

    await advance(s.engine).verb.deletePermanent([s.perm("knight").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("trashes the opponent's top security card when it has no Digimon to delete", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: QUEEN, as: "queen" },
            { card: PAWN, as: "pawn" },
          ],
        },
        1: { security: [{ card: TAMER, as: "top" }, FILLER] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    const topId = s.inst("top").instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("pawn").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.security.map(({ cardId }) => cardId)).toEqual([FILLER]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(topId);
  });

  it.each([
    ["one of your Digimon without [Chessmon] in its name", 0],
    ["an opponent's Chessmon", 1],
  ] as const)("ignores the deletion of %s", async (_label, victimSeat) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: QUEEN, as: "queen" }, ...(victimSeat === 0 ? [{ card: FILLER, as: "victim" }] : [])],
        },
        1: {
          battleArea: [
            { card: ARMADILLOMON, as: "bystander" },
            ...(victimSeat === 1 ? [{ card: PAWN, as: "victim" }] : []),
          ],
          security: [TAMER],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("victim").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("bystander")).toBeDefined();
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("does not trigger on its own deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: QUEEN, as: "queen" }] },
        1: { battleArea: [{ card: ARMADILLOMON, as: "bystander" }], security: [TAMER] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("queen").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("bystander")).toBeDefined();
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
});
