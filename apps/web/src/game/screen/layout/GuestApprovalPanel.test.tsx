import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PendingMatchBoard } from "@/game/screen/layout/PendingMatchBoard";

vi.mock("@/design/sound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/design/sound")>()),
  playSound: vi.fn<(kind: string) => void>(),
  unlockAudio: vi.fn<() => void>(),
}));

const guest = { sessionId: "guest", displayName: "Challenger", avatarId: "garurumon", connected: true };

function renderBoard(onAnswerGuest: (accept: boolean) => void) {
  render(
    <I18nProvider>
      <PendingMatchBoard
        title="Join request"
        detail="Challenger wants to join your room."
        spinner={false}
        guestRequest={guest}
        onAnswerGuest={onAnswerGuest}
        onCancel={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("private room guest approval panel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the host who wants to join instead of the invite code", () => {
    renderBoard(() => undefined);

    expect(screen.getByRole("region", { name: "Join request" })).toBeTruthy();
    expect(screen.getByText("Challenger")).toBeTruthy();
    expect(screen.queryByText("Invite a friend")).toBeNull();
  });

  it("sends the host's acceptance", () => {
    const onAnswerGuest = vi.fn<(accept: boolean) => void>();
    renderBoard(onAnswerGuest);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onAnswerGuest).toHaveBeenCalledWith(true);
  });

  it("sends the host's refusal", () => {
    const onAnswerGuest = vi.fn<(accept: boolean) => void>();
    renderBoard(onAnswerGuest);

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(onAnswerGuest).toHaveBeenCalledWith(false);
  });

  it("lets the host cancel the room while reviewing a guest", () => {
    renderBoard(() => undefined);

    expect(screen.getByRole("button", { name: "Cancel and return to lobby" })).toBeTruthy();
  });
});
