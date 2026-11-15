import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { RankedMetaPanel } from "@/ranked/RankedMetaPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(rows: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }),
    ),
  );
  return render(
    <I18nProvider>
      <RankedMetaPanel
        season={{ id: 1, startsAt: 0, endsAt: 1, finalized: false, formats: ["standard"] }}
        format="standard"
      />
    </I18nProvider>,
  );
}

function buildRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    archetype: `Deck ${String(index + 1).padStart(2, "0")}`,
    games: 100 - index,
    players: 12,
    wins: 50,
    winrate: 0.5,
    coverCardId: null,
    colors: [],
  }));
}

it("draws each deck's bars in its card colours for play share and win rate", async () => {
  renderPanel([
    {
      archetype: "Examon",
      games: 60,
      players: 12,
      wins: 36,
      winrate: 0.6,
      coverCardId: null,
      colors: ["Green", "Blue"],
    },
    { archetype: "Rogue", games: 40, players: 3, wins: 4, winrate: null, coverCardId: null, colors: ["Red"] },
  ]);
  const meters = await screen.findAllByRole("meter", { name: "Examon" });
  expect(meters.map((meter) => meter.getAttribute("aria-valuenow"))).toEqual(["60", "60"]);
  for (const meter of meters) {
    expect((meter.firstElementChild as HTMLElement).style.background).toContain("linear-gradient");
  }
  const rogue = screen.getAllByRole("meter", { name: "Rogue" });
  expect(rogue).toHaveLength(1);
  expect(rogue[0]?.getAttribute("aria-valuenow")).toBe("40");
  const rogueFill = rogue[0]?.firstElementChild;
  expect(rogueFill).toBeInstanceOf(HTMLElement);
  expect((rogueFill as HTMLElement).style.width).toBe(`${(40 / 60) * 100}%`);
});

it("charts the ten most played decks and pages the table ten rows at a time", async () => {
  renderPanel(buildRows(23));
  const table = await screen.findByRole("table");
  const getNames = () =>
    within(table)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent?.trim());
  expect(screen.getAllByRole("meter")).toHaveLength(20);
  expect(getNames()).toEqual(buildRows(10).map((row) => row.archetype));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(getNames()[0]).toBe("Deck 11");
  expect(screen.getByText("2 / 3")).toBeTruthy();
});

it("sorts the table by the chosen column and returns to the first page", async () => {
  renderPanel(buildRows(23));
  const table = await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(within(table).getByRole("button", { name: "Deck appearances" }));
  expect(within(table).getAllByRole("rowheader")[0]?.textContent?.trim()).toBe("Deck 23");
  expect(within(table).getByRole("columnheader", { name: "Deck appearances" }).getAttribute("aria-sort")).toBe(
    "ascending",
  );
  expect(screen.getByText("1 / 3")).toBeTruthy();
});
