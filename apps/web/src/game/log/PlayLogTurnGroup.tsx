import { Phase, type Seat } from "@aegis/shared/schema/enums";
import type { LogKind, LogTurnGroup } from "@/game/log/LogEntry";
import type { SeatNames } from "@/game/log/SeatNames";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import { PlayLogEntry } from "@/game/log/PlayLogEntry";
import { formatPlayLogTurnHeading } from "@/game/log/formatPlayLogTurnHeading";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";

type Props = {
  turn: LogTurnGroup;
  playerNames: SeatNames;
  playerAvatars?: SeatAvatars;
  viewerSeat?: Seat;
  highlight?: string;
  onOpenCard?: (cardId: string) => void;
};

const phaseKeys: Record<Phase, TranslationKey> = {
  [Phase.Active]: "game.phaseBanner.active",
  [Phase.Draw]: "game.phaseBanner.draw",
  [Phase.Breeding]: "game.phaseBanner.breeding",
  [Phase.Main]: "game.phaseBanner.main",
  [Phase.End]: "game.phaseBanner.end",
  [Phase.None]: "game.matchLog",
};

type TurnToneParams = { turnSeat: Seat; viewerSeat?: Seat };

function getTurnTone({ turnSeat, viewerSeat = 0 }: TurnToneParams): LogKind {
  return turnSeat === viewerSeat ? "you" : "opp";
}

export function PlayLogTurnGroup({ turn, playerNames, playerAvatars, viewerSeat, highlight, onOpenCard }: Props) {
  const { t } = useTranslation();
  return (
    <section
      data-seat={turn.turnSeat}
      data-viewer={turn.turnSeat === viewerSeat || undefined}
      data-tone={getTurnTone({ turnSeat: turn.turnSeat, viewerSeat })}
    >
      <h3 className="play-log__turn-heading">{formatPlayLogTurnHeading({ ...turn, playerNames, t })}</h3>
      {turn.phases.map((phase, index) => (
        <div className="play-log__phase" key={`${phase.phase}:${index}`}>
          <h4 className="play-log__phase-heading">{t(phaseKeys[phase.phase])}</h4>
          {phase.entries.map((entry) => (
            <PlayLogEntry
              key={entry.id}
              entry={entry}
              playerNames={playerNames}
              playerAvatars={playerAvatars}
              viewerSeat={viewerSeat}
              highlight={highlight}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
