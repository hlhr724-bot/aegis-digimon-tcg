import { turnControlLabelKey, type TurnControlState } from "../turnControl";
import { useTranslation } from "../../i18n";

/**
 * The one round control on the memory band. It rotates through the turn — ending
 * the breeding step, then the turn, then waiting out the opponent's — and sends
 * the same `endPhase` intent in both of its active states, because that is the
 * only intent the server advances a phase on.
 */
export function TurnControl({
  state,
  onEndPhase,
  covered: coveredOverride,
}: {
  state: TurnControlState;
  onEndPhase: () => void;
  /** Disables the control when the current server phase cannot accept endPhase. */
  covered?: boolean;
}) {
  const { t } = useTranslation();
  const label = t(turnControlLabelKey(state));
  const waiting = state === "waiting" || state === "resolving";
  const covered = coveredOverride ?? false;
  return (
    <button
      type="button"
      className={`game-end-turn-orb${waiting ? " game-end-turn-orb--waiting" : ""}${
        state === "endBreeding" ? " game-end-turn-orb--breeding" : ""
      }${covered ? " game-end-turn-orb--covered" : ""}`}
      data-state={state}
      data-arena-turn
      disabled={waiting || covered}
      aria-disabled={covered || undefined}
      onClick={() => {
        if (covered) return;
        onEndPhase();
      }}
    >
      {/* The ring the reference client turns around the control for as long as it
          is the thing the player is meant to press. */}
      {!waiting ? <span className="game-end-turn-orb__ring" aria-hidden="true" /> : null}
      <span key={label}>{label}</span>
    </button>
  );
}
