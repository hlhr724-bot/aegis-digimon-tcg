import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./deleted-attacker-cannot-redirect.replay.json", import.meta.url), "utf8"),
);

it("does not announce a redirect after the attacker was deleted and another Digimon was played", async () => {
  const events: SequencedServerEvent[] = [];
  const run = await runReplay(record, {
    untilInput: 114,
    onBatch: (_state, batch) => events.push(...batch),
  });
  try {
    expect(
      run.divergences.filter(({ kind }) => kind === "intent-result" || kind === "position" || kind === "threw"),
    ).toEqual([]);
    expect(run.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === "perm-11")).toBe(false);
    const replacement = run.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === "perm-16");
    expect(replacement?.topCard.cardId).toBe("BT26-072");
    const input = record.inputs[114]!;
    if (input.kind !== "intent") {
      throw new Error("Expected the recorded redirect response");
    }
    events.length = 0;
    expect(await run.applyIntent(input.seat, input.intent)).toEqual({ ok: true });
    expect(events.filter((event) => event.kind === "attackDeclared")).toEqual([]);
  } finally {
    await run.applyIntent(0, { type: "surrender" });
  }
});
