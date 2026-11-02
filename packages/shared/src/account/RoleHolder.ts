import type { AccountRole } from "#shared/account/AccountRole";

export const ROLE_HOLDER_SEARCH_LIMIT = 25;

export type RoleHolder = {
  id: string;
  displayName: string;
  roles: AccountRole[];
};
