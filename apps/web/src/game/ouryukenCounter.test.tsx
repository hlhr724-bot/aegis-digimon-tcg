// @vitest-environment jsdom
import {
  ANIMATION_SPEED_CHANNEL,
  CardInstance,
  CombatWindow,
  GameState,
  Permanent,
  Phase,
  PlayerState,
} from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import type { AegisRoom } from "../net/client";
import { GameScreen } from "./GameScreen";

afterEach(cleanup);

it.each([
  ["ace-1", "ouryumon-1"],
  ["ace-2", "ouryumon-1"],
] as const)(
  "Discord 1556343982546755625: selecting %s groups identical hand partners and activates %s from the Counter selection dialog",
  (aceId, partnerId) => {
    localStorage.clear();
    const state = new GameState();
    state.phase = Phase.Main;
    state.turnSeat = 1;
    state.memory = 3;
    for (const seat of [0, 1] as const) {
      const player = new PlayerState();
      player.seat = seat;
      player.sessionId = `session-${seat}`;
      state.players.push(player);
    }
    for (const [instanceId, cardId] of [
      ["ace-1", "BT20-060"],
      ["ace-2", "BT20-060"],
      ["ouryumon-1", "BT20-018"],
      ["ouryumon-2", "BT20-018"],
    ]) {
      const card = new CardInstance();
      card.instanceId = instanceId!;
      card.cardId = cardId!;
      card.ownerSeat = 0;
      state.players[0]!.hand.push(card);
    }
    state.players[0]!.handCount = 4;
    for (const [seat, permanentId, cardId] of [
      [0, "alphamon", "EX13-060"],
      [1, "lanamon", "BT12-024"],
    ] as const) {
      const permanent = new Permanent();
      permanent.permanentId = permanentId;
      permanent.controllerSeat = seat;
      permanent.topCard = new CardInstance();
      permanent.topCard.instanceId = `${permanentId}-top`;
      permanent.topCard.cardId = cardId;
      state.players[seat]!.battleArea.push(permanent);
    }
    const effectKey = (partner: string) =>
      `blast-dna-digivolve:${JSON.stringify(["alphamon", "alphamon-top", partner, 0])}`;
    state.combatWindow = new CombatWindow();
    state.combatWindow.kind = "counter";
    state.combatWindow.seat = 0;
    state.combatWindow.attackerPermanentId = "lanamon";
    state.combatWindow.eligibleCountersJson = JSON.stringify(
      ["ace-1", "ace-2"].flatMap((instanceId) =>
        ["ouryumon-1", "ouryumon-2"].map((partner) => ({
          instanceId,
          effectKey: effectKey(partner),
          description: "＜Blast DNA Digivolve＞ Alphamon + Ouryumon (hand)",
        })),
      ),
    );
    // The server omits the opponent's private hand from the live client projection.
    const clientState = state.toJSON() as unknown as GameState;
    Reflect.deleteProperty(clientState.players[1]!, "hand");
    const send = vi.fn<(type: string, payload: unknown) => void>();
    const room = {
      state: clientState,
      connection: { isOpen: true },
      send: (type: string, payload: unknown) => (type === ANIMATION_SPEED_CHANNEL ? undefined : send(type, payload)),
      onMessage: () => () => {},
    } as unknown as AegisRoom;
    const { container } = render(
      <I18nProvider>
        <GameScreen
          joinOptions={{ displayName: "zeroxbass", deck: { mainDeck: [], eggDeck: [] } }}
          identityColor="Black"
          onExit={() => undefined}
          demoConnection={{
            room,
            status: "connected",
            state: clientState,
            events: [],
            batches: [],
            decision: undefined,
            acknowledgeDecision: () => undefined,
            error: undefined,
            sessionId: "session-0",
            roomCode: "",
          }}
        />
      </I18nProvider>,
    );
    const picker = screen.getByRole("dialog", { name: "Counter timing" });
    expect(within(within(picker).getByRole("region", { name: "Hand" })).getAllByRole("button")).toHaveLength(1);
    const handCards = container.querySelectorAll(".game-hand-card");
    fireEvent.click(handCards[aceId === "ace-1" ? 0 : 1]!, { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    const rail = within(screen.getByRole("dialog", { name: "Counter timing" }));
    const partners = rail.getAllByRole("button", { name: /Blast DNA/ });
    expect(partners).toHaveLength(1);
    expect(within(partners[0]!).getByRole("img", { name: /^Alphamon$/ })).toBeTruthy();
    fireEvent.click(partners[0]!);
    expect(send).toHaveBeenCalledExactlyOnceWith("respondCounter", {
      rollbackRevision: 0,
      sourceInstanceId: aceId,
      effectKey: effectKey(partnerId),
    });
  },
);
