import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { RankedMetaPanel } from "@/ranked/RankedMetaPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps an archetype's color consistent when another deck has no wins", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify([
            { archetype: "Zero wins", games: 40, players: 12, wins: 0, winrate: 0 },
            { archetype: "Greymon", games: 40, players: 12, wins: 24, winrate: 0.6 },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
  const { container } = render(
    <I18nProvider>
      <RankedMetaPanel
        season={{ id: 1, startsAt: 0, endsAt: 1, finalized: false, formats: ["standard"] }}
        format="standard"
        region=""
      />
    </I18nProvider>,
  );
  const meter = await screen.findByRole("meter", { name: "Greymon" });
  const segment = container.querySelector(".ranked-meta__segment");
  expect(segment).not.toBeNull();
  expect(segment?.getAttribute("stroke")).toBe((meter.firstElementChild as HTMLElement).style.background);
  expect(meter.getAttribute("aria-valuenow")).toBe("60");
  expect(container.querySelectorAll(".ranked-meta__segment")).toHaveLength(1);
});
