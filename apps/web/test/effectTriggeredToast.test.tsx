// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { setupEngine, settle } from "@aegis-api/engine/testkit/harness.js";
import "@aegis-api/cards/BT25/BT25-084.js";
import { compiled } from "@aegis-api/cards/BT25/BT25-054.js";
import { withPrintedClauses } from "@aegis-api/engine/effects/interpreter/registration/printedClauses.js";
import { getCardDefinition } from "@aegis/shared";
import { cleanup, render, screen, within, waitFor } from "./scenarioHarness/testingLibrary";
import { act } from "@testing-library/react";
import type { DecisionResponse } from "@aegis/shared";
import { GameScreen } from "../src/game/GameScreen";

const mocked = vi.hoisted(() => ({
  roomResult: { current: undefined as unknown },
  room: { roomId: "effect-resolved-toast-room", onMessage: () => () => {}, send: () => {} },
}));

vi.mock("../src/net/useRoom", () => ({
  useRoom: () => mocked.roomResult.current,
}));

afterEach(() => cleanup());

it("shows Titamon's hand-trash All Turns clause from the real engine announcement", async () => {
  const s = setupEngine(
    {
      0: { battleArea: ["BT25-084"], hand: [{ card: "BT1-013", as: "discard" }], security: 5 },
      1: { battleArea: [{ card: "BT1-013", dp: 4000, as: "target" }], security: 5 },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.engine.recomputeContinuousEffects();
  const fx = (s.engine as unknown as { primitives: { trash(ids: string[]): Promise<unknown[]> } }).primitives;
  await fx.trash([s.inst("discard").instanceId]);
  await settle(() => s.state.players[1]!.battleArea.length === 0);
  const activation = s.events.find((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-084");
  expect(activation).toBeDefined();
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";
  await renderThenNarrate(
    { room: mocked.room, status: "connected", state: s.state, sessionId: "viewer-session", stateVersion: 1 },
    activation,
  );
  const notice = await screen.findByRole("status");
  const printed = getCardDefinition("BT25-084")!.effectText!.split("\n");
  expect(notice.textContent).toContain(printed.find((line) => line.startsWith("[All Turns] When your hand")));
  expect(notice.textContent).not.toContain("When this Digimon would leave");
});

it("waits for confirmed targets before showing Titamon's new toast", async () => {
  const s = setupEngine(
    {
      0: { battleArea: ["BT25-084"], hand: [{ card: "BT1-013", as: "discard" }], security: 5 },
      1: {
        battleArea: [
          { card: "BT1-013", dp: 4000, as: "a" },
          { card: "BT1-013", dp: 4000, as: "b" },
        ],
        security: 5,
      },
    },
    { autoAcceptOptional: true, autoSelectCards: false },
  );
  await s.engine.recomputeContinuousEffects();
  const fx = (s.engine as unknown as { primitives: { trash(ids: string[]): Promise<unknown[]> } }).primitives;
  const trashing = fx.trash([s.inst("discard").instanceId]);
  await settle(() => s.decisions.some(({ req }) => req.kind === "chooseTargets" || req.kind === "selectCards"));
  const request = s.decisions.find(({ req }) => req.kind === "chooseTargets" || req.kind === "selectCards")!.req;
  const activation = s.events.find((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-084")!;
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";
  const connection = {
    room: mocked.room,
    status: "connected",
    state: s.state,
    sessionId: "viewer-session",
    stateVersion: 1,
  };
  const update = await renderThenNarrate(connection, activation, request);
  await screen.findByRole("button", { name: /confirm (targets|selection)/i });
  await new Promise((resolve) => setTimeout(resolve, 900));
  expect(document.querySelector(".match-notice[data-variant=effect]")).toBeNull();
  const response: DecisionResponse = {
    kind: request.kind === "selectCards" ? "selectCards" : "chooseTargets",
    instanceIds: [s.perm("a").permanentId],
  };
  await s.engine.applyIntent(0, { type: "respondDecision", decisionId: request.decisionId, response });
  await trashing;
  await settle(() => s.state.players[1]!.battleArea.length === 1);
  act(() => update({ ...connection, events: [activation], decision: undefined }));
  await waitFor(() =>
    expect(document.querySelector(".match-notice[data-variant=effect]")?.textContent).toContain("lowest DP"),
  );
});

it.each([true, false])(
  "shows BT25-054's full digivolution clause with server description=%s",
  async (includeDescription) => {
    const s = setupEngine({ 0: { battleArea: ["BT25-054"], security: 5 }, 1: { security: 5 } });
    s.state.players[0]!.sessionId = "viewer-session";
    s.state.players[1]!.sessionId = "opponent-session";
    const effect = withPrintedClauses("BT25-054", compiled).effects.find(
      (entry) => entry.trigger === "WhenDigivolving",
    )!;
    const clause = getCardDefinition("BT25-054")!
      .effectText!.split("\n")
      .find((line) => line.startsWith("[On Play]"))!;

    await renderThenNarrate(
      {
        room: mocked.room,
        status: "connected",
        state: s.state,
        sessionId: "viewer-session",
        stateVersion: 1,
        roomCode: "",
      },
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT25-054",
        effectKey: "BT25-054/when-digivolving",
        description: includeDescription ? effect.description : undefined,
        timing: "WhenDigivolving",
      },
    );

    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain(clause);
    expect(notice.textContent).not.toContain("[All Turns]");
  },
);

/**
 * The match screen treats the first batch of events it sees as replayed history
 * and narrates none of it, so a notice is only raised for an event that arrives
 * after the board is already up.
 */
async function renderThenNarrate(connection: Record<string, unknown>, event: unknown, decision?: unknown) {
  mocked.roomResult.current = { ...connection, events: [] };
  // A fresh element each time: React bails out of re-rendering when handed the
  // very same element object, and the second pass is the point of the exercise.
  const screenElement = (): ReactElement => (
    <GameScreen
      joinOptions={{ displayName: "Protagonist", deck: { mainDeck: [], eggDeck: [] } }}
      identityColor="Red"
      startMode="casual"
      onExit={() => {}}
    />
  );
  const { rerender } = render(screenElement());
  mocked.roomResult.current = { ...connection, events: [event], decision };
  rerender(screenElement());
  return (next: Record<string, unknown>) => {
    mocked.roomResult.current = next;
    rerender(screenElement());
  };
}

it("shows a non-blocking notice when the viewer's mandatory effect resolves", async () => {
  const clause =
    "[Main] Reveal the top 3 cards of your deck. Add 1 card with [Huckmon] or [Sistermon] in its name " +
    "or [Royal Knight] in its traits among them to your hand. Trash the rest.";
  const s = setupEngine({
    0: { battleArea: ["ST12-15"], deck: ["BT1-010"], security: 5 },
    1: { deck: ["BT1-029"], security: 5 },
  });
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";
  s.state.turnSeat = 0;
  s.state.phase = "Main";

  await renderThenNarrate(
    {
      room: mocked.room,
      status: "connected",
      state: s.state,
      decision: undefined,
      error: undefined,
      sessionId: "viewer-session",
      stateVersion: 1,
      roomCode: "",
    },
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "ST12-15",
      effectKey: "st12-15-main",
      description: clause,
      timing: "Main",
    },
  );

  const notice = await screen.findByRole("status");
  expect(within(notice).getByText("From Master to Disciple (ST12-15)")).toBeDefined();
  // The clause is rendered as linked fragments, so it is read off the notice as a whole.
  expect(notice.textContent).toContain(clause);
  expect(notice.getAttribute("data-variant")).toBe("effect");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("shows the exact inherited clause instead of SaviorHuckmon's main effect", async () => {
  const inherited =
    "[When Attacking][Inherited][Once Per Turn] If this Digimon has [Royal Knight] in its traits, " +
    "you may play 1 Digimon card with [Sistermon] in its name from your hand or trash without paying its memory cost.";
  const s = setupEngine({
    0: { battleArea: [{ card: "ST12-10", under: ["ST12-08"] }], security: 5 },
    1: { security: 5 },
  });
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";

  await renderThenNarrate(
    {
      room: mocked.room,
      status: "connected",
      state: s.state,
      decision: undefined,
      error: undefined,
      sessionId: "viewer-session",
      stateVersion: 1,
      roomCode: "",
    },
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "ST12-08",
      effectKey: "ST12-08/when-attacking-inherited-play-sistermon",
      description: inherited,
      timing: "OnAllyAttack",
    },
  );

  const notice = await screen.findByRole("status");
  // Printed as the card prints it: the inherited box carries no "[Inherited]" marker.
  expect(notice.textContent).toContain(inherited.replace("[Inherited]", ""));
  expect(within(notice).queryByText(/\[When Digivolving\].*unsuspended Digimon/)).toBeNull();
});

it("dims breeding only once the viewer can act, never during setup or the opponent's turn", async () => {
  const s = setupEngine({ 0: { security: 5 }, 1: { security: 5 } });
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";
  s.state.turnSeat = 0;
  s.state.phase = "Breeding";
  const connection = {
    room: mocked.room,
    status: "connected",
    state: s.state,
    events: [],
    sessionId: "viewer-session",
    stateVersion: 1,
    roomCode: "",
  };
  mocked.roomResult.current = { ...connection, decision: { kind: "optional", seat: 1 } };
  const element = () => (
    <GameScreen
      joinOptions={{ displayName: "Protagonist", deck: { mainDeck: [], eggDeck: [] } }}
      identityColor="Red"
      startMode="casual"
      onExit={() => {}}
    />
  );
  const { container, rerender } = render(element());
  expect(container.querySelector(".game-breeding-mode")).toBeNull();

  mocked.roomResult.current = connection;
  rerender(element());
  expect(container.querySelector(".game-breeding-mode")).not.toBeNull();

  s.state.turnSeat = 1;
  rerender(element());
  expect(container.querySelector(".game-breeding-mode")).toBeNull();

  s.state.turnSeat = 0;
  s.state.phase = "Main";
  rerender(element());
  expect(container.querySelector(".game-breeding-mode")).toBeNull();
});

it("keeps Gallantmon's On Play toast while its distinct All Turns protection asks a question", async () => {
  const s = setupEngine({ 0: { battleArea: ["EX13-015"], security: 5 }, 1: { security: 5 } });
  s.state.players[0]!.sessionId = "viewer-session";
  const host = s.state.players[0]!.battleArea[0]!;
  await renderThenNarrate(
    {
      room: mocked.room,
      status: "connected",
      state: s.state,
      sessionId: "viewer-session",
      stateVersion: 1,
      decision: {
        decisionId: "nested-protection",
        seat: 0,
        kind: "optional",
        sourceCardId: "EX13-015",
        sourceInstanceId: host.topCard!.instanceId,
        sourcePermanentId: host.permanentId,
        promptText: "Prevent leaving the battle area?",
        options: {
          timing: "AllTurns",
          effectText:
            "When this Digimon would leave the battle area other than by your effects, by deleting 1 of your opponent's 9000 DP or lower Digimon, it doesn't leave",
        },
      },
    },
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "EX13-015",
      sourceInstanceId: host.topCard!.instanceId,
      sourcePermanentId: host.permanentId,
      effectKey: "EX13-015/ir-shared-0",
      timing: "OnPlay",
      description:
        "[On Play] [When Digivolving] [When Attacking] [Counter] [Once Per Turn] Delete 1 of your opponent's 12000 DP or higher Digimon. If this effect didn't delete, trash their top security card.",
    },
  );
  const notice = await screen.findByRole("status");
  expect(notice.textContent).toContain("12000 DP");
});
