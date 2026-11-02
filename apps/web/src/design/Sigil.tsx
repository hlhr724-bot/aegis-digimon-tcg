import { COLORS, colorKey, emblemFor, sigilPaths } from "@/design/theme";

export function Sigil({
  cardId,
  emblem,
  color = "Neutral",
  size = 84,
  faded = false,
}: {
  cardId?: string;
  emblem?: string;
  color?: string;
  size?: number;
  faded?: boolean;
}) {
  const c = COLORS[colorKey(color)];
  const body = sigilPaths(emblem ?? (cardId ? emblemFor(cardId) : "sigil"));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ color: c.base, opacity: faded ? 0.5 : 1, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
