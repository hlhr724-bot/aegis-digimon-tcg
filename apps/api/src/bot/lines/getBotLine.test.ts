import { describe, expect, it } from "vitest";
import { BotLine } from "@aegis/shared/bot/BotLine";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { getBotLine } from "#api/bot/lines/getBotLine";

const base = { botSeat: 1 as const, securityCounts: [3, 3] as const, turnCount: 4, isBoss: false };

describe("bot lines", () => {
  it("greets at the start and uses the boss greeting for story bosses", () => {
    const event = { kind: "matchStarted", firstSeat: 0 } as const;
    expect(getBotLine({ ...base, event })?.line).toBe(BotLine.GREETING);
    expect(getBotLine({ ...base, event, isBoss: true })?.line).toBe(BotLine.BOSS_GREETING);
  });

  it("announces only its own Ultimate or Mega digivolutions, once per turn", () => {
    const event = (seat: 0 | 1, cardId: string) =>
      ({ kind: "digivolved", seat, permanentId: "p1", cardId, mechanic: "normal" }) as const;
    expect(getCardDefinition("BT21-026")?.level).toBeGreaterThanOrEqual(5);
    expect(getCardDefinition("BT21-007")?.level).toBe(3);
    const spoken = getBotLine({ ...base, event: event(1, "BT21-026") });
    expect(spoken).toEqual({ line: BotLine.BIG_DIGIVOLVE, key: "bigDigivolve:4", cardId: "BT21-026" });
    expect(getBotLine({ ...base, event: event(1, "BT21-007") })).toBeUndefined();
    expect(getBotLine({ ...base, event: event(0, "BT21-026") })).toBeUndefined();
  });

  it("presses when the player runs out of security and rallies when the bot does", () => {
    const event = (seat: 0 | 1) =>
      ({ kind: "securityChecked", seat, revealedCardId: "BT21-007", resolution: "trashed" }) as const;
    expect(getBotLine({ ...base, event: event(0), securityCounts: [0, 3] })?.line).toBe(BotLine.PRESSURE);
    expect(getBotLine({ ...base, event: event(1), securityCounts: [3, 0] })?.line).toBe(BotLine.LAST_STAND);
    expect(getBotLine({ ...base, event: event(0), securityCounts: [1, 3] })).toBeUndefined();
  });

  it("closes the match with a victory or defeat line and stays quiet on a draw", () => {
    const over = (result: { outcome: "win"; winnerSeat: 0 | 1 } | { outcome: "draw" }) =>
      ({ kind: "gameOver", result, reason: "security" }) as const;
    expect(getBotLine({ ...base, event: over({ outcome: "win", winnerSeat: 1 }) })?.line).toBe(BotLine.VICTORY);
    expect(getBotLine({ ...base, event: over({ outcome: "win", winnerSeat: 0 }) })?.line).toBe(BotLine.DEFEAT);
    expect(getBotLine({ ...base, event: over({ outcome: "draw" }) })).toBeUndefined();
  });
});
