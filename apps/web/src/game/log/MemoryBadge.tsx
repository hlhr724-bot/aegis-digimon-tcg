import type { LogMemory } from "@/game/log/LogEntry";
import { formatSignedMemory } from "@/game/log/formatSignedMemory";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { memory: LogMemory };

export function MemoryBadge({ memory }: Props) {
  const { t } = useTranslation();
  return (
    <span className="play-log__memory">
      <span className="play-log__memory-delta" data-direction={memory.delta < 0 ? "spent" : "gained"}>
        {t("feed.memoryDelta", { delta: formatSignedMemory(memory.delta) })}
      </span>
      <span className="play-log__memory-transition">
        {t("feed.memoryTransition", { before: memory.after - memory.delta, after: memory.after })}
      </span>
    </span>
  );
}
