import { gzipSync } from "node:zlib";
import { test, expect } from "@playwright/test";
import { replayFixture } from "../test/replays/fixture";

const OPPONENT_HAND_SIZE = 6;
const READABLE_CARD_WIDTH = 72;

test("shows the opponent's recorded hand at a readable size on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const replay = replayFixture();
  replay.visibleHandSeats = [0, 1];
  for (const frame of replay.frames) {
    const opponent = frame.state.players[1]!;
    opponent.hand = Array.from({ length: OPPONENT_HAND_SIZE }, (_, index) => ({
      instanceId: `opponent-hand-${index}`,
      cardId: "BT1-029",
      artId: "BT1-029",
      ownerSeat: 1,
    })) as never;
    opponent.handCount = OPPONENT_HAND_SIZE;
  }
  await page.route("**/auth/me", (route) => route.fulfill({ contentType: "application/json", body: "null" }));
  await page.goto("/profile");
  await page.getByLabel("Open replay file").setInputFiles({
    name: "revealed-opponent-hand.aegis-replay",
    mimeType: "application/gzip",
    buffer: gzipSync(JSON.stringify(replay)),
  });
  const cards = page.getByTestId("opponent-hand").getByRole("button");
  await expect(cards).toHaveCount(OPPONENT_HAND_SIZE);
  await expect
    .poll(async () => (await cards.first().locator("img").boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(READABLE_CARD_WIDTH);
  const lastCard = await cards.last().boundingBox();
  const viewport = page.viewportSize()!;
  expect(lastCard!.x + lastCard!.width).toBeLessThanOrEqual(viewport.width);
});
