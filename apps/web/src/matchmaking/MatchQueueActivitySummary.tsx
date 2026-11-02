import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { getMatchQueueActivity } from "@/matchmaking/getMatchQueueActivity";
import "./MatchQueueActivity.css";

type Props = {
  counts: MatchQueueCounts;
  selection: MatchQueueSelection;
  viewerQueued?: boolean;
  className?: string;
};

export function MatchQueueActivitySummary({ counts, selection, viewerQueued = false, className }: Props) {
  const { t } = useTranslation();
  const { matching, total } = getMatchQueueActivity({ counts, selection, viewerQueued });
  return (
    <p
      className={["match-queue-activity", className].filter(Boolean).join(" ")}
      data-searching={matching > 0 || undefined}
    >
      <Icons.Users size={14} />
      <span>{t(viewerQueued ? "matchQueue.activityWhileWaiting" : "matchQueue.activity", { matching, total })}</span>
    </p>
  );
}
