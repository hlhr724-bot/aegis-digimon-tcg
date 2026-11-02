import { describe, expect, it } from "vitest";
import { DECK_BOTTOM, type Seat, type ServerEvent } from "@aegis/shared";
import {
  attackAnnouncementFromEvent,
  pushSidePanel,
  sidePanelFromEvent,
  sidePanelRemaining,
  SIDE_PANEL_LIFETIME_MS,
  titleForMovement,
  type SidePanel,
  type SidePanelLookup,
} from "./sidePanels";
import { Side } from "./side";

const VIEWER: Seat = 0;

function lookup(cards: Record<string, string>, seats: Record<string, Seat>): SidePanelLookup {
  return { cardId: (id) => cards[id], seat: (id) => seats[id] };
}

function panel(overrides: Partial<SidePanel> = {}): SidePanel {
  return {
    id: "p1",
    titleKey: "panel.discardedCards",
    side: Side.Viewer,
    cards: [{ cardId: "BT1-001", badge: 1 }],
    ordered: false,
    createdAt: 0,
    ...overrides,
  };
}

describe("titleForMovement", () => {
  it("names a trash movement by where the cards came from", () => {
    expect(titleForMovement("hand", "trash")).toBe("panel.discardedCards");
    expect(titleForMovement("battleArea", "trash")).toBe("panel.deletedCards");
    expect(titleForMovement("breeding", "trash")).toBe("panel.deletedCards");
    expect(titleForMovement("various", "trash")).toBe("panel.trashedCards");
  });

  it("names the other destinations the reference client titles", () => {
    expect(titleForMovement("deck", "hand")).toBe("panel.cardsAddedToHand");
    expect(titleForMovement("hand", "deckBottom")).toBe("panel.deckBottomCard");
    expect(titleForMovement("hand", "deck")).toBe("panel.deckCards");
    expect(titleForMovement("deck", "selected")).toBe("panel.selectedCards");
    expect(titleForMovement("hand", "stackBottom")).toBe("panel.digivolutionCards");
  });

  it("uses the exact destination the server emits for a deck-bottom return", () => {
    // Pinned to the shared constant so renaming it on the server fails here, not in the UI.
    expect(titleForMovement("various", DECK_BOTTOM)).toBe("panel.deckBottomCard");
  });

  it("stays silent about movements the board already shows", () => {
    expect(titleForMovement("hand", "battleArea")).toBeNull();
    expect(titleForMovement("suspended", "unsuspended")).toBeNull();
  });
});

