import { memo, useRef } from "react";
import { memoryCellCenterFraction, shouldDrawMemoryArc, shouldDrawMemoryPrediction } from "../memoryArc";
import { useTranslation } from "../../i18n";
import { MEMORY_SWEEP_CHIP_MS, MEMORY_SWEEP_MS, traversedChips } from "./memoryChips";
import { MemoryArc } from "./MemoryArc";
import { MemoryPredictionArc } from "./MemoryPredictionArc";

export const MemoryGauge = memo(function MemoryGauge({
  value,
  compact,
  phaseLabel,
  phaseSweeping,
  arc,
  prediction,
}: {
  value: number;
  compact?: boolean;
  /** Current phase, printed as the pill at the gauge's left end (reference-client style). */
  phaseLabel?: string;
  /** The unsuspend phase is sweeping the board, which the phase pill pulses along with. */
  phaseSweeping?: boolean;
  /** Forces the jump arc, for the showcase page — a match derives it from the value that changed. */
  arc?: { from: number; to: number };
  /** Where memory would land if the held card were played, while one is hovered or dragged. */
  prediction?: number;
}) {
  const { t } = useTranslation();
  const gaugeLabel = t("game.memoryGauge", { memory: value > 0 ? `+${value}` : `${value}` });
  const ticks: number[] = [];
  for (let v = 10; v >= -10; v -= 1) ticks.push(v);
  const cv = Math.max(-10, Math.min(10, value));
  // Swept chips are remounted so their keyframes restart, which is why the sweep
  // needs a generation counter rather than a class toggle on a stable element.
  const previousValue = useRef<number | null>(null);
  const sweepGeneration = useRef(0);
  const previous = previousValue.current;
  if (previous !== null && previous !== cv) sweepGeneration.current += 1;
  previousValue.current = cv;
  const swept = previous === null ? [] : traversedChips(previous, cv);
  // A single step is already told by the marker pop, so only a real jump is traced.
  const arcEnds =
    arc ?? (previous !== null && shouldDrawMemoryArc(previous, cv) ? { from: previous, to: cv } : undefined);
  const sweepDelay = (chip: number) => {
    const index = swept.indexOf(chip);
    if (index < 0 || swept.length === 0) return undefined;
    return `${Math.round(((MEMORY_SWEEP_MS - MEMORY_SWEEP_CHIP_MS) * index) / swept.length)}ms`;
  };
  // The gauge reads like the physical one: the viewer's half is always red and the
  // opponent's half always blue, whatever identity colours the players picked. Only
  // the marker moves — a yellow-lit chip on the current memory value.
  const renderCoin = (v: number) => {
    const isMarker = v === cv;
    const isSwept = swept.includes(v);
    const side = v > 0 ? "you" : v < 0 ? "opp" : "zero";
    const fill = v > 0 ? "var(--battle-memory-you)" : v < 0 ? "var(--battle-memory-opp)" : "var(--battle-memory-zero)";
    const ink = v === 0 ? "var(--battle-memory-zero-ink)" : "#fff";
    return (
      <div
        key={isSwept ? `${v}:${sweepGeneration.current}` : v}
        data-memory-side={side}
        className={`game-memory-coin${isMarker ? " game-memory-coin--marker" : ""}${isSwept ? " game-memory-coin--swept" : ""}${v % 5 === 0 ? " game-memory-coin--five" : ""}`}
        style={{ background: fill, color: ink, animationDelay: sweepDelay(v) }}
      >
        <span className="game-memory-coin__n">{Math.abs(v)}</span>
      </div>
    );
  };

  return (
    <div
      className={`game-memory-gauge${compact ? " game-memory-gauge--compact" : ""}`}
      role="img"
      aria-label={gaugeLabel}
      style={{ display: "flex", minWidth: 0, alignItems: "center", justifyContent: "center" }}
    >
      {phaseLabel ? (
        <span
          className={`game-memory-gauge__phase${phaseSweeping ? " game-memory-gauge__phase--sweeping" : ""}`}
          aria-hidden
        >
          {phaseLabel}
        </span>
      ) : null}
      <div className="game-memory-gauge__track">
        {/* The current value is lit by the chip itself — a wider hexagon wearing a
            crisp ring (game.css). The halo that used to ride over it was positioned
            by cell fraction, which the marker's own extra width puts it beside, and
            a blurred disc that wide washed over its neighbours either way. */}
        {ticks.map(renderCoin)}
        {arcEnds ? <MemoryArc key={sweepGeneration.current} from={arcEnds.from} to={arcEnds.to} /> : null}
        {prediction !== undefined && shouldDrawMemoryPrediction(cv, prediction) ? (
          <MemoryPredictionArc from={cv} to={prediction} />
        ) : null}
        {prediction !== undefined ? (
          <span
            className="game-memory-prediction__marker"
            style={{
              left: `calc(var(--memory-track-pad-x) + (100% - var(--memory-track-pad-x) * 2) * ${memoryCellCenterFraction(prediction)})`,
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
});
