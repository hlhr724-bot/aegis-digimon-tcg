import type { AccountRole } from "@aegis/shared/account/AccountRole";
import { Gavel, ShieldCheck, Trophy, type LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/i18n";

export const accountRoleDisplay: Record<AccountRole, { icon: LucideIcon; descriptionKey: TranslationKey }> = {
  admin: { icon: ShieldCheck, descriptionKey: "account.roles.adminDescription" },
  judge: { icon: Gavel, descriptionKey: "account.roles.judgeDescription" },
  organizer: { icon: Trophy, descriptionKey: "account.roles.organizerDescription" },
};
