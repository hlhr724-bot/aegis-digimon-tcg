import { describe, expect, it } from "vitest";
import "../../cards/AD1/AD1-001.js";
import "../../cards/AD1/AD1-010.js";
import "../../cards/EX13/EX13-077.js";
import "../../cards/ST20/ST20-07.js";
import { setupEngine, settle } from "../testkit/harness.js";

const OPPONENT_TRASH = Array.from({ length: 10 }, () => "BT1-009");
const COLOR_ACTIVATION_CLAUSE = "Then, for every 2 of your Digimon and Tamers' colors, activate 1 effect below:";
const RECOVERY_CHOICE = 0;

type Engine = ReturnType<typeof setupEngine>;

const answeredBy = new WeakMap<Engine, Set<string>>();

async function respondToNext(s: Engine, kind: string, respond: (req: Engine["decisions"][number]["req"]) => unknown) {
  const answered = answeredBy.get(s) ?? new Set<string>();
  answeredBy.set(s, answered);
  await settle(() => {
    const last = s.decisions.at(-1)?.req;
    return last?.kind === kind && !answered.has(last.decisionId);
  });
  const req = s.decisions.at(-1)!.req;
  answered.add(req.decisionId);
  expect(
    s.engine.applyIntent(0, { type: "respondDecision", decisionId: req.decisionId, response: respond(req) as never }),
  ).toEqual({ ok: true });
  return req;
}

async function playMercifulWithFourColorsAndNoBattleTarget() {
  const s = setupEngine(
    {
      0: {
        hand: [{ card: "EX13-077", as: "merciful" }],
        battleArea: [{ card: "AD1-001" }, { card: "AD1-010" }, { card: "ST20-07" }],
        deck: ["BT1-012", "BT1-013", "BT1-014"],
        security: ["BT1-090"],
      },
      1: { deck: ["BT1-013"], security: ["BT1-014"], trash: OPPONENT_TRASH },
    },
    {},
  );
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
    ok: true,
  });
  await respondToNext(s, "optional", () => ({ kind: "optional", accept: false }));
  return s;
}

async function chooseRecovery(s: Engine, activationIndex: number) {
  const req = await respondToNext(s, "chooseOption", () => ({ kind: "chooseOption", optionIndex: RECOVERY_CHOICE }));
  expect(req.options?.choices).toEqual(["Recovery +1"]);
  expect(req.options).toMatchObject({
    effectTextEmphasis: COLOR_ACTIVATION_CLAUSE,
    activation: { index: activationIndex, total: 2 },
  });
}

async function answerRecoveryCost(s: Engine, pays: boolean) {
  const req = await respondToNext(s, "selectCards", (request) => ({
    kind: "selectCards",
    instanceIds: pays ? (request.options?.candidateInstanceIds ?? []).slice(0, 5) : [],
  }));
  expect(req.options).toMatchObject({ min: 5, max: 5, purpose: "cost", declinesCost: true });
}

describe("a scaled modal choice with an optional By cost", () => {
  it("declines one activation at its cost selection, and the next activation still resolves", async () => {
    const s = await playMercifulWithFourColorsAndNoBattleTarget();
    await chooseRecovery(s, 1);
    await answerRecoveryCost(s, false);
    await chooseRecovery(s, 2);
    expect(s.state.players[1]!.trash).toHaveLength(10);
    expect(s.state.players[0]!.security).toHaveLength(1);
    await answerRecoveryCost(s, true);
    await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.trash.length === 5);
    expect(s.state.players[1]!.deck).toHaveLength(6);
    expect(s.state.players[0]!.security).toHaveLength(2);
  });

  it("pays nothing and recovers nothing when every cost selection is declined", async () => {
    const s = await playMercifulWithFourColorsAndNoBattleTarget();
    await chooseRecovery(s, 1);
    await answerRecoveryCost(s, false);
    await chooseRecovery(s, 2);
    await answerRecoveryCost(s, false);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.trash).toHaveLength(10);
    expect(s.state.players[1]!.deck).toHaveLength(1);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });
});
