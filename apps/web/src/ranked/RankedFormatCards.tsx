import type { RankedSeason } from "@aegis/shared/ranked/RankedContracts";
import { formatBanlistDate, type DeckFormat } from "@aegis/shared/deckFormat";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { season?: RankedSeason; seasons: RankedSeason[]; format: DeckFormat };

export function RankedFormatCards({ season, seasons, format }: Props) {
  const { t, locale } = useTranslation();
  const next = seasons.find((entry) => season && entry.startsAt === season.endsAt);
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="ranked-format-cards">
      <section className="ranked-format-card ranked-format-card--current">
        <div className="ranked-format-card__heading">
          <Icons.PanelDeck size={22} />
          <h2>{t("ranked.format.current")}</h2>
        </div>
        <strong>{format === "standard" ? "Standard" : format}</strong>
        <p>{t("ranked.format.restrictions", { date: formatBanlistDate(format) })}</p>
        <details>
          <summary>{t("ranked.format.rules")}</summary>
          <p>{t("ranked.season.clock")}</p>
          <p>{t("ranked.format.legality")}</p>
        </details>
      </section>
      <section className="ranked-format-card ranked-format-card--next">
        <div className="ranked-format-card__heading">
          <Icons.Calendar size={22} />
          <h2>{t("ranked.format.next")}</h2>
        </div>
        <strong>
          {season ? t("ranked.format.starts", { date: date.format(season.endsAt) }) : t("common.loading")}
        </strong>
        <div className="ranked-format-card__formats">
          {next?.formats.length ? (
            next.formats.map((value) => <span key={value}>{value === "standard" ? "Standard" : value}</span>)
          ) : (
            <p>{t("ranked.format.unannounced")}</p>
          )}
        </div>
        <p className="ranked-muted">{t("ranked.format.preview")}</p>
      </section>
    </div>
  );
}
