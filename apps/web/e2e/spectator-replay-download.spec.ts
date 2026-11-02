import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { matchMaker } from "colyseus";
import type { MatchReplay } from "@aegis/shared/replays";
import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import { expect, test } from "@e2e/fixtures";

for (const { width, dark } of [
  { width: 1440, dark: false },
  { width: 390, dark: true },
]) {
  test(`an anonymous spectator downloads and reopens the completed match at ${width}px with dark=${dark}`, async ({
    page,
    browser,
    match,
  }) => {
    await match.start("reconnect");
    const origin = new URL(page.url()).origin;
    const roomId = match.opponent.room.roomId;
    const roomCode = match.state().spectatorCode;
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      await context.route("**/spectate/join", async (route) => {
        expect(route.request().postDataJSON().roomCode).toBe(roomCode);
        const [listing] = await matchMaker.query({ roomId });
        const reservation = await matchMaker.reserveSeatFor(listing!, {
          spectator: true,
          roomCode,
          displayName: "Replay Spectator",
          deck: { mainDeck: [], eggDeck: [] },
        });
        await route.fulfill({ json: reservation });
      });
      await context.addInitScript(
        (settings) => {
          localStorage.setItem("aegis:locale", "en");
          localStorage.setItem("aegis:darkMode", String(settings.dark));
          window.browserTestMode = "spectator";
          window.browserTestRoomCode = settings.roomCode;
          window.browserTestOptions = {
            displayName: "Replay Spectator",
            deck: { mainDeck: [], eggDeck: [] },
            seed: 1,
            spectator: true,
          };
        },
        { roomCode, dark },
      );
      const spectator = await context.newPage();
      await spectator.goto(`${origin}/e2e/harness.html`);
      await spectator.waitForFunction(
        () =>
          typeof window.browserTestSnapshot === "function" &&
          window.browserTestSnapshot().players?.[0]?.displayName === "Browser Protagonist",
      );
      match.opponent.room.onMessage("replay", () => {});
      match.opponent.room.send("surrender", {});
      await expect(spectator.getByRole("heading", { name: "Saved on this device" })).toBeVisible();
      const pendingDownload = spectator.waitForEvent("download");
      await spectator.getByRole("button", { name: "Download file", exact: true }).click();
      const download = await pendingDownload;
      expect(download.suggestedFilename()).toMatch(/^aegis-.+-spectator\.aegis-replay$/);
      const path = await download.path();
      expect(path).toBeTruthy();
      const replay = JSON.parse(gunzipSync(await readFile(path!)).toString()) as MatchReplay;
      expect(replay.viewerSeat).toBe(SPECTATOR_REPLAY_SEAT);
      expect(replay.visibleHandSeats).toEqual([]);
      expect(replay.frames[0]!.events.some((event) => event.kind === "matchStarted")).toBe(true);
      expect(replay.frames.at(-1)!.state.gameOver).toBe(true);
      for (const frame of replay.frames) {
        expect(frame.state.players.map((player) => player.hand)).toEqual([[], []]);
        expect(frame.events.some((event) => event.kind === "finalReveal")).toBe(false);
      }
      await context.route("**/auth/me", (route) => route.fulfill({ json: null }));
      await spectator.goto(`${origin}/profile`);
      await spectator.getByLabel("Open replay file").setInputFiles(path!);
      await expect(spectator.getByRole("heading", { name: "Browser Protagonist vs Observer Opponent" })).toBeVisible();
      await spectator.getByRole("button", { name: "Go to end", exact: true }).click();
      await expect(spectator.getByText("Replay finished", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
