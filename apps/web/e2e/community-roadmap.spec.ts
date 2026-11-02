import { expect, test, type Page } from "@playwright/test";

type Item = {
  id: number;
  title: string;
  status: string;
  supportCount: number;
  supported: boolean;
  description: string;
  discussionUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

const at = 1791700000000;

function item(fields: Partial<Item> & Pick<Item, "id" | "title" | "status">): Item {
  return {
    supportCount: 0,
    supported: false,
    description: `${fields.title} in detail.`,
    discussionUrl: null,
    createdAt: at,
    updatedAt: at,
    ...fields,
  };
}

const report = {
  id: 5,
  report: {
    kind: "improvement",
    summary: "Bracket view for tournaments",
    description: "Show the whole bracket. My friend Kai asked for it in match 123.",
    cardIds: [],
    reporterName: "Tamer",
  },
  createdAt: at,
  githubStatus: "disabled",
  githubNumber: null,
  githubUrl: null,
  status: "new",
  finalReply: null,
  internalNote: null,
  duplicateOfId: null,
  revision: 0,
  hasReporterAccount: true,
  reopenedAt: null,
  confirmedBug: false,
  history: [],
  reporterConfirmedBugs: 0,
};

class RoadmapPage {
  readonly items: Item[] = [
    item({ id: 1, title: "Ranked / Leaderboard", status: "planned", supportCount: 4 }),
    item({ id: 2, title: "Replay annotations", status: "in_progress" }),
    item({
      id: 3,
      title: "Friends and match invitations",
      status: "under_review",
      supportCount: 2,
      discussionUrl: "https://discord.com/channels/1/2/3",
    }),
    item({ id: 4, title: "Faster alternate-art selection", status: "completed" }),
  ];
  readonly requests: { method: string; path: string; body: unknown }[] = [];

  constructor(readonly page: Page) {}

  async open({ path, signedIn = true, isAdmin = false }: { path: string; signedIn?: boolean; isAdmin?: boolean }) {
    await this.page.route("http://127.0.0.1:2569/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const body = request.postData() ? request.postDataJSON() : undefined;
      this.requests.push({ method, path, body });
      const itemMatch = /^\/(?:account\/admin\/|community\/)?roadmap\/(\d+)(\/support)?$/.exec(path);
      const found = itemMatch ? this.items.find((entry) => entry.id === Number(itemMatch[1])) : undefined;
      if (path === "/auth/me") {
        if (!signedIn) return route.fulfill({ status: 401, json: { error: "authentication_required" } });
        return route.fulfill({
          json: { id: "roadmap-fixture", displayName: "Kai", isAdmin, avatarUrl: null, avatarId: null },
        });
      }
      if (path === "/community/roadmap") return route.fulfill({ json: { items: this.items } });
      if (itemMatch && !found) return route.fulfill({ status: 404, json: { error: "not_found" } });
      if (found && itemMatch?.[2]) {
        const supported = (body as { supported: boolean }).supported;
        found.supportCount += supported === found.supported ? 0 : supported ? 1 : -1;
        found.supported = supported;
        return route.fulfill({ json: found });
      }
      if (found && method === "PUT") {
        Object.assign(found, body, { updatedAt: at + 1 });
        return route.fulfill({ json: found });
      }
      if (found && method === "DELETE") {
        this.items.splice(this.items.indexOf(found), 1);
        return route.fulfill({ status: 204 });
      }
      if (found) return route.fulfill({ json: found });
      if (path === "/account/admin/roadmap" && method === "POST") {
        const created = item({ ...(body as Item), id: 9 });
        this.items.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      if (path === "/account/admin/feedback/5/roadmap") {
        const linked = this.items.find((entry) => entry.id === 9);
        return route.fulfill({ json: { item: linked ?? null } });
      }
      if (path === "/account/admin/feedback/5") return route.fulfill({ json: report });
      if (path === "/account/admin/feedback")
        return route.fulfill({
          json: {
            items: [report],
            nextBefore: null,
            counts: { new: 1, triaged: 0, in_progress: 0, resolved: 0, wont_fix: 0, duplicate: 0 },
            reopenedCount: 0,
          },
        });
      if (path === "/community/decks") return route.fulfill({ json: { decks: [], hasMore: false } });
      if (path === "/account/admin/community/reports") return route.fulfill({ json: { decks: [] } });
      if (path === "/account/admin/playtest/members") return route.fulfill({ json: { members: [] } });
      if (path === "/account/admin/playtest/studies") return route.fulfill({ json: { open: [], past: [] } });
      if (path === "/account/decks") return route.fulfill({ json: [] });
      if (path === "/friends") return route.fulfill({ json: { friends: [] } });
      if (path === "/friends/requests") return route.fulfill({ json: { requests: [] } });
      if (path === "/account/blocks") return route.fulfill({ json: { blocks: [] } });
      return route.fulfill({ json: {} });
    });
    await this.page.goto(path);
  }

  column(name: string) {
    return this.page.getByRole("region", { name, exact: true });
  }

  async showColumn(name: string) {
    const lane = this.page.getByRole("group", { name: "Roadmap columns" }).getByRole("button", { name, exact: true });
    if (await lane.isVisible()) {
      await lane.click();
    }
  }
}

for (const width of [320, 1440]) {
  for (const dark of [false, true]) {
    test(`the roadmap shows four columns and lets players support items at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const roadmap = new RoadmapPage(page);
      await roadmap.open({ path: "/roadmap" });
      await page.evaluate((darkMode) => document.documentElement.classList.toggle("dark", darkMode), dark);
      await expect(page.getByRole("heading", { name: "Community roadmap", exact: true })).toBeVisible();
      const columns = page.locator(".roadmap-column h2");
      await expect(columns).toHaveText(["Planned", "In development", "Under review", "Completed"]);
      await roadmap.showColumn("Planned");
      await expect(roadmap.column("Planned").getByRole("link", { name: "Ranked / Leaderboard" })).toHaveAttribute(
        "href",
        "/roadmap/1",
      );
      await roadmap.showColumn("Under review");
      const support = roadmap.column("Under review").getByRole("button", { name: /Support Friends and match/ });
      await expect(support).toHaveText("2");
      await support.click();
      await expect(support).toHaveAttribute("aria-pressed", "true");
      await expect(support).toHaveText("3");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("roadmap.png"), fullPage: true });
    });
  }
}

test("guests are sent to sign in before supporting", async ({ page }) => {
  const roadmap = new RoadmapPage(page);
  await roadmap.open({ path: "/roadmap", signedIn: false });
  await roadmap
    .column("Planned")
    .getByRole("button", { name: /Support Ranked/ })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(roadmap.requests.some((request) => request.path.endsWith("/support"))).toBe(false);
});

test("the community header tabs link decks and the roadmap", async ({ page }) => {
  const roadmap = new RoadmapPage(page);
  await roadmap.open({ path: "/community" });
  const tabs = page.getByRole("tablist", { name: "Community sections" });
  await expect(tabs.getByRole("tab", { name: "Decks" })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "Roadmap" }).click();
  await expect(page).toHaveURL(/\/roadmap$/);
  await expect(page.getByRole("heading", { name: "Community roadmap", exact: true })).toBeVisible();
  await page.getByRole("tablist", { name: "Community sections" }).getByRole("tab", { name: "Decks" }).click();
  await expect(page).toHaveURL(/\/community$/);
});

test("an item page links its Discord discussion and has no admin tools for players", async ({ page }) => {
  const roadmap = new RoadmapPage(page);
  await roadmap.open({ path: "/roadmap" });
  await roadmap.column("Under review").getByRole("link", { name: "Friends and match invitations" }).click();
  await expect(page).toHaveURL(/\/roadmap\/3$/);
  await expect(page.getByRole("heading", { name: "Friends and match invitations", exact: true })).toBeVisible();
  await expect(page.getByText("Under review", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Discuss on Discord" })).toHaveAttribute(
    "href",
    "https://discord.com/channels/1/2/3",
  );
  await expect(page.getByRole("form", { name: "Manage this item" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the roadmap" }).click();
  await expect(page).toHaveURL(/\/roadmap$/);
});

test("admins edit and remove a roadmap item", async ({ page }) => {
  const roadmap = new RoadmapPage(page);
  await roadmap.open({ path: "/roadmap/2", isAdmin: true });
  const editor = page.getByRole("form", { name: "Manage this item" });
  await editor.getByRole("combobox", { name: "Column" }).selectOption("completed");
  const thread = editor.getByRole("textbox", { name: "Discord thread (optional)" });
  await thread.fill("https://example.com/thread");
  await expect(editor.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await thread.fill("https://discord.gg/aegis");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.locator(".roadmap-item__status")).toHaveText("Completed");
  expect(roadmap.requests.find((request) => request.path === "/account/admin/roadmap/2")?.body).toEqual({
    title: "Replay annotations",
    description: "Replay annotations in detail.",
    status: "completed",
    discussionUrl: "https://discord.gg/aegis",
  });
  await editor.getByRole("button", { name: "Remove from the roadmap" }).click();
  await editor.getByRole("button", { name: "Remove it and its support" }).click();
  await expect(page).toHaveURL(/\/roadmap$/);
  await expect(page.getByRole("link", { name: "Replay annotations" })).toHaveCount(0);
});

test("admins publish a private report with edited public text", async ({ page }) => {
  const roadmap = new RoadmapPage(page);
  await roadmap.open({ path: "/admin/feedback/5", isAdmin: true });
  const panel = page.getByRole("form", { name: "Publish to the roadmap" });
  await expect(panel.getByRole("textbox", { name: "Public title" })).toHaveValue("Bracket view for tournaments");
  await expect(panel.getByRole("combobox", { name: "Column" })).toHaveValue("under_review");
  await panel.getByRole("textbox", { name: "Public description" }).fill("Show the whole tournament bracket.");
  await panel.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published on the roadmap as “Bracket view for tournaments”.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the roadmap item" })).toHaveAttribute("href", "/roadmap/9");
  expect(roadmap.requests.find((request) => request.path === "/account/admin/roadmap")?.body).toEqual({
    title: "Bracket view for tournaments",
    description: "Show the whole tournament bracket.",
    status: "under_review",
    discussionUrl: null,
    sourceFeedbackId: 5,
  });
});
