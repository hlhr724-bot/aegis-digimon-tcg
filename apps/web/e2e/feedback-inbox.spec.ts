import { expect, test, type Page } from "@playwright/test";
import { FeedbackStatus, FEEDBACK_STATUSES } from "@aegis/shared/feedback/FeedbackStatus";
import type { FeedbackDetail } from "@/bugs/adminClient";

class FeedbackInboxPage {
  constructor(readonly page: Page) {}

  async open(isAdmin = true) {
    const item: FeedbackDetail = {
      id: 42,
      report: {
        kind: "bug",
        summary: "On-play effect does not activate",
        description: "Play Agumon, then select the opponent's Digimon.\nThe effect does not resolve.",
        reporterName: "Tamer",
        cardIds: ["BT1-010"],
        matchId: "f62249e5-ba6e-4528-b517-63bee8fbbb0f",
        userAgent: "Browser context ".repeat(20),
      },
      createdAt: 1780000000000,
      githubStatus: "sent",
      githubNumber: 42,
      githubUrl: "https://github.com/example/repo/issues/42",
      status: FeedbackStatus.NEW.value,
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
    const port = process.env.AEGIS_E2E_EDGE_PORT ?? "2569";
    const responses: Record<string, unknown> = {
      "/auth/me": { id: "admin-fixture", displayName: "Vn", isAdmin, avatarUrl: null, avatarId: null },
      "/account/admin/feedback": {
        items: [item],
        nextBefore: null,
        counts: Object.fromEntries(
          FEEDBACK_STATUSES.map((status) => [status, status === FeedbackStatus.NEW.value ? 1 : 0]),
        ),
        reopenedCount: 0,
      },
      "/account/admin/feedback/42": item,
      "/account/admin/community/reports": { decks: [] },
      "/account/admin/playtest/members": { members: [] },
      "/account/admin/playtest/studies": { open: [], past: [] },
      "/account/decks": [],
    };
    await this.page.route(`http://127.0.0.1:${port}/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body =
        path === "/account/preferences" && request.method() === "PUT"
          ? request.postDataJSON()
          : (responses[path] ?? {});
      await route.fulfill({ json: body });
    });
    await this.page.goto("/admin/feedback");
  }
}

for (const width of [320, 768, 1024, 1440]) {
  test(`administrator inbox fits ${width}px and exposes report context`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await new FeedbackInboxPage(page).open();
    await page.getByRole("button", { name: /On-play effect does not activate/ }).click();
    await expect(page.getByRole("heading", { name: "On-play effect does not activate" })).toBeVisible();
    const details = page.getByText("Technical details", { exact: true });
    await details.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("f62249e5-ba6e-4528-b517-63bee8fbbb0f", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open GitHub issue #42" })).toBeVisible();
    const region = page.getByRole("region", { name: "Player feedback" });
    expect(await region.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`feedback-${width}.png`), fullPage: true });
    const back = page.getByRole("button", { name: "Back to the list", exact: true });
    if (await back.isVisible()) await back.click();
    await page.getByRole("button", { name: "Older", exact: true }).scrollIntoViewIfNeeded();
    const older = await page.getByRole("button", { name: "Older", exact: true }).boundingBox();
    expect(older).not.toBeNull();
    expect(older!.y + older!.height).toBeLessThanOrEqual(900 - (width < 960 ? 68 : 0));
    expect(errors).toEqual([]);
  });
}

test("direct navigation by an ordinary player does not request feedback", async ({ page }) => {
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/account/admin/feedback")) reads++;
  });
  await new FeedbackInboxPage(page).open(false);
  await expect(page.getByText("Only administrators can view feedback.")).toBeVisible();
  expect(reads).toBe(0);
});
