import { useTranslation } from "@/i18n/useTranslation";
import { windowKey } from "@/tournaments/labels";
import { serverNow } from "@/tournaments/serverClock";
import type { TournamentWindows } from "@/tournaments/types";

type TournamentScheduleTimelineParams = {
  startsAt: number;
  windows: TournamentWindows | undefined;
};

const WINDOW_ORDER = ["checkInOpensAt", "checkInClosesAt", "registrationClosesAt"] as const;

export function TournamentScheduleTimeline({ startsAt, windows }: TournamentScheduleTimelineParams) {
  const { t, locale } = useTranslation();
  const now = serverNow();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const steps = [
    ...WINDOW_ORDER.flatMap((key) => {
      const at = windows?.[key] ?? null;
      return at === null ? [] : [{ key, label: t(windowKey(key)), at }];
    }),
    { key: "startsAt", label: t("tournaments.startsAt"), at: startsAt },
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
