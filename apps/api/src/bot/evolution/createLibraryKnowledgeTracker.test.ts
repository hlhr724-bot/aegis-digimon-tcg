import { describe, expect, it } from "vitest";
import type { GameState, SequencedServerEvent } from "@aegis/shared";
import { DECK_BOTTOM, type DecisionRequest } from "@aegis/shared/protocol/events";
import { Zone } from "@aegis/shared/schema/enums";
import { createLibraryKnowledgeTracker } from "#api/bot/evolution/createLibraryKnowledgeTracker";

function library(...cards: { instanceId: string; faceUp?: boolean }[]): GameState {
  return {
    players: [{ deck: cards.map((card) => ({ faceUp: false, ...card })) }, { deck: [] }],
  } as unknown as GameState;
}

function sequenced(events: object[]): SequencedServerEvent[] {
  return events as SequencedServerEvent[];
}

function decision(instanceId: string): DecisionRequest {
  return { seat: 0, options: { visibleCards: [{ instanceId, cardId: "BT1-010" }] } } as unknown as DecisionRequest;
}

describe("library knowledge at bot roots", () => {
  it("ignores security reveals and hand or security movements, which stay as recorded", () => {
    const tracker = createLibraryKnowledgeTracker();
    const state = library({ instanceId: "top" });
    tracker.observeBatch(
      state,
      sequenced([
        { kind: "securityRevealed", seat: 0, revealedCardId: "BT1-010" },
        { kind: "cardsMoved", instanceIds: ["a"], from: Zone.Security, to: Zone.Hand },
        { kind: "cardsMoved", instanceIds: ["b"], from: Zone.Hand, to: Zone.Security },
      ]),
    );
    expect(tracker.getKnowledge(state)).toBeUndefined();
  });

  it("refuses a card placed on top of the library until that library is shuffled", () => {
    const tracker = createLibraryKnowledgeTracker();
    const state = library({ instanceId: "placed" }, { instanceId: "unknown" });
    tracker.observeBatch(
      state,
      sequenced([{ kind: "cardsMoved", instanceIds: ["placed"], from: Zone.Trash, to: Zone.Deck }]),
    );
    expect(tracker.getKnowledge(state)).toBe("seat 0 library top card");
    tracker.observeBatch(state, sequenced([{ kind: "deckShuffled", seat: 0, deck: "deck" }]));
    expect(tracker.getKnowledge(state)).toBeUndefined();
  });

  it("allows cards placed under the library", () => {
    const tracker = createLibraryKnowledgeTracker();
    const state = library({ instanceId: "unknown" }, { instanceId: "placed" });
    tracker.observeBatch(
      state,
      sequenced([{ kind: "cardsMoved", instanceIds: ["placed"], from: Zone.Trash, to: DECK_BOTTOM }]),
    );
    expect(tracker.getKnowledge(state)).toBeUndefined();
  });

  it("refuses a revealed card that stays on top of the library", () => {
    const tracker = createLibraryKnowledgeTracker();
    const revealed = library({ instanceId: "top", faceUp: true });
    tracker.observeBatch(revealed, sequenced([{ kind: "cardRevealed", seat: 0, cardId: "BT1-010" }]));
    expect(tracker.getKnowledge(library({ instanceId: "top" }))).toBe("seat 0 library top card");
  });

  it("allows revealed cards that went under the library", () => {
    const tracker = createLibraryKnowledgeTracker();
    tracker.observeBatch(
      library({ instanceId: "next" }, { instanceId: "seen", faceUp: true }),
      sequenced([{ kind: "cardRevealed", seat: 0, cardId: "BT1-010" }]),
    );
    expect(tracker.getKnowledge(library({ instanceId: "next" }, { instanceId: "seen" }))).toBeUndefined();
  });

  it("refuses a privately seen library top card but allows seen hand cards", () => {
    const tracker = createLibraryKnowledgeTracker();
    const state = library({ instanceId: "top" });
    tracker.observeDecision(decision("hand"));
    expect(tracker.getKnowledge(state)).toBeUndefined();
    tracker.observeDecision(decision("top"));
    expect(tracker.getKnowledge(state)).toBe("seat 0 library top card");
  });

  it("resets when a new match starts", () => {
    const tracker = createLibraryKnowledgeTracker();
    const state = library({ instanceId: "placed" });
    tracker.observeBatch(
      state,
      sequenced([{ kind: "cardsMoved", instanceIds: ["placed"], from: Zone.Hand, to: Zone.Deck }]),
    );
    tracker.observeBatch(state, sequenced([{ kind: "matchStarted" }]));
    expect(tracker.getKnowledge(state)).toBeUndefined();
  });
});
