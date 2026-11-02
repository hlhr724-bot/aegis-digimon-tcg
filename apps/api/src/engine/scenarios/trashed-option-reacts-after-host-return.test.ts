import { readFileSync } from "node:fs";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/trashed-option-reacts-after-host-return.fixture";
import "#api/cards/index";

describe("Trashed Option reacts after its former host returns to the deck", () => {
  it.each([false, true])(
    "resolves Der Blitz after Slayerdramon finishes with return accepted: %s",
    async (acceptReturn) => {
      const s = setupScenario(fixture, {
        autoAcceptOptional: acceptReturn,
        autoDeclineOptional: !acceptReturn,
        autoSelectCards: true,
        autoChooseOption: true,
      });
      await s.ready();
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      try {
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            instanceId: s.inst("slayer").instanceId,
            permanentId: s.perm("slayer-base").permanentId,
          }),
        ).toEqual({ ok: true });
        await settle(
          () =>
            s.state.players[1]!.trash.some(({ cardId }) => cardId === "EX7-070") &&
            s.state.pendingDecision === undefined,
        );
        expect(s.perm("slayer-base").topCard.cardId).toBe("BT1-038");
        expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX13-024")).toBe(true);
        expect(s.state.players[1]!.battleArea).toHaveLength(acceptReturn ? 0 : 1);
        expect(s.state.pendingDecision).toBeUndefined();
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
});

it("offers Der Blitz after the recorded Slayerdramon returns both source hosts", async () => {
  const record = JSON.parse(
    readFileSync(new URL("./trashed-option-reacts-after-host-return.replay.json", import.meta.url), "utf8"),
  ) as ReplayRecord;
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.pendingRequest).toMatchObject({ kind: "chooseTargets", seat: 0, sourceCardId: "EX7-070" });
    expect(replay.state.players[0]!.battleArea.every(({ topCard }) => topCard.cardId === "BT25-092")).toBe(true);
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: replay.pendingRequest!.decisionId,
        response: { kind: "chooseTargets", instanceIds: ["perm-23"] },
      }),
    ).toEqual({ ok: true });
    expect(
      replay.state.players[1]!.battleArea.find(({ permanentId }) => permanentId === "perm-23")?.topCard.cardId,
    ).not.toBe("EX13-024");
    expect(replay.state.players[1]!.trash.some(({ instanceId }) => instanceId === "s1-36")).toBe(true);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
