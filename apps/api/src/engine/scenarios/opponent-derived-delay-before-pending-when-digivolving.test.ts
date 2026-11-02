import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(
    new URL("./opponent-derived-delay-before-pending-when-digivolving.replay.json", import.meta.url),
    "utf8",
  ),
) as ReplayRecord;

const firstWhenDigivolvingKey = "AD1-008/ir-shared-0";
const pendingWhenDigivolvingKey = "AD1-008/ir-7-0";
const derivedWhenDigivolvingKey = "EX13-020/ir-shared-buff";

function eventIndex(
  events: readonly ServerEvent[],
  kind: ServerEvent["kind"],
  matches: (effectKey: string) => boolean,
): number {
  return events.findIndex(
    (event) =>
      event.kind === kind && "effectKey" in event && typeof event.effectKey === "string" && matches(event.effectKey),
  );
}

describe("Opponent trigger derived from the turn player's first [When Digivolving]", () => {
  it("activates the opponent's Delay and its derived [When Digivolving] before the second pending [When Digivolving]", async () => {
    const allEvents: ServerEvent[] = [];
    const replay = await runReplay(record, {
      untilInput: record.inputs.length - 1,
      onBatch: (_state, batch) => allEvents.push(...batch),
    });
    try {
      expect(replay.divergences).toEqual([]);
      const firstTriggered = eventIndex(allEvents, "effectTriggered", (key) => key === firstWhenDigivolvingKey);
      expect(firstTriggered).toBeGreaterThanOrEqual(0);
      const events = allEvents.slice(firstTriggered);

      const firstResolved = eventIndex(events, "effectResolved", (key) => key === firstWhenDigivolvingKey);
      const armorPurge = events.findIndex(
        (event) => event.kind === "deletionPrevented" && event.keyword === "Armor Purge",
      );
      const delayTriggered = eventIndex(events, "effectTriggered", (key) => key.includes("whenDigimonTopTrashed"));
      const armorDigivolved = events.findIndex(
        (event) => event.kind === "digivolved" && event.seat === 1 && event.cardId === "EX13-020",
      );
      const derivedResolved = eventIndex(events, "effectResolved", (key) => key === derivedWhenDigivolvingKey);
      const pendingTriggered = eventIndex(events, "effectTriggered", (key) => key === pendingWhenDigivolvingKey);

      expect(armorPurge).toBeGreaterThanOrEqual(0);
      expect(firstResolved).toBeGreaterThan(armorPurge);
      expect(delayTriggered).toBeGreaterThan(firstResolved);
      expect(armorDigivolved).toBeGreaterThan(delayTriggered);
      expect(derivedResolved).toBeGreaterThan(armorDigivolved);
      expect(pendingTriggered).toBeGreaterThan(derivedResolved);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
