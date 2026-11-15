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

const { ResumeActiveMatchAction } = await import("@/game/screen/layout/ResumeActiveMatchAction");
const { I18nProvider } = await import("@/i18n/I18nProvider");
const { loadReconnectSession } = await import("@/net/reconnectSession");

const match: ResumableMatch = { roomId: "room-1", seat: 0, slot: "legacy" };

function renderAction(onResume = vi.fn<() => void>()) {
  render(
    <I18nProvider>
      <ResumeActiveMatchAction onResume={onResume} />
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

describe("resuming the match that blocks a new one", () => {
  it("claims the held seat for this tab and returns to the match", async () => {
    findActiveMatch.mockResolvedValue(match);
    claimActiveMatch.mockResolvedValue({
      reconnectionToken: "room-1:fresh-token",
      roomId: "room-1",
      slot: "legacy",
      savedAt: Date.now(),
    });
    const onResume = renderAction();

    fireEvent.click(screen.getByRole("button", { name: "Resume match" }));

    await waitFor(() => expect(onResume).toHaveBeenCalledOnce());
    expect(claimActiveMatch).toHaveBeenCalledWith(match);
    expect(loadReconnectSession()).toMatchObject({ reconnectionToken: "room-1:fresh-token", roomId: "room-1" });
  });

  it("explains that the match has ended when the seat is no longer held", async () => {
    findActiveMatch.mockResolvedValue(undefined);
    const onResume = renderAction();

    fireEvent.click(screen.getByRole("button", { name: "Resume match" }));

    expect(await screen.findByText("We could not move the match to this device. It may have ended.")).toBeTruthy();
    expect(claimActiveMatch).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
    expect(loadReconnectSession()).toBeUndefined();
  });
});
