// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { accountApi } from "./client";
import { RankedStart } from "./RankedStart";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("ranked sign-in prompt", () => {
  it("opens settings when an unauthenticated player chooses to sign in", async () => {
    vi.spyOn(accountApi, "me").mockResolvedValue(null);
    const onOpenSettings = vi.fn();

    render(
      <I18nProvider>
        <RankedStart
          disabled={false}
          buttonLabel="Enter queue"
          onOpenSettings={onOpenSettings}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign in to enable ranked" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});

describe("explicit queue selection", () => {
  it("starts the ranked queue only after the player explicitly selects it", async () => {
    vi.spyOn(accountApi, "me").mockResolvedValue({
      id: "signed-in-player",
      displayName: "Ranked Player",
      avatarUrl: null,
      avatarId: null,
      avatarSource: "discord",
      isAdmin: false,
      roles: [],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>(
        async () =>
          new Response(JSON.stringify({ enabled: true, formats: ["standard"] }), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    localStorage.setItem("aegis-ranked-confirmed", "1");
    const onStart = vi.fn<(ranked: boolean) => void>();
    render(
      <I18nProvider>
        <RankedStart disabled={false} buttonLabel="Enter queue" onOpenSettings={() => undefined} onStart={onStart} />
      </I18nProvider>,
    );
    const ranked = await screen.findByRole("radio", { name: /^Ranked/ });
    await waitFor(() => expect((ranked as HTMLInputElement).disabled).toBe(false));
    expect((screen.getByRole("radio", { name: /^Casual/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(ranked);
    expect(screen.getByLabelText("Region")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter ranked queue" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(true));
  });
});
