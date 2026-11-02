import { describe, expect, it } from "vitest";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { getMatchQueueSelection } from "@/matchmaking/getMatchQueueSelection";

describe("match queue selection", () => {
  it("normalizes casual options the same way the room filters do", () => {
    expect(getMatchQueueSelection({ options: {} })).toEqual({
      queue: "casual",
      format: "standard",
      matchTimer: false,
      bestOf: 1,
      allowRollback: false,
    });
    expect(
      getMatchQueueSelection({ options: { format: "pauper", matchTimer: true, bestOf: 3, allowRollback: true } }),
    ).toEqual({ queue: "casual", format: "pauper", matchTimer: true, bestOf: 3, allowRollback: true });
  });

  it("routes each mode to the queue the client joins", () => {
    expect(getMatchQueueSelection({ options: { unlimited: true } }).queue).toBe("unlimited");
    expect(getMatchQueueSelection({ options: { format: "BT10:unlimited" } }).queue).toBe("unlimited");
    expect(getMatchQueueSelection({ options: { betaBattleMode: true } }).queue).toBe("beta");
    expect(getMatchQueueSelection({ options: { ranked: true } }).queue).toBe("ranked");
    expect(getMatchQueueSelection({ options: { ranked: true, gameMode: GameMode.MANUAL.value } }).queue).toBe("manual");
  });
});
