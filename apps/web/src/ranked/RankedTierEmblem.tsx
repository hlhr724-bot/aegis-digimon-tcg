import { RankedTier } from "@aegis/shared/ranked/RankedTier";

import goldEmblem from "@/ranked/assets/gold-emblem.png";

type Props = { tier: RankedTier; size?: number };

export function RankedTierEmblem({ tier, size = 20 }: Props) {
  if (tier === RankedTier.GOLD.value && size >= 40) {
    return (
      <img
        className="ranked-emblem ranked-emblem--art"
        data-tier={tier}
        src={goldEmblem}
        width={size}
        height={size}
        alt=""
        decoding="async"
      />
    );
  }
  return (
    <svg
      className="ranked-emblem"
      data-tier={tier}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path className="ranked-emblem__body" d="M16 1.5 29 9v14L16 30.5 3 23V9Z" />
      <path className="ranked-emblem__face" d="M16 7.5 23.5 12v8.5L16 25l-7.5-4.5V12Z" />
      <path className="ranked-emblem__mark" d="M16 11.5 19.5 16 16 20.5 12.5 16Z" />
    </svg>
  );
}
