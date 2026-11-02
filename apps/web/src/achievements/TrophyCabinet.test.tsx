import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { TrophyCabinet as TrophyCabinetData } from "@aegis/shared/achievements/TrophyContracts";
import { TrophyCabinet } from "@/achievements/TrophyCabinet";
import { I18nProvider } from "@/i18n";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockTrophies(body: TrophyCabinetData | null, status = 200) {
  const fetcher = vi.fn<() => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(body ?? { error: "failed" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function showCabinet() {
  return render(
    <I18nProvider>
      <TrophyCabinet accountId="account-1" />
    </I18nProvider>,
  );
}

describe("trophy cabinet", () => {
  it("shows each trophy with its tier, source and award date", async () => {
    const fetcher = mockTrophies({
      items: [
        {
          award: "tournament_top_four",
          tier: "silver",
          source: { kind: "tournament", tournamentId: "t-2", name: "Community Cup" },
          awardedAt: Date.UTC(2026, 11, 8, 12),
        },
        {
          award: "tournament_champion",
          tier: "gold",
          source: { kind: "tournament", tournamentId: "t-1", name: "Lightning Cup" },
          awardedAt: Date.UTC(2026, 9, 20, 12),
        },
      ],
    });
    showCabinet();

    const items = await screen.findAllByRole("listitem");
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/achievements/trophies"), expect.anything());
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("img", { name: "Silver trophy" }).getAttribute("src")).toBe(
      "/trophies/trophy-silver-128.webp",
    );
    expect(within(items[0]!).getByText("Top 4 · Community Cup")).toBeTruthy();
    expect(within(items[0]!).getByText(/^Awarded Dec 8, 2026$/)).toBeTruthy();
    expect(within(items[1]!).getByRole("img", { name: "Gold trophy" })).toBeTruthy();
    expect(within(items[1]!).getByText("Champion · Lightning Cup")).toBeTruthy();
    expect(items[1]!.getAttribute("title")).toBe("Gold trophy · Champion · Lightning Cup · Awarded Oct 20, 2026");
  });

  it("explains how to earn a trophy when the player has none", async () => {
    mockTrophies({ items: [] });
    showCabinet();

    expect(await screen.findByText(/No trophies yet/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("reports a failed request", async () => {
    mockTrophies(null, 500);
    showCabinet();

    expect((await screen.findByRole("alert")).textContent).toContain("Could not load your trophies");
  });
});
