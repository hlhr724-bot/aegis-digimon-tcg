// @vitest-environment jsdom
import { CardInstance, GameState, Permanent, Phase, PlayerState, type DecisionResponse } from "@aegis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { GameScreen } from "./GameScreen";

vi.mock("../design/sound", () => ({
  playSound: vi.fn<() => void>(),
  startMusic: vi.fn<() => void>(),
  stopMusic: vi.fn<() => void>(),
}));
afterEach(cleanup);

it.each([
  { separateHosts: false, cancelAtHost: false },
  { separateHosts: true, cancelAtHost: false },
  { separateHosts: true, cancelAtHost: true },
])(
  "opens source selection with separate hosts $separateHosts and cancels at the host step $cancelAtHost",
  ({ separateHosts, cancelAtHost }) => {
    localStorage.clear();
    const state = new GameState();
    state.stateVersion = 1;
    state.phase = Phase.Main;
    state.turnSeat = 0;
    for (const seat of [0, 1] as const) {
      const player = new PlayerState();
      player.seat = seat;
      player.sessionId = `session-${seat}`;
      state.players.push(player);
    }
    for (const [id, cardId] of [
      ["first", "ST1-07"],
      ["second", "ST1-09"],
      ["unoffered", "ST1-11"],
    ]) {
      const host = new Permanent();
      host.permanentId = id!;
      host.topCard = new CardInstance();
      host.topCard.instanceId = `${id}-top`;
      host.topCard.cardId = cardId!;
      const source = new CardInstance();
      source.instanceId = `${id}-source`;
      source.cardId = "ST1-03";
      host.stack.push(source);
      state.players[1]!.battleArea.push(host);
    }
    if (!separateHosts) {
      const firstHost = state.players[1]!.battleArea[0]!;
      const secondHost = state.players[1]!.battleArea[1]!;
      firstHost.stack.push(...secondHost.stack.splice(0));
    }
    const respond = vi.fn<(response: DecisionResponse) => void>();
    const { container } = render(
      <I18nProvider>
        <GameScreen
          joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
          identityColor="Red"
          onExit={() => undefined}
          demoConnection={{
            room: undefined,
            status: "connected",
            state,
            events: [],
            batches: [],
            decision: {
              decisionId: "strip-sources",
              seat: 0,
              kind: "selectCards",
              promptText: "Trash 2 digivolution cards from your opponent's Digimon.",
              options: { candidateInstanceIds: ["first-source", "second-source"], min: 2, max: 2, declinesCost: true },
            },
            acknowledgeDecision: vi.fn<() => void>(),
            respondDecision: respond,
            error: undefined,
            sessionId: "session-0",
            roomCode: "",
          }}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("dialog") !== null).toBe(!separateHosts);
    const host = (id: string) => container.querySelector<HTMLElement>(`[data-drop="perm-opp"][data-id="${id}"]`)!;
    if (cancelAtHost) {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    } else {
      if (separateHosts) {
        fireEvent.click(host("first"));
      }
      const first = container.querySelector<HTMLElement>('[data-instance-id="first-source"]')!;
      fireEvent.click(first);
      if (separateHosts) {
        fireEvent.click(screen.getByRole("button", { name: "Choose another Digimon" }));
        fireEvent.click(host("second"));
      }
      fireEvent.click(container.querySelector<HTMLElement>('[data-instance-id="second-source"]')!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    }
    expect(container.querySelector('[data-instance-id="first-source"]') !== null).toBe(!cancelAtHost && !separateHosts);
    expect(container.querySelector('[data-instance-id="second-source"]') !== null).toBe(!cancelAtHost);
    expect(respond).toHaveBeenCalledWith({
      kind: "selectCards",
      instanceIds: cancelAtHost ? [] : ["first-source", "second-source"],
    });
  },
);
