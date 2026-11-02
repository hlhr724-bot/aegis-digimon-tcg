import { describe, expect, it } from "vitest";
import type { MatchReplay } from "@aegis/shared/replays";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { buildReplayTimelineEvents } from "@/replays/buildReplayTimelineEvents";

type Frame = { turn?: number; seat?: number; security?: [number, number]; events?: ServerEvent[] };

function createReplay(frames: Frame[]): MatchReplay {
  return {
    frames: frames.map(({ turn = 1, seat = 0, security = [5, 5], events = [] }, index) => ({
      atMs: index * 1000,
      state: { turnCount: turn, turnSeat: seat, players: security.map((securityCount) => ({ securityCount })) },
      events,
    })),
  } as unknown as MatchReplay;
}

const reveal: ServerEvent = {
  kind: "securityRevealed",
  seat: 1,
  revealedCardId: "BT1-010",
  attackerPermanentId: "attacker",
};
const checked: ServerEvent = { kind: "securityChecked", seat: 1, revealedCardId: "BT1-010", resolution: "trashed" };

describe("replay timeline events", () => {
  it("marks the first frame and each turn transition at their exact action", () => {
    const replay = createReplay([{}, {}, { turn: 2, seat: 1 }, { turn: 2, seat: 1 }, { turn: 3 }]);
    expect(buildReplayTimelineEvents({ replay })).toEqual([
      { index: 0, kind: "turn", turn: 1, seat: 0, amount: 1 },
      { index: 2, kind: "turn", turn: 2, seat: 1, amount: 1 },
      { index: 4, kind: "turn", turn: 3, seat: 0, amount: 1 },
    ]);
  });

  it("starts turn markers at the first numbered turn instead of the setup frame", () => {
    const replay = createReplay([
      { turn: 0, seat: 1 },
      { turn: 1, seat: 1 },
      { turn: 2, seat: 0 },
    ]);
    expect(buildReplayTimelineEvents({ replay })).toEqual([
      { index: 1, kind: "turn", turn: 1, seat: 1, amount: 1 },
      { index: 2, kind: "turn", turn: 2, seat: 0, amount: 1 },
    ]);
  });

  it("counts checks once at the reveal and ignores their later routing and resolution", () => {
    const replay = createReplay([
      {},
      { security: [5, 4], events: [reveal] },
      {
        security: [5, 4],
        events: [
          {
            kind: "cardsMoved",
            from: "security",
            to: "trash",
            seat: 1,
            instanceIds: ["checked"],
            fromSecurityCheck: true,
          },
          checked,
        ],
      },
    ]);
    expect(buildReplayTimelineEvents({ replay }).filter((event) => event.kind === "security")).toEqual([
      { index: 1, kind: "security", turn: 1, seat: 1, amount: 1 },
    ]);
  });

  it("counts a reveal once when the security count drops in a later frame", () => {
    const replay = createReplay([
      { security: [5, 3] },
      { security: [5, 3], events: [reveal] },
      { security: [5, 2], events: [checked] },
      { security: [5, 2], events: [reveal] },
      { security: [5, 1], events: [checked] },
    ]);
    expect(buildReplayTimelineEvents({ replay }).filter((event) => event.kind === "security")).toEqual([
      { index: 1, kind: "security", turn: 1, seat: 1, amount: 1 },
      { index: 3, kind: "security", turn: 1, seat: 1, amount: 1 },
    ]);
  });

  it("records security removed by effects even when recovery hides the net change", () => {
    const replay = createReplay([
      {},
      {
        events: [
          { kind: "cardsMoved", from: "security", to: "hand", fromSeat: 1, seat: 0, instanceIds: ["first", "second"] },
          { kind: "securityRecovered", seat: 1, amount: 2 },
        ],
      },
    ]);
    expect(buildReplayTimelineEvents({ replay }).filter((event) => event.kind === "security")).toEqual([
      { index: 1, kind: "security", turn: 1, seat: 1, amount: 2 },
    ]);
  });

  it("counts a security-origin play with unlabelled routing and same-batch recovery", () => {
    const replay = createReplay([
      {},
      {
        events: [
          {
            kind: "cardPlayed",
            fromZone: "security",
            seat: 1,
            instanceId: "played-security",
            cardId: "BT1-010",
            permanentId: "played",
          },
          { kind: "cardsMoved", from: "security", to: "battleArea", instanceIds: ["played-security"] },
          { kind: "securityRecovered", seat: 1, amount: 1 },
        ],
      },
    ]);
    expect(buildReplayTimelineEvents({ replay }).filter((event) => event.kind === "security")).toEqual([
      { index: 1, kind: "security", turn: 1, seat: 1, amount: 1 },
    ]);
  });

  it("supports older snapshots and simultaneous losses for both players", () => {
    const replay = createReplay([{}, { security: [3, 4] }]);
    expect(buildReplayTimelineEvents({ replay }).filter((event) => event.kind === "security")).toEqual([
      { index: 1, kind: "security", turn: 1, seat: 0, amount: 2 },
      { index: 1, kind: "security", turn: 1, seat: 1, amount: 1 },
    ]);
  });

  it("does not mark recovery, security reordering, or the initial security setup as removal", () => {
    const replay = createReplay([
      {},
      {
        security: [6, 5],
        events: [{ kind: "cardsMoved", from: "security", to: "security", seat: 0, instanceIds: ["reordered"] }],
      },
    ]);
    expect(buildReplayTimelineEvents({ replay }).filter((event) => event.kind === "security")).toEqual([]);
  });

  it("handles empty recordings without creating markers", () => {
    expect(buildReplayTimelineEvents({ replay: createReplay([]) })).toEqual([]);
  });
});
