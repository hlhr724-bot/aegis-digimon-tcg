import { describe, expect, it } from "vitest";
import { resolveArenaBurstAnchor } from "@/game/arena3d/resolveArenaBurstAnchor";
import type { PermanentBurst } from "@/game/showcases";
import { Side } from "@/game/side";

const VIEWER_SEAT = 0;
const OPPONENT_SEAT = 1;

const viewerRaising = { id: "viewer-raising" } as unknown as HTMLElement;
const opponentRaising = { id: "opponent-raising" } as unknown as HTMLElement;
const battleCard = { id: "battle-card" } as unknown as HTMLElement;

const board = {
  querySelector: (selector: string) => {
    if (selector.includes(`game-utility-slot--${Side.Viewer}-raising`)) {
      return viewerRaising;
    }
    if (selector.includes(`game-utility-slot--${Side.Opponent}-raising`)) {
      return opponentRaising;
    }
    return null;
  },
} as unknown as HTMLElement;

function buildBurst(overrides: Partial<PermanentBurst>): PermanentBurst {
  return {
    key: 1,
    permanentId: "raised",
    seat: OPPONENT_SEAT,
    variant: "evolve",
    color: "Red",
    inBreeding: true,
    ...overrides,
  };
}

describe("resolveArenaBurstAnchor", () => {
  it("anchors an opponent raising digivolve on the opponent raising slot", () => {
    expect(
      resolveArenaBurstAnchor({ board, burst: buildBurst({}), viewerSeat: VIEWER_SEAT, element: undefined }),
    ).toEqual({ side: Side.Opponent, anchor: opponentRaising });
  });

  it("anchors an opponent hatch on the opponent raising slot", () => {
    expect(
      resolveArenaBurstAnchor({
        board,
        burst: buildBurst({ variant: "hatch" }),
        viewerSeat: VIEWER_SEAT,
        element: undefined,
      }),
    ).toEqual({ side: Side.Opponent, anchor: opponentRaising });
  });

  it("anchors a viewer raising digivolve on the viewer raising slot", () => {
    expect(
      resolveArenaBurstAnchor({
        board,
        burst: buildBurst({ seat: VIEWER_SEAT }),
        viewerSeat: VIEWER_SEAT,
        element: undefined,
      }),
    ).toEqual({ side: Side.Viewer, anchor: viewerRaising });
  });

  it("keeps the opponent side when the viewer sits in the second seat", () => {
    expect(
      resolveArenaBurstAnchor({
        board,
        burst: buildBurst({ seat: VIEWER_SEAT }),
        viewerSeat: OPPONENT_SEAT,
        element: undefined,
      }),
    ).toEqual({ side: Side.Opponent, anchor: opponentRaising });
  });

  it("anchors a battle area burst on its own card", () => {
    expect(
      resolveArenaBurstAnchor({
        board,
        burst: buildBurst({ inBreeding: false }),
        viewerSeat: VIEWER_SEAT,
        element: battleCard,
      }),
    ).toEqual({ side: Side.Opponent, anchor: battleCard });
  });

  it("leaves a battle area burst without a card unanchored instead of borrowing a raising slot", () => {
    expect(
      resolveArenaBurstAnchor({
        board,
        burst: buildBurst({ inBreeding: false }),
        viewerSeat: VIEWER_SEAT,
        element: undefined,
      }),
    ).toEqual({ side: Side.Opponent, anchor: null });
  });
});
