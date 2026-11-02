// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Phase, type DecisionRequest, type GameState } from "@aegis/shared";
import { Side } from "../../side";
import { useOverlayState } from "./useOverlayState";
import { GameState as MutableGameState, PendingDecision, CombatWindow } from "@aegis/shared/schema/GameState";
import { useBoardSelection } from "@/game/screen/hooks/useBoardSelection";

type Props = { decision: DecisionRequest | undefined; state: GameState };

const boardPlayers = [
  { battleArea: [{ permanentId: "mine-1" }], hand: [{ instanceId: "reading-card" }] },
  { battleArea: [{ permanentId: "opp-1" }], hand: [] },
];

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: Phase.Main,
    turnSeat: 1,
    gameOver: false,
    players: boardPlayers,
    ...overrides,
  } as unknown as GameState;
}

function decisionFor(decisionId: string): DecisionRequest {
  return { decisionId } as DecisionRequest;
}

function renderOverlays() {
  return renderHook(
    (props: Props) =>
      useOverlayState({
        ...props,
        handPreview: null,
        setHandPreview: () => undefined,
        clearSel: () => undefined,
        clearDeclarations: () => undefined,
        viewerSeat: 0,
      }),
    {
      initialProps: { decision: undefined, state: gameState() } as Props,
    },
  );
}

// Issue #55: every opponent phase, decision and turn change closed the card the
// viewer was reading, so the opponent's turn could not be followed card by card.
describe("windows that only show cards", () => {
  function openReadOnlyWindows(result: ReturnType<typeof renderOverlays>["result"]) {
    act(() => {
      result.current.setCardMenu({ permanentId: "opp-1", side: Side.Opponent, x: 10, y: 10 });
      result.current.setStackView("opp-1");
      result.current.setTrashView(Side.Opponent);
      result.current.setSecurityView(Side.Viewer);
    });
  }

  it("stay open through the opponent's phases, decisions and turn change", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    for (const state of [
      gameState({ phase: Phase.Breeding }),
      gameState({ phase: Phase.Main, pendingDecision: { decisionId: "bot-1" } } as Partial<GameState>),
      gameState({ phase: Phase.Main, combatWindow: { kind: "block" } } as Partial<GameState>),
      gameState({ phase: Phase.Active, turnSeat: 0 }),
    ])
      rerender({ decision: undefined, state });
    expect(result.current.cardMenu?.permanentId).toBe("opp-1");
    expect(result.current.stackView).toBe("opp-1");
    expect(result.current.trashView).toBe(Side.Opponent);
    expect(result.current.securityView).toBe(Side.Viewer);
  });

  it("close when the viewer gets a decision of their own, so the prompt is never covered", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    act(() => result.current.setStackView("mine-1"));
    rerender({ decision: decisionFor("mine-1"), state: gameState() });
    expect(result.current.cardMenu).toBeNull();
    expect(result.current.stackView).toBeNull();
    expect(result.current.trashView).toBeNull();
    expect(result.current.securityView).toBeNull();
  });

  it("leave the viewer's own action menu to close with the action window, as before", () => {
    const { result, rerender } = renderOverlays();
    act(() => result.current.setCardMenu({ permanentId: "mine-1", side: Side.Viewer, x: 0, y: 0 }));
    rerender({ decision: undefined, state: gameState({ phase: Phase.End }) });
    expect(result.current.cardMenu).toBeNull();
  });
});

describe("pinned hand inspection during opponent actions", () => {
  function renderInspection() {
    const initialProps: Props = {
      decision: undefined,
      state: Object.assign(new MutableGameState(), { phase: Phase.Main, turnSeat: 1 }),
    };
    return renderHook(
      (props: Props) => {
        const selection = useBoardSelection({ state: props.state, viewerSeat: 0 });
        useOverlayState({
          ...props,
          handPreview: selection.handPreview,
          setHandPreview: selection.setHandPreview,
          clearSel: selection.clearSel,
          clearDeclarations: selection.clearDeclarations,
          viewerSeat: 0,
        });
        return selection;
      },
      { initialProps },
    );
  }

  it.each([
    { label: "phase change", phase: Phase.End },
    { label: "turn change", turnSeat: 0 },
    {
      label: "opponent decision",
      pendingDecision: Object.assign(new PendingDecision(), { decisionId: "opponent", seat: 1 }),
    },
    { label: "combat window", combatWindow: Object.assign(new CombatWindow(), { kind: "block", seat: 1 }) },
  ])("preserves inspection and clears declarations through $label", (change) => {
    const { result, rerender } = renderInspection();
    act(() => {
      result.current.setHandPreview("reading-card");
      result.current.setHandSel("declared-card");
    });
    rerender({
      decision: undefined,
      state: Object.assign(
        new MutableGameState(),
        { phase: Phase.Main, turnSeat: 1 },
        {
          phase: change.phase ?? Phase.Main,
          turnSeat: change.turnSeat ?? 1,
          pendingDecision: change.pendingDecision,
          combatWindow: change.combatWindow,
        },
      ),
    });
    expect(result.current.handPreview).toBe("reading-card");
    expect(result.current.handSel).toBeNull();
  });

  it.each(["decision", "gameOver", "combatWindow"])("closes inspection for the viewer's %s", (reason) => {
    const { result, rerender } = renderInspection();
    act(() => result.current.setHandPreview("reading-card"));
    rerender({
      decision: reason === "decision" ? decisionFor("viewer-decision") : undefined,
      state: Object.assign(new MutableGameState(), {
        phase: Phase.Main,
        turnSeat: 1,
        gameOver: reason === "gameOver",
        combatWindow:
          reason === "combatWindow" ? Object.assign(new CombatWindow(), { kind: "block", seat: 0 }) : undefined,
      }),
    });
    expect(result.current.handPreview).toBeNull();
  });
});

