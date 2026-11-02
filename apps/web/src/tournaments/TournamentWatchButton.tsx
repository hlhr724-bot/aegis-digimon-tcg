import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import "./tournamentSpectators.css";

type Props = {
  target: TournamentSpectateTarget;
  players: string;
  onWatch: (target: TournamentSpectateTarget) => void;
};

export function TournamentWatchButton({ target, players, onWatch }: Props) {
  const { t } = useTranslation();
  return (
    <Button
      className="tournaments-watch-button"
      variant="secondary"
      size="sm"
      icon={Icons.Eye}
      aria-label={t("tournaments.spectators.watchMatch", { players })}
      onClick={() => onWatch(target)}
    >
      {t("tournaments.spectators.watch")}
    </Button>
  );
}
