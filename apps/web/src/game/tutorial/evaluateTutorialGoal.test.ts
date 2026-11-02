import { describe, expect, it } from "vitest";
import { type GameState, Phase } from "@aegis/shared";
import { TutorialGoalKind } from "@aegis/shared/tutorial/TutorialGoalKind";
import { evaluateTutorialGoal } from "@/game/tutorial/evaluateTutorialGoal";

type BoardParams = {
  phase?: Phase;
  turnSeat?: 0 | 1;
  field?: { cardId: string; suspended?: boolean; stack?: number; sources?: string[]; linked?: string[] }[];
  breeding?: string;
  trash?: string[];
  hand?: string[];
  opponentSecurity?: number;
  security?: number;
  opponentTrash?: string[];
  memory?: number;
  combatWindow?: { kind: string; seat: 0 | 1 };
};

function buildState({
  phase = Phase.Main,
  turnSeat = 0,
  field = [],
  breeding,
  trash = [],
  hand = [],
  opponentSecurity = 5,
  security = 5,
  opponentTrash = [],
  memory = 3,
  combatWindow,
}: BoardParams): GameState {
  const viewer = {
    battleArea: field.map((entry, index) => ({
      permanentId: `p${index}`,
      topCard: { cardId: entry.cardId },
      isSuspended: entry.suspended === true,
      stack: (entry.sources ?? Array.from({ length: entry.stack ?? 0 }, () => "under")).map((cardId) => ({ cardId })),
      linked: (entry.linked ?? []).map((cardId) => ({ cardId })),
    })),
    breeding: breeding ? { topCard: { cardId: breeding } } : undefined,
    trash: trash.map((cardId) => ({ cardId })),
    hand: hand.map((cardId) => ({ cardId })),
    securityCount: security,
  };
  const opponent = {
    battleArea: [],
    trash: opponentTrash.map((cardId) => ({ cardId })),
    securityCount: opponentSecurity,
  };
  return { phase, turnSeat, memory, players: [viewer, opponent], combatWindow } as unknown as GameState;
}

