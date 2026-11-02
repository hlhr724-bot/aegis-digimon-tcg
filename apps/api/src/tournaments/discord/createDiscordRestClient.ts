import { DiscordChannelType } from "#api/tournaments/discord/DiscordChannelType";
import { DiscordRequestError } from "#api/tournaments/discord/DiscordRequestError";
import type { DiscordRestClient } from "#api/tournaments/discord/DiscordRestClient";

type Params = { token: string; fetcher?: typeof fetch };

const API = "https://discord.com/api/v10";
type ChannelPayload = {
  id: string;
  type: number;
  guild_id?: string;
  parent_id?: string | null;
  topic?: string | null;
  permission_overwrites?: readonly { id: string; type: number; allow: string; deny: string }[];
};

export function createDiscordRestClient({ token, fetcher = fetch }: Params): DiscordRestClient {
  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetcher(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 429) {
      const payload = (await response.json().catch(() => ({}))) as { retry_after?: number };
      const seconds = Number(response.headers.get("Retry-After") ?? payload.retry_after ?? 60);
      throw new DiscordRequestError(429, Number.isFinite(seconds) ? Math.max(1000, seconds * 1000) : 60_000);
    }
    if (!response.ok) {
      throw new DiscordRequestError(response.status);
    }
    return response;
  }

  async function idOf(response: Response): Promise<{ id: string }> {
    const payload = (await response.json()) as { id?: unknown };
    if (typeof payload.id !== "string") {
      throw new DiscordRequestError(502);
    }
    return { id: payload.id };
  }

  return {
    async postMessage(channelId, message) {
      return idOf(
        await request("POST", `/channels/${channelId}/messages`, {
          content: message.content,
          embeds: message.embeds,
          allowed_mentions: { parse: [], users: message.allowedUserIds ?? [] },
        }),
      );
    },
    async ensureTournamentChannel({ referenceChannelId, guildId, name, topic }) {
      const reference = (await (await request("GET", `/channels/${referenceChannelId}`)).json()) as ChannelPayload;
      const serverId = guildId ?? reference.guild_id;
      if (!serverId || (reference.guild_id && reference.guild_id !== serverId)) {
        throw new Error("tournament_discord_channel_guild_mismatch");
      }
      if (
        reference.type !== DiscordChannelType.TEXT.value &&
        reference.type !== DiscordChannelType.ANNOUNCEMENT.value
      ) {
        throw new Error("tournament_discord_reference_channel_invalid");
      }
      const channels = (await (await request("GET", `/guilds/${serverId}/channels`)).json()) as ChannelPayload[];
      const existing = channels.find(
        (channel) => channel.type === DiscordChannelType.TEXT.value && channel.topic === topic,
      );
      if (existing) {
        return { id: existing.id, guildId: serverId };
      }
      const created = await idOf(
        await request("POST", `/guilds/${serverId}/channels`, {
          name,
          type: DiscordChannelType.TEXT.value,
          topic,
          parent_id: reference.parent_id ?? null,
          permission_overwrites: reference.permission_overwrites ?? [],
        }),
      );
      return { ...created, guildId: serverId };
    },
    async addMemberRole(guildId, userId, roleId) {
      await request("PUT", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
    },
    async removeMemberRole(guildId, userId, roleId) {
      try {
        await request("DELETE", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
      } catch (error) {
        if (!(error instanceof DiscordRequestError && error.status === 404)) {
          throw error;
        }
      }
    },
  };
}
