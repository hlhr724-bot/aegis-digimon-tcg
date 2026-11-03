// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { BoardStyleSettings } from "@/game/arena3d/boardStyle/BoardStyleSettings";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import * as webGl from "@/game/arena3d/isWebGlAvailable";
import { I18nProvider } from "@/i18n/I18nProvider";

const UNSUPPORTED_TEXT = /can't use WebGL/;

function renderSettings() {
  render(
    <I18nProvider>
      <BoardStyleSettings />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  boardStylePreference.setStyle(BoardStyle.CLASSIC.value);
});

describe("the board style settings", () => {
  it("blocks the 3D option and explains why when WebGL is missing", () => {
    vi.spyOn(webGl, "isWebGlAvailable").mockReturnValue(false);
    boardStylePreference.setStyle(BoardStyle.ARENA_3D.value);
    renderSettings();

    const arena3d = screen.getByRole<HTMLInputElement>("radio", { name: "Arena 3D" });
    const classic = screen.getByRole<HTMLInputElement>("radio", { name: "Classic 2D" });
    expect(arena3d.disabled).toBe(true);
    expect(arena3d.checked).toBe(false);
    expect(classic.checked).toBe(true);
    const description = document.getElementById(arena3d.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toMatch(UNSUPPORTED_TEXT);
    expect(boardStylePreference.getStyle()).toBe(BoardStyle.ARENA_3D.value);
  });

  it("offers the 3D option without the WebGL note when WebGL works", () => {
    vi.spyOn(webGl, "isWebGlAvailable").mockReturnValue(true);
    renderSettings();

    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Arena 3D" }).disabled).toBe(false);
    expect(screen.queryByText(UNSUPPORTED_TEXT)).toBeNull();
  });
});
