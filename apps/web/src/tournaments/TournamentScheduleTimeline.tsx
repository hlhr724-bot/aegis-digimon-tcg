import type { PhaseView } from "@aegis/shared";
import type { Translate } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { topCutRoundKey, windowKey } from "@/tournaments/labels";
import { serverNow } from "@/tournaments/serverClock";
import type { TournamentWindows } from "@/tournaments/types";

type TournamentScheduleTimelineParams = {
  startsAt: number;
  windows: TournamentWindows | undefined;
  phases?: readonly PhaseView[];
};

type ScheduleStep = { key: string; label: string; at: number };

const WINDOW_ORDER = ["checkInOpensAt", "checkInClosesAt", "registrationClosesAt"] as const;

export function TournamentScheduleTimeline({ startsAt, windows, phases }: TournamentScheduleTimelineParams) {
  const { t, locale } = useTranslation();
  const now = serverNow();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const steps: ScheduleStep[] = [
    ...WINDOW_ORDER.flatMap((key) => {
      const at = windows?.[key] ?? null;
      return at === null ? [] : [{ key, label: t(windowKey(key)), at }];
    }),
    { key: "startsAt", label: t("tournaments.startsAt"), at: startsAt },
    ...listRoundStarts({ phases: phases ?? [], t }),
  ].sort((first, second) => first.at - second.at);

  return (
    <ol className="tournaments-timeline">
      {steps.map((step) => (
        <li key={step.key} data-done={step.at <= now || undefined}>
          <span className="tournaments-timeline__dot" aria-hidden="true" />
          <b>{step.label}</b>
          <time dateTime={new Date(step.at).toISOString()}>{format.format(step.at)}</time>
        </li>
      ))}
    </ol>
  );
}

function listRoundStarts({ phases, t }: { phases: readonly PhaseView[]; t: Translate }): ScheduleStep[] {
  return phases.flatMap((phase) =>
    phase.rounds.flatMap((round) => {
      if (round.publishedAt === null) {
        return [];
      }
      const label =
        phase.kind === "top_cut"
          ? t("tournaments.schedule.phaseRoundStarted", {
              round: t(topCutRoundKey(round.number, phase.plannedRounds), { round: round.number }),
            })
          : t("tournaments.schedule.roundStarted", { round: round.number });
      return [{ key: `${phase.id}:${round.number}`, label, at: round.publishedAt }];
    }),
  );
}
