import { describe, expect, it } from "vitest";
import { parseBotExperiment } from "#api/bot/experiment/parseBotExperiment";

describe("bot experiment configuration", () => {
  it("accepts known arms with integer weights that sum to 100", () => {
    expect(parseBotExperiment({ id: "bot-ab-2026-10", arms: { certified: 80, humanPanelPlanner: 20 } })).toEqual({
      id: "bot-ab-2026-10",
      arms: [
        { arm: "certified", weight: 80 },
        { arm: "humanPanelPlanner", weight: 20 },
      ],
    });
    expect(parseBotExperiment({ id: "all-legacy", arms: { legacy: 100 } }).arms).toEqual([
      { arm: "legacy", weight: 100 },
    ]);
  });

  it.each([
    ["a non-object", "certified", "JSON object"],
    ["an array", [], "JSON object"],
    ["an unknown field", { id: "bot-ab", arms: { certified: 100 }, extra: true }, "Unknown bot experiment fields"],
    ["a missing id", { arms: { certified: 100 } }, "id must be"],
    ["an uppercase id", { id: "Bot-AB", arms: { certified: 100 } }, "id must be"],
    ["a short id", { id: "ab", arms: { certified: 100 } }, "id must be"],
    ["missing arms", { id: "bot-ab" }, "arms must be an object"],
    ["an arms array", { id: "bot-ab", arms: [["certified", 100]] }, "arms must be an object"],
    ["an unknown arm", { id: "bot-ab", arms: { certified: 50, champion: 50 } }, "Unknown bot experiment arm: champion"],
    [
      "an inherited property name",
      { id: "bot-ab", arms: { certified: 50, constructor: 50 } },
      "Unknown bot experiment arm",
    ],
    ["a fractional weight", { id: "bot-ab", arms: { certified: 50.5, legacy: 49.5 } }, "integer weight"],
    ["a zero weight", { id: "bot-ab", arms: { certified: 100, legacy: 0 } }, "integer weight"],
    ["a string weight", { id: "bot-ab", arms: { certified: "100" } }, "integer weight"],
    ["weights below 100", { id: "bot-ab", arms: { certified: 60, legacy: 30 } }, "sum to 100, not 90"],
    ["weights above 100", { id: "bot-ab", arms: { certified: 60, legacy: 50 } }, "sum to 100, not 110"],
  ])("rejects %s", (_case, value, message) => {
    expect(() => parseBotExperiment(value)).toThrow(message);
  });
});
