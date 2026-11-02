import { AccountRole } from "#shared/account/AccountRole";

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === "string" && Object.values(AccountRole).some((role) => role.value === value);
}
