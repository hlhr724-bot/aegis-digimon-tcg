import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardLinkedText } from "@/game/cardLinks";
import { I18nProvider } from "@/i18n/I18nProvider";
import { hoverZoomPreference } from "@/design/hoverZoomPreference";

beforeEach(() => {
  vi.useFakeTimers();
  hoverZoomPreference.setEnabled(true);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === "(hover: hover) and (pointer: fine)",
    media: query,
    onchange: null,
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(),
  }));
});

afterEach(() => {
  cleanup();
  hoverZoomPreference.setEnabled(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderLink(onOpenCard = vi.fn<(cardId: string, artId?: string) => void>()) {
  return render(
    <I18nProvider>
      <CardLinkedText text="Alice played Agumon" cardIds={["ST1-03"]} highlight="agumon" onOpenCard={onOpenCard} />
    </I18nProvider>,
  );
}

describe("card links in match history", () => {
  it("highlights the printed name inside the existing card button", () => {
    renderLink();
    expect(screen.getByRole("button").querySelector("mark")?.textContent).toBe("Agumon");
  });

  it("waits before showing the preview and dismisses on scrolling", () => {
    renderLink();
    fireEvent.mouseEnter(screen.getByRole("button"), { clientX: 200, clientY: 300 });
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId("card-zoom-preview").style.width).toBe("300px");
    fireEvent.scroll(document.body);
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
  });

  it("cancels a pending preview when the pointer leaves", () => {
    renderLink();
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
  });

  it("opens the full card on click and dismisses the preview", () => {
    const open = vi.fn<(cardId: string, artId?: string) => void>();
    renderLink(open);
    const button = screen.getByRole("button");
    fireEvent.focus(button);
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId("card-zoom-preview")).toBeTruthy();
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith("ST1-03", undefined);
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
  });

  it("keeps links clickable without a hover preview when the player turns zoom off", () => {
    hoverZoomPreference.setEnabled(false);
    const open = vi.fn<(cardId: string, artId?: string) => void>();
    renderLink(open);
    fireEvent.mouseEnter(screen.getByRole("button"), { clientX: 200, clientY: 300 });
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(open).toHaveBeenCalledWith("ST1-03", undefined);
  });

  it("keeps touch links clickable without showing a hover preview", () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
      removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
      addListener: vi.fn<MediaQueryList["addListener"]>(),
      removeListener: vi.fn<MediaQueryList["removeListener"]>(),
      dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(),
    }));
    const open = vi.fn<(cardId: string, artId?: string) => void>();
    renderLink(open);
    fireEvent.focus(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(open).toHaveBeenCalledWith("ST1-03", undefined);
  });
});

it("keeps same-name printings distinct and appends each number only once", () => {
  const open = vi.fn<(cardId: string, artId?: string) => void>();
  render(
    <I18nProvider>
      <CardLinkedText text="Agumon (BT1-010) with Agumon (ST1-03)" cardIds={["BT1-010", "ST1-03"]} onOpenCard={open} />
    </I18nProvider>,
  );
  const first = screen.getByRole("button", { name: "Open Agumon (BT1-010)" });
  const second = screen.getByRole("button", { name: "Open Agumon (ST1-03)" });
  expect(first.textContent).toBe("Agumon (BT1-010)");
  expect(second.textContent).toBe("Agumon (ST1-03)");
  fireEvent.click(second);
  expect(open).toHaveBeenCalledWith("ST1-03", undefined);
});
