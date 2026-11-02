import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PlayLogSidebar } from "@/game/log/PlayLogSidebar";
import { fieldReferenceStore } from "@/design/fieldReference/fieldReferenceStore";
import { setFieldReferenceVisible } from "@/design/fieldReference/setFieldReferenceVisible";
import type { LogTurnGroup } from "@/game/log/LogEntry";

const turns: LogTurnGroup[] = [
  {
    turnCount: 1,
    turnSeat: 0,
    phases: [
      {
        phase: Phase.Main,
        entries: [
          { id: "1", text: "Match started", kind: "sys", turnCount: 1, turnSeat: 0, phase: Phase.Main },
          {
            id: "2",
            text: "Alice played Agumon",
            kind: "you",
            cardIds: ["ST1-03"],
            memory: { delta: -5, after: -2 },
            turnCount: 1,
            turnSeat: 0,
            phase: Phase.Main,
          },
        ],
      },
    ],
  },
];

afterEach(() => {
  cleanup();
  setFieldReferenceVisible(false);
});

function renderPanel(onClose = vi.fn<() => void>()) {
  return render(
    <I18nProvider>
      <PlayLogSidebar
        turns={turns}
        playerNames={{ 0: "Alice", 1: "Bob" }}
        viewerSeat={0}
        onClose={onClose}
        onOpenCard={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
}

describe("searchable chronological play log", () => {
  it("toggles field references next to card names, off by default", () => {
    renderPanel();
    const toggle = screen.getByRole("switch", { name: "Show IDs next to card names" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(fieldReferenceStore.visible).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("shows named turn and phase headings and signed memory chips", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Turn 1 · Alice" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Main Phase" })).toBeTruthy();
    expect(screen.getByText("-5 Memory")).toBeTruthy();
    expect(screen.getByText("Memory: 3 → -2")).toBeTruthy();
  });

  it("filters and highlights matching card names", () => {
    renderPanel();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "agumon" } });
    expect(screen.queryByText("Match started")).toBeNull();
    expect(screen.getByText("Agumon").tagName).toBe("MARK");
    expect(screen.queryByText("1 matches")).toBeNull();
  });

  it("clears search on the first Escape and closes on the second", () => {
    const close = vi.fn<() => void>();
    renderPanel(close);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "agumon" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText("Match started")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("distinguishes no matches from an empty history", () => {
    renderPanel();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
    expect(screen.getByText("No matching actions")).toBeTruthy();
  });

  it("focuses the search field on a fine pointer after the dialog opens", async () => {
    const spy = vi.spyOn(window, "matchMedia");
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    spy.mockReturnValue({ ...media, matches: true });
    renderPanel();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox")));
    spy.mockRestore();
  });
});

describe("play log entries by acting player", () => {
  const twoTurns: LogTurnGroup[] = [
    {
      turnCount: 1,
      turnSeat: 0,
      phases: [
        {
          phase: Phase.Main,
          entries: [{ id: "a", text: "Alice attacked", kind: "opp", turnCount: 1, turnSeat: 0, phase: Phase.Main }],
        },
      ],
    },
    {
      turnCount: 1,
      turnSeat: 1,
      phases: [
        {
          phase: Phase.Main,
          entries: [{ id: "b", text: "Bob blocked", kind: "you", turnCount: 1, turnSeat: 1, phase: Phase.Main }],
        },
      ],
    },
  ];

  function renderFromSeat(viewerSeat?: Seat) {
    render(
      <I18nProvider>
        <PlayLogSidebar
          turns={twoTurns}
          playerNames={{ 0: "Alice", 1: "Bob" }}
          viewerSeat={viewerSeat}
          onClose={vi.fn<() => void>()}
        />
      </I18nProvider>,
    );
  }

  function getEntryTone(text: string) {
    return screen.getByText(text).closest(".play-log__line")?.getAttribute("data-kind");
  }

  function getTurnTone(name: string) {
    return screen.getByRole("heading", { name }).closest("section")?.getAttribute("data-tone");
  }

  it("marks each entry as the viewer's or the opponent's", () => {
    renderFromSeat(1);
    expect(getEntryTone("Bob blocked")).toBe("you");
    expect(getEntryTone("Alice attacked")).toBe("opp");
  });

  it("tones the viewer's own turns as theirs when they sit in the second seat", () => {
    renderFromSeat(1);
    expect(getTurnTone("Turn 1 · Bob")).toBe("you");
    expect(getTurnTone("Turn 1 · Alice")).toBe("opp");
  });

  it("tones the first seat as the viewer's for spectators", () => {
    renderFromSeat(undefined);
    expect(getTurnTone("Turn 1 · Alice")).toBe("you");
    expect(getTurnTone("Turn 1 · Bob")).toBe("opp");
  });
});
