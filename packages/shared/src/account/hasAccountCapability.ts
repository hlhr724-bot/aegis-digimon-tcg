import { AccountRole, type AccountRoleCapability } from "#shared/account/AccountRole";

type HasAccountCapabilityParams = {
  roles: readonly AccountRole[];
  capability: AccountRoleCapability;
};

export function hasAccountCapability({ roles, capability }: HasAccountCapabilityParams): boolean {
  return Object.values(AccountRole).some((role) => role[capability] && roles.includes(role.value));
}
