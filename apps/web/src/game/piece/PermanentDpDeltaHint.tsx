import type { ReactNode } from "react";
import { formatDp } from "@/design/formatDp";
import { useTranslation } from "@/i18n/useTranslation";
import { BadgeHint } from "@/game/piece/BadgeHint";

type PermanentDpDeltaHintParams = {
  delta: number;
  baseDp?: number;
  children: ReactNode;
};

export function PermanentDpDeltaHint({ delta, baseDp, children }: PermanentDpDeltaHintParams) {
  const { t } = useTranslation();
  const label = `DP ${delta < 0 ? "−" : "+"}${formatDp(Math.abs(delta))}`;
  return (
    <BadgeHint
      className="game-dp-delta"
      data-dp={delta < 0 ? "down" : "up"}
      data-label={label}
      title={label}
      style={{ display: "inline-flex" }}
      hint={
        baseDp === undefined
          ? { title: label, description: t("redesign.arena.badge.dpChanged") }
          : {
              title: t("redesign.arena.badge.dpTitle", { dp: (baseDp + delta).toLocaleString() }),
              description: t(delta < 0 ? "redesign.arena.badge.dpDown" : "redesign.arena.badge.dpUp", {
                base: baseDp.toLocaleString(),
                amount: Math.abs(delta).toLocaleString(),
              }),
            }
      }
    >
      {children}
    </BadgeHint>
  );
}
