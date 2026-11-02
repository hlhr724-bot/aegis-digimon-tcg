import type { Queryable } from "#api/db/migrator";

export async function readDiscordUserIds(db: Queryable, accountIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(accountIds)];
  if (!unique.length) {
    return new Map();
  }
  const placeholders = unique.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.query<{ account_id: string; subject: string }>(
    `SELECT account_id, subject FROM login_identities WHERE provider='discord' AND account_id IN (${placeholders})`,
    unique,
  );
  return new Map(
    result.rows.filter((row) => /^\d+$/.test(row.subject)).map((row) => [String(row.account_id), row.subject]),
  );
}