describe("sidePanelFromEvent", () => {
  it("opens a discard panel for cards leaving the hand for the trash", () => {
    const event: ServerEvent = { kind: "cardsMoved", instanceIds: ["a", "b"], from: "hand", to: "trash" };
    const result = sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-001", b: "BT1-002" }, { a: 0, b: 0 }), "id", 100);
    expect(result).toEqual({
      id: "id",
      titleKey: "panel.discardedCards",
      side: Side.Viewer,
      cards: [
        { cardId: "BT1-001", badge: 1 },
        { cardId: "BT1-002", badge: 2 },
      ],
      ordered: true,
      createdAt: 100,
    });
  });

  it("does not call a used Option a discard when it reaches trash", () => {
    const event: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["option"],
      from: "hand",
      to: "trash",
      optionUsed: true,
    };
    expect(sidePanelFromEvent(event, VIEWER, lookup({ option: "BT1-090" }, { option: 0 }), "id", 100)).toBeNull();
  });

  it("opens a deletion panel for cards leaving the battle area, on the owner's side", () => {
    const event: ServerEvent = { kind: "cardsMoved", instanceIds: ["a"], from: "battleArea", to: "trash" };
    const result = sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-010" }, { a: 1 }), "id", 0);
    expect(result?.titleKey).toBe("panel.deletedCards");
    expect(result?.side).toBe("opp");
  });

  it("does not duplicate a field deletion already announced by dedicated notices", () => {
    const event: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["a", "source"],
      from: "battleArea",
      to: "trash",
      deletedPermanents: [{ permanentId: "perm-a", instanceId: "a", cardId: "BT1-010", artId: "BT1-010", seat: 1 }],
    };
    expect(
      sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-010", source: "BT1-001" }, { a: 1, source: 1 }), "id", 0),
    ).toBeNull();
  });

  it.each([0, 1] as const)("does not announce the automatic digivolution draw for seat %s", (seat) => {
    const event: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["a"],
      from: "deck",
      to: "hand",
      drawReason: "digivolution",
    };
    expect(sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-010" }, { a: seat }), "id", 0)).toBeNull();
  });

  it("does not duplicate an effect draw with a hand panel", () => {
    const event: ServerEvent = { kind: "cardsMoved", instanceIds: ["a"], from: "deck", to: "hand" };
    expect(sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-010" }, { a: 0 }), "id", 0)).toBeNull();
  });

  it("ignores movements the board already shows", () => {
    const event: ServerEvent = { kind: "cardsMoved", instanceIds: ["a"], from: "hand", to: "battleArea" };
    expect(sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-010" }, { a: 0 }), "id", 0)).toBeNull();
  });

  it("skips a movement whose cards cannot be identified yet", () => {
    const event: ServerEvent = { kind: "cardsMoved", instanceIds: ["a"], from: "hand", to: "trash" };
    expect(sidePanelFromEvent(event, VIEWER, lookup({}, {}), "id", 0)).toBeNull();
  });

  it("skips a movement with no resolvable owner", () => {
    const event: ServerEvent = { kind: "cardsMoved", instanceIds: ["a"], from: "hand", to: "trash" };
    expect(sidePanelFromEvent(event, VIEWER, lookup({ a: "BT1-010" }, {}), "id", 0)).toBeNull();
  });

  it("names the cards from the event itself before the board index has caught up", () => {
    const event: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["a", "b"],
      from: "security",
      to: "trash",
      cardIds: ["BT1-010", "BT1-095"],
      seat: 1,
    };
    const result = sidePanelFromEvent(event, VIEWER, lookup({}, {}), "id", 0);
    expect(result?.titleKey).toBe("panel.trashedCards");
    expect(result?.side).toBe("opp");
    expect(result?.cards).toEqual([
      { cardId: "BT1-010", badge: 1 },
      { cardId: "BT1-095", badge: 2 },
    ]);
  });

  it("numbers a reveal from its first card, because reveal order is the point", () => {
    const theirs: ServerEvent = { kind: "cardRevealed", seat: 1, cardId: "BT1-021" };
    const result = sidePanelFromEvent(theirs, VIEWER, lookup({}, {}), "b", 0);
    expect(result?.titleKey).toBe("panel.revealedCards");
    expect(result?.side).toBe("opp");
    expect(result?.ordered).toBe(true);
  });

  it("skips a reveal by the viewer, because a reveal informs the other player", () => {
    const mine: ServerEvent = { kind: "cardRevealed", seat: 0, cardId: "BT1-021" };
    expect(sidePanelFromEvent(mine, VIEWER, lookup({}, {}), "b", 0)).toBeNull();
  });

  it("leaves a played card to the centre-screen showcase, for either seat", () => {
    const mine: ServerEvent = { kind: "cardPlayed", seat: 0, cardId: "BT1-030" };
    const theirs: ServerEvent = { kind: "cardPlayed", seat: 1, cardId: "BT1-031" };
    expect(sidePanelFromEvent(mine, VIEWER, lookup({}, {}), "a", 0, true)).toBeNull();
    expect(sidePanelFromEvent(theirs, VIEWER, lookup({}, {}), "b", 0, true)).toBeNull();
  });

  it("announces the opponent's play when the showcase cannot play it", () => {
    const theirs: ServerEvent = { kind: "cardPlayed", seat: 1, cardId: "BT1-031" };
    const result = sidePanelFromEvent(theirs, VIEWER, lookup({}, {}), "b", 0, false);
    expect(result?.titleKey).toBe("panel.playedCard");
    expect(result?.side).toBe("opp");
    expect(result?.cards).toEqual([{ cardId: "BT1-031", badge: 1 }]);
  });

  it("still leaves the viewer's own play unannounced without a showcase", () => {
    const mine: ServerEvent = { kind: "cardPlayed", seat: 0, cardId: "BT1-030" };
    expect(sidePanelFromEvent(mine, VIEWER, lookup({}, {}), "a", 0, false)).toBeNull();
  });

  it("opens no panel for a digivolution, which the centre-screen showcase holds up", () => {
    const theirs: ServerEvent = {
      kind: "digivolved",
      seat: 1,
      permanentId: "p",
      cardId: "BT1-041",
      mechanic: "normal",
    };
    expect(sidePanelFromEvent(theirs, VIEWER, lookup({}, {}), "b", 0)).toBeNull();
    expect(sidePanelFromEvent({ ...theirs, inBreeding: true }, VIEWER, lookup({}, {}), "b", 0, false)).toBeNull();
  });
});

describe("attackAnnouncementFromEvent", () => {
  const attack = (seat: Seat): ServerEvent => ({
    kind: "attackDeclared",
    seat,
    attackerPermanentId: "p1",
    attackerCardId: "BT1-040",
    target: { kind: "player" },
  });

  it("announces an attack from either seat with the attacker's card", () => {
    expect(attackAnnouncementFromEvent(attack(0), VIEWER, "a", 5)).toEqual({
      id: "a",
      cardId: "BT1-040",
      side: Side.Viewer,
      createdAt: 5,
    });
    expect(attackAnnouncementFromEvent(attack(1), VIEWER, "b", 5)?.side).toBe("opp");
  });

  it("ignores a redirect, which re-aims an attack that was already announced", () => {
    const redirect: ServerEvent = {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: "p1",
      attackerCardId: "BT1-040",
      target: { kind: "permanent", permanentId: "p9" },
      redirected: true,
    };
    expect(attackAnnouncementFromEvent(redirect, VIEWER, "a", 5)).toBeNull();
  });

  it("ignores other events", () => {
    expect(
      attackAnnouncementFromEvent({ kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 2 }, VIEWER, "a", 0),
    ).toBeNull();
  });
});

