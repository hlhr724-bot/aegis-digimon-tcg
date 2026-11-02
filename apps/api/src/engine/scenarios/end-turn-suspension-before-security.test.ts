import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/end-turn-suspension-before-security.fixture";

const record = JSON.parse(
  readFileSync(new URL("./end-turn-suspension-before-security.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("End-turn suspension before security effects", () => {
  it.each([true, false])(
    "finishes the suspension reaction before security play with an existing target=%s",
    async (hasTarget) => {
      const board = structuredClone(fixture);
      if (hasTarget) {
        board.board[1]!.battleArea = [{ card: "BT1-010", as: "target" }];
      }
      const s = setupScenario(board, { autoAcceptOptional: true, autoSelectCards: true });
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(0);
        advance(s.engine).endMainPhaseIfOpen(0);
        await settle(() => s.state.turnSeat === 1);
        expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX11-041"]);
        expect(s.state.players[1]!.trash.some((card) => card.cardId === "BT1-010")).toBe(hasTarget);
        expect(s.state.players[1]!.trash.some((card) => card.cardId === "EX11-041")).toBe(false);
        expect(s.state.players[0]!.hand).toHaveLength(2);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );

  it("resolves Craniamon's derived reaction before playing Oblivimon from security", async () => {
    const replay = await runReplay(record, { untilInput: 32 });
    try {
      expect(replay.divergences).toEqual([]);
      expect(
        await replay.applyIntent(1, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      expect(replay.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX11-041")).toBe(
        true,
      );
      expect(replay.state.players[0]!.trash.some((card) => card.cardId === "EX11-041")).toBe(false);
      expect(replay.state.turnCount).toBe(6);
      expect(replay.state.turnSeat).toBe(0);
      expect(replay.state.pendingDecision?.seat).toBe(0);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
