import "../../cards/index.js";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../testkit/harness.js";

const watchedCardIds = ["BT24-035", "BT25-011", "EX12-060"];

describe("rule-check replacement play waits for the turn player's simultaneous triggers", () => {
  it("resolves the turn player's pending On Play effects before the On Play of a Digimon a rule-check replacement DNA digivolved", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-041", as: "minervamon" }, "BT24-102"],
          hand: [{ card: "BT26-081", as: "mervamon" }],
          trash: ["BT24-035", "BT25-011"],
        },
        1: {
          battleArea: [
            { card: "EX12-058", as: "hiandromon", under: ["EX12-003", "EX12-055"] },
            { card: "EX12-059", as: "machinedramon" },
          ],
          hand: [{ card: "EX12-060", as: "chaosdramon" }],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 8;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("minervamon").permanentId,
        instanceId: s.inst("mervamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX12-060"));

    expect(
      s.state.players[1]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("chaosdramon").instanceId),
    ).toBe(true);
    expect(
      s.events.flatMap((event) =>
        event.kind === "effectTriggered" && watchedCardIds.includes(event.sourceCardId) ? [event.sourceCardId] : [],
      ),
    ).toEqual(["BT24-035", "BT25-011", "EX12-060"]);
  });
});
