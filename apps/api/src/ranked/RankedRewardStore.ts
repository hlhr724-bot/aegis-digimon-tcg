import { RankedDiscordStatus } from "@aegis/shared/ranked/RankedDiscordStatus";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { RankedRewards } from "@aegis/shared/ranked/RankedContracts";
import type { RankedTier } from "@aegis/shared/ranked/RankedTier";
import { runRankedTransaction } from "#api/ranked/runRankedTransaction";

type EquipParams = { accountId: string; seasonId: number | null };
type OptInParams = { accountId: string; optedIn: boolean };

export class RankedRewardStore {
  constructor(private readonly accounts: AccountStore) {}

  async getRewards(accountId: string): Promise<RankedRewards> {
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<{ season_id: number; tier: RankedTier; equipped: boolean; granted_at: string }>(
        "SELECT * FROM ranked_rewards WHERE account_id=$1 ORDER BY season_id DESC",
        [accountId],
      )
    ).rows;
    const discord = (
      await this.accounts.pool.query<{ opted_in: boolean; status: RankedDiscordStatus | null; attempts: number }>(
        "SELECT opted_in,status,attempts FROM ranked_discord WHERE account_id=$1",
        [accountId],
      )
    ).rows[0];
    return {
      items: rows.map((row) => ({
        seasonId: row.season_id,
        tier: row.tier,
        equipped: row.equipped,
        grantedAt: Number(row.granted_at),
      })),
      discordEnabled: Boolean(
        process.env.AEGIS_RANKED_DISCORD_GUILD_ID &&
        process.env.AEGIS_DISCORD_BOT_TOKEN &&
        process.env.AEGIS_RANKED_DISCORD_ROLES,
      ),
      discordOptIn: discord?.opted_in ?? false,
      discordStatus: discord?.status ?? null,
      discordAttempts: discord?.attempts ?? 0,
    };
  }

  async equipReward({ accountId, seasonId }: EquipParams): Promise<void> {
    await runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        if (
          seasonId !== null &&
          !(await db.query("SELECT 1 FROM ranked_rewards WHERE account_id=$1 AND season_id=$2", [accountId, seasonId]))
            .rowCount
        ) {
          throw new Error("ranked_reward_not_owned");
        }
        await db.query("UPDATE ranked_rewards SET equipped=false WHERE account_id=$1", [accountId]);
        if (seasonId !== null) {
          await db.query("UPDATE ranked_rewards SET equipped=true WHERE account_id=$1 AND season_id=$2", [
            accountId,
            seasonId,
          ]);
        }
      },
    });
  }

  async setDiscordOptIn({ accountId, optedIn }: OptInParams): Promise<void> {
    await runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        if (optedIn && !(await this.accounts.discordUserId(accountId))) {
          throw new Error("ranked_discord_not_linked");
        }
        const reward = (
          await db.query<{ tier: string }>(
            "SELECT tier FROM ranked_rewards WHERE account_id=$1 AND season_id=(SELECT MAX(id) FROM ranked_seasons WHERE finalized=true)",
            [accountId],
          )
        ).rows[0];
        await db.query(
          `INSERT INTO ranked_discord (account_id,opted_in,status,desired_tier,updated_at) VALUES ($1,$2,'${RankedDiscordStatus.PENDING.value}',$3,$4) ON CONFLICT (account_id) DO UPDATE SET opted_in=EXCLUDED.opted_in,status='${RankedDiscordStatus.PENDING.value}',desired_tier=EXCLUDED.desired_tier,attempts=0,retry_at=0,updated_at=EXCLUDED.updated_at`,
          [accountId, optedIn, optedIn ? (reward?.tier ?? null) : null, Date.now()],
        );
      },
    });
  }
}
