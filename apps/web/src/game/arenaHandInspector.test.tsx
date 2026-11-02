// @vitest-environment jsdom
import {
  ANIMATION_SPEED_CHANNEL,
  CardInstance,
  GameState,
  Permanent,
  Phase,
  PlayerState,
  getCardDefinition,
  type DecisionRequest,
} from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { cardConfirmationPreference } from "@/game/cardConfirmation/cardConfirmationPreference";
import { I18nProvider } from "../i18n";
import type { AegisRoom } from "../net/client";
import type { ActivatableEntry } from "./boardModel";
import { GameScreen, HandCardPreview } from "./GameScreen";
import { normalizeKeywordBrackets } from "./keywordReminders";
import { Side } from "./side";

beforeEach(() => {
  localStorage.clear();
  cardConfirmationPreference.setMode(CardConfirmationMode.NEVER.value);
});
afterEach(() => {
  cleanup();
  cardConfirmationPreference.setMode(CardConfirmationMode.ALWAYS.value);
});

function arena(decision?: DecisionRequest) {
  const state = new GameState();
  state.phase = Phase.Main;
  state.turnSeat = 0;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.sessionId = `session-${seat}`;
    state.players.push(player);
  }
  const hand = new CardInstance();
  hand.instanceId = "hand-greymon";
  hand.cardId = "ST1-07";
  hand.ownerSeat = 0;
  hand.playableFromHand = true;
  hand.digivolveTargetPermanentIds.push("base-agumon");
  hand.linkTargetPermanentIds.push("base-agumon");
  state.players[0]!.hand.push(hand);
  state.players[0]!.handCount = 1;
  const base = new Permanent();
  base.permanentId = "base-agumon";
  base.controllerSeat = 0;
  base.topCard = new CardInstance();
  base.topCard.cardId = "ST1-03";
  base.topCard.instanceId = "base-card";
  base.baseDP = 2000;
  base.currentDP = 2000;
  state.players[0]!.battleArea.push(base);
  const send = vi.fn<(type: string, payload: unknown) => void>();
  const room = {
    state,
    connection: { isOpen: true },
    send: (type: string, payload: unknown) => (type === ANIMATION_SPEED_CHANNEL ? undefined : send(type, payload)),
    onMessage: () => () => {},
  } as unknown as AegisRoom;
  const result = render(
    <I18nProvider>
      <GameScreen
        joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Red"
        onExit={() => undefined}
        demoConnection={{
          room,
          status: "connected",
          state,
          events: [],
          batches: [],
          decision,
          acknowledgeDecision: () => undefined,
          error: undefined,
          sessionId: "session-0",
          roomCode: "",
        }}
      />
    </I18nProvider>,
  );
  return {
    ...result,
    send,
    hand: result.container.querySelector<HTMLElement>(".game-hand-card")!,
    base: result.container.querySelector<HTMLElement>('[data-drop="perm-you"][data-id="base-agumon"]')!,
  };
}

it("opens hand details on the first click over the opponent half without the selected cost/cancel strip", () => {
  const { hand, container } = arena();
  fireEvent.click(hand);
  const panel = screen.getByRole("dialog", { name: "Greymon" });
  expect(panel.getAttribute("data-half")).toBe("upper");
  expect(panel.closest(".game-board")).toBeNull();
  expect(panel.parentElement).toBe(document.body);
  expect(panel.querySelector('[data-role="stack"]')).toBeNull();
  // The details print the card data's full-width ＜Keyword＞ brackets as ASCII ones.
  expect(panel.querySelector('[data-role="printed-inherited"]')?.textContent).toContain(
    normalizeKeywordBrackets(getCardDefinition("ST1-07")!.inheritedEffectText ?? ""),
  );
  expect(panel.textContent).toContain(getCardDefinition("ST1-07")!.effectText ?? "No printed effect");
  expect(container.querySelector(".game-action-bar--contextual")).toBeNull();
  expect(within(panel).queryByRole("button", { name: "Cancel" })).toBeNull();
  fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Greymon" })).toBeNull();
  expect(hand.getAttribute("aria-pressed")).toBe("false");
  expect(document.activeElement).toBe(hand);
  fireEvent.keyDown(hand, { key: "Enter" });
  expect(screen.getByRole("dialog", { name: "Greymon" })).toBeTruthy();
});

it("plays the selected hand instance through the existing intent path", () => {
  const { hand, send } = arena();
  fireEvent.click(hand);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Greymon" })).getByRole("button", { name: "Play Digimon" }),
  );
  expect(send).toHaveBeenCalledWith("playCard", expect.objectContaining({ instanceId: "hand-greymon" }));
  expect(screen.queryByRole("dialog", { name: "Greymon" })).toBeNull();
});

