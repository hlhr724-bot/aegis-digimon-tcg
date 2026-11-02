import { ProviderCredit } from "@/deckProviders/ProviderCredit";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { BetaBanner } from "@/design/BetaBanner";
import { DISCORD_INVITE_URL, GITHUB_REPO_URL } from "@/community";
import type { DeckListing } from "@/game/decks";
import { HomeAgendaCard } from "@/home/HomeAgendaCard";
import { HomeBoosterCard } from "@/home/HomeBoosterCard";
import { HomeDecksCard } from "@/home/HomeDecksCard";
import { HomeLiveMatchesCard } from "@/home/HomeLiveMatchesCard";
import type { HomeMatchQueue } from "@/home/HomeMatchQueue";
import { HomeNextMatchCard } from "@/home/HomeNextMatchCard";
import { HomePublicReplaysCard } from "@/home/HomePublicReplaysCard";
import { HomeResumeMatchCard } from "@/home/HomeResumeMatchCard";
import { HomeTournamentsCard } from "@/home/HomeTournamentsCard";
import { useHomeTournaments } from "@/home/useHomeTournaments";
import { useTranslation } from "@/i18n/useTranslation";
import { currentRelease, displayVersion } from "@/releases/catalog";
import strategyGuides from "@/guides/catalog.json";
import "@/home/home.css";

type HomeParams = {
  accountId?: string;
  decks: readonly DeckListing[];
  activeDeck: DeckListing | undefined;
  activeDeckId: string;
  rankedEnabled: boolean;
  onFindMatch: (queue: HomeMatchQueue) => void;
  onPractice: () => void;
  onPrivateMatch: () => void;
  onChangeDeck: () => void;
  onWatchLive: (spectatorCode: string) => void;
  onOpenWatch: () => void;
  onOpenReplay: (replayId: string) => void;
  onOpenPublicReplays: () => void;
  onOpenTournament: (id: string) => void;
  onOpenTournaments: () => void;
  onCreateTournament: () => void;
  onOpenBooster: () => void;
  onEditDeck: (deck: DeckListing) => void;
  onPlayDeck: (deck: DeckListing) => void;
  onBuildDeck: () => void;
  onOpenDecks: () => void;
  onSignIn: () => void;
  onReportBug?: () => void;
  onOpenReleases?: () => void;
  onResumeMatch?: () => void;
};

export function Home(params: HomeParams) {
  const { t } = useTranslation();
  const tournaments = useHomeTournaments();
  const signedIn = params.accountId !== undefined;
  const hasStrategyGuides = strategyGuides.some((guide) => "strictVerified" in guide && guide.strictVerified === true);

  return (
    <main className="home-page">
      <div className="home-wrap">
        <h1 className="aegis-sr-only">{t("nav.home")}</h1>

        {signedIn && params.onResumeMatch ? <HomeResumeMatchCard onResume={params.onResumeMatch} /> : null}

        <div className="home-board">
          <div className="home-board__main">
            <HomeLiveMatchesCard onWatch={params.onWatchLive} onViewAll={params.onOpenWatch} />
            <HomePublicReplaysCard onOpen={params.onOpenReplay} onViewAll={params.onOpenPublicReplays} />
            <HomeTournamentsCard
              tournaments={tournaments}
              onOpen={params.onOpenTournament}
              onViewAll={params.onOpenTournaments}
              onCreate={signedIn ? params.onCreateTournament : undefined}
            />
            <HomeDecksCard
              decks={params.decks}
              activeDeckId={params.activeDeckId}
              onEdit={params.onEditDeck}
              onPlay={params.onPlayDeck}
              onBuild={params.onBuildDeck}
              onViewAll={params.onOpenDecks}
            />
          </div>

          <aside className="home-board__rail">
            <HomeNextMatchCard
              deck={params.activeDeck}
              rankedEnabled={params.rankedEnabled}
              onFindMatch={params.onFindMatch}
              onPractice={params.onPractice}
              onPrivateMatch={params.onPrivateMatch}
              onChangeDeck={params.onChangeDeck}
            />
            <HomeBoosterCard onOpen={params.onOpenBooster} />
            {params.accountId ? (
              <HomeAgendaCard
                tournaments={tournaments}
                accountId={params.accountId}
                onOpen={params.onOpenTournament}
                onViewAll={params.onOpenTournaments}
              />
            ) : (
              <section className="home-card home-signin">
                <span className="home-signin__icon" aria-hidden="true">
                  <Icons.Devices size={18} />
                </span>
                <p>
                  <strong>{t("home.signInTitle")}</strong> {t("home.signInCopy")}
                </p>
                <Button variant="secondary" size="sm" onClick={params.onSignIn}>
                  {t("home.signInAction")}
                </Button>
              </section>
            )}
          </aside>
        </div>

        {hasStrategyGuides ? (
          <a className="home-card home-guides" href="/strategy-guides/">
            <Icons.BookOpen size={20} aria-hidden="true" />
            <span>{t("home.strategyGuides")}</span>
            <Icons.ArrowRight size={16} aria-hidden="true" />
          </a>
        ) : null}

        <BetaBanner />
      </div>

      <footer className="home-footer">
        <div className="home-footer__links">
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
            <Icons.Discord size={15} />
            {t("home.footer.discord")}
          </a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            <Icons.Github size={15} />
            {t("home.footer.github")}
          </a>
          {params.onReportBug ? (
            <button type="button" onClick={params.onReportBug}>
              <Icons.Megaphone size={15} />
              {t("bugReport.button")}
            </button>
          ) : null}
          {params.onOpenReleases ? (
            <button type="button" onClick={params.onOpenReleases}>
              <span aria-hidden="true">
                <Icons.Sparkles size={15} />
              </span>
              {displayVersion(currentRelease().version)} · {t("releases.nav")}
            </button>
          ) : null}
        </div>
        <p>{t("home.footer.legal")}</p>
        <ProviderCredit />
      </footer>
    </main>
  );
}
