import { describe, expect, it, vi } from "vitest";
import { createDiscordRestClient } from "#api/tournaments/discord/createDiscordRestClient";
import { DiscordRequestError } from "#api/tournaments/discord/DiscordRequestError";

const REFERENCE = {
  id: "100000000000000001",
  guild_id: "100000000000000002",
  parent_id: "100000000000000003",
  type: 0,
  permission_overwrites: [{ id: "100000000000000002", type: 0, allow: "1024", deny: "2048" }],
};
const CHANNEL = { id: "300000000000000001", type: 0, topic: "Aegis tournament event" };
const INPUT = { referenceChannelId: REFERENCE.id, name: "torneio-community-cup-event", topic: CHANNEL.topic };

function respond(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("Discord tournament channels", () => {
  it("creates a text channel in the reference server and category with the same permissions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(REFERENCE))
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(respond(CHANNEL));
    const discord = createDiscordRestClient({ token: "test-token", fetcher });

    expect(await discord.ensureTournamentChannel(INPUT)).toEqual({ id: CHANNEL.id, guildId: REFERENCE.guild_id });
    expect(fetcher.mock.calls[2]![0]).toBe(`https://discord.com/api/v10/guilds/${REFERENCE.guild_id}/channels`);
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toEqual({
      name: INPUT.name,
      type: 0,
      topic: INPUT.topic,
      parent_id: REFERENCE.parent_id,
      permission_overwrites: REFERENCE.permission_overwrites,
    });
  });

  it("reuses a channel created before a failed database save", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(REFERENCE))
      .mockResolvedValueOnce(respond([CHANNEL]));
    const discord = createDiscordRestClient({ token: "test-token", fetcher });

    expect(await discord.ensureTournamentChannel(INPUT)).toEqual({ id: CHANNEL.id, guildId: REFERENCE.guild_id });
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "GET"]);
  });

  it("recovers a created channel after an ambiguous network failure without creating another", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(REFERENCE))
      .mockResolvedValueOnce(respond([]))
      .mockRejectedValueOnce(new Error("Connection closed after channel creation"))
      .mockResolvedValueOnce(respond(REFERENCE))
      .mockResolvedValueOnce(respond([CHANNEL]));
    const discord = createDiscordRestClient({ token: "test-token", fetcher });

    await expect(discord.ensureTournamentChannel(INPUT)).rejects.toThrow("Connection closed");
    expect(await discord.ensureTournamentChannel(INPUT)).toEqual({ id: CHANNEL.id, guildId: REFERENCE.guild_id });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("rejects a reference channel in a different configured server", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(respond(REFERENCE));
    const discord = createDiscordRestClient({ token: "test-token", fetcher });

    await expect(discord.ensureTournamentChannel({ ...INPUT, guildId: "900000000000000001" })).rejects.toThrow(
      "guild_mismatch",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves Discord's retry delay when channel creation is rate limited", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(REFERENCE))
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(respond({ retry_after: 5 }, 429));
    const discord = createDiscordRestClient({ token: "test-token", fetcher });

    await expect(discord.ensureTournamentChannel(INPUT)).rejects.toEqual(new DiscordRequestError(429, 5000));
  });
});
