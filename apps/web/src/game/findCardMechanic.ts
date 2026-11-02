import { CardMechanic } from "@/game/CardMechanic";

type Params = { marker: string };

export function findCardMechanic({ marker }: Params) {
  const label = marker.replace(/^\[|\]$/g, "").trim();
  return Object.values(CardMechanic).find((entry) => entry.pattern.test(label));
}
