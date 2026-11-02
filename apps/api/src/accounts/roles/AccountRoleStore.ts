import type { AccountRole } from "@aegis/shared/account/AccountRole";
import { isAccountRole } from "@aegis/shared/account/isAccountRole";
import { ROLE_HOLDER_SEARCH_LIMIT, type RoleHolder } from "@aegis/shared/account/RoleHolder";
import type { AccountStore } from "#api/accounts/AccountStore";

type RoleHolderRow = { id: string; display_name: string; roles: string[] };

type SetRolesParams = { accountId: string; roles: readonly AccountRole[] };

export class AccountRoleStore {
  constructor(private readonly accounts: AccountStore) {}

  async findRoleHolders(query: string): Promise<RoleHolder[]> {
    await this.accounts.ensureReady();
    const search = query.trim();
    const { rows } = search
      ? await this.accounts.pool.query<RoleHolderRow>(
          "SELECT id, display_name, roles FROM accounts WHERE strpos(lower(display_name), lower($1)) > 0 ORDER BY lower(display_name) LIMIT $2",
          [search, ROLE_HOLDER_SEARCH_LIMIT],
        )
      : await this.accounts.pool.query<RoleHolderRow>(
          "SELECT id, display_name, roles FROM accounts WHERE roles <> '{}' ORDER BY lower(display_name)",
        );
    return rows.map(toRoleHolder);
  }

  async setRoles({ accountId, roles }: SetRolesParams): Promise<RoleHolder | undefined> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<RoleHolderRow>(
      "UPDATE accounts SET roles=$2 WHERE id=$1 RETURNING id, display_name, roles",
      [accountId, [...new Set(roles)]],
    );
    return rows[0] && toRoleHolder(rows[0]);
  }
}

function toRoleHolder(row: RoleHolderRow): RoleHolder {
  return { id: row.id, displayName: row.display_name, roles: row.roles.filter(isAccountRole) };
}
