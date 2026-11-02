import { useState } from "react";
import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { findKeywordDrill } from "@aegis/shared/tutorial/findKeywordDrill";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { getKeywordName } from "@/game/getKeywordName";
import { KEYWORD_GLOSSARY } from "@/game/keywordGlossary";
import { useTranslation } from "@/i18n/useTranslation";
import { getOfficialRuleUrl } from "@/learn/rules/getOfficialRuleUrl";

const keywords = Object.entries(KEYWORD_GLOSSARY)
  .map(([key, entry]) => ({ key, name: getKeywordName(key), ...entry }))
  .sort((left, right) => left.name.localeCompare(right.name));

type Params = { onTryDrill: (drill: TutorialLesson) => void };

function findPlayableDrill(keyword: string): TutorialLesson | undefined {
  const drill = findKeywordDrill(keyword);
  return drill && drill.steps.length > 0 ? drill : undefined;
}

export function KeywordList({ onTryDrill }: Params) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const shown = keywords.filter(
    (keyword) =>
      !query || [keyword.name, keyword.key, keyword.rule, keyword.reminder].join(" ").toLowerCase().includes(query),
  );
  return (
    <div className="rules-keywords">
      <label className="rules-keywords__filter">
        <span>{t("learn.rules.keywordFilter")}</span>
        <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </label>
      {shown.length === 0 ? <p role="status">{t("learn.rules.keywordEmpty")}</p> : null}
      <dl>
        {shown.map((keyword) => {
          const drill = findPlayableDrill(keyword.key);
          return (
            <div key={keyword.key}>
              <dt>
                <span>&lt;{keyword.name}&gt;</span>
                <small>
                  <a href={getOfficialRuleUrl(keyword.rule)} target="_blank" rel="noreferrer">
                    {t("learn.rules.keywordRule", { rule: keyword.rule })}
                  </a>
                </small>
              </dt>
              <dd lang="en">{keyword.reminder}</dd>
              {drill ? (
                <dd className="rules-keywords__try">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Icons.Play}
                    aria-label={t("learn.rules.tryDrillLabel", { keyword: keyword.name })}
                    onClick={() => onTryDrill(drill)}
                  >
                    {t("learn.rules.tryIt")}
                  </Button>
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
