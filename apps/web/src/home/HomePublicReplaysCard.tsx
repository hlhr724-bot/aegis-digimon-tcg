import type { PublicReplayPage } from "@aegis/shared/replays/PublicReplay";
import { Icons } from "@/design/icons";
import { HomeCard } from "@/home/HomeCard";
import { useTranslation } from "@/i18n/useTranslation";
import { PublicReplayCard } from "@/replays/PublicReplayCard";
import type { PublicReplayRequest } from "@/replays/fetchPublicReplays";
import { usePublicReplays } from "@/replays/usePublicReplays";

const HOME_PUBLIC_REPLAY_COUNT = 4;

type HomePublicReplaysCardParams = {
  onOpen: (replayId: string) => void;
  onViewAll: () => void;
  load?: (request: PublicReplayRequest) => Promise<PublicReplayPage>;
};

export function HomePublicReplaysCard({ onOpen, onViewAll, load }: HomePublicReplaysCardParams) {
  const { t } = useTranslation();
  const { replays } = usePublicReplays({ pageSize: HOME_PUBLIC_REPLAY_COUNT, load });
  return (
    <HomeCard
      className="home-replays"
      title={t("publicReplays.title")}
      description={t("publicReplays.description")}
      action={{ label: t("home.viewAll"), onClick: onViewAll }}
    >
      {replays.length === 0 ? (
        <div className="home-empty">
          <Icons.Play size={22} aria-hidden="true" />
          <p>
            <strong>{t("publicReplays.empty")}</strong>
            <span>{t("publicReplays.emptyHint")}</span>
          </p>
        </div>
      ) : (
        <ul className="public-replays__grid">
          {replays.map((replay) => (
            <PublicReplayCard key={replay.id} replay={replay} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
