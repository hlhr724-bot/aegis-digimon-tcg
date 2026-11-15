import { CoverThumb } from "@/design/cards";
import { COLORS, colorKey } from "@/design/theme";

type Props = { name: string; coverCardId: string | null; colors: readonly string[]; detail?: string };

export function RankedDeckIdentity({ name, coverCardId, colors, detail }: Props) {
  const color = colorKey(colors[0]);
  return (
    <span className="ranked-deck-identity">
      <span className="ranked-deck-identity__art" style={{ borderColor: COLORS[color].base }}>
        <CoverThumb
          key={coverCardId ?? ""}
          coverCardId={coverCardId ?? undefined}
          sigilColor={color}
          sigilSize={22}
          objectPosition="50% 18%"
        />
      </span>
      <span className="ranked-deck-identity__name">
        <span>{name}</span>
        {detail ? <small>{detail}</small> : null}
      </span>
    </span>
  );
}