describe("windows the viewer's own decision interrupted", () => {
  function openReadOnlyWindows(result: ReturnType<typeof renderOverlays>["result"]) {
    act(() => {
      result.current.setCardMenu({ permanentId: "opp-1", side: Side.Opponent, x: 10, y: 10 });
      result.current.setStackView("mine-1");
      result.current.setTrashView(Side.Opponent);
      result.current.setSecurityView(Side.Viewer);
    });
  }

  function expectReadOnlyWindowsOpen(current: ReturnType<typeof renderOverlays>["result"]["current"]) {
    expect(current.cardMenu?.permanentId).toBe("opp-1");
    expect(current.stackView).toBe("mine-1");
    expect(current.trashView).toBe(Side.Opponent);
    expect(current.securityView).toBe(Side.Viewer);
  }

  it("reopen once the viewer answers the decision", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    expect(result.current.stackView).toBeNull();
    rerender({ decision: undefined, state: gameState() });
    expectReadOnlyWindowsOpen(result.current);
  });

  it("stay closed through a chain of viewer decisions and combat windows, then reopen", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    const viewerBlock = gameState({
      combatWindow: { kind: "block", seat: 0, attackerPermanentId: "opp-1", permanentId: "mine-1" },
    } as unknown as Partial<GameState>);
    rerender({ decision: decisionFor("first"), state: gameState() });
    rerender({ decision: decisionFor("second"), state: gameState() });
    rerender({ decision: undefined, state: viewerBlock });
    expect(result.current.stackView).toBeNull();
    expect(result.current.trashView).toBeNull();
    rerender({ decision: undefined, state: gameState() });
    expectReadOnlyWindowsOpen(result.current);
  });

  it("leave out a permanent that left the board while the viewer answered", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    const boardWithoutOpponent = [boardPlayers[0], { battleArea: [], hand: [] }];
    rerender({
      decision: undefined,
      state: gameState({ players: boardWithoutOpponent } as unknown as Partial<GameState>),
    });
    expect(result.current.cardMenu).toBeNull();
    expect(result.current.stackView).toBe("mine-1");
    expect(result.current.trashView).toBe(Side.Opponent);
  });

  it("give way to a window the viewer opened while answering", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    act(() => result.current.setStackView("opp-1"));
    rerender({ decision: undefined, state: gameState() });
    expect(result.current.stackView).toBe("opp-1");
    expect(result.current.cardMenu).toBeNull();
    expect(result.current.trashView).toBeNull();
  });

  it("do not reopen the viewer's own action menu, which belongs to the closed action window", () => {
    const { result, rerender } = renderOverlays();
    act(() => result.current.setCardMenu({ permanentId: "mine-1", side: Side.Viewer, x: 0, y: 0 }));
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    rerender({ decision: undefined, state: gameState() });
    expect(result.current.cardMenu).toBeNull();
  });

  it("do not reopen after the match ends", () => {
    const { result, rerender } = renderOverlays();
    openReadOnlyWindows(result);
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    rerender({ decision: undefined, state: gameState({ gameOver: true } as Partial<GameState>) });
    expect(result.current.stackView).toBeNull();
    expect(result.current.trashView).toBeNull();
  });
});

describe("pinned hand inspection interrupted by the viewer's decision", () => {
  function renderInspection() {
    return renderHook(
      (props: Props) => {
        const selection = useBoardSelection({ state: props.state, viewerSeat: 0 });
        useOverlayState({
          ...props,
          handPreview: selection.handPreview,
          setHandPreview: selection.setHandPreview,
          clearSel: selection.clearSel,
          clearDeclarations: selection.clearDeclarations,
          viewerSeat: 0,
        });
        return selection;
      },
      { initialProps: { decision: undefined, state: gameState() } as Props },
    );
  }

  it("reopens the card the viewer was reading once the decision is answered", () => {
    const { result, rerender } = renderInspection();
    act(() => result.current.setHandPreview("reading-card"));
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    expect(result.current.handPreview).toBeNull();
    rerender({ decision: undefined, state: gameState() });
    expect(result.current.handPreview).toBe("reading-card");
  });

  it("stays closed when the decision took the card out of the hand", () => {
    const { result, rerender } = renderInspection();
    act(() => result.current.setHandPreview("reading-card"));
    rerender({ decision: decisionFor("viewer-decision"), state: gameState() });
    const emptyHand = [{ ...boardPlayers[0], hand: [] }, boardPlayers[1]];
    rerender({ decision: undefined, state: gameState({ players: emptyHand } as unknown as Partial<GameState>) });
    expect(result.current.handPreview).toBeNull();
  });
});
