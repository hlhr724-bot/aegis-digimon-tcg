import { Badge, Button, Panel, type Screen } from "@/design/primitives";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { MatchQueueTables } from "@/matchmaking/MatchQueueTables";
import { useMatchQueueCounts } from "@/matchmaking/useMatchQueueCounts";
import { PlayHeader } from "@/play/PlayHeader";
import { PlayTab } from "@/play/PlayTab";
import { PrivateRoomCard } from "@/play/PrivateRoomCard";
import { LiveMatchList } from "@/screens/LiveMatchList";
import { SpectatorCodeForm } from "@/screens/SpectatorCodeForm";
import { useLiveMatches } from "@/screens/useLiveMatches";
import "@/screens/watch.css";

type WatchScreenParams = {
  initialCode?: string;
  rankedEnabled: boolean;
  onWatch: (code: string) => void;
  onNav: (screen: Screen) => void;
  onOpenMatchSettings: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onChallengeQueue: (selection: MatchQueueSelection) => void;
};

export function WatchScreen({
  initialCode,
  rankedEnabled,
  onWatch,
  onNav,
  onOpenMatchSettings,
  onCreateRoom,
  onJoinRoom,
  onChallengeQueue,
}: WatchScreenParams) {
  const { t } = useTranslation();
  const { page, failed, canShowMore, refresh, showMore } = useLiveMatches();
  const hasMatches = (page?.matches.length ?? 0) > 0;
  const queueCounts = useMatchQueueCounts();

  function getLiveMatchesContent() {
    if (page) {
      return (
        <LiveMatchList
          matches={page.matches}
          total={page.total}
          now={Date.now()}
          onWatch={onWatch}
          onShowMore={canShowMore ? showMore : undefined}
        />
      );
    }
    if (failed) {
      return (
        <Panel pad={0}>
          <p className="live-matches__error" role="alert">
            {t("spectator.liveError")}
          </p>
        </Panel>
      );
    }
    return (
      <Panel pad={0}>
        <p className="live-matches__loading" aria-busy="true">
          {t("common.loading")}
        </p>
      </Panel>
    );
  }

  return (
    <main className="aegis-page play-page watch-page">
      <div className="aegis-page__wrap">
        <PlayHeader
          activeTab={PlayTab.ROOMS.value}
          rankedEnabled={rankedEnabled}
          liveMatchCount={page?.total}
          onNav={onNav}
        />
        <div className="aegis-page__body">
          <PrivateRoomCard onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />
          {queueCounts ? <MatchQueueTables counts={queueCounts} onChallenge={onChallengeQueue} /> : null}
          <section className="watch-section" aria-labelledby="watch-live-title">
            <header className="watch-header">
              <div className="watch-header__title">
                <h2 id="watch-live-title">{t("spectator.liveTitle")}</h2>
                {hasMatches ? (
                  <Badge tone="danger" className="watch-live-badge">
                    {t("spectator.liveBadge")}
                  </Badge>
                ) : null}
              </div>
              <div className="watch-header__row">
                <p>{t("spectator.liveSubtitle")}</p>
                <Button variant="ghost" size="sm" icon={Icons.RotateCcw} onClick={refresh}>
                  {t("spectator.liveRefresh")}
                </Button>
              </div>
            </header>
            {getLiveMatchesContent()}
          </section>
          <Panel className="watch-code-panel">
            <SpectatorCodeForm initialCode={initialCode} onWatch={onWatch} />
          </Panel>
          <p className="watch-opt-in">
            {t("spectator.liveOptIn")}{" "}
            <button type="button" onClick={onOpenMatchSettings}>
              {t("spectator.liveOpenSettings")}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
