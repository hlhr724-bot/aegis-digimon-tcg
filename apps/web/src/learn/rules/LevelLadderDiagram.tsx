import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";

const levelKeys: readonly TranslationKey[] = [
  "learn.rules.levels.egg",
  "learn.rules.levels.rookie",
  "learn.rules.levels.champion",
  "learn.rules.levels.ultimate",
  "learn.rules.levels.mega",
];

export function LevelLadderDiagram() {
  const { t } = useTranslation();
  return (
    <ol className="rules-levels">
      {levelKeys.map((key, index) => (
        <li key={key}>
          {index > 0 ? (
            <span className="rules-levels__step" aria-hidden="true">
              <Icons.ChevronRight size={16} />
              <small>{t("learn.rules.levels.draw")}</small>
            </span>
          ) : null}
          <span className="rules-levels__level">{t(key)}</span>
        </li>
      ))}
    </ol>
  );
}
