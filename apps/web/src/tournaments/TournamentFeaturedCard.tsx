import "@/tournaments/tournamentCatalog.css";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { Badge, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { statusKey, structureKey } from "@/tournaments/labels";
import type { TournamentListing } from "@/tournaments/types";

type TournamentFeaturedCardParams = {
  tournament: TournamentListing;
  onOpen: (id: string) => void;
};

export function TournamentFeaturedCard({ tournament, onOpen }: TournamentFeaturedCardParams) {
  const { t, locale } = useTranslation();
  const official = tournament.category === TournamentCategory.OFFICIAL.value;
  const full = tournament.registeredCount >= tournament.maxPlayers;
  const canSignUp = tournament.status === "registration" && !full && !tournament.myEntry;
  const capacity = Math.min(100, Math.max(0, (tournament.registeredCount / tournament.maxPlayers) * 100));
  const startsAt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(tournament.startsAt);

  return (
    <section
      className="tournaments-card tournaments-feature"
      aria-label={t("tournaments.catalog.featured")}
      data-official={official || undefined}
    >
      <div className="tournaments-feature__body">
        <div className="tournaments-feature__badges">
          <Badge tone="primary">{t("tournaments.catalog.featured")}</Badge>
          <Badge>{t(official ? "tournaments.category.official" : "tournaments.category.community")}</Badge>
          {tournament.circuitId ? <Badge>{t("tournaments.circuits.badge")}</Badge> : null}
        </div>
        <div className="tournaments-feature__heading">
          <strong className="tournaments-feature__name">{tournament.name}</strong>
          <span className="tournaments-feature__status">{t(statusKey(tournament.status))}</span>
        </div>
        <div className="tournaments-feature__facts">
          <span>
            <Icons.Calendar size={15} aria-hidden="true" />
            {startsAt}
          </span>
          <span>
            <Icons.LayoutGrid size={15} aria-hidden="true" />
            {t(structureKey(tournament.structure))}
            {tournament.topCutEnabled ? ` + ${t("tournaments.badge.topCut")}` : ""}
          </span>
          <span>
            <Icons.Swords size={15} aria-hidden="true" />
            {t("tournaments.bestOf", { count: tournament.bestOf })}
          </span>
          <span>
            <Icons.Cards size={15} aria-hidden="true" />
            {deckFormatLabel(tournament.format ?? "standard", t)}
          </span>
          {tournament.passwordProtected ? (
            <span>
              <Icons.Lock size={15} aria-hidden="true" />
              {t("tournaments.catalog.withPassword")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="tournaments-feature__side">
        <div className="tournaments-capacity">
          <div className="tournaments-capacity__label">
            <span>{t("home.tournaments.players")}</span>
            <span>
              <b>{tournament.registeredCount}</b> / {tournament.maxPlayers}
            </span>
          </div>
          <span className="tournaments-progress" aria-hidden="true">
            <span style={{ width: `${capacity}%` }} />
          </span>
        </div>
        <div className="tournaments-feature__foot">
          <Button variant="secondary" onClick={() => onOpen(tournament.id)}>
            {t("tournaments.catalog.view")}
          </Button>
          {canSignUp ? <Button onClick={() => onOpen(tournament.id)}>{t("home.tournaments.signUp")}</Button> : null}
        </div>
      </div>
    </section>
  );
}
