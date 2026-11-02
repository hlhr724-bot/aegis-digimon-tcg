import "#api/cards/index";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/revealed-dual-option-uses-option-side.fixture";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./revealed-dual-option-uses-option-side.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Revealed DUAL cards use their Option side", () => {
  it("uses the selected Gundramon without offering an illegal play destination", async () => {
    const replay = await runReplay(record, { untilInput: 51 });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.state.pendingDecision?.kind).toBe("selectCards");
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: ["s0-49"] },
        }),
      ).toEqual({ ok: true });
      expect(JSON.parse(replay.state.pendingDecision!.payloadJson)).not.toMatchObject({
        choices: ["play", "useOption"],
      });
      expect(replay.state.players[0]!.hand.some(({ instanceId }) => instanceId === "s0-49")).toBe(false);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});

it("resolves the revealed Option for free and leaves no card in hand or pending decision", async () => {
  const s = setupScenario(fixture, {
    autoSelectCards: true,
    autoChooseOption: true,
    autoDeclineOptional: true,
    declinePrompts: ["Arts Digivolve"],
  });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("gundramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
    expect(s.perm("opponent").topCard.cardId).toBe("BT1-009");
    expect(s.state.memory).toBe(6);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(
      s.inst("revealedOption").instanceId,
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("revealedOption").instanceId,
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.decisions.some(({ req }) => req.kind === "chooseOption" && req.options?.choices?.includes("play"))).toBe(
      false,
    );
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
