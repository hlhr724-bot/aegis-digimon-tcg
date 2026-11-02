import { canonicalTimingLabel, isPrintedTimingReference, printedTimingLabelPattern } from "@aegis/shared";
import { TIMING_LABELS } from "@/game/overlay/effectText";
import { isEmbeddedPrintedTiming } from "@/game/isEmbeddedPrintedTiming";

export function getPrintedClauseGroups(effectText: string): {
  marks: { label: string; index: number; end: number }[];
  groups: { labels: Set<string>; start: number }[];
} {
  const boundary = new RegExp(`\\[(${Object.values(TIMING_LABELS).map(printedTimingLabelPattern).join("|")})\\]`, "g");
  const marks: { label: string; index: number; end: number }[] = [];
  for (let m = boundary.exec(effectText); m !== null; m = boundary.exec(effectText)) {
    if (isEmbeddedPrintedTiming({ text: effectText, index: m.index })) {
      continue;
    }

    if (isPrintedTimingReference(effectText, m.index + m[0].length)) {
      continue;
    }
    if (/^\s*(?:skills?\b|as an effect\b|to all\b)/i.test(effectText.slice(m.index + m[0].length))) {
      continue;
    }
    marks.push({ label: canonicalTimingLabel(m[1] ?? ""), index: m.index, end: m.index + m[0].length });
  }
  const groups: { labels: Set<string>; start: number }[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    const prev = groups[groups.length - 1];
    const gap = i > 0 ? effectText.slice(marks[i - 1]!.end, mark.index) : "|";
    if (prev !== undefined && gap.trim() === "") {
      prev.labels.add(mark.label);
    } else {
      groups.push({ labels: new Set([mark.label]), start: mark.index });
    }
  }
  return { marks, groups };
}
