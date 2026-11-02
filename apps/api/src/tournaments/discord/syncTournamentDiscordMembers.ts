import { ANNOUNCED_TOURNAMENT_STATUSES } from "#api/tournaments/discord/ANNOUNCED_TOURNAMENT_STATUSES";
import { getDesiredDiscordRoles } from "#api/tournaments/discord/getDesiredDiscordRoles";
import { getDiscordRetryAt } from "#api/tournaments/discord/getDiscordRetryAt";
import { isTournamentDiscordRole } from "#api/tournaments/discord/isTournamentDiscordRole";
import { readDiscordUserIds } from "#api/tournaments/discord/readDiscordUserIds";
import type { TournamentDiscordContext } from "#api/tournaments/discord/TournamentDiscordContext";
import type { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";

const MEMBERS_PER_SWEEP = 10;
const UNLINKED_RETRY_MS = 3_600_000;

export async function syncTournamentDiscordMembers(context: TournamentDiscordContext): Promise<number> {
  const { db, config, discord, now } = context;
  const guildId = config.guildId;
  if (!guildId || !Object.keys(config.roles).length) {
    return 0;
  }
  const statuses = ANNOUNCED_TOURNAMENT_STATUSES.map((_, index) => `$${index + 1}`).join(",");
  const [active, placements, members] = await Promise.all([
    db.query<{ account_id: string }>(
      `SELECT DISTINCT p.account_id FROM tournament_participants p JOIN tournaments t ON t.id = p.tournament_id
       WHERE t.discord_announce AND t.status IN (${statuses})
       AND p.status IN ('registered','checked_in','active') AND p.account_id IS NOT NULL`,
      [...ANNOUNCED_TOURNAMENT_STATUSES],
    ),
    db.query<{ account_id: string; placement: string }>(
      "SELECT account_id, placement FROM tournament_discord_placements",
    ),
    db.query<{ account_id: string; applied_roles: string; attempts: number; retry_at: string | number }>(
      "SELECT account_id, applied_roles, attempts, retry_at FROM tournament_discord_members",
    ),
  ]);
  const activeAccounts = new Set(active.rows.map((row) => String(row.account_id)));
  const placementsByAccount = new Map<string, TournamentDiscordRole[]>();
  for (const row of placements.rows) {
    if (isTournamentDiscordRole(row.placement)) {
      const accountId = String(row.account_id);
      placementsByAccount.set(accountId, [...(placementsByAccount.get(accountId) ?? []), row.placement]);
    }
  }
  const memberByAccount = new Map(members.rows.map((row) => [String(row.account_id), row]));
  const pending = [...new Set([...activeAccounts, ...placementsByAccount.keys(), ...memberByAccount.keys()])]
    .map((accountId) => {
      const member = memberByAccount.get(accountId);
      const applied = (member?.applied_roles ?? "").split(",").filter(isTournamentDiscordRole);
      const desired = getDesiredDiscordRoles({
        roles: config.roles,
        isActiveParticipant: activeAccounts.has(accountId),
        placements: placementsByAccount.get(accountId) ?? [],
      });
      return { accountId, member, applied, desired };
    })
    .filter(
      ({ member, applied, desired }) => applied.join(",") !== desired.join(",") && Number(member?.retry_at ?? 0) <= now,
    )
    .slice(0, MEMBERS_PER_SWEEP);
  if (!pending.length) {
    return 0;
  }
  const discordIds = await readDiscordUserIds(
    db,
    pending.map(({ accountId }) => accountId),
  );
  let actions = 0;
  for (const { accountId, member, applied, desired } of pending) {
    const attempts = Number(member?.attempts ?? 0) + 1;
    const userId = discordIds.get(accountId);
    if (!userId) {
      await saveMember(context, accountId, applied, attempts, now + UNLINKED_RETRY_MS);
      continue;
    }
    try {
      for (const role of applied) {
        const roleId = config.roles[role];
        if (roleId && !desired.includes(role)) {
          await discord.removeMemberRole(guildId, userId, roleId);
        }
      }
      for (const role of desired) {
        const roleId = config.roles[role];
        if (roleId && !applied.includes(role)) {
          await discord.addMemberRole(guildId, userId, roleId);
        }
      }
      await saveMember(context, accountId, desired, 0, 0);
      actions += 1;
    } catch (error) {
      await saveMember(context, accountId, applied, attempts, getDiscordRetryAt({ error, attempts, now }));
    }
  }
  return actions;
}

async function saveMember(
  { db, now }: TournamentDiscordContext,
  accountId: string,
  roles: readonly TournamentDiscordRole[],
  attempts: number,
  retryAt: number,
): Promise<void> {
  if (!roles.length && attempts === 0) {
    await db.query("DELETE FROM tournament_discord_members WHERE account_id=$1", [accountId]);
    return;
  }
  await db.query(
    `INSERT INTO tournament_discord_members (account_id, applied_roles, attempts, retry_at, updated_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (account_id) DO UPDATE SET applied_roles=$2, attempts=$3, retry_at=$4, updated_at=$5`,
    [accountId, roles.join(","), attempts, retryAt, now],
  );
}
