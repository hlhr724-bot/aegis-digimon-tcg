import "@/replays/replayDeckIcons.css";
import type { ReplaySummary } from "@aegis/shared/replays";
import { CardArt } from "@/game/overlay/CardArt";

type Params = { summary: Pick<ReplaySummary, "deckIcons" | "players"> };

export function ReplayDeckIcons({ summary }: Params) {
  if (!summary.deckIcons?.some(Boolean)) {
    return null;
  }
  return (
    <span className="replay-deck-icons">
      {summary.deckIcons.map((cardId, seat) => (
        <span key={seat} title={summary.players[seat]}>
          {cardId ? <CardArt cardId={cardId} width={32} /> : <span aria-hidden="true">—</span>}
        </span>
      ))}
    </span>
  );
}
