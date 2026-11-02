import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";

const phaseKeys: readonly TranslationKey[] = [
  "learn.rules.turn.phaseUnsuspend",
  "learn.rules.turn.phaseDraw",
  "learn.rules.turn.phaseBreeding",
  "learn.rules.turn.phaseMain",
];

export function PhaseStripDiagram() {
  const { t } = useTranslation();
  return (
    <ol className="rules-phases">
      {phaseKeys.map((key, index) => (
        <li key={key}>
          <span className="rules-phases__number">{index + 1}</span>
          <span>{t(key)}</span>
        </li>
      ))}
    </ol>
  );
}
