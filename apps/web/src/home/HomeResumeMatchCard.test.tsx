// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReconnectSession } from "@/net/reconnectSession";
import type { ResumableMatch } from "@/net/activeMatch/ResumableMatch";

const findActiveMatch = vi.fn<() => Promise<ResumableMatch | undefined>>();
const claimActiveMatch = vi.fn<(match: ResumableMatch) => Promise<ReconnectSession | undefined>>();

vi.mock("@/net/client", () => ({
  findActiveMatch: () => findActiveMatch(),
  claimActiveMatch: (match: ResumableMatch) => claimActiveMatch(match),
}));

const { HomeResumeMatchCard } = await import("@/home/HomeResumeMatchCard");
const { I18nProvider } = await import("@/i18n/I18nProvider");
const { loadReconnectSession, saveReconnectSession } = await import("@/net/reconnectSession");

const match: ResumableMatch = { roomId: "room-1", seat: 1, slot: "legacy" };

function renderCard(onResume = vi.fn<() => void>()) {
  render(
    <I18nProvider>
      <HomeResumeMatchCard onResume={onResume} />
    </I18nProvider>,
  );
  return onResume;
}

beforeEach(() => {
  sessionStorage.clear();
  findActiveMatch.mockReset();
  claimActiveMatch.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("resuming a live match from another device", () => {
  it("offers the live match and moves its seat to this device", async () => {
    findActiveMatch.mockResolvedValue(match);
    claimActiveMatch.mockResolvedValue({
      reconnectionToken: "room-1:fresh-token",
      roomId: "room-1",
      slot: "legacy",
      savedAt: Date.now(),
    });
    const onResume = renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Resume match" }));

    await waitFor(() => expect(onResume).toHaveBeenCalledOnce());
    expect(claimActiveMatch).toHaveBeenCalledWith(match);
    expect(loadReconnectSession()).toMatchObject({ reconnectionToken: "room-1:fresh-token", roomId: "room-1" });
  });

  it("counts down the time the dropped seat stays held", async () => {
    findActiveMatch.mockResolvedValue({ ...match, reconnectGraceMs: 42_000 });
    renderCard();

    expect((await screen.findByRole("timer")).textContent).toBe("Seat held for 0:42");
  });

  it("shows no countdown while the other device is still connected", async () => {
    findActiveMatch.mockResolvedValue(match);
    renderCard();

    await screen.findByRole("button", { name: "Resume match" });
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("shows nothing when the account has no live match", async () => {
    findActiveMatch.mockResolvedValue(undefined);
    renderCard();

    await waitFor(() => expect(findActiveMatch).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Resume match" })).toBeNull();
  });

  it("does not ask the server while this tab already holds a seat", async () => {
    saveReconnectSession({ reconnectionToken: "room-1:token", roomId: "room-1", slot: "legacy", savedAt: Date.now() });
    renderCard();

    await Promise.resolve();
    expect(findActiveMatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Resume match" })).toBeNull();
  });

  it("explains a refused claim and keeps the player on the home screen", async () => {
    findActiveMatch.mockResolvedValue(match);
    claimActiveMatch.mockResolvedValue(undefined);
    const onResume = renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Resume match" }));

    expect(await screen.findByText("We could not move the match to this device. It may have ended.")).toBeTruthy();
    expect(onResume).not.toHaveBeenCalled();
    expect(loadReconnectSession()).toBeUndefined();
  });
});
