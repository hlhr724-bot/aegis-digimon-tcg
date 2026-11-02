import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import {
  burstPalette,
  deletionAnchorIdsFromEvent,
  hasTurnStartDraw,
  permanentBurstFromEvent,
  zoneShowcaseFromEvent,
} from "./showcases";

const VIEWER = 0;
const OPPONENT = 1;

const PLAYED: ServerEvent = { kind: "cardPlayed", seat: OPPONENT, cardId: "BT1-010", permanentId: "perm-1" };
const DIGIVOLVED: ServerEvent = {
  kind: "digivolved",
  seat: OPPONENT,
  permanentId: "perm-1",
  cardId: "BT1-011",
  mechanic: "normal",
};

describe("centre-screen showcase", () => {
  it("announces the opponent's play", () => {
    expect(zoneShowcaseFromEvent(PLAYED, VIEWER, 1)).toMatchObject({ key: 1, cardId: "BT1-010", kind: "play" });
  });

  it("reveals the viewer's accepted play", () => {
    expect(zoneShowcaseFromEvent({ ...PLAYED, seat: VIEWER }, VIEWER, 1)).toMatchObject({ mine: true, kind: "play" });
  });

  it("holds up the opponent's battle-area digivolution, which changes a stack in place", () => {
    expect(zoneShowcaseFromEvent(DIGIVOLVED, VIEWER, 1)).toMatchObject({
      key: 1,
      cardId: "BT1-011",
      seat: OPPONENT,
      kind: "digivolve",
    });
  });

  it("holds up the opponent's breeding digivolution, which happens off where the viewer looks", () => {
    expect(zoneShowcaseFromEvent({ ...DIGIVOLVED, inBreeding: true }, VIEWER, 1)).toMatchObject({
      key: 1,
      cardId: "BT1-011",
      seat: OPPONENT,
      kind: "digivolve",
    });
  });

  it("reveals the viewer's own breeding digivolution", () => {
    expect(zoneShowcaseFromEvent({ ...DIGIVOLVED, seat: VIEWER, inBreeding: true }, VIEWER, 1)).toMatchObject({
      mine: true,
      kind: "digivolve",
    });
  });

  it("announces nothing for an event that changes no zone", () => {
    expect(zoneShowcaseFromEvent({ kind: "memoryChanged", from: 3, to: -1, reason: "cost" }, VIEWER, 1)).toBeNull();
  });
});

describe("field burst", () => {
  it("bursts in the card's own colour where a permanent lands", () => {
    expect(permanentBurstFromEvent(PLAYED, 1)).toMatchObject({
      permanentId: "perm-1",
      variant: "play",
      inBreeding: false,
    });
  });

  it("burns over an evolution and opens in the breeding slot for a hatch", () => {
    expect(permanentBurstFromEvent(DIGIVOLVED, 1)).toMatchObject({ variant: "evolve", inBreeding: false });
    expect(permanentBurstFromEvent({ ...DIGIVOLVED, inBreeding: true }, 1)).toMatchObject({
      variant: "evolve",
      inBreeding: true,
    });
    expect(
      permanentBurstFromEvent({ kind: "hatched", seat: VIEWER, permanentId: "perm-egg", cardId: "ST1-01" }, 1),
    ).toMatchObject({ variant: "hatch", inBreeding: true });
  });

  it("moves a raised stack without treating it as a newly played card", () => {
    expect(
      permanentBurstFromEvent({ kind: "movedFromBreeding", seat: VIEWER, permanentId: "perm-2", cardId: "ST1-03" }, 1),
    ).toMatchObject({ permanentId: "perm-2", moveFromBreeding: true, inBreeding: false });
  });

  it("bursts for both seats, because the field is shared", () => {
    expect(permanentBurstFromEvent({ ...PLAYED, seat: VIEWER }, 1)).not.toBeNull();
  });

  it("keeps the acting seat so an opponent raising burst stays on the opponent side", () => {
    expect(permanentBurstFromEvent({ ...DIGIVOLVED, seat: OPPONENT, inBreeding: true }, 1)).toMatchObject({
      seat: OPPONENT,
      inBreeding: true,
    });
    expect(
      permanentBurstFromEvent({ kind: "hatched", seat: OPPONENT, permanentId: "perm-egg", cardId: "ST1-01" }, 1),
    ).toMatchObject({ seat: OPPONENT, variant: "hatch" });
  });

  it("leaves an Option alone: it never becomes a permanent", () => {
    expect(permanentBurstFromEvent({ kind: "cardPlayed", seat: OPPONENT, cardId: "BT1-090" }, 1)).toBeNull();
  });
});

