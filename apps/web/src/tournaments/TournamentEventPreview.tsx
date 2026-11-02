import "@/tournaments/tournamentCatalog.css";
import type { TournamentStructure } from "@aegis/shared";
import { Badge } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { structureKey } from "@/tournaments/labels";

type TournamentEventPreviewParams = {
  name: string;
  official: boolean;
  passwordProtected: boolean;
  startsAt: number;
  structure: TournamentStructure;
  topCut: boolean;
  bestOf: 1 | 3;
  maxPlayers: number;
};

export function TournamentEventPreview({
  name,
  official,
  passwordProtected,
  startsAt,
  structure,
  topCut,
  bestOf,
  maxPlayers,
}: TournamentEventPreviewParams) {
  const { t, locale } = useTranslation();
  const trimmed = name.trim();
  const when = Number.isFinite(startsAt)
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(startsAt)
    : "";
  return (
    <section
      className="tournaments-card create-tournament__preview"
      aria-label={t("tournaments.create.previewCard")}
      data-official={official || undefined}
    >
      <div className="create-tournament__preview-eyebrow">
        <small>{t("tournaments.create.previewCard")}</small>
        <Badge tone={official ? "primary" : "neutral"}>
          {t(official ? "tournaments.category.official" : "tournaments.category.community")}
        </Badge>
        {passwordProtected ? (
          <Badge>
            <Icons.Lock size={11} aria-hidden="true" />
            {t("tournaments.catalog.withPassword")}
          </Badge>
        ) : null}
      </div>
      <strong className="create-tournament__preview-name" data-placeholder={trimmed ? undefined : true}>
        {trimmed || t("tournaments.create.title")}
      </strong>
      <dl className="create-tournament__preview-facts">
        {when ? (
          <div>
            <dt>{t("tournaments.create.startsAt")}</dt>
            <dd>{when}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("tournaments.create.structure")}</dt>
          <dd>
            {t(structureKey(structure))}
            {topCut ? ` + ${t("tournaments.badge.topCut")}` : ""}
          </dd>
        </div>
        <div>
          <dt>{t("tournaments.create.bestOf")}</dt>
          <dd>{t("tournaments.bestOf", { count: bestOf })}</dd>
        </div>
      </dl>
      <div className="tournaments-capacity">
        <div className="tournaments-capacity__label">
          <span>{t("home.tournaments.players")}</span>
          <span>
            <b>0</b> / {maxPlayers}
          </span>
        </div>
        <span className="tournaments-progress" aria-hidden="true">
          <span style={{ width: 0 }} />
        </span>
      </div>
    </section>
  );
}
