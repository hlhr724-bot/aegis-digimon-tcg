import { describe, expect, it } from "vitest";
import { getCardArts } from "@aegis/shared/cards/arts";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

const KING = "BT27-042";
const QUEEN = "BT27-069";
const PAWN = "BT27-036";
const KNIGHT = "BT27-039";
const BISHOP = "BT27-041";
const OLD_QUEEN = "BT13-073";
const FALCOMON = "BT27-074";
const OLD_KING = "BT13-045";
const FILLER = "BT1-009";

const kingIn = (seat: 0 | 1, s: ReturnType<typeof setupEngine>) =>
  s.state.players[seat]!.battleArea.find(({ topCard }) => topCard.cardId === KING);

describe("KingChessmon", () => {
  it("offers the Japanese art under the canonical card", () => {
    expect(getCardArts(KING).map((art) => art.artId)).toEqual([KING, `${KING}-J`]);
  });

  it("plays by Assembly for 5 less with Lv.5, Lv.4 and Lv.3 Chessmon cards from the trash", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: KING, as: "king" }],
          trash: [
            { card: BISHOP, as: "lv5" },
            { card: KNIGHT, as: "lv4" },
            { card: PAWN, as: "lv3" },
          ],
        },
        1: {},
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 8;
    const materials = ["lv5", "lv4", "lv3"].map((alias) => s.inst(alias).instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("king").instanceId,
        assembly: { materialInstanceIds: materials },
      }),
    ).toEqual({ ok: true });
    await settle(() => kingIn(0, s) !== undefined && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
    expect(
      kingIn(0, s)!
        .stack.map(({ instanceId }) => instanceId)
        .sort(),
    ).toEqual([...materials].sort());
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it.each([
    ["two Lv.4 cards", [BISHOP, KNIGHT, KNIGHT]],
    ["a DATA SQUAD card without Chessmon in its name", [BISHOP, KNIGHT, FALCOMON]],
  ])("refuses Assembly with %s", async (_label, cards) => {
    const s = setupEngine({
      0: {
        hand: [{ card: KING, as: "king" }],
        trash: cards.map((card, index) => ({ card, as: `material-${index}` })),
      },
      1: {},
    });
    await s.ready();
    s.state.memory = 8;

    const result = s.engine.applyIntent(0, {
      type: "playCard",
      instanceId: s.inst("king").instanceId,
      assembly: { materialInstanceIds: cards.map((_, index) => s.inst(`material-${index}`).instanceId) },
    });

    expect(result.ok).toBe(false);
    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(3);
  });

  it("digivolves from a Lv.5 with [Chessmon] in its name for 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BISHOP, as: "host" }],
          hand: [{ card: KING, as: "king" }],
        },
        1: {},
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("king").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === KING && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
  });

  it.each([
    [true, 2],
    [false, 1],
  ])(
    "When Digivolving may play a play cost 7 Chessmon from hand for free, accepted=%s",
    async (accept, battleAreaSize) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: BISHOP, as: "host" }],
            hand: [
              { card: KING, as: "king" },
              { card: BISHOP, as: "bishop" },
            ],
          },
          1: {},
        },
        { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
      );
      await s.ready();
      s.state.memory = 5;

      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("king").instanceId,
        alternateRequirementIndex: 0,
      });
      await settle(() => s.perm("host").topCard.cardId === KING && s.state.pendingDecision === undefined);

      expect(s.state.players[0]!.battleArea).toHaveLength(battleAreaSize);
      expect(s.state.memory).toBe(2);
    },
  );

  it("On Play does not offer a Chessmon above play cost 7 or a non-Chessmon Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: KING, as: "king" }, { card: OLD_QUEEN }, { card: FILLER }],
        },
        1: {},
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 13;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => kingIn(0, s) !== undefined && s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId).sort()).toEqual([OLD_QUEEN, FILLER].sort());
  });

  it("On Deletion recovers and replays itself to the breeding area by suspending a QueenChessmon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: KING, as: "king" },
            { card: QUEEN, as: "queen" },
          ],
          deck: [{ card: FILLER, as: "recovered" }, FILLER],
          security: [FILLER],
        },
        1: {},
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    const kingInstance = s.perm("king").topCard.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("king").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security[0]!.instanceId).toBe(s.inst("recovered").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.perm("queen").isSuspended).toBe(true);
    expect(s.state.players[0]!.breeding?.topCard.instanceId).toBe(kingInstance);
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === kingInstance)).toBe(false);
  });

  it("On Deletion may decline the replay and leaves the Queen unsuspended", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: KING, as: "king" },
            { card: QUEEN, as: "queen" },
          ],
          deck: [FILLER, FILLER],
        },
        1: {},
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    const kingInstance = s.perm("king").topCard.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("king").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.perm("queen").isSuspended).toBe(false);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === kingInstance)).toBe(true);
  });

  it.each([
    ["no QueenChessmon", [{ card: KNIGHT }]],
    ["only a suspended QueenChessmon", [{ card: QUEEN, suspended: true }]],
  ])("On Deletion stays in the trash with %s", async (_label, others) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: KING, as: "king" }, ...others],
          deck: [FILLER, FILLER],
        },
        1: {},
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    const kingInstance = s.perm("king").topCard.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("king").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === kingInstance)).toBe(true);
  });

  it("On Deletion cannot replay into an occupied breeding area", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: KING, as: "king" },
            { card: QUEEN, as: "queen" },
            { card: PAWN, as: "egg" },
          ],
          deck: [FILLER, FILLER],
        },
        1: {},
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    expect(await advance(s.engine).verb.moveToBreeding(s.perm("egg").permanentId)).toBe(true);
    const kingInstance = s.perm("king").topCard.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("king").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.breeding?.topCard.cardId).toBe(PAWN);
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === kingInstance)).toBe(true);
  });

  describe("Assembly on the breeding-area replay (CR 7-3-2-10, Q2674)", () => {
    const replayBoard = () =>
      setupEngine(
        {
          0: {
            battleArea: [
              { card: KING, as: "king" },
              { card: QUEEN, as: "queen" },
            ],
            deck: [FILLER, FILLER],
            trash: [
              { card: PAWN, as: "lv3" },
              { card: FALCOMON, as: "squadOnly" },
              { card: BISHOP, as: "lv5" },
              { card: OLD_KING, as: "lv6" },
              { card: KNIGHT, as: "lv4" },
            ],
          },
          1: {},
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );

    const assemblyRequest = (s: ReturnType<typeof setupEngine>) =>
      s.decisions.find(({ req }) => req.kind === "selectCards" && req.options?.assemblyCardId === KING)?.req;

    it("places one Lv.5, Lv.4 and Lv.3 Chessmon from the trash under King without changing memory", async () => {
      const s = replayBoard();
      await s.ready();
      s.state.memory = 2;
      const kingInstance = s.perm("king").topCard.instanceId;
      const materials = ["lv5", "lv4", "lv3"].map((alias) => s.inst(alias).instanceId);

      await advance(s.engine).verb.deletePermanent([s.perm("king").permanentId]);
      await settle(() => s.state.pendingDecision === undefined);

      expect([...(assemblyRequest(s)?.options?.candidateInstanceIds ?? [])].sort()).toEqual([...materials].sort());
      const breeding = s.state.players[0]!.breeding;
      expect(breeding?.topCard.instanceId).toBe(kingInstance);
      expect(breeding?.stack.map(({ instanceId }) => instanceId)).toEqual([...materials].reverse());
      expect(s.state.players[0]!.trash.some(({ instanceId }) => materials.includes(instanceId))).toBe(false);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId).sort()).toEqual([FALCOMON, OLD_KING].sort());
      expect(s.perm("queen").isSuspended).toBe(true);
      expect(s.state.memory).toBe(2);
    });

    it("may decline the Assembly and replays King with no digivolution cards", async () => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: KING, as: "king" },
              { card: QUEEN, as: "queen" },
            ],
            deck: [FILLER, FILLER],
            trash: [
              { card: BISHOP, as: "lv5" },
              { card: KNIGHT, as: "lv4" },
              { card: PAWN, as: "lv3" },
            ],
          },
          1: {},
        },
        { autoAcceptOptional: true },
      );
      await s.ready();
      const kingInstance = s.perm("king").topCard.instanceId;

      const deletion = advance(s.engine).verb.deletePermanent([s.perm("king").permanentId]);
      let answered = 0;
      while (answered < 5) {
        await settle(() => s.state.pendingDecision !== undefined || s.state.players[0]!.breeding !== undefined);
        const request = s.state.pendingDecision;
        if (request === undefined) break;
        const candidates = request.options?.candidateInstanceIds ?? [];
        const instanceIds = request.options?.assemblyCardId === KING ? [] : candidates.slice(0, 1);
        const kind = request.kind === "selectCards" ? "selectCards" : "chooseTargets";
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind, instanceIds },
        });
        answered += 1;
      }
      await deletion;
      await settle(() => s.state.pendingDecision === undefined);

      expect(assemblyRequest(s)?.options?.min).toBe(0);
      expect(s.state.players[0]!.breeding?.topCard.instanceId).toBe(kingInstance);
      expect(s.state.players[0]!.breeding?.stack).toHaveLength(0);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId).sort()).toEqual([BISHOP, KNIGHT, PAWN].sort());
    });
  });
});