describe("burst palette", () => {
  it("takes the card's own colour for an arrival", () => {
    expect(burstPalette("play", "Green")).toEqual({ base: "#67f794", edge: "#67f794" });
  });

  it("gives evolution a white centre and the card's primary colour", () => {
    expect(burstPalette("evolve", "Green")).toEqual({ base: "#ffffff", edge: "#67f794" });
    expect(burstPalette("evolve", "Blue")).toEqual({ base: "#ffffff", edge: "#5db9ff" });
    expect(burstPalette("evolve", "Purple")).toEqual({ base: "#ffffff", edge: "#f555dc" });
  });

  it("keeps the fixed vocabulary for hatch and draw", () => {
    expect(burstPalette("hatch", "Red")).toEqual(burstPalette("hatch", "Black"));
    expect(burstPalette("draw")).toEqual(burstPalette("draw", "Yellow"));
  });
});

describe("turn-start draw", () => {
  const DRAW_PHASE: ServerEvent = { kind: "phaseChanged", phase: "Draw", turnSeat: VIEWER, turnCount: 3 };

  it("recognises the draw the turn opens with", () => {
    expect(hasTurnStartDraw([DRAW_PHASE], VIEWER)).toBe(true);
  });

  it("leaves an effect draw to its notice", () => {
    const effect: ServerEvent = {
      kind: "effectResolved",
      seat: VIEWER,
      sourceCardId: "BT1-010",
      effectKey: "k",
      description: "Draw 1.",
    };
    expect(hasTurnStartDraw([effect], VIEWER)).toBe(false);
  });

  it("keeps the cue on the drawing seat", () => {
    expect(hasTurnStartDraw([DRAW_PHASE], OPPONENT)).toBe(false);
    expect(hasTurnStartDraw([{ ...DRAW_PHASE, turnSeat: OPPONENT }], OPPONENT)).toBe(true);
  });

  it("ignores any other phase", () => {
    expect(hasTurnStartDraw([{ kind: "phaseChanged", phase: "Main", turnSeat: VIEWER, turnCount: 3 }], VIEWER)).toBe(
      false,
    );
  });
});

describe("deletions", () => {
  it("names the permanents a combat resolution deleted", () => {
    const combat: ServerEvent = {
      kind: "combatResolved",
      seat: OPPONENT,
      attackerPermanentId: "perm-1",
      deletedPermanentIds: ["perm-2", "perm-3"],
    };
    expect(deletionAnchorIdsFromEvent(combat)).toEqual(["perm-2", "perm-3"]);
  });

  it("names the card instances an effect trashed off the field", () => {
    const moved: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["inst-1"],
      from: "battleArea",
      to: "trash",
      deletedPermanents: [{ permanentId: "perm-1", instanceId: "inst-1", cardId: "BT1-010", seat: 1 }],
    };
    expect(deletionAnchorIdsFromEvent(moved)).toEqual(["perm-1"]);
  });

  it("leaves every other movement and event alone", () => {
    expect(deletionAnchorIdsFromEvent({ kind: "blocked", blockerPermanentId: "perm-4" })).toEqual([]);
    expect(
      deletionAnchorIdsFromEvent({ kind: "cardsMoved", instanceIds: ["inst-2"], from: "hand", to: "trash" }),
    ).toEqual([]);
    expect(
      deletionAnchorIdsFromEvent({ kind: "cardsMoved", instanceIds: ["inst-3"], from: "battleArea", to: "hand" }),
    ).toEqual([]);
  });

  it("burns a deletion orange out of a green ring and a shattering pane blue", () => {
    expect(burstPalette("delete")).toEqual({ base: "#ff9f43", edge: "#3ddc84" });
    expect(burstPalette("shatter")).toEqual({ base: "#e4f1ff", edge: "#3b82f6" });
  });
});
