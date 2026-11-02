import { readFileSync } from "node:fs";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import "#api/cards/index";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/discarded-inherited-draw-after-host-return.fixture";

it("draws from the discarded inherited source after Zudomon returns its former host", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  await s.ready();
  s.state.phase = Phase.Main;
  expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("zudomon").instanceId })).toEqual({ ok: true });
  await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
  expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("EX10-045");
  expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
    expect.arrayContaining([s.inst("host").instanceId, s.inst("drawn").instanceId]),
  );
  expect(s.state.players[0]!.battleArea).toHaveLength(0);
});

it.each(["BT10-073", "BT10-075", "BT10-076", "BT10-077", "BT11-077", "BT11-081", "BT11-082"])(
  "resolves %s memory after the opponent trashes it and returns its host",
  async (sourceCard) => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            battleArea: [{ card: "BT11-081", as: "host", under: [{ card: sourceCard, as: "source" }] }],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.phase = Phase.Main;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("zudomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain(sourceCard);
    expect(s.state.memory).toBe(5);
  },
);

it.each(["EX10-039", "EX10-044", "EX10-045"])(
  "checks %s original Bagra host even after it is returned",
  async (sourceCard) => {
    for (const hostCard of ["BT11-081", "BT1-010"]) {
      const s = setupScenario(
        {
          ...fixture,
          board: {
            ...fixture.board,
            0: {
              ...fixture.board[0],
              battleArea: [{ card: hostCard, as: "host", under: [{ card: sourceCard, as: "source" }] }],
            },
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      s.state.phase = Phase.Main;
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("zudomon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
      expect(s.state.players[0]!.battleArea).toHaveLength(0);
      expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("drawn").instanceId)).toBe(
        hostCard === "BT11-081",
      );
    }
  },
);

it("preserves the pending Tuwarmon draw after the recorded Zudomon return", async () => {
  const record = JSON.parse(
    readFileSync(new URL("./discarded-inherited-draw-after-host-return.replay.json", import.meta.url), "utf8"),
  ) as ReplayRecord;
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.state.pendingDecision).toMatchObject({ kind: "chooseTargets", seat: 1 });
    const drawnIds = replay.state.players[0]!.deck.slice(0, 2).map((card) => card.instanceId);
    const host = replay.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === "perm-3")!;
    expect(host.topCard.cardId).toBe("BT11-081");
    expect(
      replay.state.players[0]!.trash.some((card) => card.instanceId === "s0-17" && card.cardId === "EX10-045"),
    ).toBe(true);
    expect(
      await replay.applyIntent(1, {
        type: "respondDecision",
        decisionId: replay.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: ["perm-3"] },
      }),
    ).toEqual({ ok: true });
    expect(replay.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(expect.arrayContaining(drawnIds));
    expect(replay.state.players[0]!.hand.some((card) => card.instanceId === host.topCard.instanceId)).toBe(true);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
