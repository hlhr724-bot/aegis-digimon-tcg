import { describe, expect, it } from "vitest";
import { getTournamentDiscordConfig } from "#api/tournaments/discord/getTournamentDiscordConfig";

const BASE = {
  AEGIS_DISCORD_BOT_TOKEN: "token",
  AEGIS_TOURNAMENT_DISCORD_CHANNEL_ID: "100000000000000001",
  AEGIS_WEB_URL: "https://aegis.test/",
};

describe("tournament Discord configuration", () => {
  it("stays disabled without a token or channel", () => {
    expect(getTournamentDiscordConfig({})).toBeUndefined();
    expect(getTournamentDiscordConfig({ AEGIS_DISCORD_BOT_TOKEN: "token" })).toBeUndefined();
  });

  it("reads a partial role map for the configured guild", () => {
    expect(
      getTournamentDiscordConfig({
        ...BASE,
        AEGIS_TOURNAMENT_DISCORD_GUILD_ID: "100000000000000002",
        AEGIS_TOURNAMENT_DISCORD_ROLES: JSON.stringify({ participant: "200000000000000001" }),
      }),
    ).toEqual({
      token: "token",
      channelId: "100000000000000001",
      guildId: "100000000000000002",
      webUrl: "https://aegis.test",
      roles: { participant: "200000000000000001" },
    });
  });

  it("prefers the dedicated tournament bot token over the shared bot token", () => {
    expect(
      getTournamentDiscordConfig({
        ...BASE,
        DISCORD_BOT_TOKEN: "shared",
        AEGIS_TOURNAMENT_DISCORD_BOT_TOKEN: "tournament",
      })?.token,
    ).toBe("tournament");
    expect(
      getTournamentDiscordConfig({ ...BASE, AEGIS_DISCORD_BOT_TOKEN: undefined, DISCORD_BOT_TOKEN: "shared" })?.token,
    ).toBe("shared");
  });

  it("refuses roles without a guild, unknown role names and malformed IDs", () => {
    const roles = JSON.stringify({ participant: "200000000000000001" });
    expect(() => getTournamentDiscordConfig({ ...BASE, AEGIS_TOURNAMENT_DISCORD_ROLES: roles })).toThrow(
      "tournament_discord_invalid_roles",
    );
    expect(() =>
      getTournamentDiscordConfig({
        ...BASE,
        AEGIS_TOURNAMENT_DISCORD_GUILD_ID: "100000000000000002",
        AEGIS_TOURNAMENT_DISCORD_ROLES: JSON.stringify({ constructor: "200000000000000001" }),
      }),
    ).toThrow("tournament_discord_invalid_roles");
    expect(() => getTournamentDiscordConfig({ ...BASE, AEGIS_TOURNAMENT_DISCORD_CHANNEL_ID: "general" })).toThrow(
      "tournament_discord_invalid_channel",
    );
  });
});
