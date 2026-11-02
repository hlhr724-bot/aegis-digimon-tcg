import { type ReactNode, useEffect, useState } from "react";
import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { CardMini } from "@/design/cards";
import { Icons } from "@/design/icons";
import { OFFICIAL_COMPREHENSIVE_RULES_URL } from "@/game/keywordGlossary";
import { useTranslation } from "@/i18n/useTranslation";
import { LessonBriefing } from "@/learn/LessonBriefing";
import { AttackFlowDiagram } from "@/learn/rules/AttackFlowDiagram";
import { getRulesChapterAnchor } from "@/learn/rules/getRulesChapterAnchor";
import { getRulesGuideChapters } from "@/learn/rules/getRulesGuideChapters";
import { getRulesGuideLabels } from "@/learn/rules/getRulesGuideLabels";
import { isRulesChapterId } from "@/learn/rules/isRulesChapterId";
import { KeywordList } from "@/learn/rules/KeywordList";
import { LevelLadderDiagram } from "@/learn/rules/LevelLadderDiagram";
import { MemoryGaugeDiagram } from "@/learn/rules/MemoryGaugeDiagram";
import { PhaseStripDiagram } from "@/learn/rules/PhaseStripDiagram";
import { rulesChapters, type RulesChapterId } from "@/learn/rules/rulesChapters";
import { rulesChapterGroups } from "@/learn/rules/rulesChapterGroups";
import { RulesChapterContent } from "@/learn/rules/RulesChapterContent";
import { ChapterBattleList } from "@/learn/rules/ChapterBattleList";
import type { RulesGuideChapter } from "@/learn/rules/RulesGuideChapter";
import "@/learn/rules/rules.css";

type Params = { signedIn: boolean; onBack: () => void; onStartLesson: (lessonId: string) => void };

const exampleCards: Partial<Record<RulesChapterId, readonly string[]>> = {
  digivolve: ["ST1-03", "ST1-07"],
  cardTypes: ["ST1-01", "ST1-03", "ST1-12", "ST1-13"],
};

function renderChapterVisual(chapterId: RulesChapterId, onTryDrill: (drill: TutorialLesson) => void): ReactNode {
  if (chapterId === "turn") {
    return <PhaseStripDiagram />;
  }
  if (chapterId === "memory") {
    return <MemoryGaugeDiagram />;
  }
  if (chapterId === "digivolve") {
    return <LevelLadderDiagram />;
  }
  if (chapterId === "attack") {
    return <AttackFlowDiagram />;
  }
  if (chapterId === "keywords") {
    return <KeywordList onTryDrill={onTryDrill} />;
  }
  return null;
}

function focusChapter(anchor: string) {
  const target = document.getElementById(anchor);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "start" });
}

function getSelectedChapterId(anchor: string): RulesChapterId {
  const chapterId = anchor.replace(/^chapter-/, "");
  if (isRulesChapterId(chapterId)) {
    return chapterId;
  }
  return rulesChapters.find((chapter) => anchor.startsWith(`rule-${chapter.id}-`))?.id ?? "goal";
}

function normalizeRulesSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

type SearchParams = { chapter: RulesGuideChapter; query: string };

function matchesChapterSearch({ chapter, query }: SearchParams): boolean {
  return (
    !query ||
    normalizeRulesSearch(
      [chapter.title, ...chapter.topics.flatMap((topic) => [topic.title, topic.rule, topic.body])].join(" "),
    ).includes(query)
  );
}

