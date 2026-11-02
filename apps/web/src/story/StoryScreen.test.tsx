import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { StoryScreen } from "@/story/StoryScreen";
import { storyBattles } from "@aegis/shared/story/storyBattles";

const request = vi.hoisted(() => vi.fn<() => Promise<{ completed: string[]; milestones?: string[] }>>());
vi.mock("@/account/client", () => ({ request }));
beforeEach(() => {
  localStorage.setItem("aegis:locale", "en");
  request.mockReset();
  request.mockResolvedValue({ completed: [], milestones: [] });
});
afterEach(cleanup);

function renderStory(initialBattleId?: string) {
  const start = vi.fn<(battleId: string) => void>();
  render(
    <I18nProvider>
      <StoryScreen signedIn={false} onSignIn={vi.fn<() => void>()} onStart={start} initialBattleId={initialBattleId} />
    </I18nProvider>,
  );
  return start;
}

it("starts with an illustrated campaign library and hides campaigns with a single encounter", () => {
  renderStory();
  expect(screen.getByRole("heading", { level: 1, name: "Choose your story" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Explore campaign · Digimon World 2" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Explore campaign · Digimon Ghost Game" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Explore campaign · Digimon Survive" })).toBeNull();
  expect(screen.queryByText("Work inventory · 237")).toBeNull();
  expect(screen.queryByText(/DigiLab/)).toBeNull();
  expect(screen.queryByText("Adaptation")).toBeNull();
  expect(screen.queryByText("In preparation")).toBeNull();
  expect(screen.queryByRole("button", { name: "Explore campaign · Digimon V-Tamer 01 (manga)" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Films and specials" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Explore campaign · Our War Game" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Explore campaign · Digimon Adventure tri." })).toBeNull();
  expect(screen.queryByRole("button", { name: "Explore campaign · Digimon Next (manga)" })).toBeNull();
});

it("filters campaigns by search and medium", () => {
  renderStory();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search campaigns" }), { target: { value: "World 2" } });
  expect(screen.getByRole("button", { name: "Explore campaign · Digimon World 2" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Explore campaign · Digimon Tamers" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Anime" }));
  expect(screen.getByText("No campaigns found.")).toBeTruthy();
});

it("opens every World 2 encounter as a battle without exposing deck lists, sources or dates", async () => {
  const start = renderStory();
  fireEvent.click(screen.getByRole("button", { name: "Explore campaign · Digimon World 2" }));
  const buttons = await screen.findAllByRole("button", { name: "Start battle" });
  expect(buttons).toHaveLength(60);
  await vi.waitFor(() => expect(buttons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true));
  fireEvent.click(buttons.at(-1)!);
  expect(start).toHaveBeenCalledWith(
    storyBattles.filter((battle) => battle.campaignId === "digimon-world-2").at(-1)!.id,
  );
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText(/WMD\d|DigiLab|2026-\d/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to campaigns" }));
  expect(screen.getByRole("heading", { name: "Choose your story" })).toBeTruthy();
});

it("preserves the World recruit prerequisites and restores the campaign after a match", async () => {
  request.mockResolvedValue({ completed: ["dw1-001", "dw1-002"], milestones: [] });
  const start = renderStory("dw1-001");
  expect(screen.getByRole("heading", { level: 1, name: "Digimon World 1" })).toBeTruthy();
  await screen.findByText("2 / 38 Battles completed");
  const ogremon = screen.getByRole("heading", { name: "Ogremon I + Agumon ×2" }).closest("li")!;
  expect((within(ogremon).getByRole("button", { name: "Start battle" }) as HTMLButtonElement).disabled).toBe(true);
  const kunemon = screen.getByRole("heading", { name: "Kunemon" }).closest("li")!;
  fireEvent.click(within(kunemon).getByRole("button", { name: "Start battle" }));
  expect(start).toHaveBeenCalledWith("dw1-003");
});

it("keeps battles without prerequisites playable and shows no error when progress cannot be loaded", async () => {
  request.mockRejectedValue(new Error("offline"));
  renderStory("dw1-001");
  const kunemon = (await screen.findByRole("heading", { name: "Kunemon" })).closest("li")!;
  await vi.waitFor(() =>
    expect((within(kunemon).getByRole("button", { name: "Start battle" }) as HTMLButtonElement).disabled).toBe(false),
  );
  const ogremon = screen.getByRole("heading", { name: "Ogremon I + Agumon ×2" }).closest("li")!;
  expect((within(ogremon).getByRole("button", { name: "Start battle" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

it("preserves Liberator progress, localization and identities without source links", async () => {
  localStorage.setItem("aegis:locale", "zh-CN");
  request.mockResolvedValue({ completed: ["ice-knight"] });
  const start = renderStory("ice-knight");
  expect(screen.getByRole("heading", { level: 1, name: "数码宝贝界放者" })).toBeTruthy();
  const first = (await screen.findByRole("heading", { name: "对战收录 [1] VS. 冰之骑士" })).closest("li")!;
  await vi.waitFor(() =>
    expect((within(first).getByRole("button", { name: "再来一局" }) as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(within(first).getByRole("button", { name: "再来一局" }));
  expect(start).toHaveBeenCalledWith("ice-knight");
  expect(screen.queryByRole("link")).toBeNull();
});

it("uses official media artwork and presents Back Dimension only once", async () => {
  renderStory("dw1-038");
  expect(await screen.findAllByRole("heading", { name: "Partner vs. Machinedramon" })).toHaveLength(1);
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(38);
  const images = [...document.querySelectorAll<HTMLImageElement>(".story-catalog-list img")];
  expect(images).toHaveLength(38);
  expect(images.every((image) => image.getAttribute("src") === "/story/media/digimon-world-1.jpg")).toBe(true);
  expect(document.querySelector('img[src*="card-images"]')).toBeNull();
});

it("opens the expanded Cyber Sleuth campaign with optional challenges identified", async () => {
  renderStory();
  fireEvent.click(screen.getByRole("button", { name: "Explore campaign · Digimon Cyber Sleuth" }));
  expect(await screen.findAllByRole("button", { name: "Start battle" })).toHaveLength(57);
  expect(screen.getAllByText(/Optional challenge/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Introduction/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Boss/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/WMD\d|DigiLab|2026-\d/)).toBeNull();
});

it("opens the Seekers webnovel with eight playable confrontations and official artwork", async () => {
  renderStory();
  const campaign = screen.getByRole("button", { name: "Explore campaign · Digimon Seekers" });
  expect(campaign.querySelector("img")?.getAttribute("src")).toBe("/story/media/digimon-seekers.jpg");
  fireEvent.click(campaign);
  expect(await screen.findAllByRole("button", { name: "Start battle" })).toHaveLength(8);
  expect(screen.getByRole("heading", { name: /The battle of the Seekers/ })).toBeTruthy();
});

it.each([
  ["Digimon Savers / Data Squad", 17],
  ["Digimon Xros Wars", 17],
  ["Digimon Xros Wars: Hunters", 16],
  ["Digimon Adventure: (2020)", 16],
  ["Digimon Ghost Game", 16],
  ["Digimon Beatbreak", 12],
] as const)("opens the expanded anime campaign %s with %s encounters", async (title, count) => {
  renderStory();
  const campaign = screen.getByRole("button", { name: `Explore campaign · ${title}` });
  expect(campaign.querySelector("img")?.getAttribute("src")).toMatch(/^\/story\/media\//);
  fireEvent.click(campaign);
  const buttons = await screen.findAllByRole("button", { name: "Start battle" });
  expect(buttons).toHaveLength(count);
  await vi.waitFor(() => expect(buttons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true));
  expect(screen.queryByText(/WMD\d|DigiLab|2026-\d/)).toBeNull();
});

it("renders catalog battle titles and chapters in English", async () => {
  renderStory();
  fireEvent.click(screen.getByRole("button", { name: "Explore campaign · Digimon Seekers" }));
  await screen.findAllByRole("button", { name: "Start battle" });
  expect(screen.getByRole("heading", { name: /^The battle of the Seekers — / })).toBeTruthy();
  expect(screen.getAllByText(/ · Chapter 4/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Capítulo|A batalha/)).toBeNull();
});
