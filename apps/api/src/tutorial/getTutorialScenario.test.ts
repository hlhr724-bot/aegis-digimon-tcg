import { describe, expect, it } from "vitest";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { getKeywordDrillScenario } from "#api/tutorial/getKeywordDrillScenario";
import { getTutorialScenario } from "#api/tutorial/getTutorialScenario";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import type { TutorialStep } from "@aegis/shared/tutorial/TutorialStep";
import { TutorialHighlightKind } from "@aegis/shared/tutorial/TutorialHighlightKind";
import { keywordDrills } from "@aegis/shared/tutorial/keywordDrills";
import { TutorialGoalKind } from "@aegis/shared/tutorial/TutorialGoalKind";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { rulePracticeLessons } from "@aegis/shared/tutorial/rulePracticeLessons";
import { getRulePracticeScenario } from "#api/tutorial/getRulePracticeScenario";

type CardReference = { cardId: string; seat: 0 | 1 };

function getCardReferences(step: TutorialStep): CardReference[] {
  const references: CardReference[] = [];
  if ("cardId" in step.goal && step.goal.cardId) {
    const seat = step.goal.kind === TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value ? 1 : 0;
    references.push({ cardId: step.goal.cardId, seat });
  }
  if ("sourceCardId" in step.goal) {
    references.push({ cardId: step.goal.sourceCardId, seat: 0 });
  }
  if (step.highlight && "cardId" in step.highlight) {
    const seat = step.highlight.kind === TutorialHighlightKind.OPPONENT_FIELD_CARD.value ? 1 : 0;
    references.push({ cardId: step.highlight.cardId, seat });
  }
  return references;
}

type FixtureCardsParams = { fixture: ScenarioFixture; steps: readonly TutorialStep[] };

function findMissingStepCards({ fixture, steps }: FixtureCardsParams): string[] {
  const decks = ([0, 1] as const).map((seat) => {
    const deck = getStorySeatDeck({ fixture, seat });
    return new Set([...deck.mainDeck, ...deck.eggDeck]);
  });
  return steps.flatMap((step) =>
    getCardReferences(step)
      .filter(({ cardId, seat }) => !decks[seat]!.has(cardId))
      .map(({ cardId }) => `${step.id} ${cardId}`),
  );
}

describe("tutorial lesson catalog", () => {
  it.each(tutorialLessons.map((lesson) => [lesson.id, lesson] as const))("%s has a fixture", (lessonId, lesson) => {
    const fixture = getTutorialScenario(lessonId);
    expect(fixture).toBeDefined();
    expect(fixture!.presentation?.timed).toBe(false);
    expect(fixture!.presentation?.opponent).toBeDefined();
    expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
    expect(lesson.steps.length).toBeLessThanOrEqual(7);
  });

  it.each(tutorialLessons.slice(1).map((lesson) => [lesson.id, lesson] as const))(
    "%s requires an earlier lesson",
    (_id, lesson) => {
      const index = tutorialLessons.indexOf(lesson);
      const prerequisiteIndex = tutorialLessons.findIndex((entry) => entry.id === lesson.prerequisiteId);
      expect(prerequisiteIndex).toBeGreaterThanOrEqual(0);
      expect(prerequisiteIndex).toBeLessThan(index);
    },
  );

  it("starts with a lesson that has no prerequisite", () => {
    expect(tutorialLessons[0]!.prerequisiteId).toBeUndefined();
  });

  it("uses unique lesson ids with the tutorial prefix", () => {
    const ids = tutorialLessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^tutorial-[a-z-]+$/);
    }
  });

  it.each(tutorialLessons.map((lesson) => [lesson.id, lesson] as const))("%s uses unique step ids", (_id, lesson) => {
    const ids = lesson.steps.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it.each(tutorialLessons.map((lesson) => [lesson.id, lesson] as const))(
    "%s only refers to cards in its fixture",
    (lessonId, lesson) => {
      expect(findMissingStepCards({ fixture: getTutorialScenario(lessonId)!, steps: lesson.steps })).toEqual([]);
    },
  );
});

describe("rules practice catalog", () => {
  it.each(rulePracticeLessons.map((lesson) => [lesson.id, lesson] as const))(
    "%s has a scripted fixture and every coached card is available",
    (id, lesson) => {
      const fixture = getRulePracticeScenario(id)!;
      expect(fixture).toBeDefined();
      expect(fixture.presentation?.timed).toBe(false);
      expect(fixture.presentation?.opponent).toBeDefined();
      expect(lesson.prerequisiteId).toBeUndefined();
      expect(findMissingStepCards({ fixture, steps: lesson.steps })).toEqual([]);
      expect(new Set(lesson.steps.map((step) => step.id)).size).toBe(lesson.steps.length);
    },
  );
});

describe("keyword drill catalog", () => {
  const drillEntries = keywordDrills.map((drill) => [drill.id, drill] as const);

  it("uses unique drill ids and keywords with the drill prefix", () => {
    const ids = keywordDrills.map((drill) => drill.id);
    const keywords = keywordDrills.map((drill) => drill.keyword);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keywords).size).toBe(keywords.length);
    for (const id of ids) {
      expect(id).toMatch(/^drill-[a-z-]+$/);
    }
  });

  it.each(drillEntries)("%s has an untimed scripted fixture and no prerequisite", (drillId, drill) => {
    const fixture = getKeywordDrillScenario(drillId);
    expect(fixture).toBeDefined();
    expect(fixture!.presentation?.timed).toBe(false);
    expect(fixture!.presentation?.opponent).toBeDefined();
    expect(drill.keyword).toBeDefined();
    expect(drill.prerequisiteId).toBeUndefined();
    expect(drill.rulesChapterId).toBe("keywords");
  });

  it.each(drillEntries)("%s explains the keyword first and keeps three to seven steps", (_id, drill) => {
    expect(drill.steps[0]!.goal.kind).toBe(TutorialGoalKind.ACKNOWLEDGE.value);
    expect(drill.steps.length).toBeGreaterThanOrEqual(3);
    expect(drill.steps.length).toBeLessThanOrEqual(7);
  });

  it.each(drillEntries)("%s uses unique step ids", (_id, drill) => {
    const ids = drill.steps.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it.each(drillEntries)("%s only refers to cards in its fixture", (drillId, drill) => {
    expect(findMissingStepCards({ fixture: getKeywordDrillScenario(drillId)!, steps: drill.steps })).toEqual([]);
  });
});
