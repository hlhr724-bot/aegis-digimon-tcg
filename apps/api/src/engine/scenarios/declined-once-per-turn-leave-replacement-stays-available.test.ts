import { describe, expect, it } from "vitest";
import "../../cards/EX12/EX12-034.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../testkit/harness.js";

async function answerErlangmon(s: EngineSetup, accept: boolean): Promise<void> {
  await settle(
    () => s.state.pendingDecision?.kind === "optional" && s.decisions.at(-1)?.req.sourceCardId === "EX12-034",
  );
  const decision = s.decisions.at(-1)!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.req.decisionId,
      response: { kind: "optional", accept },
    }),
  ).toEqual({ ok: true });
}

describe("declined once-per-turn leave replacement", () => {
  it("offers Erlangmon's leave play again after the player declined it earlier that turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-034", as: "erlangmon" },
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
          ],
          hand: [{ card: "EX12-039", as: "sw" }],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    const firstDeletion = advance(s.engine).verb.deletePermanent([s.perm("first").permanentId], "byEffect");
    await answerErlangmon(s, false);
    expect(await firstDeletion).toBe(1);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX12-039"]);

    const secondDeletion = advance(s.engine).verb.deletePermanent([s.perm("second").permanentId], "byEffect");
    await answerErlangmon(s, true);
    expect(await secondDeletion).toBe(1);
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX12-039"),
    );

    expect(s.state.players[0]!.hand).toHaveLength(0);
  });
});
