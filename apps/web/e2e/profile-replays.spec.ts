import { gzipSync } from "node:zlib";
import { test, expect, type Page, type Route, type Request } from "@playwright/test";
import type { MatchHistoryEntry, SavedReplay } from "@aegis/shared";
import { replayFixture } from "../test/replays/fixture";

const recording = replayFixture();
const archive = gzipSync(JSON.stringify(recording));
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const account = {
  id: "account-id",
  displayName: "Vinicius",
  avatarUrl: null,
  avatarId: "tyrannomon",
  avatarSource: "digimon",
  isAdmin: false,
  discordLinked: true,
};
const replayId = (index: number) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
function saved(index: number): SavedReplay {
  return {
    id: replayId(index),
    matchId: `match-${index}`,
    summary: recording,
    viewerSeat: 0,
    bytes: archive.length,
    savedAt: Date.now(),
    driveFileId: `profileDriveFile${String(index).padStart(2, "0")}`,
    visibility: "private",
  };
}
const MODES = ["ranked", "casual", "bot", "tournament"] as const;
function history(count: number): MatchHistoryEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `match-${index}`,
    mode: MODES[index % MODES.length]!,
    opponentName: index === 0 ? "Gabumon Player" : `Opponent ${index}`,
    opponentKind: index % 4 === 2 ? "bot" : "human",
    result: index % 3 === 0 ? "win" : index % 3 === 1 ? "loss" : "draw",
    reason: "surrender",
    finishedAt: Date.UTC(2026, 9, 9, 21, 14) - index * 3_600_000,
    replay: index % 3 === 0 ? saved(index) : null,
  }));
}
/** The Aegis API answers `/replays/:id`; the web server answers the same path for the page itself. */
const apiOnly =
  (handler: (route: Route, request: Request) => unknown) =>
  (route: Route, request: Request): unknown =>
    request.resourceType() === "document" ? route.fallback() : handler(route, request);

async function setup(page: Page, { count = 37, dark = false } = {}) {
  let matches = history(count);
  let current = { ...account };
  const drive: { method: string; path: string }[] = [];
  const writes: { path: string; body: unknown }[] = [];
  await page.addInitScript((darkMode) => {
    localStorage.setItem("aegis:locale", "en");
    localStorage.setItem("aegis:darkMode", String(darkMode));
    localStorage.setItem("aegis.drive.linked", "1");
    localStorage.setItem(
      "aegis.drive.token",
      JSON.stringify({ token: "e2e-token", expiresAt: Date.now() + 3_600_000 }),
    );
  }, dark);
  await page.route("https://www.googleapis.com/**", (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    drive.push({ method: request.method(), path: url.pathname });
    if (url.searchParams.get("alt") === "media")
      return route.fulfill({ headers: CORS, contentType: "application/gzip", body: archive });
    return route.fulfill({ headers: CORS, json: {} });
  });
  await page.route("**/auth/me", (route) => route.fulfill({ json: current }));
  await page.route("**/account/decks", (route) => route.fulfill({ json: [] }));
  await page.route("**/account/preferences", (route) => route.fulfill({ json: { profileStats: true } }));
  await page.route("**/account/playtest", (route) => route.fulfill({ json: { member: false, since: null } }));
  await page.route("**/account/profile", (route) => {
    const replays = matches.filter((match) => match.replay).length;
    const wins = matches.filter((match) => match.result === "win").length;
    return route.fulfill({
      json: {
        account: current,
        stats: {},
        decks: [],
        summary: { matches: matches.length, wins, losses: 0, draws: 0, replaysSaved: replays },
      },
    });
  });
  await page.route("**/account/matches?**", (route) => {
    const url = new URL(route.request().url());
    const number = Number(url.searchParams.get("page"));
    const limit = Number(url.searchParams.get("limit"));
    const result = url.searchParams.get("result");
    const mode = url.searchParams.get("mode");
    const opponent = url.searchParams.get("opponent")?.toLowerCase();
    const selected = matches.filter(
      (match) =>
        (!result || match.result === result) &&
        (!mode || match.mode === mode) &&
        (!opponent || match.opponentName.toLowerCase().includes(opponent)),
    );
    const humans = matches.filter(
      (match) =>
        match.opponentKind === "human" &&
        match.mode !== "bot" &&
        (!mode || match.mode === mode) &&
        (!opponent || match.opponentName.toLowerCase().includes(opponent)),
    );
    return route.fulfill({
      json: {
        winRate: {
          matches: humans.length,
          wins: humans.filter((m) => m.result === "win").length,
          losses: humans.filter((m) => m.result === "loss").length,
          draws: humans.filter((m) => m.result === "draw").length,
        },
        matches: selected.slice((number - 1) * limit, number * limit),
        total: selected.length,
        page: number,
        limit,
        sharing: true,
      },
    });
  });
  await page.route("**/account/profile/**", (route) => {
    const request = route.request();
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ path: new URL(request.url()).pathname, body });
    if ("avatarId" in body)
      current = {
        ...current,
        avatarId: body.avatarId === "initials" ? null : (body.avatarId as string | null),
        avatarSource: body.avatarId === "initials" ? "initials" : body.avatarId ? "digimon" : "discord",
      } as typeof current;
    if ("displayName" in body) current = { ...current, displayName: String(body.displayName) };
    return route.fulfill({ json: current });
  });
  await page.route("**/account/replays/**", (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/")[3];
    if (request.method() === "DELETE") {
      matches = matches.map((match) => (match.replay?.id === id ? { ...match, replay: null } : match));
      return route.fulfill({ json: { ok: true } });
    }
    const visibility = (request.postDataJSON() as { visibility: SavedReplay["visibility"] }).visibility;
    matches = matches.map((match) =>
      match.replay && match.replay.id === id ? { ...match, replay: { ...match.replay, visibility } } : match,
    );
    return route.fulfill({ json: { ...matches.find((match) => match.replay?.id === id)!.replay, visibility } });
  });
  await page.route(
    (url) => /^\/replays\/[0-9a-f-]{36}$/.test(url.pathname),
    apiOnly((route, request) => {
      const id = new URL(request.url()).pathname.split("/")[2];
      const match = matches.find((entry) => entry.replay?.id === id);
      return match ? route.fulfill({ json: { ...match.replay, owned: true } }) : route.fulfill({ status: 404 });
    }),
  );
  return { drive, writes };
}
const rows = (page: Page) => page.locator(".profile-matches > li");
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe.configure({ mode: "parallel" });

