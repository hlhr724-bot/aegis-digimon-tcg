import { InspectorMarker } from "@/game/InspectorMarker";

type Params = { text: string };

export function getInspectorMarker({ text }: Params) {
  const label = text.replace(/^[[（(]|[\]）)]$/g, "").trim();
  return Object.values(InspectorMarker).find((entry) => entry.pattern.test(label))?.value;
}
