// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import { BOARD_STYLE_NOTICE_END, BOARD_STYLE_NOTICE_START } from "@/game/screen/layout/boardStyleNoticeWindow";
import { MatchBoardStyleNotice } from "@/game/screen/layout/MatchBoardStyleNotice";
import { I18nProvider } from "@/i18n/I18nProvider";

const webGl = vi.hoisted(() => ({ available: true }));

vi.mock("@/game/arena3d/isWebGlAvailable", () => ({
  isWebGlAvailable: () => webGl.available,
}));

function renderNotice() {
  const view = render(
    <I18nProvider>
      <MatchBoardStyleNotice />
    </I18nProvider>,
  );
  return { view };
}

beforeEach(() => {
  webGl.available = true;
  boardStylePreference.setStyle(BoardStyle.CLASSIC.value);
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BOARD_STYLE_NOTICE_START);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the Arena 3D board notice", () => {
  it("lets a classic-board player turn on the Arena 3D board from the match", () => {
    renderNotice();

    expect(screen.getByRole("status").textContent).toContain("Arena 3D");
    fireEvent.click(screen.getByRole("button", { name: "Turn on 3D" }));
    expect(boardStylePreference.getStyle()).toBe(BoardStyle.ARENA_3D.value);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("survives a match screen remount but never shows again after it was closed", () => {
    const first = renderNotice();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(localStorage.getItem("aegis.board-style-notice-seen")).toBe("1");
    first.view.unmount();

    const remounted = renderNotice();
    fireEvent.click(screen.getByRole("button", { name: "Close the Arena 3D notice" }));
    remounted.view.unmount();

    renderNotice();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden before the campaign starts and after it ends", () => {
    vi.setSystemTime(BOARD_STYLE_NOTICE_START - 1);
    const before = renderNotice();
    expect(screen.queryByRole("status")).toBeNull();
    before.view.unmount();

    vi.setSystemTime(BOARD_STYLE_NOTICE_END);
    renderNotice();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden for players who already use the Arena 3D board", () => {
    boardStylePreference.setStyle(BoardStyle.ARENA_3D.value);

    renderNotice();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden when the device cannot render WebGL", () => {
    webGl.available = false;

    renderNotice();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides when the player closes it", () => {
    renderNotice();

    fireEvent.click(screen.getByRole("button", { name: "Close the Arena 3D notice" }));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
