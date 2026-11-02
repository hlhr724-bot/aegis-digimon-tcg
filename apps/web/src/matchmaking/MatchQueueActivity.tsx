import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { MatchQueueActivitySummary } from "@/matchmaking/MatchQueueActivitySummary";
import { useMatchQueueCounts } from "@/matchmaking/useMatchQueueCounts";

type Props = {
  selection: MatchQueueSelection;
  viewerQueued?: boolean;
  className?: string;
  load?: () => Promise<MatchQueueCounts>;
};

export function MatchQueueActivity({ selection, viewerQueued = false, className, load }: Props) {
  const counts = useMatchQueueCounts({ load });
  if (!counts) {
    return null;
  }
  return (
    <MatchQueueActivitySummary
      counts={counts}
      selection={selection}
      viewerQueued={viewerQueued}
      className={className}
    />
  );
}