it("retains selection while choosing a digivolution base and can abandon it with Escape", () => {
  const { hand, base, send } = arena();
  fireEvent.click(hand);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Greymon" })).getByRole("button", {
      name: "Digivolve",
    }),
  );
  expect(screen.queryByRole("dialog", { name: "Greymon" })).toBeNull();
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(hand.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(hand);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Greymon" })).getByRole("button", {
      name: "Digivolve",
    }),
  );
  fireEvent.click(base);
  expect(send).toHaveBeenCalledWith(
    "digivolve",
    expect.objectContaining({ instanceId: "hand-greymon", permanentId: "base-agumon" }),
  );
});

it("retains the server-projected link target flow", () => {
  const { hand, base, send } = arena();
  fireEvent.click(hand);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Greymon" })).getByRole("button", { name: "Link" }));
  expect(screen.queryByRole("dialog", { name: "Greymon" })).toBeNull();
  fireEvent.click(base);
  expect(send).toHaveBeenCalledWith("linkCard", {
    instanceId: "hand-greymon",
    targetPermanentId: "base-agumon",
    rollbackRevision: 0,
  });
});

it("keeps local digivolution selection after inspecting a field card without showing magnifiers", () => {
  const { hand, base, send } = arena();
  expect(screen.queryByRole("button", { name: "Read Agumon" })).toBeNull();
  fireEvent.click(hand);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Greymon" })).getByRole("button", { name: "Digivolve" }));
  expect(screen.queryByRole("button", { name: "Read Agumon" })).toBeNull();
  fireEvent.contextMenu(base);
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { name: "Agumon" })).getByRole("button", { name: "Close" }));
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Read Agumon" })).toBeNull();
  fireEvent.click(base);
  expect(send).toHaveBeenCalledWith(
    "digivolve",
    expect.objectContaining({ instanceId: "hand-greymon", permanentId: "base-agumon" }),
  );
});

it.each(["optional", "chooseTargets", "selectCards"] as const)(
  "shows field magnifiers only for an active card selection (%s)",
  (kind) => {
    const { container } = arena({
      decisionId: "inspection-event",
      seat: 0,
      kind,
      promptText: "Choose a Digimon.",
      sourceCardId: "ST1-03",
      options: { candidateInstanceIds: ["base-agumon"], min: 0, max: 1 },
    });
    expect(container.querySelectorAll(".game-permanent__inspect")).toHaveLength(kind === "optional" ? 0 : 1);
  },
);

it("preserves distinct hand effects and art zoom in the shared inspector", () => {
  const activate = vi.fn<(effect: ActivatableEntry) => void>();
  const effects = [
    { instanceId: "cyber", effectKey: "first", description: "[Hand][Main] First action" },
    { instanceId: "cyber", effectKey: "second", description: "[Hand][Main] Second action" },
  ];
  render(
    <I18nProvider>
      <HandCardPreview
        arenaInspection={{ side: Side.Viewer, container: null }}
        cardId="BT10-025"
        activatableEffects={effects}
        canPlay={false}
        canDigivolve={false}
        onPlay={() => undefined}
        onActivateEffect={activate}
        onChooseBase={() => undefined}
        onCancel={() => undefined}
      />
    </I18nProvider>,
  );
  const panel = screen.getByRole("dialog", { name: "Cyberdramon" });
  fireEvent.click(within(panel).getByRole("button", { name: "Activate effect: [Hand][Main] Second action" }));
  expect(activate).toHaveBeenCalledWith(effects[1]);
  fireEvent.click(within(panel).getByRole("button", { name: "Enlarge card" }));
  expect(document.querySelector(".card-zoom")).toBeTruthy();
});

it("shows the Option name and effect alongside the Digimon effect for dual cards", () => {
  const card = getCardDefinition("BT26-056")!;
  render(
    <I18nProvider>
      <HandCardPreview
        arenaInspection={{ side: Side.Viewer, container: null }}
        cardId={card.cardId}
        activatableEffects={[]}
        onActivateEffect={() => undefined}
        canPlay={false}
        canDigivolve={false}
        onPlay={() => undefined}
        onChooseBase={() => undefined}
        onCancel={() => undefined}
      />
    </I18nProvider>,
  );
  const panel = screen.getByRole("dialog", { name: card.nameEn });
  const option = panel.querySelector('[data-role="printed-option"]');
  expect(option?.textContent).toContain(card.dualEffect);
  expect(option?.textContent).toContain("Use Req. ([TS] trait)");
  expect(option?.textContent).toContain("[Main] Trash 1 card in your hand.");
  expect(option?.textContent).toContain("De-Digivolve 3");
  expect(panel.querySelector('[data-role="top"]')?.textContent).toContain("[On Deletion]");
});
