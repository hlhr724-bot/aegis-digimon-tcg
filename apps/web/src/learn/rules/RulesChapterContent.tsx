import { useTranslation } from "@/i18n/useTranslation";
import type { RulesGuideChapter } from "@/learn/rules/RulesGuideChapter";
import { getOfficialRuleUrl } from "@/learn/rules/getOfficialRuleUrl";
import { getRulesGuideLabels } from "@/learn/rules/getRulesGuideLabels";

type Params = { chapter: RulesGuideChapter };

export function RulesChapterContent({ chapter }: Params) {
  const { locale } = useTranslation();
  const labels = getRulesGuideLabels(locale);
  return (
    <div className="rules-topics" lang={locale === "pt-BR" ? "pt-BR" : "en"}>
      {chapter.topics.map((topic) => (
        <section className="rules-topic" key={topic.id} aria-labelledby={`rule-${chapter.id}-${topic.id}`}>
          <h3 id={`rule-${chapter.id}-${topic.id}`} tabIndex={-1}>
            {topic.title}
          </h3>
          <a className="rules-topic__reference" href={getOfficialRuleUrl(topic.rule)} target="_blank" rel="noreferrer">
            {labels.rule} {topic.rule}
          </a>
          <p>{topic.body}</p>
        </section>
      ))}
    </div>
  );
}
