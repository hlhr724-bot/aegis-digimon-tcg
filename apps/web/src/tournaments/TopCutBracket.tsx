/* The Top Cut, as the server publishes it.

   Everything here is a projection: which players are in the cut, which round each confrontation
   belongs to and whether it is decided are all decided server-side and arrive in `detail.phases`.
   This component picks the cut phase out and lays its rounds out as a bracket — no seeding rule, no
   advancement rule and no clock lives in React. */

import type { PhaseView } from "@aegis/shared";
import { Panel } from "../design/primitives";
import { useTranslation } from "../i18n";
import { getTournamentBracketSpectating } from "@/tournaments/getTournamentBracketSpectating";
import { TournamentBracket } from "@/tournaments/TournamentBracket";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import type { TournamentDetail } from "./types";

/** The cut phase, or undefined while the event has not reached one. */
export function topCutPhase(phases: readonly PhaseView[] | undefined): PhaseView | undefined {
  return phases?.find((phase) => phase.kind === "top_cut");
}

/**
 * True while the Swiss phase has ended and the cut has not been drawn yet.
 *
 * The Swiss phase parks in `frozen` between the two, which is a real state a player can refresh
 * into: the standings are final, the bracket does not exist, and the honest thing to render is
 * "the cut is being drawn" rather than an empty bracket or nothing at all.
 */
export function isAwaitingTopCut(detail: TournamentDetail): boolean {
  if (!detail.topCutEnabled || topCutPhase(detail.phases)) return false;
  return detail.phases?.some((phase) => phase.kind === "swiss" && phase.status === "frozen") === true;
}

type TopCutBracketParams = {
  detail: TournamentDetail;
  accountId?: string;
  onWatchMatch?: (target: TournamentSpectateTarget) => void;
};

export function TopCutBracket({ detail, accountId, onWatchMatch }: TopCutBracketParams) {
  const { t } = useTranslation();
  const phase = topCutPhase(detail.phases);

  if (isAwaitingTopCut(detail)) {
    return (
      <Panel className="tournaments-bracket">
        <h3>{t("tournaments.topCut.title")}</h3>
        <p role="status">{t("tournaments.topCut.starting", { size: detail.topCutSize ?? 0 })}</p>
      </Panel>
    );
  }
  if (!phase) return null;

  return (
    <Panel className="tournaments-bracket">
      <h3>{t("tournaments.topCut.title")}</h3>
      <p className="tournaments-note">{t("tournaments.topCut.size", { size: bracketSize(phase) })}</p>
      <TournamentBracket
        phase={phase}
        participants={detail.participants}
        accountId={accountId}
        spectating={getTournamentBracketSpectating({ detail, onWatchMatch })}
      />
    </Panel>
  );
}

/** How many players the cut admitted: twice the confrontations of its first round. */
function bracketSize(phase: PhaseView): number {
  return (phase.rounds[0]?.matches.length ?? 0) * 2;
}
