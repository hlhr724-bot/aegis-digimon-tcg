import { describe, expect, it, vi } from "vitest";
import { Decoder } from "@colyseus/schema";
import { ALL_FAMOUS_DECKS } from "@aegis/shared";
import type { GameState } from "@aegis/shared/schema/GameState";
import { runBotMatch } from "./matchHarness.js";

describe("bot match client projections", () => {
  it("records a decoder warning as a projection failure even if both players survive", async () => {
    const decode = Decoder.prototype.decode;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const injected = vi.spyOn(Decoder.prototype, "decode").mockImplementationOnce(function (
      this: Decoder<GameState>,
      ...args
    ) {
      const changes = decode.apply(this, args);
      console.warn("projection decoder regression diagnostic");
      return changes;
    });
    try {
      const result = await runBotMatch({
        seed: 20260922,
        seats: [{ profile: "balanced" }, { profile: "balanced" }],
        turnLimit: 2,
        verifyProjections: true,
      });
      expect(result.errors).toContain(
        "projection: Error: projection seat 0: decoder diagnostic: projection decoder regression diagnostic",
      );
    } finally {
      injected.mockRestore();
      warning.mockRestore();
    }
  });
  it.each([262605, 262606])(
    "keeps later draws private after recovery in a BT26 Abbadomon mirror (seed %i)",
    async (seed) => {
      const source = ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === "bt26-dgo-2026-09-05-2-abbadomon@1");
      expect(source).toBeDefined();
      const deck = { mainDeck: [...source!.decklist.mainDeck], eggDeck: [...source!.decklist.eggDeck] };
      const result = await runBotMatch({
        seed,
        seats: [
          { deck, profile: "balanced" },
          { deck, profile: "balanced" },
        ],
        verifyProjections: true,
        captureEvents: true,
      });
      expect(result.errors).toEqual([]);
      expect(result.rejections).toEqual([]);
      expect(result.timedOut).toBe(false);
      // Keep this seed honest if deck data or the heuristic policy changes: a
      // recovered card must be discarded again before a later draw is checked.
      const moves = result.events!.filter((event) => event.kind === "cardsMoved");
      expect(
        moves.some((recovery, recoveryIndex) => {
          if (recovery.from !== "trash" || recovery.to !== "hand") return false;
          const discardIndex = moves.findIndex(
            (move, index) =>
              index > recoveryIndex &&
              move.to === "trash" &&
              move.instanceIds.some((id) => recovery.instanceIds.includes(id)),
          );
          return (
            discardIndex >= 0 &&
            moves.slice(discardIndex + 1).some((move) => move.from === "deck" && move.to === "hand")
          );
        }),
      ).toBe(true);
    },
  );

  it("keeps both client views private through a seeded real match", async () => {
    const result = await runBotMatch({
      seed: 20260922,
      seats: [{ profile: "balanced" }, { profile: "balanced" }],
      turnLimit: 2,
      verifyProjections: true,
      captureEvents: true,
    });

    expect(result.projectionChecks).toBeGreaterThan(1);
    expect(result.errors).toEqual([]);
    expect(result.events?.length).toBeGreaterThan(0);
  });
});