describe("tutorial goals", () => {
  it("waits for the actual draw and a surviving unsuspended host in an effect chain", () => {
    const drawn = { kind: TutorialGoalKind.HAND_HAS_CARD.value, cardId: "BT4-030" } as const;
    expect(evaluateTutorialGoal({ goal: drawn, state: buildState({}), viewerSeat: 0 })).toBe(false);
    expect(evaluateTutorialGoal({ goal: drawn, state: buildState({ trash: ["BT4-030"] }), viewerSeat: 0 })).toBe(false);
    expect(evaluateTutorialGoal({ goal: drawn, state: buildState({ hand: ["BT4-030"] }), viewerSeat: 0 })).toBe(true);
    const ready = { kind: TutorialGoalKind.CARD_UNSUSPENDED.value, cardId: "EX12-060" } as const;
    expect(evaluateTutorialGoal({ goal: ready, state: buildState({}), viewerSeat: 0 })).toBe(false);
    expect(
      evaluateTutorialGoal({
        goal: ready,
        state: buildState({ field: [{ cardId: "EX12-060", suspended: true }] }),
        viewerSeat: 0,
      }),
    ).toBe(false);
    expect(
      evaluateTutorialGoal({ goal: ready, state: buildState({ field: [{ cardId: "EX12-060" }] }), viewerSeat: 0 }),
    ).toBe(true);
  });
  it("requires a surviving host for Detach and an actual replay for Fortitude", () => {
    const detached = {
      kind: TutorialGoalKind.PERMANENT_LINK_COUNT_AT_MOST.value,
      cardId: "BT26-037",
      count: 0,
    } as const;
    expect(
      evaluateTutorialGoal({
        goal: detached,
        state: buildState({ field: [{ cardId: "BT26-037", linked: ["BT26-010"] }] }),
        viewerSeat: 0,
      }),
    ).toBe(false);
    expect(evaluateTutorialGoal({ goal: detached, state: buildState({}), viewerSeat: 0 })).toBe(false);
    expect(
      evaluateTutorialGoal({ goal: detached, state: buildState({ field: [{ cardId: "BT26-037" }] }), viewerSeat: 0 }),
    ).toBe(true);
    const revived = { kind: TutorialGoalKind.STACK_HEIGHT_AT_MOST.value, cardId: "EX5-036", height: 1 } as const;
    expect(
      evaluateTutorialGoal({
        goal: revived,
        state: buildState({ field: [{ cardId: "EX5-036", stack: 1 }] }),
        viewerSeat: 0,
      }),
    ).toBe(false);
    expect(evaluateTutorialGoal({ goal: revived, state: buildState({}), viewerSeat: 0 })).toBe(false);
    expect(
      evaluateTutorialGoal({ goal: revived, state: buildState({ field: [{ cardId: "EX5-036" }] }), viewerSeat: 0 }),
    ).toBe(true);
  });

  it("observes source, link and security changes and the correct side of memory", () => {
    const state = buildState({
      field: [{ cardId: "host", sources: ["tamer"], linked: ["first", "second"] }],
      security: 1,
      opponentTrash: ["target"],
      turnSeat: 1,
      memory: -2,
    });
    const goals = [
      { kind: TutorialGoalKind.STACK_HAS_CARD.value, cardId: "host", sourceCardId: "tamer" },
      { kind: TutorialGoalKind.PERMANENT_LINK_COUNT_AT_LEAST.value, cardId: "host", count: 2 },
      { kind: TutorialGoalKind.VIEWER_SECURITY_AT_LEAST.value, count: 1 },
      { kind: TutorialGoalKind.VIEWER_SECURITY_AT_MOST.value, count: 1 },
      { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "target" },
      { kind: TutorialGoalKind.MEMORY_AT_LEAST.value, amount: 2 },
    ] as const;
    for (const goal of goals) {
      expect(evaluateTutorialGoal({ goal, state, viewerSeat: 0 })).toBe(true);
    }
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.STACK_HAS_CARD.value, cardId: "host", sourceCardId: "missing" },
        state,
        viewerSeat: 0,
      }),
    ).toBe(false);
    expect(
      evaluateTutorialGoal({ goal: { kind: TutorialGoalKind.MEMORY_AT_LEAST.value, amount: 3 }, state, viewerSeat: 0 }),
    ).toBe(false);
  });
  it("never completes an acknowledge step on its own", () => {
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        state: buildState({}),
        viewerSeat: 0,
      }),
    ).toBe(false);
  });

  it("detects the viewer's phase and the opponent's turn", () => {
    const goal = { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } as const;
    expect(evaluateTutorialGoal({ goal, state: buildState({}), viewerSeat: 0 })).toBe(true);
    expect(evaluateTutorialGoal({ goal, state: buildState({ turnSeat: 1 }), viewerSeat: 0 })).toBe(false);
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        state: buildState({ turnSeat: 1 }),
        viewerSeat: 0,
      }),
    ).toBe(true);
  });

  it("finds cards on the viewer's field, breeding area and trash", () => {
    const state = buildState({
      field: [{ cardId: "ST1-07", suspended: true, stack: 1 }],
      breeding: "ST1-01",
      trash: ["ST1-13"],
    });
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-07" },
        state,
        viewerSeat: 0,
      }),
    ).toBe(true);
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.STACK_HEIGHT_AT_LEAST.value, cardId: "ST1-07", height: 2 },
        state,
        viewerSeat: 0,
      }),
    ).toBe(true);
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-07" },
        state,
        viewerSeat: 0,
      }),
    ).toBe(true);
    expect(
      evaluateTutorialGoal({ goal: { kind: TutorialGoalKind.BREEDING_HAS_CARD.value }, state, viewerSeat: 0 }),
    ).toBe(true);
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "ST1-13" },
        state,
        viewerSeat: 0,
      }),
    ).toBe(true);
  });

  it("reads the opponent's security count and the viewer's block window", () => {
    const state = buildState({ opponentSecurity: 0, combatWindow: { kind: "block", seat: 0 } });
    expect(
      evaluateTutorialGoal({
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        state,
        viewerSeat: 0,
      }),
    ).toBe(true);
    expect(
      evaluateTutorialGoal({ goal: { kind: TutorialGoalKind.BLOCK_WINDOW_OPEN.value }, state, viewerSeat: 0 }),
    ).toBe(true);
    expect(
      evaluateTutorialGoal({ goal: { kind: TutorialGoalKind.BLOCK_WINDOW_OPEN.value }, state, viewerSeat: 1 }),
    ).toBe(false);
  });
});
