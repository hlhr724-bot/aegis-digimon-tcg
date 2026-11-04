interface WinRateBandProps {
  score: number;
  interval: readonly [number, number];
  compact?: boolean;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function WinRateBand({ score, interval, compact = false }: WinRateBandProps) {
  return (
    <div className="deck-win-band" data-compact={compact} aria-hidden="true">
      <span className="deck-win-band__even" />
      <span
        className="deck-win-band__range"
        style={{ left: percent(interval[0]), width: percent(interval[1] - interval[0]) }}
      />
      <span className="deck-win-band__point" style={{ left: percent(score) }} />
    </div>
  );
}
