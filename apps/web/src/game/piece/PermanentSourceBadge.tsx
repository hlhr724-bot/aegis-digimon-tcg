import type { SourceCountBadge } from "../fieldBadges";
import { useTranslation } from "../../i18n";
import { BadgeHint } from "./BadgeHint";

/** The `×N` digivolution-source count on the card's top-left corner, in its side's color. */
export function PermanentSourceBadge({ sources }: { sources: SourceCountBadge }) {
  const { t } = useTranslation();
  const faceDown = sources.faceDown > 0 ? t("game.faceDownSourceCount", { count: sources.faceDown }) : undefined;
  return (
    <BadgeHint
      className="game-source-badge"
      aria-label={[t("game.digivolutionSources", { count: sources.count }), faceDown].filter(Boolean).join(", ")}
      hint={{
        title: t("redesign.arena.badge.stackTitle"),
        description: [t("redesign.arena.badge.stack", { count: sources.count }), faceDown].filter(Boolean).join(" "),
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m12 2 10 5-10 5L2 7z" />
        <path d="m2 12 10 5 10-5" />
        <path d="m2 17 10 5 10-5" />
      </svg>
      ×{sources.count}
      {sources.faceDown > 0 ? ` (${sources.faceDown})` : null}
    </BadgeHint>
  );
}
