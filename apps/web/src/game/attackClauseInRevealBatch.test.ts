// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, ServerEvent } from "@aegis/shared";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import type { PresentationPacing } from "./presentationProbe";

vi.mock("../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));

const VIEWER = 0;

const BOARD = {
  players: [
    {
      battleArea: [
        {
          permanentId: "marcus",
          topCard: { instanceId: "marcus-card", cardId: "AD1-021" },
          stack: [],
          currentDP: 3000,
        },
        { permanentId: "ally", topCard: { instanceId: "ally-card", cardId: "BT21-044" }, stack: [], currentDP: 7000 },
      ],
      trash: [],
      hand: [],
      handCount: 5,
    },
    { battleArea: [], trash: [], hand: [], handCount: 5 },
  ],
} as unknown as GameState;

const ALLIANCE: Extract<ServerEvent, { kind: "effectTriggered" }> = {
  kind: "effectTriggered",
  seat: 0,
  sourceCardId: "AD1-021",
  sourceInstanceId: "marcus-card",
  sourcePermanentId: "marcus",
  effectKey: "marcus-card/alliance/0",
  description:
    "＜Alliance＞: By suspending 1 of your other Digimon, this Digimon gets that Digimon's DP and ＜Security A. +1＞.",
  timing: "OnUseAttack",
};

const REVEAL: ServerEvent = {
  kind: "securityRevealed",
  seat: 1,
  revealedCardId: "BT1-027",
  attackerPermanentId: "marcus",
  securityCardDP: 4000,
  attackerDP: 10000,
  securityCountBefore: 4,
  hasSecurityEffect: false,
  isDigimon: true,
};

const ATTACK_THEN_CHECK: readonly (readonly ServerEvent[])[] = [
  [
    {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: "marcus",
      attackerCardId: "AD1-021",
      target: { kind: "player" },
    },
  ],
  [ALLIANCE, { ...ALLIANCE, kind: "effectResolved" } as ServerEvent, REVEAL],
  [
    {
      kind: "securityChecked",
      seat: 1,
      revealedCardId: "BT1-027",
      resolution: "battle",
      battle: { securityDigimonDeleted: true, attackerDeleted: false, attackerDP: 10000, securityCardDP: 4000 },
    },
  ],
  [{ kind: "attackEnded", seat: 0, attackerPermanentId: "marcus" }],
];

function geometry(): MatchCueAnchors {
  const board = document.createElement("div");
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  return {
    board: { current: board },
    permanentCenter: () => ({ x: 120, y: 80 }),
    yourDeck: { current: null },
    oppDeck: { current: null },
    yourHandDock: { current: null },
    oppHandStrip: { current: null },
    yourSecurity: { current: null },
    oppSecurity: { current: null },
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe.each<PresentationPacing>(["current", "sequential"])(
  "an attack clause the server closes in the batch that reveals security (%s pacing)",
  (presentationPacing) => {
    it("reads the clause before the shield breaks", async () => {
      const anchors = geometry();
      const view = renderHook(
        ({ fed }: { fed: readonly ServerBatch[] }) =>
          useMatchCues({
            batches: fed,
            state: BOARD,
            viewerSeat: VIEWER,
            mulliganOpen: false,
            anchors,
            onActionRejected: vi.fn<(reason: string) => void>(),
            presentationPacing,
          }),
        { initialProps: { fed: [] as readonly ServerBatch[] } },
      );
      await advance(0);
      view.rerender({ fed: ATTACK_THEN_CHECK.map((events, index) => singleServerBatch(events, index + 1)) });

      let clauseAt: number | undefined;
      let breakAt: number | undefined;
      for (let elapsed = 0; elapsed <= 20_000; elapsed += 16) {
        const clause = view.result.current.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.cardId === "AD1-021",
        );
        if (clause) clauseAt ??= elapsed;
        if (view.result.current.securityBreak !== null) breakAt ??= elapsed;
        await advance(16);
      }

      expect(clauseAt).toBeDefined();
      expect(breakAt).toBeDefined();
      expect(clauseAt!).toBeLessThan(breakAt!);
    });
  },
);
