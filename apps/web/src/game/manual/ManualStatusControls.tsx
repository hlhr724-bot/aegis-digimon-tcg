import { ManualStatus } from "@aegis/shared/manual/ManualStatus";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { permanent: Permanent; send: (command: ManualCommand) => void };

export function ManualStatusControls({ permanent, send }: Props) {
  const { t } = useTranslation();
  const statuses = Array.from(permanent.manualStatuses ?? []) as ManualStatus[];
  return (
    <section className="manual-features__section" aria-label={t("manual.features.status")}>
      <strong>{t("manual.features.status")}</strong>
      <div className="manual-features__chips">
        {Object.values(ManualStatus).map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={statuses.includes(entry.value)}
            onClick={() =>
              send({
                action: ManualAction.STATUSES.value,
                permanentId: permanent.permanentId,
                statuses: statuses.includes(entry.value)
                  ? statuses.filter((status) => status !== entry.value)
                  : [...statuses, entry.value],
              })
            }
          >
            {t(`manual.features.status.${entry.value}`)}
          </button>
        ))}
      </div>
      <span className="manual-table__marker-hint">{t("manual.features.statusHint")}</span>
    </section>
  );
}
