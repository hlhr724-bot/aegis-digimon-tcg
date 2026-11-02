import "../../cards/index.js";
import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

describe("player-wide stacked-card trash lock covers a new Digimon at once", () => {
  it("locks a Digimon DNA digivolved during the opponent's turn before the turn player's pending effects resolve", async () => {
    const chaosdramonLockedWhenTurnPlayerResolves: boolean[] = [];
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
          hand: ["EX12-055", { card: "EX12-060", as: "chaosdramon" }],
          trash: ["EX12-055"],
        },
      },
      {
        autoSelectCards: true,
        autoAcceptOptional: true,
        onEvent: (event) => {
          if (event.kind !== "effectTriggered" || event.sourceCardId !== "BT24-035") return;
          const chaosdramon = s.state.players[1]!.battleArea.find(
            ({ topCard }) => topCard.instanceId === s.inst("chaosdramon").instanceId,
          );
          if (chaosdramon === undefined) return;
          chaosdramonLockedWhenTurnPlayerResolves.push(
            advance(s.engine).ledgers.continuous.stackTrashLocked(chaosdramon.permanentId),
          );
        },
      },
    );
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("machinedramon"));
    await settle(() => s.perm("machinedramon").stack.length === 2);
    s.state.memory = 8;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("minervamon").permanentId,
        instanceId: s.inst("mervamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => chaosdramonLockedWhenTurnPlayerResolves.length > 0);

    expect(chaosdramonLockedWhenTurnPlayerResolves).toEqual([true]);
    expect(advance(s.engine).ledgers.continuous.stackTrashLocked(s.perm("minervamon").permanentId)).toBe(false);
  });
});
