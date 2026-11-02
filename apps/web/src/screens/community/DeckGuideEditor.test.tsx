import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DeckGuideEditor } from "@/screens/community/DeckGuideEditor";

function renderEditor(guide: string | null = "## Opening\n\nPlay BT1-009") {
  const onSaved = vi.fn<(guide: string | null) => void>();
  const onCancel = vi.fn<() => void>();
  render(
    <I18nProvider>
      <DeckGuideEditor deckId="public-deck" initialGuide={guide} onSaved={onSaved} onCancel={onCancel} />
    </I18nProvider>,
  );
  return { onSaved, onCancel };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editing a deck guide", () => {
  it("loads formatted content and saves to the public deck endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ guide: "## Opening\n\nPlay BT1-009" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = renderEditor();
    expect(screen.getByRole("textbox", { name: "Guide" }).querySelector("h3")?.textContent).toBe("Opening");
    fireEvent.click(screen.getByRole("button", { name: "Save guide" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("## Opening\n\nPlay BT1-009"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/community/decks/public-deck/guide");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ guide: "## Opening\n\nPlay BT1-009" });
  });
  it("removes a guide with null", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ guide: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Remove guide" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ guide: null });
  });
  it("keeps the editor open on a server validation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: "guide_too_long" }), { status: 422 })),
    );
    const { onSaved } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save guide" }));
    expect(await screen.findByText(/The guide is too long/)).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("cancels without saving", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { onCancel } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
