// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PublicReplay, PublicReplayPage } from "@aegis/shared/replays/PublicReplay";
import { I18nProvider } from "@/i18n";
import type { PublicReplayRequest } from "@/replays/fetchPublicReplays";
import { PublicReplaysScreen } from "@/replays/PublicReplaysScreen";

afterEach(cleanup);

function buildReplay(index: number, overrides: Partial<PublicReplay> = {}): PublicReplay {
  return {
    id: `replay-${index}`,
    viewerSeat: 0,
    format: "standard",
    savedAt: 1_000 - index,
    summary: {
      id: `match-${index}`,
      players: [`Player${index}`, `Rival${index}`],
      deckIcons: ["BT1-010", "BT1-001"],
      mode: "casual",
      startedAt: 1,
      finishedAt: Date.UTC(2026, 9, 30),
      winnerSeat: 0,
      frameCount: 10,
    },
    ...overrides,
  };
}

function renderScreen(load: (request: PublicReplayRequest) => Promise<PublicReplayPage>) {
  const onOpen = vi.fn<(replayId: string) => void>();
  render(
    <I18nProvider>
      <PublicReplaysScreen onOpen={onOpen} load={load} />
    </I18nProvider>,
  );
  return { onOpen };
}

it("shows each replay's players and format and opens the chosen replay", async () => {
  const load = vi.fn<(request: PublicReplayRequest) => Promise<PublicReplayPage>>(async () => ({
    replays: [buildReplay(1, { format: "BT15:pauper" })],
  }));
  const { onOpen } = renderScreen(load);
  const watch = await screen.findByRole("button", { name: "Watch replay: Player1 vs Rival1" });
  const card = watch.closest("li")!;
  expect(within(card).getByText("Player1")).toBeTruthy();
  expect(within(card).getByText("Rival1")).toBeTruthy();
  expect(within(card).getByText("BT15 · Pauper · C / U")).toBeTruthy();
  expect(card.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-30T00:00:00.000Z");
  fireEvent.click(watch);
  expect(onOpen).toHaveBeenCalledWith("replay-1");
});

it("labels hidden identities by seat", async () => {
  renderScreen(async () => ({
    replays: [buildReplay(2, { summary: { ...buildReplay(2).summary, players: ["", "Sora"] } })],
  }));
  expect(await screen.findByRole("button", { name: "Watch replay: Player 1 vs Sora" })).toBeTruthy();
});

it("loads the next page from the cursor and appends it", async () => {
  const load = vi.fn<(request: PublicReplayRequest) => Promise<PublicReplayPage>>(async ({ cursor }) =>
    cursor ? { replays: [buildReplay(3)] } : { replays: [buildReplay(1), buildReplay(2)], nextCursor: "next" },
  );
  renderScreen(load);
  fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
  expect(await screen.findByRole("button", { name: "Watch replay: Player3 vs Rival3" })).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(load).toHaveBeenLastCalledWith({ limit: 20, cursor: "next", format: undefined });
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
});

it("reloads from the first page when the format filter changes", async () => {
  const load = vi.fn<(request: PublicReplayRequest) => Promise<PublicReplayPage>>(async ({ format }) => ({
    replays: format === "BT15" ? [buildReplay(9, { format: "BT15" })] : [buildReplay(1)],
  }));
  renderScreen(load);
  await screen.findByRole("button", { name: "Watch replay: Player1 vs Rival1" });
  fireEvent.change(screen.getByLabelText("Format"), { target: { value: "BT15" } });
  expect(await screen.findByRole("button", { name: "Watch replay: Player9 vs Rival9" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Watch replay: Player1 vs Rival1" })).toBeNull();
  expect(load).toHaveBeenLastCalledWith({ limit: 20, cursor: undefined, format: "BT15" });
});

it("explains an empty list", async () => {
  renderScreen(async () => ({ replays: [] }));
  expect(await screen.findByText("No public replays yet.")).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
});

it("reports a failed load and retries on request", async () => {
  const load = vi
    .fn<(request: PublicReplayRequest) => Promise<PublicReplayPage>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ replays: [buildReplay(1)] });
  renderScreen(load);
  expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load public replays.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Watch replay: Player1 vs Rival1" })).toBeTruthy();
});
