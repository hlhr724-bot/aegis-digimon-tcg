import type { AccountRole } from "@aegis/shared/account/AccountRole";
import { accountRoleDisplay } from "@/account/roles/accountRoleDisplay";
import "@/account/roles/accountRoleBadge.css";

export function AccountRoleBadge({ role }: { role: AccountRole }) {
  const Icon = accountRoleDisplay[role].icon;
  return (
    <span className="account-role-badge" data-role={role} aria-hidden="true">
      <Icon size={11} strokeWidth={2.75} />
    </span>
  );
}
