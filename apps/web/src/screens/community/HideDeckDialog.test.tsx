// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CommunityModeration } from "@aegis/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { HideDeckDialog } from "./HideDeckDialog";

const DECK_ID = "e9db0e41-aff5-495c-a971-45f61e84546e";

function mockModeration(status: number) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(status === 200 ? { status: "hidden" } : {}), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDialog() {
  const onHidden = vi.fn<(moderation: CommunityModeration) => void>();
  render(
    <I18nProvider>
      <HideDeckDialog deckId={DECK_ID} deckName="Rude deck" onHidden={onHidden} onClose={() => undefined} />
    </I18nProvider>,
  );
  return onHidden;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("hiding a community deck", () => {
  it("sends the reason and the note the owner will see", async () => {
    const fetchMock = mockModeration(200);
    const onHidden = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.change(screen.getByLabelText("Note to the owner (optional)"), {
      target: { value: " Posted ten times " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide deck" }));

    await waitFor(() => expect(onHidden).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(`/account/admin/community/decks/${DECK_ID}/moderation`);
    expect(JSON.parse(String(init?.body))).toEqual({ action: "hide", reason: "spam", note: "Posted ten times" });
    expect(onHidden.mock.calls[0]![0]).toMatchObject({
      reason: "spam",
      note: "Posted ten times",
      reviewRequestedAt: null,
    });
  });

  it("stays open and explains a failed hide", async () => {
    mockModeration(500);
    const onHidden = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Hide deck" }));

    expect(await screen.findByText("Could not change this deck. Try again.")).toBeTruthy();
    expect(onHidden).not.toHaveBeenCalled();
  });
});
