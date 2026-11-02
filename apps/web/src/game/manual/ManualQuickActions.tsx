import type { TranslationKey } from "@/i18n/translationTypes";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand, ManualDestination } from "@aegis/shared/manual/ManualCommand";
import { Zone } from "@aegis/shared/schema/enums";
import type { ManualSourceOption } from "@/game/manual/getManualSources";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { source: ManualSourceOption; send: (command: ManualCommand) => void };
type QuickDestination = { label: TranslationKey; to: ManualDestination };

export function ManualQuickActions({ source, send }: Props) {
  const { t } = useTranslation();
  const wholePile = Boolean(source.permanent && source.from.part === "top");
  const destinations: QuickDestination[] = [
    { label: "manual.features.play", to: { zone: Zone.BattleArea } },
    { label: "manual.features.toHand", to: { zone: Zone.Hand } },
    { label: "manual.features.toTrash", to: { zone: Zone.Trash } },
    { label: "manual.features.toSecurity", to: { zone: Zone.Security, position: "top" } },
    { label: "manual.features.deckTop", to: { zone: Zone.Deck, position: "top" } },
    { label: "manual.features.deckBottom", to: { zone: Zone.Deck, position: "bottom" } },
  ];
  return (
    <section className="manual-features__section" aria-label={t("manual.features.quickActions")}>
      <strong>{t("manual.features.quickActions")}</strong>
      {wholePile ? <span className="manual-table__marker-hint">{t("manual.wholePile")}</span> : null}
      <div className="manual-features__quick-actions">
        {destinations
          .filter((entry) => entry.to.zone !== source.from.zone || entry.to.zone === Zone.Deck)
          .map((entry) => (
            <button
              type="button"
              key={entry.label}
              onClick={() => send({ action: ManualAction.MOVE.value, from: source.from, to: entry.to, wholePile })}
            >
              {t(entry.label)}
            </button>
          ))}
        <button type="button" onClick={() => send({ action: ManualAction.REVEAL.value, from: source.from })}>
          {t("manual.reveal")}
        </button>
      </div>
    </section>
  );
}
