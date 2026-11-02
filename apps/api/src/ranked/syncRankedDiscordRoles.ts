import { RankedDiscordStatus } from "@aegis/shared/ranked/RankedDiscordStatus";
import type { AccountStore } from "#api/accounts/AccountStore";
import { RankedTier } from "@aegis/shared/ranked/RankedTier";
import { runRankedTransaction } from "#api/ranked/runRankedTransaction";

type Params = { accounts: AccountStore; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: number };

export async function syncRankedDiscordRoles({
  accounts,
  env = process.env,
  fetcher = fetch,
  now = Date.now(),
}: Params): Promise<void> {
  const guild = env.AEGIS_RANKED_DISCORD_GUILD_ID;
  const token = env.AEGIS_DISCORD_BOT_TOKEN;
  if (!guild || !token || !env.AEGIS_RANKED_DISCORD_ROLES) {
    return;
  }
  if (!/^\d+$/.test(guild)) {
    throw new Error("ranked_discord_invalid_guild");
  }
  const roles: unknown = JSON.parse(env.AEGIS_RANKED_DISCORD_ROLES);
  if (
    !roles ||
    typeof roles !== "object" ||
    Object.values(roles).some((value) => typeof value !== "string" || !/^\d+$/.test(value))
  ) {
    throw new Error("ranked_discord_invalid_roles");
  }
  const mapping = roles as Record<string, string>;
  if (
    Object.keys(mapping).length !== Object.values(RankedTier).length ||
    Object.values(RankedTier).some((tier) => !mapping[tier.value]) ||
    new Set(Object.values(mapping)).size !== Object.values(mapping).length
  ) {
    throw new Error("ranked_discord_invalid_roles");
  }
  await runRankedTransaction({
    accounts,
    serialize: false,
    work: async (db) => {
      const entries = (
        await db.query<{
          account_id: string;
          desired_tier: string | null;
          applied_role: string | null;
          opted_in: boolean;
          attempts: number;
        }>(
          `SELECT * FROM ranked_discord WHERE status='${RankedDiscordStatus.PENDING.value}' AND retry_at<=$1 ORDER BY updated_at LIMIT 5 FOR UPDATE SKIP LOCKED`,
          [now],
        )
      ).rows;
      for (const entry of entries) {
        let retryAfterMs = 0;
        async function applyRole(method: "PUT" | "DELETE", role: string): Promise<void> {
          const response = await fetcher(
            `https://discord.com/api/v10/guilds/${guild}/members/${discordId}/roles/${role}`,
            { method, headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(5000) },
          );
          if (response.status === 429) {
            const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
            const seconds = Number(response.headers.get("Retry-After") ?? body.retry_after ?? 60);
            retryAfterMs = Number.isFinite(seconds) ? Math.max(1000, seconds * 1000) : 60_000;
            throw new Error("discord_rate_limited");
          }
          if (!response.ok && !(method === "DELETE" && response.status === 404)) {
            throw new Error(`discord_${response.status}`);
          }
        }
        const discordId = await accounts.discordUserId(entry.account_id);
        const target = entry.opted_in && entry.desired_tier ? (mapping[entry.desired_tier] ?? null) : null;
        try {
          if (!discordId || !/^\d+$/.test(discordId)) {
            throw new Error("discord_not_linked");
          }
          for (const role of new Set([
            ...Object.values(mapping),
            ...(entry.applied_role ? [entry.applied_role] : []),
          ])) {
            if (role === target) {
              continue;
            }
            await applyRole("DELETE", role);
          }
          if (target) {
            await applyRole("PUT", target);
          }
          await db.query(
            `UPDATE ranked_discord SET status='${RankedDiscordStatus.SYNCED.value}',applied_role=$2,updated_at=$3,attempts=0 WHERE account_id=$1`,
            [entry.account_id, target, now],
          );
        } catch {
          const attempts = entry.attempts + 1;
          await db.query(
            `UPDATE ranked_discord SET status='${RankedDiscordStatus.PENDING.value}',attempts=$2,retry_at=$3,updated_at=$4 WHERE account_id=$1`,
            [
              entry.account_id,
              attempts,
              now + Math.max(retryAfterMs, Math.min(3_600_000, 60_000 * 2 ** Math.min(attempts, 6))),
              now,
            ],
          );
          if (retryAfterMs) {
            return;
          }
        }
      }
    },
  });
}
