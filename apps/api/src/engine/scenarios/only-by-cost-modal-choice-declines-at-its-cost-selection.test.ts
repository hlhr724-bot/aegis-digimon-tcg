import { describe, expect, it } from "vitest";
import "../../cards/BT19/BT19-090.js";
import { setupEngine, settle } from "../testkit/harness.js";

const SECURITY = ["BT1-009", "BT1-013", "BT1-009"];

async function playMeteorRockSoulWithNoTamer() {
  const s = setupEngine(
    {
      0: {
        hand: [{ card: "BT19-090", as: "option" }],
        battleArea: [
          { card: "BT19-014", as: "ex6", suspended: true },
          { card: "BT19-035", as: "starmon", suspended: true },
          { card: "BT1-013", as: "attacker" },
        ],
        deck: ["BT1-009", "BT1-013", "BT1-009"],
        security: [...SECURITY],
      },
      1: { deck: ["BT1-009", "BT1-013"], security: [...SECURITY] },
    },
    {},
  );
  s.state.memory = 3;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({ ok: true });
  return s;
}

describe("a modal whose only legal choice opens with an optional By cost", () => {
  it("declines at the unsuspend cost selection, so nothing is unsuspended and no attack is declared", async () => {
    const s = await playMeteorRockSoulWithNoTamer();
    await settle(() => s.decisions.at(-1)?.req.kind === "chooseTargets");
    const req = s.decisions.at(-1)!.req;
    expect(req.options).toMatchObject({
      candidateInstanceIds: [s.perm("ex6").permanentId],
      min: 1,
      max: 1,
      purpose: "cost",
      declinesCost: true,
    });
    expect(s.decisions.some((decision) => decision.req.kind === "chooseOption")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.memory === 0);
    expect(s.perm("ex6").isSuspended).toBe(true);
    expect(s.perm("starmon").isSuspended).toBe(true);
    expect(s.perm("attacker").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(SECURITY.length);
  });
});