describe("pushSidePanel", () => {
  it("merges a follow-up into a fresh panel of the same title and side, renumbering the badges", () => {
    const first = panel({ id: "a", createdAt: 0 });
    const second = panel({ id: "b", createdAt: 500, cards: [{ cardId: "BT1-002", badge: 1 }] });
    const result = pushSidePanel([first], second);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b");
    expect(result[0]!.cards).toEqual([
      { cardId: "BT1-001", badge: 1 },
      { cardId: "BT1-002", badge: 2 },
    ]);
  });

  it("replaces a stale panel of the same title and side instead of merging", () => {
    const first = panel({ id: "a", createdAt: 0 });
    const second = panel({ id: "b", createdAt: 9000, cards: [{ cardId: "BT1-002", badge: 1 }] });
    expect(pushSidePanel([first], second)).toEqual([second]);
  });

  it("keeps panels of the same title but different sides apart", () => {
    const mine = panel({ id: "a", side: Side.Viewer });
    const theirs = panel({ id: "b", side: Side.Opponent });
    expect(pushSidePanel([mine], theirs)).toHaveLength(2);
  });

  it("keeps every panel of the batch: the queue presents them one at a time, so nothing is dropped", () => {
    const a = panel({ id: "a", titleKey: "panel.discardedCards", createdAt: 0 });
    const b = panel({ id: "b", titleKey: "panel.deletedCards", createdAt: 1 });
    const c = panel({ id: "c", titleKey: "panel.revealedCards", createdAt: 2 });
    const theirs = panel({ id: "d", side: Side.Opponent, titleKey: "panel.playedCard", createdAt: 3 });
    const result = pushSidePanel(pushSidePanel(pushSidePanel([a], b), c), theirs);
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("side panel lifetimes", () => {
  it("gives every panel the same reading time, however busy the board is", () => {
    const alone = panel({ id: "a", createdAt: 0 });
    expect(sidePanelRemaining(alone, 0)).toBe(SIDE_PANEL_LIFETIME_MS);
    expect(sidePanelRemaining(alone, 1000)).toBe(SIDE_PANEL_LIFETIME_MS - 1000);
  });

  it("counts a panel's clock from when it opened, not from the stack around it", () => {
    const older = panel({ id: "a", createdAt: 0 });
    const newer = panel({ id: "b", titleKey: "panel.deletedCards", createdAt: 2000 });
    expect(sidePanelRemaining(older, 2000)).toBe(SIDE_PANEL_LIFETIME_MS - 2000);
    expect(sidePanelRemaining(newer, 2000)).toBe(SIDE_PANEL_LIFETIME_MS);
  });

  it("never reports a negative remainder", () => {
    expect(sidePanelRemaining(panel({ createdAt: 0 }), SIDE_PANEL_LIFETIME_MS + 500)).toBe(0);
  });
});

describe("stripped stack tops", () => {
  const stripped = (reason: "deDigivolve" | "trashTop"): ServerEvent => ({
    kind: "cardsMoved",
    instanceIds: ["king"],
    cardIds: ["EX13-035"],
    seat: 0,
    from: "battleArea",
    to: "trash",
    strippedStackTops: { permanentId: "perm-1", reason, sourceCardId: "BT25-025" },
  });

  it("titles a De-Digivolve as De-Digivolved rather than deleted, on the owner's side", () => {
    const shown = sidePanelFromEvent(stripped("deDigivolve"), VIEWER, lookup({}, {}), "id", 0);
    expect(shown).toMatchObject({
      titleKey: "panel.deDigivolvedCards",
      side: Side.Viewer,
      cards: [{ cardId: "EX13-035", badge: 1 }],
    });
  });

  it("titles an effect trashing stack tops as a top-card trash", () => {
    const shown = sidePanelFromEvent(stripped("trashTop"), 1, lookup({}, {}), "id", 0);
    expect(shown).toMatchObject({ titleKey: "panel.strippedTopCards", side: Side.Opponent });
  });
});

describe("trashed digivolution cards", () => {
  // Discord 1555176240359415878: EX12-035 MetalGarurumon trashed the source under the bot's Cherubimon.
  const trashedSources: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["s1-19"],
    cardIds: ["BT16-024"],
    artIds: ["BT16-024"],
    seat: 1,
    from: "various",
    to: "trash",
    trashedSources: { permanentId: "perm-5", hostCardId: "EX6-035", sourceCardId: "EX12-035" },
  };

  it("titles the trashed cards as digivolution cards, on their owner's side", () => {
    expect(sidePanelFromEvent(trashedSources, VIEWER, lookup({}, {}), "id", 0)).toMatchObject({
      titleKey: "panel.trashedDigivolutionCards",
      side: Side.Opponent,
      cards: [{ cardId: "BT16-024" }],
    });
  });
});

it.each(["digivolutionCards", "linkedCards", "underTamer", "resolvingOption", "deckTop", "deckBottom"])(
  "titles trash arrivals from %s",
  (from) => {
    expect(titleForMovement(from, "trash")).toBe("panel.trashedCards");
  },
);
