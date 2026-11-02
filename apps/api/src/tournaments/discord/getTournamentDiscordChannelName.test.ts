import { describe, expect, it } from "vitest";
import { getTournamentDiscordChannelName } from "#api/tournaments/discord/getTournamentDiscordChannelName";

describe("tournament Discord channel names", () => {
  it("normalizes punctuation and accents while distinguishing events with identical names", () => {
    expect(getTournamentDiscordChannelName({ name: "Copa São Paulo!", tournamentId: "first-event" })).toBe(
      "torneio-copa-sao-paulo-first-ev",
    );
    expect(getTournamentDiscordChannelName({ name: "Copa São Paulo!", tournamentId: "second-event" })).toBe(
      "torneio-copa-sao-paulo-second-e",
    );
  });

  it("uses a readable fallback and stays within Discord's channel-name limit", () => {
    expect(getTournamentDiscordChannelName({ name: "🏆", tournamentId: "event-id" })).toBe("torneio-evento-event-id");
    expect(
      getTournamentDiscordChannelName({ name: "cup".repeat(100), tournamentId: "event-id" }).length,
    ).toBeLessThanOrEqual(100);
  });
});
