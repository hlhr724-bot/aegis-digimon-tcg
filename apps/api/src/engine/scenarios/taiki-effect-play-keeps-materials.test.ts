import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./taiki-effect-play-keeps-materials.replay.json", import.meta.url), "utf8"),
);

it("uses every selected under-Tamer material after paying Taiki's replacement cost", async () => {
  const run = await runReplay(record, { untilInput: 146 });
  try {
    expect(run.divergences).toEqual([]);
    const input = record.inputs[146]!;
    if (input.kind !== "intent") throw new Error("Expected the material selection response");
    expect(await run.applyIntent(input.seat, input.intent)).toEqual({ ok: true });
    const player = run.state.players[1]!;
    expect(player.battleArea.find((permanent) => permanent.permanentId === "perm-8")?.isSuspended).toBe(true);
    const played = player.battleArea.find((permanent) => permanent.permanentId === "perm-25");
    expect(played?.topCard.cardId).toBe("BT19-014");
    expect(played?.stack.map((card) => card.instanceId).sort()).toEqual(["s1-10", "s1-15", "s1-24", "s1-29"]);
  } finally {
    await run.applyIntent(0, { type: "surrender" });
  }
});
