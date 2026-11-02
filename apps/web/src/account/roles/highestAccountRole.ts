import { AccountRole } from "@aegis/shared/account/AccountRole";

export type AccountRoleDefinition = (typeof AccountRole)[keyof typeof AccountRole];

export function highestAccountRole(roles: readonly AccountRole[]): AccountRoleDefinition | undefined {
  return Object.values(AccountRole).find((role) => roles.includes(role.value));
}
