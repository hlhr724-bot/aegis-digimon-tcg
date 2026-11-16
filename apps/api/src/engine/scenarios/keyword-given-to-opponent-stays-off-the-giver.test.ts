import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./keyword-given-to-opponent-stays-off-the-giver.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;
const afterCollisionWasGiven = 37;

describe("Keyword given to an opponent stays off the giver", () => {
  it("gives Collision to the chosen opposing Digimon and leaves MetalGreymon without it", async () => {
    const replay = await runReplay(record, { untilInput: afterCollisionWasGiven });
    try {
      expect(replay.divergences).toEqual([]);
      const metalGreymon = replay.state.players[1]!.battleArea.find(
        (permanent) => permanent.topCard.cardId === "EX10-008",
      )!;
      const seadramon = replay.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "P-098")!;
      const untouchedOpposingDigimon = replay.state.players[0]!.battleArea.find(
        (permanent) => permanent.topCard.cardId === "EX12-031",
      )!;

      expect([...seadramon.keywords]).toContain("Collision");
      expect([...seadramon.grantedEffectTexts]).toEqual(["[Start of Your Main Phase] This Digimon attacks."]);
      expect([...untouchedOpposingDigimon.keywords]).not.toContain("Collision");
      expect([...metalGreymon.keywords]).toEqual(["Reboot"]);
      expect(replay.state.turnSeat).toBe(0);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