for (const [width, dark] of [
  [390, false],
  [390, true],
  [1440, false],
  [1440, true],
] as const)
  test(`profile renders at ${width}px in ${dark ? "dark" : "light"} mode`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await setup(page, { dark });
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "My profile", level: 1 })).toBeVisible();
    const identity = page.getByRole("region", { name: "My profile" });
    await expect(identity.getByText("Account connected")).toBeVisible();
    await expect(identity.locator(".profile-stats")).toContainText("Human matches28");
    await expect(identity.getByRole("link", { name: "Preferences" })).toHaveAttribute("href", "/settings");
    await expect(rows(page)).toHaveCount(25);
    await expect(page.getByText("Showing 1–25 of 37")).toBeVisible();
    await expect(page.getByText("37 of last 100")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Profile sections" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);
    const stats = await identity
      .locator(".profile-stats > div")
      .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(stats).size).toBe(width < 600 ? 2 : 1);
    await testInfo.attach(`profile-${width}-${dark ? "dark" : "light"}`, {
      body: await page.screenshot({ path: `test-results/profile-${width}-${dark ? "dark" : "light"}.png` }),
      contentType: "image/png",
    });
  });

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const dark of [false, true]) {
    test(`match history controls fit without overlap at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await setup(page, { count: 3, dark });
      await page.goto("/profile");
      await expect(rows(page)).toHaveCount(3);
      await page.evaluate(
        async ({ summary, data }) => {
          const modulePath = "/src/replays/local.ts";
          const { saveLocalReplay } = await import(modulePath);
          await saveLocalReplay({
            summary: { ...summary, id: "match-1" },
            data,
            viewerSeat: 0,
            indexId: "local-index",
          });
        },
        { summary: recording, data: archive.toString("base64") },
      );
      await expect(page.getByText("This device", { exact: true })).toBeVisible();
      const problems = await rows(page).evaluateAll((items) =>
        items.flatMap((item) => {
          const row = item.getBoundingClientRect();
          const children = Array.from(item.children).map((child) => ({
            name: child.className,
            rect: child.getBoundingClientRect(),
          }));
          return children.flatMap(({ name, rect }, index) => {
            const errors = [];
            if (rect.left < row.left || rect.right > row.right) {
              errors.push(`${name} overflows its row`);
            }
            for (const other of children.slice(index + 1)) {
              if (
                rect.left < other.rect.right &&
                rect.right > other.rect.left &&
                rect.top < other.rect.bottom &&
                rect.bottom > other.rect.top
              ) {
                errors.push(`${name} overlaps ${other.name}`);
              }
            }
            return errors;
          });
        }),
      );
      expect(problems).toEqual([]);
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  }
}

for (const width of [390, 1440])
  test(`filters reset to the first page and the pager walks the history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/profile");
    await expect(rows(page)).toHaveCount(25);
    await page.getByRole("button", { name: "Page 2" }).click();
    await expect(page.getByText("Showing 26–37 of 37")).toBeVisible();
    await expect(rows(page)).toHaveCount(12);
    await page.getByRole("button", { name: "Wins" }).click();
    await expect(page.getByText("Showing 1–13 of 13")).toBeVisible();
    await page.getByRole("combobox", { name: "Mode" }).selectOption("ranked");
    await expect(page.getByText("Showing 1–4 of 4")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search opponent" }).fill("opponent 2");
    await expect(page.getByText("Showing 1–1 of 1")).toBeVisible();
    await expect(rows(page)).toHaveText([/Opponent 24/]);
    await page.getByRole("searchbox", { name: "Search opponent" }).fill("nobody");
    await expect(page.getByRole("heading", { name: "No matches fit these filters." })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.getByText("Showing 1–25 of 37")).toBeVisible();
  });

for (const width of [390, 1440])
  test(`watching a saved replay plays it from Drive and returns to the profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { drive } = await setup(page);
    await page.goto("/profile");
    await page.getByRole("link", { name: "Watch: Gabumon Player" }).click();
    await expect(page.locator(".replay-player")).toBeVisible();
    await expect(page.locator(".aegis-top-nav")).toHaveCount(0);
    expect(drive).toContainEqual({ method: "GET", path: "/drive/v3/files/profileDriveFile00" });
    await page.getByRole("button", { name: "Back to replays" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(rows(page)).toHaveCount(25);
  });

test("the row menu shares through Drive and deletes with an offer to trash", async ({ page }) => {
  const { drive } = await setup(page);
  await page.goto("/profile");
  const first = rows(page).first();
  await first.getByRole("button", { name: "More replay actions" }).click();
  await first.getByRole("button", { name: "Private · Sharing" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Public/ }).check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(drive).toContainEqual({ method: "POST", path: "/drive/v3/files/profileDriveFile00/permissions" });
  await first.getByRole("button", { name: "More replay actions" }).click();
  await expect(first.getByRole("button", { name: "Public · Sharing" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(first.getByRole("button", { name: "Public · Sharing" })).toBeHidden();

  await first.getByRole("button", { name: "More replay actions" }).click();
  await first.getByRole("button", { name: "Delete replay" }).click();
  await expect(first.getByText("Remove this replay from your library?")).toBeVisible();
  await first.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(first.getByText("No replay", { exact: true })).toBeVisible();
  await expect(page.locator(".profile-stats")).toContainText("Replays saved12");
  await page.getByRole("button", { name: "Move to Drive trash" }).click();
  await expect(page.getByText("The file is in your Google Drive trash.")).toBeVisible();
  expect(drive).toContainEqual({ method: "PATCH", path: "/drive/v3/files/profileDriveFile00" });
});

for (const width of [390, 1440])
  test(`the avatar menu saves a choice at once at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const { writes } = await setup(page);
    await page.goto("/profile");
    const trigger = page.getByRole("button", { name: "Change avatar" });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Choose avatar" });
    await expect(menu.getByRole("searchbox", { name: "Search Digimon" })).toBeVisible();
    const box = (await menu.boundingBox())!;
    if (width < 600) expect(Math.round(box.y + box.height)).toBe(844);
    else {
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect
      .poll(() =>
        menu
          .locator("img")
          .first()
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    const tiles = await menu
      .locator(".avatar-picker__grid button")
      .evaluateAll((buttons) =>
        buttons.slice(0, 8).map((button) => button.getBoundingClientRect().toJSON() as DOMRect),
      );
    for (const [index, tile] of tiles.entries()) {
      expect(Math.abs(tile.width - tile.height)).toBeLessThanOrEqual(1);
      const below = tiles.find((other, otherIndex) => otherIndex > index && other.top > tile.top + 1);
      if (below) expect(below.top).toBeGreaterThanOrEqual(tile.bottom);
    }
    await testInfo.attach(`avatar-menu-${width}`, {
      body: await page.screenshot({ path: `test-results/profile-avatar-menu-${width}.png` }),
      contentType: "image/png",
    });
    await menu.getByRole("searchbox").fill("Greymon");
    await menu.getByRole("button", { name: "Use Greymon as your avatar", exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(writes).toContainEqual({ path: "/account/profile/avatar", body: { avatarId: "greymon" } });
    await trigger.click();
    await page.getByRole("button", { name: "Use initials instead" }).click();
    await expect(menu).toHaveCount(0);
    expect(writes).toContainEqual({ path: "/account/profile/avatar", body: { avatarId: "initials" } });
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

test("the name edits in place with Enter and Escape", async ({ page }) => {
  const { writes } = await setup(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit name: Vinicius" }).click();
  const input = page.getByRole("textbox", { name: "Nickname" });
  await expect(input).toBeFocused();
  await input.fill("Draft");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: "Edit name: Vinicius" }).click();
  await input.fill("New Tamer");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Edit name: New Tamer" })).toBeVisible();
  expect(writes).toEqual([{ path: "/account/profile/display-name", body: { displayName: "New Tamer" } }]);
});

test("profile load failures can be retried and an empty history explains how to save", async ({ page }) => {
  await setup(page, { count: 0 });
  let failed = true;
  await page.route("**/account/matches?**", (route) =>
    failed
      ? route.fulfill({ status: 503 })
      : route.fulfill({ json: { matches: [], total: 0, page: 1, limit: 25, sharing: true } }),
  );
  await page.goto("/profile");
  await expect(page.getByRole("alert")).toContainText("Could not load match history");
  failed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your completed matches will appear here." })).toBeVisible();
  await expect(page.getByText("Save a replay on the match result screen to watch it here.")).toBeVisible();
});

test("signed-out profile offers sign-in and local files without account history", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: null }));
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Sign in with Discord" })).toBeVisible();
  await expect(page.locator(".profile-open-file")).toHaveText("Open replay file");
  await expect(page.locator(".profile-matches")).toHaveCount(0);
  await page.getByLabel("Open replay file").setInputFiles({
    name: "match.aegis-replay",
    mimeType: "application/gzip",
    buffer: archive,
  });
  await expect(page.getByRole("heading", { name: "Agumon Player vs Gabumon Player" })).toBeVisible();
});

test("old profile and replays paths open the single profile page", async ({ page }) => {
  await setup(page);
  for (const path of ["/profile/customize", "/profile/replays", "/replays"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(rows(page)).toHaveCount(25);
  }
  await expect(page.locator(".aegis-top-nav").getByRole("button", { name: "Replays" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open the player menu" }).first().click();
  await expect(page.locator("#player-menu").getByRole("link", { name: "My profile" })).toBeFocused();
  await expect(page.locator("#player-menu").getByRole("link", { name: "Replays" })).toHaveCount(0);
});

test("private or removed links show a recoverable state without exposing the board", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: null }));
  await page.route(
    `**/replays/${replayId(0)}`,
    apiOnly((route) => route.fulfill({ status: 404 })),
  );
  await page.route(`**/replays/${replayId(0)}/file`, (route) => route.fulfill({ status: 404 }));
  await page.goto(`/replays/${replayId(0)}`);
  await expect(page.getByRole("alert")).toContainText("Replay unavailable");
  await expect(page.locator(".replay-player")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to replays" }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

test("a public link opens without signing in", async ({ page }) => {
  const { drive } = await setup(page);
  await page.route("**/auth/me", (route) => route.fulfill({ json: null }));
  await page.route(
    `**/replays/${replayId(0)}`,
    apiOnly((route) => route.fulfill({ json: { ...saved(0), visibility: "public", owned: false } })),
  );
  await page.route(`**/replays/${replayId(0)}/file`, (route) =>
    route.fulfill({ contentType: "application/gzip", body: archive }),
  );
  await page.goto(`/replays/${replayId(0)}`);
  await expect(page.locator(".replay-player")).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(drive.filter((request) => request.method === "GET")).toEqual([]);
});

test("the owner signs in to Drive with a click before watching a private replay on a new device", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    localStorage.removeItem("aegis.drive.token");
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (response: object) => void }) => ({
            requestAccessToken: () => config.callback({ access_token: "e2e-token", expires_in: 3599 }),
          }),
          hasGrantedAllScopes: () => true,
          revoke: () => undefined,
        },
      },
    };
  });
  await page.goto(`/replays/${replayId(0)}`);
  await expect(
    page.getByText("This replay is in your Google Drive. Sign in to Google Drive to watch it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Watch now" }).click();
  await expect(page.locator(".replay-player")).toBeVisible();
});
