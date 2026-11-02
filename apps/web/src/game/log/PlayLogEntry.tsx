import type { Seat } from "@aegis/shared/schema/enums";
import type { LogEntry } from "@/game/log/LogEntry";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import type { SeatNames } from "@/game/log/SeatNames";
import { CardLinkedText } from "@/game/cardLinks";
import { MemoryBadge } from "@/game/log/MemoryBadge";
import { LogActorAvatar } from "@/game/log/LogActorAvatar";
import { LogEntryCards } from "@/game/log/LogEntryCards";
import { getLogEntrySeat } from "@/game/log/getLogEntrySeat";

type Props = {
  entry: LogEntry;
  playerNames: SeatNames;
  playerAvatars?: SeatAvatars;
  viewerSeat?: Seat;
  highlight?: string;
  onOpenCard?: (cardId: string) => void;
};

export function PlayLogEntry({ entry, playerNames, playerAvatars, viewerSeat, highlight, onOpenCard }: Props) {
  return (
    <div className="play-log__line" data-kind={entry.kind} data-effect={entry.effectRole}>
      <LogActorAvatar
        seat={getLogEntrySeat({ entry, viewerSeat })}
        playerNames={playerNames}
        playerAvatars={playerAvatars}
      />
      <div className="play-log__body">
        <p>
          <CardLinkedText text={entry.text} cardIds={entry.cardIds} highlight={highlight} onOpenCard={onOpenCard} />
          {entry.memory ? <MemoryBadge memory={entry.memory} /> : null}
        </p>
        <LogEntryCards cardIds={entry.cardIds} onOpenCard={onOpenCard} />
      </div>
    </div>
  );
}
