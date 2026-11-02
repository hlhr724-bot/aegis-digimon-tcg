import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./simultaneous-end-turn-attack.replay.json", import.meta.url), "utf8"),
);

describe("Simultaneous end turn attack", () => {
  it("resolves pending Engage before Counter without declaring a second attack during Homeros's attack", async () => {
    const events: SequencedServerEvent[] = [];
    const run = await runReplay(record, {
      onBatch(_state, batch) {
        events.push(...batch);
      },
    });
    expect(run.divergences).toEqual([]);
    expect(run.pendingRequest?.sourceCardId).toBe("BT26-033");
    expect(run.pendingRequest?.promptText).toContain("Another attack cannot start");
    const declarations = events.filter((event) => event.kind === "attackDeclared").length;
    const attackEnds = events.filter((event) => event.kind === "attackEnded").length;
    expect(declarations).toBe(attackEnds + 1);
    expect(
      await run.applyIntent(0, {
        type: "respondDecision",
        decisionId: run.pendingRequest!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    expect(events.filter((event) => event.kind === "attackDeclared")).toHaveLength(declarations);
    expect(events.filter((event) => event.kind === "attackEnded")).toHaveLength(declarations);
    expect(run.state.pendingDecision).toBeUndefined();
  });
});
