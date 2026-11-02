import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { ResumableMatch } from "@/net/activeMatch/ResumableMatch";
import { claimActiveMatch, findActiveMatch } from "@/net/client";
import { loadReconnectSession, saveReconnectSession } from "@/net/reconnectSession";
import { usePolling } from "@/tournaments/hooks";
import { formatReconnectGrace } from "@/home/formatReconnectGrace";

type HomeResumeMatchCardParams = {
  onResume: () => void;
};

type ResumeState = { kind: "idle" } | { kind: "claiming" } | { kind: "failed" };

type FoundMatch = { match: ResumableMatch; graceEndsAt?: number };

const ACTIVE_MATCH_POLL_MS = 10_000;

export function HomeResumeMatchCard({ onResume }: HomeResumeMatchCardParams) {
  const { t } = useTranslation();
  const [found, setFound] = useState<FoundMatch>();
  const [state, setState] = useState<ResumeState>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [seatHeldHere] = useState(() => Boolean(loadReconnectSession()));

  const refresh = useCallback(
    () =>
      findActiveMatch()
        .catch(() => undefined)
        .then((match) => {
          const fetchedAt = Date.now();
          setNow(fetchedAt);
          setFound(
            match && {
              match,
              graceEndsAt: match.reconnectGraceMs === undefined ? undefined : fetchedAt + match.reconnectGraceMs,
            },
          );
        }),
    [],
  );

  usePolling(refresh, ACTIVE_MATCH_POLL_MS, !seatHeldHere && state.kind === "idle");

  const graceEndsAt = found?.graceEndsAt;
  useEffect(() => {
    if (graceEndsAt === undefined) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [graceEndsAt]);

  if (!found) {
    return null;
  }
  if (state.kind === "failed") {
    return <Alert tone="warning">{t("resumeMatch.failed")}</Alert>;
  }

  const resume = async () => {
    setState({ kind: "claiming" });
    const session = await claimActiveMatch(found.match).catch(() => undefined);
    if (!session) {
      setState({ kind: "failed" });
      return;
    }
    saveReconnectSession(session);
    onResume();
  };

  const graceLeftMs = graceEndsAt === undefined ? undefined : Math.max(0, graceEndsAt - now);

  return (
    <section className="home-card home-resume-match" aria-labelledby="home-resume-match-title">
      <span className="home-resume-match__pulse" aria-hidden="true" />
      <div className="home-resume-match__text">
        <strong id="home-resume-match-title">{t("resumeMatch.title")}</strong>
        <span>{t("resumeMatch.copy")}</span>
      </div>
      {graceLeftMs === undefined ? null : (
        <span className="home-resume-match__grace" role="timer" aria-live="off">
          <Icons.Clock size={14} aria-hidden="true" />
          {t("resumeMatch.graceLeft", { time: formatReconnectGrace(graceLeftMs) })}
        </span>
      )}
      <Button size="sm" disabled={state.kind === "claiming"} onClick={() => void resume()}>
        {t("resumeMatch.action")}
      </Button>
    </section>
  );
}
