import type { CSSProperties } from "react";
import type { DpPulse } from "../dpPulse";
import { TIMINGS } from "../timings";
import { formatDp } from "@/design/formatDp";

/** Where each DP particle leaves from, spread across the card rather than stacked. */
const DP_PARTICLE_OFFSETS = [-34, -20, -7, 7, 20, 34];

/**
 * The particles a DP change throws off, and the refreshed figure riding with
 * them. A debuff that takes the Digimon to nothing holds four times as long as an
 * ordinary one — the reference client's own 0.1s → 0.4s stretch — because that is
 * the change the player most needs to catch.
 */
export function DpPulseParticles({ pulse }: { pulse: DpPulse }) {
  const hold = pulse.emphasized ? 300 : pulse.kind === "debuffFatal" ? TIMINGS.dpPulseFatalHold : TIMINGS.dpPulseHold;
  return (
    <span
      className={`game-dp-pulse game-dp-pulse--${pulse.kind}${pulse.emphasized ? " game-dp-pulse--emphasized" : ""}`}
      data-dp-from={pulse.from}
      data-dp-to={pulse.to}
      style={
        {
          "--dp-pulse-hold": `${hold}ms`,
          ...(pulse.emphasized ? { "--t-dp-pulse": "900ms" } : {}),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {DP_PARTICLE_OFFSETS.map((offset, index) => (
        <i key={index} style={{ "--dp-particle-x": `${offset}px`, "--dp-particle-index": index } as CSSProperties} />
      ))}
      <em>{formatDp(Math.abs(pulse.to - pulse.from))}</em>
    </span>
  );
}
