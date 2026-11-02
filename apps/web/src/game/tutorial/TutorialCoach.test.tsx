import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { GameState } from "@aegis/shared/schema/GameState";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { afterEach, expect, it, vi } from "vitest";
import { TutorialCoach } from "@/game/tutorial/TutorialCoach";
import { I18nProvider } from "@/i18n/I18nProvider";

function buildState(decisionId?: string): GameState {
  return {
    stateVersion: 1,
    gameOver: false,
    players: [{ battleArea: [] }, { battleArea: [] }],
    pendingDecision: decisionId ? { decisionId, seat: 0, kind: "optional" } : undefined,
  } as unknown as GameState;
}

function renderCoach(state = buildState()) {
  function buildView(nextState: GameState) {
    return (
      <I18nProvider>
        <TutorialCoach
          lesson={tutorialLessons[0]!}
          state={nextState}
          viewerSeat={0}
          onStartLesson={vi.fn<(lessonId: string) => void>()}
          onLeave={vi.fn<() => void>()}
        />
      </I18nProvider>
    );
  }
  return { ...render(buildView(state)), buildView };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps the current instruction and progress when compacting and reopening the coach", () => {
  renderCoach();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Hint" }));
  const instruction = screen.getByText(/Click Birdramon/i).textContent;
  fireEvent.click(screen.getByRole("button", { name: "Minimize coach" }));
  expect(screen.queryByRole("button", { name: "Hint" })).toBeNull();
  expect(screen.getByRole("button", { name: "Show coach" }).getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByRole("button", { name: "Show coach" }).textContent).toContain("Step 2 of 4");
  fireEvent.click(screen.getByRole("button", { name: "Show coach" }));
  expect(screen.getByRole("button", { name: "Hide hint" })).toBeTruthy();
  expect(screen.getByText(instruction!)).toBeTruthy();
});

it("reopens on request and compacts again for a new pending decision", () => {
  const { rerender, buildView } = renderCoach(buildState("first"));
  expect(screen.getByRole("button", { name: "Show coach" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Show coach" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  rerender(buildView(buildState("second")));
  expect(screen.getByRole("button", { name: "Show coach" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
});

it("starts compact on a touch layout", () => {
  const query = window.matchMedia("(width < 600px)");
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...query, matches: true });
  renderCoach();
  expect(screen.getByRole("button", { name: "Show coach" })).toBeTruthy();
});

it("compacts for a new combat window from the same permanent", () => {
  const combatWindow = {
    kind: "barrier",
    seat: 0,
    permanentId: "attacker",
  } as GameState["combatWindow"];
  const { rerender, buildView } = renderCoach({ ...buildState(), combatWindow } as GameState);
  fireEvent.click(screen.getByRole("button", { name: "Show coach" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  rerender(buildView({ ...buildState(), combatWindow: { ...combatWindow } } as GameState));
  expect(screen.getByRole("button", { name: "Show coach" })).toBeTruthy();
});

it("keeps a requested expansion while the same combat window receives state updates", () => {
  const combatWindow = {
    kind: "counter",
    seat: 0,
    attackerPermanentId: "attacker",
  } as GameState["combatWindow"];
  const { rerender, buildView } = renderCoach({ ...buildState(), combatWindow } as GameState);
  fireEvent.click(screen.getByRole("button", { name: "Show coach" }));
  rerender(buildView({ ...buildState(), stateVersion: 2, combatWindow } as GameState));
  expect(screen.getByRole("button", { name: "Minimize coach" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
});

it("moves the coach by keyboard and resets it without changing the lesson", () => {
  renderCoach();
  const panel = screen.getByRole("complementary", { name: "Lesson coach" });
  const handle = within(panel).getByRole("button", { name: "Move lesson coach" });
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 20,
    top: 100,
    width: 320,
    height: 300,
    right: 340,
    bottom: 400,
    x: 20,
    y: 100,
    toJSON() {},
  });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(panel.style.left).toBe("40px");
  expect(panel.style.top).toBe("100px");
  fireEvent.keyDown(handle, { key: "Home" });
  expect(panel.style.left).toBe("");
  expect(panel.hasAttribute("data-moved")).toBe(false);
  expect(screen.getByText("Step 1 of 4")).toBeTruthy();
});

it.each(["mouse", "touch"])("keeps a coach dragged with %s inside the viewport", (pointerType) => {
  renderCoach();
  const panel = screen.getByRole("complementary", { name: "Lesson coach" });
  const handle = within(panel).getByRole("button", { name: "Move lesson coach" });
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 20,
    top: 100,
    width: 320,
    height: 300,
    right: 340,
    bottom: 400,
    x: 20,
    y: 100,
    toJSON() {},
  });
  fireEvent.pointerDown(handle, { pointerId: 1, button: 0, pointerType, clientX: 30, clientY: 110 });
  fireEvent.pointerMove(handle, { pointerId: 1, pointerType, clientX: -1000, clientY: -1000 });
  fireEvent.pointerUp(handle, { pointerId: 1, pointerType });
  expect(panel.style.left).toBe("8px");
  expect(panel.style.top).toBe("8px");
  expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
});
