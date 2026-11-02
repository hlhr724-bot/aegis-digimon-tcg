// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Screen } from "@/design/primitives";
import { I18nProvider } from "@/i18n";
import { PlayHeader } from "@/play/PlayHeader";
import { PlayTab } from "@/play/PlayTab";

afterEach(() => cleanup());

describe("the play header", () => {
  it("opens the screen behind each play tab and counts live matches on rooms", () => {
    const onNav = vi.fn<(screen: Screen) => void>();
    render(
      <I18nProvider>
        <PlayHeader activeTab={PlayTab.MATCH.value} rankedEnabled liveMatchCount={3} onNav={onNav} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Match" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Match" }));
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Ranked" }));
    expect(onNav).toHaveBeenCalledWith("ranked");
    fireEvent.click(screen.getByRole("tab", { name: "Rooms 3" }));
    expect(onNav).toHaveBeenCalledWith("watch");
  });

  it("hides the ranked tab while ranked play is disabled", () => {
    render(
      <I18nProvider>
        <PlayHeader activeTab={PlayTab.ROOMS.value} rankedEnabled={false} onNav={() => undefined} />
      </I18nProvider>,
    );

    expect(screen.queryByRole("tab", { name: "Ranked" })).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Match", "Rooms"]);
  });
});
