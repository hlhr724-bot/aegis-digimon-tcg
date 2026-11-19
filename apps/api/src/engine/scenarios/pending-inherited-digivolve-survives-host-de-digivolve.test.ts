import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(
    new URL("./pending-inherited-digivolve-survives-host-de-digivolve.replay.json", import.meta.url),
    "utf8",
  ),
) as ReplayRecord;

const pagumonInstancePrefix = "s0-3e8f9fa1";
const hostPermanentId = "perm-3";
const afterGreymonDeDigivolveInput = 88;

describe("pending inherited Pagumon digivolve after its placed card leaves", () => {
  it("still offers the digivolve once the placed card is trashed and the host is de-digivolved", async () => {
    const run = await runReplay(record, { untilInput: afterGreymonDeDigivolveInput });

    expect(run.divergences).toEqual([]);
    const host = run.state.players[0]!.battleArea.find(({ permanentId }) => permanentId === hostPermanentId)!;
    expect(host.stack.some(({ instanceId }) => instanceId.startsWith(pagumonInstancePrefix))).toBe(true);
    expect(run.state.turnSeat).toBe(0);
    expect(run.state.pendingDecision).toMatchObject({ seat: 0 });
    expect(run.state.pendingDecision!.payloadJson).toContain("BT25-005");
  });
});
