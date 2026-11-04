// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import { OpponentBar, SKIP_BUTTON_HOLD_MS } from "./OpponentBar";

type Props = ComponentProps<typeof OpponentBar>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    handStripRef: createRef<HTMLDivElement>(),
    opponentName: "Rival",
    opponentAvatarId: "",
    viewerSeat: "p1",
    displayedTurnSeat: "p2",
    displayedTurnCount: 3,
    phase: "main",
    memory: 0,
    eggDeckCount: 5,
    handCount: 4,
    deckCount: 30,
    trashCount: 0,
    portraitArena: false,
    narrowGameLayout: false,
    skippable: false,
    onOpenLog: () => undefined,
    onReportBug: () => undefined,
    onOpenArenaLook: () => undefined,
    onSurrender: () => undefined,
    onSkipPresentation: () => undefined,
    ...overrides,
  } as Props;
}

function renderBar(skippable: boolean) {
  const view = render(
    <I18nProvider>
      <OpponentBar {...props({ skippable })} />
    </I18nProvider>,
  );
  return {
    rerender: (next: boolean) =>
      view.rerender(
        <I18nProvider>
          <OpponentBar {...props({ skippable: next })} />
        </I18nProvider>,
      ),
  };
}

function toolbarButtonOrder() {
  return Array.from(document.querySelectorAll(".game-topbar-actions > button")).map(
    (button) => button.getAttribute("data-testid") ?? button.getAttribute("aria-label"),
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Issue #53: the skip button came and went with each animation batch, so every
// toolbar button to its left jumped sideways while the board animated.
describe("the desktop toolbar's skip button", () => {
  it("keeps its slot when there is nothing to skip, so the other buttons never move", () => {
    const bar = renderBar(false);
    const idleOrder = toolbarButtonOrder();
    const skip = screen.getByTestId("skip-presentation");
    expect(skip).toHaveProperty("disabled", true);
    expect(skip.getAttribute("aria-hidden")).toBe("true");
    expect(skip.getAttribute("data-skippable")).toBe("false");

    bar.rerender(true);
    expect(toolbarButtonOrder()).toEqual(idleOrder);
    expect(skip.isConnected).toBe(true);
    expect(skip).toHaveProperty("disabled", false);
    expect(skip.getAttribute("data-skippable")).toBe("true");
  });

  it("stays shown across the short gap between two animation batches", () => {
    const bar = renderBar(true);
    const skip = screen.getByTestId("skip-presentation");
    bar.rerender(false);
    act(() => vi.advanceTimersByTime(SKIP_BUTTON_HOLD_MS - 50));
    expect(skip.getAttribute("data-skippable")).toBe("true");
    bar.rerender(true);
    bar.rerender(false);
    act(() => vi.advanceTimersByTime(SKIP_BUTTON_HOLD_MS - 50));
    expect(skip.getAttribute("data-skippable")).toBe("true");
    act(() => vi.advanceTimersByTime(100));
    expect(skip.getAttribute("data-skippable")).toBe("false");
    expect(screen.getByTestId("skip-presentation")).toBe(skip);
  });
});

describe("the desktop toolbar's trailing group", () => {
  it("ends with feedback, settings and leave, in that order", () => {
    renderBar(false);
    const order = toolbarButtonOrder();
    expect(order.slice(-3)).toEqual(["Send feedback", "Match settings", "Surrender"]);
  });

  it("explains an icon on hover and on focus", () => {
    renderBar(false);
    const feedback = screen.getByRole("button", { name: "Send feedback" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => {
      fireEvent.mouseEnter(feedback);
    });
    expect(screen.getByRole("tooltip").textContent).toBe("Send feedback");
    expect(feedback.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    act(() => {
      fireEvent.mouseLeave(feedback);
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();

    const cog = screen.getByRole("button", { name: "Match settings" });
    act(() => cog.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("Match settings");
  });

  it("closes the tooltip on a mouse click and leaves nothing open after the pointer leaves", () => {
    renderBar(false);
    const feedback = screen.getByRole("button", { name: "Send feedback" });
    act(() => {
      fireEvent.mouseEnter(feedback);
      fireEvent.pointerDown(feedback);
      fireEvent.focus(feedback);
      fireEvent.click(feedback);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => {
      fireEvent.mouseLeave(feedback);
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    const cog = screen.getByRole("button", { name: "Match settings" });
    act(() => cog.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("Match settings");
  });

  it("still runs each button's action when it is clicked", () => {
    const callbacks = {
      onOpenLog: vi.fn<() => void>(),
      onReportBug: vi.fn<() => void>(),
      onOpenArenaLook: vi.fn<() => void>(),
      onSurrender: vi.fn<() => void>(),
      onSkipPresentation: vi.fn<() => void>(),
      onToggleChat: vi.fn<() => void>(),
    };
    render(
      <I18nProvider>
        <OpponentBar {...props({ skippable: true, ...callbacks })} />
      </I18nProvider>,
    );
    const names: [string | RegExp, keyof typeof callbacks][] = [
      ["Match log", "onOpenLog"],
      ["Send feedback", "onReportBug"],
      ["Match settings", "onOpenArenaLook"],
      ["Surrender", "onSurrender"],
      [/skip/i, "onSkipPresentation"],
      [/chat/i, "onToggleChat"],
    ];
    for (const [name, callback] of names) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(callbacks[callback]).toHaveBeenCalledTimes(1);
    }
  });

  it("never opens a tooltip for the hidden skip slot", () => {
    renderBar(false);
    const skip = screen.getByTestId("skip-presentation");
    act(() => {
      fireEvent.mouseEnter(skip);
      fireEvent.focus(skip);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("the portrait match menu's unread count", () => {
  it("counts only chat messages, never match log entries", () => {
    render(
      <I18nProvider>
        <OpponentBar {...props({ portraitArena: true, chatUnread: 2 })} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("menu-unread").textContent).toBe("2");
    expect(screen.getByRole("button", { name: "Match log", hidden: true })).toBeTruthy();
    expect(screen.queryByTestId("log-unread")).toBeNull();
  });

  it("stays hidden while no chat message is unread", () => {
    render(
      <I18nProvider>
        <OpponentBar {...props({ portraitArena: true })} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("menu-unread")).toBeNull();
  });
});

it.each([false, true])(
  "offers leaving instead of surrendering after game over in portrait mode %s",
  (portraitArena) => {
    const leave = vi.fn<() => void>();
    render(
      <I18nProvider>
        <OpponentBar {...props({ gameOver: true, portraitArena, onSurrender: leave })} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Surrender", hidden: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leave match", hidden: true }));
    expect(leave).toHaveBeenCalledOnce();
  },
);

it("shows the opponent's uploaded profile avatar beside their name", () => {
  const { container } = render(
    <I18nProvider>
      <OpponentBar {...props({ opponentAvatarUrl: "/account/avatar/rival/image?v=2" })} />
    </I18nProvider>,
  );
  expect(container.querySelector(".game-player-line__avatar img")?.getAttribute("src")).toBe(
    "/account/avatar/rival/image?v=2",
  );
});