export function RulesScreen({ onBack, onStartLesson }: Params) {
  const { t, locale } = useTranslation();
  const chapters = getRulesGuideChapters(locale);
  const labels = getRulesGuideLabels(locale);
  const contentLanguage = locale === "pt-BR" ? "pt-BR" : "en";
  const [briefingLesson, setBriefingLesson] = useState<TutorialLesson>();
  const [contentsOpen, setContentsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [navigation, setNavigation] = useState(() => ({
    anchor: window.location.hash.slice(1),
    focus: window.location.hash !== "",
  }));
  const anchor = navigation.anchor;
  const selectedChapterId = getSelectedChapterId(anchor);
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === selectedChapterId);
  const chapter = chapters[chapterIndex]!;
  const previous = chapters[chapterIndex - 1];
  const next = chapters[chapterIndex + 1];
  const cards = exampleCards[chapter.id] ?? [];
  const query = normalizeRulesSearch(filter.trim());
  const visibleGroups = rulesChapterGroups
    .map((group) => ({
      ...group,
      chapters: chapters.filter(
        (entry) => group.chapterIds.includes(entry.id) && matchesChapterSearch({ chapter: entry, query }),
      ),
    }))
    .filter((group) => group.chapters.length > 0);

  useEffect(() => {
    function syncChapter() {
      setNavigation({ anchor: window.location.hash.slice(1), focus: true });
      setContentsOpen(false);
    }
    window.addEventListener("hashchange", syncChapter);
    window.addEventListener("popstate", syncChapter);
    return () => {
      window.removeEventListener("hashchange", syncChapter);
      window.removeEventListener("popstate", syncChapter);
    };
  }, []);

  useEffect(() => {
    if (navigation.focus) {
      const selectedLink = document.querySelector<HTMLElement>(".rules-contents [aria-current]");
      if (selectedLink?.getClientRects().length) {
        selectedLink.scrollIntoView({ block: "nearest" });
      }
      focusChapter(navigation.anchor || "rules-guide-start");
    }
  }, [navigation]);

  function navigateToAnchor(target: string) {
    if (window.location.hash !== `#${target}`) {
      window.history.pushState(null, "", `#${target}`);
    }
    setContentsOpen(false);
    setNavigation({ anchor: target, focus: true });
  }

  return (
    <main className="rules-page">
      <div className="aegis-page-sheet rules-sheet">
        <nav className="rules-contents" aria-label={t("learn.rules.contents")}>
          <button type="button" className="rules-back" onClick={onBack}>
            <Icons.ChevronLeft size={16} />
            {t("learn.rules.back")}
          </button>
          <h2 className="rules-contents__heading">{t("learn.rules.contents")}</h2>
          <button
            type="button"
            className="rules-contents__toggle"
            aria-expanded={contentsOpen}
            aria-controls="rules-contents-panel"
            onClick={() => setContentsOpen((open) => !open)}
          >
            {t("learn.rules.contents")}
            <span>
              {chapterIndex + 1} / {chapters.length}
            </span>
            <Icons.ChevronDown size={16} />
          </button>
          <div id="rules-contents-panel" className="rules-contents__body" data-open={contentsOpen || undefined}>
            <label className="rules-contents__search">
              <span>{t("learn.guide.chapterSearch")}</span>
              <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
            </label>
            {visibleGroups.length === 0 ? (
              <p className="rules-contents__empty" role="status">
                {t("learn.guide.searchEmpty")}
              </p>
            ) : null}
            {visibleGroups.map((group) => (
              <div className="rules-contents__group" key={group.id}>
                <h3>{t(group.titleKey)}</h3>
                <ol className="rules-contents__list">
                  {group.chapters.map((entry) => (
                    <li key={entry.id}>
                      <a
                        href={`#${getRulesChapterAnchor(entry.id)}`}
                        aria-current={entry.id === chapter.id ? "page" : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          navigateToAnchor(getRulesChapterAnchor(entry.id));
                        }}
                      >
                        <span aria-hidden="true">{chapters.indexOf(entry) + 1}</span>
                        <span lang={contentLanguage}>{entry.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <a className="rules-official" href={OFFICIAL_COMPREHENSIVE_RULES_URL} target="_blank" rel="noreferrer">
            {t("learn.rules.officialRules")}
            <Icons.ExternalLink size={13} />
          </a>
        </nav>
        <article className="rules-article">
          <header className="rules-article__head">
            <span className="aegis-eyebrow">{t("learn.eyebrow")}</span>
            <h1 id="rules-guide-start" tabIndex={-1}>
              {t("learn.rulesHeading")}
            </h1>
            <p>{t("learn.rulesLede")}</p>
            {locale !== "en" && locale !== "pt-BR" ? (
              <p className="rules-language-note" lang="en">
                {labels.fallback}
              </p>
            ) : null}
            <details className="rules-source" lang={contentLanguage}>
              <summary>{labels.source}</summary>
              <p>{labels.introduction}</p>
              <a href={OFFICIAL_COMPREHENSIVE_RULES_URL} target="_blank" rel="noreferrer">
                {t("learn.rules.officialRules")}
              </a>
            </details>
          </header>
          <section
            key={chapter.id}
            id={getRulesChapterAnchor(chapter.id)}
            className="rules-chapter"
            tabIndex={-1}
            aria-labelledby={`${getRulesChapterAnchor(chapter.id)}-title`}
          >
            <div className="rules-chapter__progress" aria-live="polite">
              <span>{t("learn.guide.chapterProgress", { current: chapterIndex + 1, total: chapters.length })}</span>
              <span>{t("learn.guide.topicCount", { count: chapter.topics.length })}</span>
            </div>
            <h2 id={`${getRulesChapterAnchor(chapter.id)}-title`} lang={contentLanguage}>
              <span className="rules-chapter__number" aria-hidden="true">
                {chapterIndex + 1}
              </span>
              <span>{chapter.title}</span>
            </h2>
            <details className="rules-topic-index">
              <summary>{t("learn.guide.onThisChapter")}</summary>
              <ol lang={contentLanguage}>
                {chapter.topics.map((topic) => (
                  <li key={topic.id}>
                    <a
                      href={`#rule-${chapter.id}-${topic.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigateToAnchor(`rule-${chapter.id}-${topic.id}`);
                      }}
                    >
                      {topic.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
            {renderChapterVisual(chapter.id, setBriefingLesson)}
            <ChapterBattleList chapterId={chapter.id} onTryBattle={setBriefingLesson} />
            <RulesChapterContent chapter={chapter} />
            {cards.length ? (
              <div className="rules-cards">
                {cards.map((cardId) => (
                  <CardMini key={cardId} cardId={cardId} width={96} />
                ))}
              </div>
            ) : null}
            <nav className="rules-chapter__pager" aria-label={t("learn.rulesHeading")}>
              {previous ? (
                <a
                  href={`#${getRulesChapterAnchor(previous.id)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateToAnchor(getRulesChapterAnchor(previous.id));
                  }}
                >
                  <Icons.ChevronLeft size={16} />
                  <span>{t("learn.rules.previous", { chapter: previous.title })}</span>
                </a>
              ) : (
                <span />
              )}
              {next ? (
                <a
                  href={`#${getRulesChapterAnchor(next.id)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateToAnchor(getRulesChapterAnchor(next.id));
                  }}
                >
                  <span>{t("learn.rules.nextChapter", { chapter: next.title })}</span>
                  <Icons.ChevronRight size={16} />
                </a>
              ) : null}
            </nav>
          </section>
        </article>
      </div>
      {briefingLesson ? (
        <LessonBriefing
          lesson={briefingLesson}
          onClose={() => setBriefingLesson(undefined)}
          onStart={(lessonId) => {
            setBriefingLesson(undefined);
            onStartLesson(lessonId);
          }}
        />
      ) : null}
    </main>
  );
}
