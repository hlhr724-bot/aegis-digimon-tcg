import { getInspectorMarker } from "@/game/getInspectorMarker";

type Params = { text: string };

const requirementStart =
  /^\s*\[(?:Digivolve|DNA Digivolve|Burst Digivolve|App Fusion|Assembly\s*[-+]?\d+|DigiXros\s*[-+]?\d+|进化|合步进化|爆裂进化)\]/i;

export function splitInspectorPrintedText({ text }: Params) {
  const requirements: string[] = [];
  const effects: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const requirement = line.match(requirementStart);
    if (!requirement) {
      effects.push(line);
      continue;
    }
    const effectStart = findEffectStart(line, requirement[0].length);
    requirements.push(line.slice(0, effectStart).trim());
    effects.push(line.slice(effectStart).trim());
  }
  const remaining = effects
    .join("\n")
    .replace(/\n\s*\n(?:\s*\n)+/g, "\n\n")
    .trim();
  if (requirements.length === 0 || !remaining) {
    return { requirements: "", effects: text };
  }
  return { requirements: requirements.join("\n"), effects: remaining };
}

function findEffectStart(line: string, from: number) {
  const marker = [...line.matchAll(/\[[^\]\n]+\]/g)].find(
    (match) => match.index >= from && getInspectorMarker({ text: match[0] }),
  );
  const keyword = line.slice(from).search(/[＜<]/);
  return Math.min(marker?.index ?? line.length, keyword < 0 ? line.length : from + keyword);
}
