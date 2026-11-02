import { LogCardThumbnail } from "@/game/log/LogCardThumbnail";

const MAX_THUMBNAILS = 4;

type Props = { cardIds: readonly string[] | undefined; onOpenCard?: (cardId: string) => void };

export function LogEntryCards({ cardIds, onOpenCard }: Props) {
  const shown = [...new Set(cardIds ?? [])].slice(0, MAX_THUMBNAILS);
  if (shown.length === 0) {
    return null;
  }
  return (
    <span className="play-log__cards">
      {shown.map((cardId) => (
        <LogCardThumbnail key={cardId} cardId={cardId} onOpenCard={onOpenCard} />
      ))}
    </span>
  );
}
