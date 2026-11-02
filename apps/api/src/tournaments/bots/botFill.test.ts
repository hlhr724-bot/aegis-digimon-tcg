import { describe, expect, it } from "vitest";
import { BOT_PROFILE_NAMES } from "../../bot/profiles.js";
import { BOT_DISPLAY_NAMES, planBotFill, type BotFillInput } from "./botFill.js";

const DECKS = [
  { deckVersion: "red@1", name: "Red" },
  { deckVersion: "blue@1", name: "Blue" },
];

function input(overrides: Partial<BotFillInput> = {}): BotFillInput {
  return {
    allowBots: true,
    confirmedHumans: 5,
    maxPlayers: 8,
    decks: DECKS,
    seed: "seed-1",
    ...overrides,
  };
}

describe("deciding whether to fill", () => {
  it("completes a five-person field to eight with three bots", () => {
    const plan = planBotFill(input());
    expect(plan).toMatchObject({ kind: "fill", targetSize: 8 });
    expect(plan.kind === "fill" && plan.bots).toHaveLength(3);
  });

  it("adds nothing when the field is already a power of two", () => {
    expect(planBotFill(input({ confirmedHumans: 4 }))).toEqual({ kind: "none", reason: "field_already_full" });
    expect(planBotFill(input({ confirmedHumans: 8 }))).toEqual({ kind: "none", reason: "field_already_full" });
  });

  it("refuses to fill when the tournament forbids bots", () => {
    expect(planBotFill(input({ allowBots: false }))).toEqual({ kind: "none", reason: "bots_not_allowed" });
  });

  it("cancels rather than running an event below the minimum", () => {
    expect(planBotFill(input({ confirmedHumans: 1 }))).toEqual({ kind: "cancel", reason: "below_minimum" });
    expect(planBotFill(input({ confirmedHumans: 0 }))).toEqual({ kind: "cancel", reason: "below_minimum" });
  });

  it("cancels below the minimum before it even considers whether bots are allowed", () => {
    expect(planBotFill(input({ confirmedHumans: 1, allowBots: false }))).toEqual({
      kind: "cancel",
      reason: "below_minimum",
    });
  });

  it("seats nobody when no legal deck exists for the block", () => {
    expect(planBotFill(input({ decks: [] }))).toEqual({ kind: "none", reason: "no_legal_bot_deck" });
  });

  it("never exceeds the advertised capacity", () => {
    // Six seats advertised: the largest bracket that fits is four, which the field already fills.
    expect(planBotFill(input({ confirmedHumans: 4, maxPlayers: 6 }))).toEqual({
      kind: "none",
      reason: "field_already_full",
    });
    expect(planBotFill(input({ confirmedHumans: 3, maxPlayers: 6 }))).toMatchObject({ kind: "fill", targetSize: 4 });
  });

  it("adds one bot to an odd field", () => {
    const plan = planBotFill(input({ confirmedHumans: 3 }));
    expect(plan.kind === "fill" && plan.bots).toHaveLength(1);
  });
});

describe("who gets seated", () => {
  it("is reproducible for one tournament and different across tournaments", () => {
    const names = (seed: string) => {
      const plan = planBotFill(input({ seed }));
      return plan.kind === "fill" ? plan.bots.map((bot) => bot.displayName) : [];
    };
    expect(names("seed-1")).toEqual(names("seed-1"));
    expect(names("seed-1")).not.toEqual(names("seed-2"));
  });

  it("gives every bot a distinct name, a known profile and a shipped deck", () => {
    const plan = planBotFill(input({ confirmedHumans: 5 }));
    if (plan.kind !== "fill") throw new Error("expected a fill");
    expect(new Set(plan.bots.map((bot) => bot.displayName)).size).toBe(plan.bots.length);
    for (const bot of plan.bots) {
      expect(BOT_DISPLAY_NAMES).toContain(bot.displayName);
      expect(BOT_PROFILE_NAMES).toContain(bot.profile);
      expect(DECKS.map((deck) => deck.deckVersion)).toContain(bot.deckVersion);
    }
  });

  it("rotates profiles rather than fielding one personality", () => {
    const plan = planBotFill(input({ confirmedHumans: 5, maxPlayers: 8 }));
    if (plan.kind !== "fill") throw new Error("expected a fill");
    expect(plan.bots).toHaveLength(3);
    expect(new Set(plan.bots.map((bot) => bot.profile)).size).toBe(3);
  });
});

describe("random bot styles", () => {
  it("draws each bot's style from the random source when the event asks for it", () => {
    const draws = [0.99, 0, 0.5];
    const plan = planBotFill(input({ randomStyles: true, drawStyle: () => draws.shift() ?? 0 }));
    const lastIndex = BOT_PROFILE_NAMES.length - 1;
    expect(plan.kind === "fill" && plan.bots.map((bot) => bot.profile)).toEqual([
      BOT_PROFILE_NAMES[lastIndex],
      BOT_PROFILE_NAMES[0],
      BOT_PROFILE_NAMES[Math.floor(0.5 * BOT_PROFILE_NAMES.length)],
    ]);
  });

  it("keeps the reproducible rotation when random styles are off", () => {
    const plan = planBotFill(input({ randomStyles: false, drawStyle: () => 0 }));
    expect(plan).toEqual(planBotFill(input()));
  });
});
