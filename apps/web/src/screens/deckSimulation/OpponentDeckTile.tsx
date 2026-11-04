import type { CSSProperties, ReactNode } from "react";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { ColorDot } from "@/design/primitives";
import { COLORS, colorKey } from "@/design/theme";

interface OpponentDeckTileProps {
  name: string;
  detail: string;
  colors: readonly string[];
  coverCardId: string | undefined;
  selected: boolean;
  disabled: boolean;
  label: string;
  meta?: ReactNode;
  onToggle: () => void;
}

export function OpponentDeckTile({
  name,
  detail,
  colors,
  coverCardId,
  selected,
  disabled,
  label,
  meta,
  onToggle,
}: OpponentDeckTileProps) {
  const color = colorKey(colors[0]);
  return (
    <li>
      <button
        type="button"
        className="opponent-tile"
        aria-pressed={selected}
        aria-label={label}
        disabled={disabled}
        style={{ "--deck-color-soft": COLORS[color].soft } as CSSProperties}
        onClick={onToggle}
      >
        <span className="opponent-tile__cover">
          <CoverThumb coverCardId={coverCardId} sigilColor={color} sigilSize={40} />
          <span className="opponent-tile__check" aria-hidden="true">
            <Icons.Check size={14} />
          </span>
        </span>
        <span className="opponent-tile__body">
          <span className="opponent-tile__name">{name}</span>
          <span className="opponent-tile__detail">{detail}</span>
          <span className="opponent-tile__meta">
            <span className="opponent-tile__colors" aria-hidden="true">
              {colors.map((entry) => (
                <ColorDot key={entry} color={entry} size={8} />
              ))}
            </span>
            {meta}
          </span>
        </span>
      </button>
    </li>
  );
}
