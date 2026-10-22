# Learn

The Learn area helps new players. It has three parts:

| Part              | Route                                    | Owner                                                                      |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Lessons           | `/learn`                                 | `LearnScreen.tsx`, catalog in `@aegis/shared/tutorial/tutorialLessons`     |
| How to Play guide | `/learn/rules`                           | `rules/RulesScreen.tsx`, chapters in `rules/rulesChapters.ts`              |
| Keyword drills    | "Try it" in the guide's Keywords chapter | `rules/KeywordList.tsx`, catalog in `@aegis/shared/tutorial/keywordDrills` |

Lessons and drills are solo bot matches. The client sends the lesson or drill ID as `storyBattleId`. The server resolves it like a story battle; see [story rooms](../../../api/src/story/README.md). Completion is stored only when the player wins, so every lesson and drill must end in a win.

The Lessons catalog has eight topic subsections: first steps, memory and digivolution, defense and support, rules in practice, combat keywords, protection and materials, digivolution and resources, and advanced effect interactions. It exposes six introductory lessons, six additional rule battles, and all forty-four keyword drills without duplicating the introductory practice variants. `lessonGroups` owns presentation grouping; the shared catalogs and API retain authority over the available matches and prerequisites. Each entry and its briefing link numbered references to the official manual through `getLessonRuleReferences`. Entries also link the corresponding guide chapter. The six introductory lessons retain their progress sequence; the other battles can be started directly.

Battle coaching and catalog labels are translated in all eleven interface languages. The detailed rules explanations have the separate language coverage described below.

## Official rules guide

The guide covers all 18 sections of the official Comprehensive Rules Manual, Ver. 4.3, updated September 18, 2026. Its 21 chapters preserve the original lesson anchors and separate security checks from ordinary battles. The guide renders one chapter at a time. Its grouped contents can be searched by chapter title, topic text, or printed rule number. Chapter hashes remain compatible; topic hashes use `#rule-<chapter>-<topic>`. Navigation and browser history restore the selected chapter and focus after the mobile contents panel closes. Each topic includes printed rule numbers and a detailed explanation. References open the official PDF at the beginning of the relevant manual section.

`rules/content/rulesBasics.*.ts` and `rules/content/rulesAdvanced.*.ts` contain 140 matching English and Brazilian Portuguese topics including the keyword introduction. `getRulesGuideChapters` orders them through `rulesChapters`. Other interface locales display the detailed content in English with an explicit language notice.

Every official keyword has a playable bot match. `keywordDrills` combines the original ten drills with the combat, protection, and evolution catalogs. Their API scenario registries resolve real-card fixtures; every fixture has a public-intent test that demonstrates the keyword and wins the match. `buildKeywordDrillFixture` counts seeded cards and fills each main deck to exactly fifty cards, preserving the scripted opening order.

`rules/rulesChapterBattles.ts` assigns example battles to every rules chapter. `rulePracticeLessons` provides unrestricted practice versions of the six introductory lessons and dedicated opening-position and rule-check battles, plus four advanced matches from `advancedPracticeLessons`. The advanced matches cover derived trigger groups with once-per-turn limits, resolving a normal draw before losing it through digivolution, inherited departure prevention whose sacrifice triggers recruitment, and inherited unsuspension before Engage. Their behavioral tests include both successful lines and consequential ordering mistakes. These practice versions preserve the introductory lesson prerequisites in the normal learning sequence while allowing readers to try the relevant rule directly. The server resolves practice IDs through `getRulePracticeScenario`; the client only sends the chosen ID.

`rules/rulesGuide.test.ts` checks coverage against every numbered subsection of `data/kb/rules/comprehensive.md`, verifies that cited rule numbers exist, and checks playable keyword/chapter coverage and bilingual coaching text. API room tests validate every fixed deck and bot registration. Run `pnpm verify:rules-source` to check whether the committed manual still matches the official PDF before revising this content. These checks establish coverage and references; factual explanations also need review against the full cited rules.

## In the match

`game/tutorial/TutorialCoach.tsx` shows the current step next to the board.

- **Goals:** `evaluateTutorialGoal` checks each step's goal against the synchronized state. The coach never decides legality and never sends intents.
- **Highlight:** `findTutorialHighlightElement` finds the step's target on the board through stable `data-*` hooks, and `TutorialSpotlight` draws a ring below dialog layers. Visible modal dialogs hide the board ring.
- **Coach window:** `TutorialCoachWindow` provides a six-dot drag handle, arrow-key movement, Home to restore docking, and an explicit compact toggle. The shared draggable-window hook keeps its controls within the viewport. Compacting preserves the current instruction, hint, and progress. Touch layouts start compact, and expanded content scrolls within the available height.
- **Decisions:** when the player has a pending decision or combat prompt, the coach shrinks to a chip. It can be reopened for the current decision and compacts again for the next one. Block steps are the exception.
- **Result:** the coach replaces the normal game-over splash with `TutorialResult`. It offers the next lesson, a retry after a loss, or a way back.

## Add a lesson or drill

1. Add the fixture in `apps/api/src/engine/scenarios/<id>.fixture.ts`, plus a test that plays the coached line to a win.
2. Register it in `getTutorialScenario` (lessons) or `getKeywordDrillScenario` (drills).
3. Add the entry and its steps to `tutorialLessons` or `keywordDrills`. Each step's goal must become true only through the action that step asks for.
4. Add English text under `learn.lesson.<id>.*` in `i18n/learn/lessons.en.ts` or `i18n/learn/drills.en.ts`, then translate it in every locale file under `i18n/learn/`.

## Simplified Chinese terminology

`getChineseLearnDictionary` normalizes `learn.*` messages when the Simplified Chinese dictionary loads, using the maintained card-name, keyword, reminder, and trait dictionaries. New lessons reuse those translations automatically. Full names take precedence over shorter names, and interpolation placeholders and identifiers remain unchanged. Other pages and locales keep their existing behavior.

Write Chinese prose for new lessons and use complete card names where possible. Unknown terms and new sentences still need translation. The learning dictionary regression suite rejects missing Chinese prose and messages that fall back to the English learning dictionary, including fallback text whose known terminology has already been normalized.
