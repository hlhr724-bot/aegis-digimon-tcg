// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { CardOpenerProvider } from "./cardLinks";
import { AttackAnnouncementBanner, SidePanelStack } from "./SidePanelStack";
import { SIDE_PANEL_LIFETIME_MS, type SidePanel } from "./sidePanels";
import { Side } from "./side";

afterEach(cleanup);

function panel(overrides: Partial<SidePanel> = {}): SidePanel {
  return {
    id: "p1",
    titleKey: "panel.discardedCards",
    side: Side.Viewer,
    cards: [
      { cardId: "BT1-001", badge: 1 },
      { cardId: "BT1-002", badge: 2 },
    ],
    ordered: false,
    createdAt: 0,
    ...overrides,
  };
}

function renderPanel(shown: SidePanel = panel(), onDismiss: (id: string) => void = () => undefined, held = false) {
  return render(
    <I18nProvider>
      <SidePanelStack panel={shown} remainingMs={SIDE_PANEL_LIFETIME_MS} held={held} onDismiss={onDismiss} />
    </I18nProvider>,
  );
}

describe("SidePanelStack", () => {
  it("titles the panel and numbers its cards", () => {
    renderPanel();
    expect(screen.getByText("Discarded cards from hand")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("numbers a single card when the event carried an order", () => {
    renderPanel(panel({ titleKey: "panel.revealedCards", ordered: true, cards: [{ cardId: "BT1-001", badge: 1 }] }));
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("leaves a lone unordered card unnumbered", () => {
    renderPanel(panel({ titleKey: "panel.playedCard", cards: [{ cardId: "BT1-001", badge: 1 }] }));
    expect(screen.queryByText("1")).toBeNull();
  });

  it("marks whose cards moved, so the slot it sits in can be read at a glance", () => {
    renderPanel(panel({ side: Side.Opponent }));
    expect(screen.getByTestId("side-panel").getAttribute("data-side")).toBe("opp");
  });

  it("erodes its border over exactly the time the queue is holding it for", () => {
    const { container } = render(
      <I18nProvider>
        <SidePanelStack panel={panel()} remainingMs={1234} onDismiss={() => undefined} />
      </I18nProvider>,
    );
    expect((container.querySelector(".side-panel__erode") as HTMLElement).style.animationDuration).toBe("1234ms");
  });

  it("pauses the eroding border while a decision holds the clock", () => {
    renderPanel(panel(), () => undefined, true);
    expect(screen.getByTestId("side-panel-stack").getAttribute("data-held")).toBe("true");
  });

  it("hands the fan its card count, so a long reveal overlaps instead of wrapping", () => {
    for (const count of [4, 6]) {
      const cards = Array.from({ length: count }, (_, index) => ({ cardId: "BT1-001", badge: index + 1 }));
      const { container, unmount } = renderPanel(panel({ titleKey: "panel.revealedCards", ordered: true, cards }));
      const row = container.querySelector(".side-panel__cards") as HTMLElement;
      expect(row.style.getPropertyValue("--panel-card-count")).toBe(String(count));
      expect(container.querySelectorAll(".side-panel__card")).toHaveLength(count);
      // Every card keeps its number, which is what makes an overlapped card readable.
      expect(container.querySelectorAll(".side-panel__badge")).toHaveLength(count);
      unmount();
    }
  });

  it("advances to the next moment through its close button", () => {
    const onDismiss = vi.fn<(id: string) => void>();
    renderPanel(panel(), onDismiss);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Discarded cards from hand" }));
    expect(onDismiss).toHaveBeenCalledWith("p1");
  });
});

describe("side panel card links", () => {
  function renderWithOpener(shown: SidePanel, onOpenCard: (cardId: string) => void) {
    return render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={onOpenCard}>
          <SidePanelStack panel={shown} remainingMs={SIDE_PANEL_LIFETIME_MS} onDismiss={() => undefined} />
        </CardOpenerProvider>
      </I18nProvider>,
    );
  }

  it("names every card the panel lists, so a deleted card can be read", () => {
    renderPanel(panel({ titleKey: "panel.deletedCards" }));
    const shown = screen.getByTestId("side-panel");
    expect(shown.textContent).toContain("Yokomon");
    expect(shown.textContent).toContain("Bebydomon");
  });

  it("opens a listed card from its name", () => {
    const opened: string[] = [];
    renderWithOpener(panel({ titleKey: "panel.deletedCards" }), (cardId) => opened.push(cardId));
    fireEvent.click(screen.getByRole("button", { name: "Open Bebydomon (BT1-002)" }));
    expect(opened).toEqual(["BT1-002"]);
  });

  it("leaves the names as plain text when there is nowhere to open a card", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
  });
});

describe("AttackAnnouncementBanner", () => {
  it("names the attacking card", () => {
    render(
      <I18nProvider>
        <AttackAnnouncementBanner announcement={{ id: "a", cardId: "BT1-001", side: Side.Opponent, createdAt: 0 }} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("attack-announcement").textContent).toContain("is attacking");
  });

  it("opens the attacker from the banner", () => {
    const opened: string[] = [];
    render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={(cardId) => opened.push(cardId)}>
          <AttackAnnouncementBanner announcement={{ id: "a", cardId: "BT1-001", side: Side.Opponent, createdAt: 0 }} />
        </CardOpenerProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Yokomon (BT1-001)" }));
    expect(opened).toEqual(["BT1-001"]);
  });
});
