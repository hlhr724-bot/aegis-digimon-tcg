// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { setupEngine } from "@aegis-api/engine/testkit/harness.js";
import { cleanup, fireEvent, render, screen, waitFor } from "./scenarioHarness/testingLibrary";
import { GameScreen } from "../src/game/GameScreen";
import { setEffectConfirmationHoldEnabled } from "../src/game/effectConfirmationHold";
import { activePacing } from "../src/game/pacing";

const mocked = vi.hoisted(() => ({
  roomResult: { current: undefined as unknown },
  room: { roomId: "hold-effects-room", onMessage: () => () => {}, send: () => {} },
}));

vi.mock("../src/net/useRoom", () => ({
  useRoom: () => mocked.roomResult.current,
}));

vi.mock("../src/net/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/net/client")>()),
  joinWithBot: () => Promise.resolve(),
}));

beforeEach(() => setEffectConfirmationHoldEnabled(true));

afterEach(() => {
  cleanup();
  setEffectConfirmationHoldEnabled(false);
});

const CLAUSE =
  "[Main] Reveal the top 3 cards of your deck. Add 1 card with [Huckmon] or [Sistermon] in its name " +
  "or [Royal Knight] in its traits among them to your hand. Trash the rest.";

function opponentEffect() {
  return {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "ST12-15",
    effectKey: "st12-15-main",
    description: CLAUSE,
    timing: "Main",
  };
}

function renderThenNarrate(startMode: "bot" | "casual") {
  const s = setupEngine({
    0: { security: 5 },
    1: { battleArea: ["ST12-15"], deck: ["BT1-010"], security: 5 },
  });
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";
  s.state.turnSeat = 1;
  s.state.phase = "Main";
  const connection = {
    room: mocked.room,
    status: "connected",
    state: s.state,
    sessionId: "viewer-session",
    stateVersion: 1,
    roomCode: "",
  };
  const screenElement = (): ReactElement => (
    <GameScreen
      joinOptions={{ displayName: "Protagonist", deck: { mainDeck: [], eggDeck: [] } }}
      identityColor="Red"
      startMode={startMode}
      presentationPacing="sequential"
      onExit={() => {}}
    />
  );
  mocked.roomResult.current = { ...connection, events: [] };
  const { rerender } = render(screenElement());
  mocked.roomResult.current = { ...connection, events: [opponentEffect()] };
  rerender(screenElement());
}

it("keeps the bot's effect on screen past the reading ceiling until the viewer confirms it", async () => {
  renderThenNarrate("bot");
  const confirm = await screen.findByRole("button", { name: "Continue to the next effect" }, { timeout: 5_000 });
  await new Promise((resolve) => setTimeout(resolve, activePacing().announceMaxMs + 500));
  expect(screen.getByRole("button", { name: "Continue to the next effect" })).toBe(confirm);
  expect(document.querySelector(".match-notice[data-variant=effect]")?.textContent).toContain("Reveal the top 3");
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Continue to the next effect" })).toBeNull());
}, 20_000);

it("never holds an effect in a match against another player", async () => {
  renderThenNarrate("casual");
  await waitFor(() =>
    expect(document.querySelector(".match-notice[data-variant=effect]")?.textContent).toContain("Reveal the top 3"),
  );
  expect(screen.queryByRole("button", { name: "Continue to the next effect" })).toBeNull();
});

it("does not hold the bot's effect when the preference is off", async () => {
  setEffectConfirmationHoldEnabled(false);
  renderThenNarrate("bot");
  await waitFor(() =>
    expect(document.querySelector(".match-notice[data-variant=effect]")?.textContent).toContain("Reveal the top 3"),
  );
  expect(screen.queryByRole("button", { name: "Continue to the next effect" })).toBeNull();
});
