import type { ReactNode } from "react";
import { Tooltip } from "radix-ui";
import { accountRoleDisplay } from "@/account/roles/accountRoleDisplay";
import type { AccountRoleDefinition } from "@/account/roles/highestAccountRole";
import { useTranslation } from "@/i18n";
import "@/account/roles/accountRoleBadge.css";

export function AccountRoleTooltip({ role, children }: { role: AccountRoleDefinition; children: ReactNode }) {
  const { t } = useTranslation();
  const Icon = accountRoleDisplay[role.value].icon;
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="account-role-tooltip"
            data-role={role.value}
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
          >
            <span className="account-role-tooltip__title">
              <span className="account-role-tooltip__icon" aria-hidden="true">
                <Icon size={14} strokeWidth={2.5} />
              </span>
              {t(role.labelKey)}
            </span>
            <span className="account-role-tooltip__description">
              {t(accountRoleDisplay[role.value].descriptionKey)}
            </span>
            <Tooltip.Arrow className="account-role-tooltip__arrow" width={12} height={6} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
