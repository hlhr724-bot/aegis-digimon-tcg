import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { runEvolutionMatch } from "#api/bot/evolution/evolutionMatch";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { informationKey, searchMcts } from "#api/bot/evolution/mcts";
import { randomDeck } from "#api/bot/evolution/randomDecks";

const search = vi.hoisted(() => vi.fn<typeof searchMcts>());

vi.mock("#api/bot/evolution/mcts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#api/bot/evolution/mcts")>()),
  searchMcts: search,
}));

interface RecordedRoot {
  information: string;
  actionCount: number;
  action: number;
}

interface RecordedRollout {
  seed: number;
  learnerSeat: 0 | 1;
  decks: [number, number];
  searchSeed: number;
  target: number;
  simulationIndex: number;
  roots: RecordedRoot[];
  rolloutChoices: { information: string; action: number }[];
}

it.each([true, false])(
  "lets a late-root rollout finish beyond the outer turn limit with replay reuse %s",
  async (reusePrefixActions) => {
    const fixture: RecordedRollout = JSON.parse(
      readFileSync(new URL("./fixtures/lateTerminalRollout.json", import.meta.url), "utf8"),
    );
    let rootIndex = 0;
    let rolloutResult: { reward: number; valid: boolean } | undefined;
    search.mockImplementation(async (options: Parameters<typeof searchMcts>[0]) => {
      const index = rootIndex++;
      const root = fixture.roots[index]!;
      expect(informationKey(options.root)).toBe(root.information);
      expect(options.root.actions).toHaveLength(root.actionCount);
      if (index === fixture.target) {
        let cursor = 0;
        rolloutResult = await options.simulate((window) => {
          const choice = fixture.rolloutChoices[cursor++];
          if (choice === undefined) {
            return options.rolloutChoose(window);
          }
          assert.equal(informationKey(window), choice.information);
          return choice.action;
        }, fixture.simulationIndex);
        assert(cursor >= fixture.rolloutChoices.length);
      }
      return {
        action: root.action,
        report: { requested: 1, attempted: 1, completed: 1, invalid: 0, nodes: 1, root: [] },
      };
    });
    const game = await runEvolutionMatch({
      seed: fixture.seed,
      learnerSeat: fixture.learnerSeat,
      decks: [randomDeck(fixture.decks[0]).deck, randomDeck(fixture.decks[1]).deck],
      program: SEED_HEURISTIC,
      mcts: { simulations: 1, seed: fixture.searchSeed, reusePrefixActions },
      turnLimit: 60,
    });
    expect(rootIndex).toBe(fixture.roots.length);
    expect(game.result.reason).toBe("security");
    expect(game.result.turnCount).toBe(60);
    expect(game.result.errors).toEqual([]);
    expect(game.result.rejections).toEqual([]);
    expect(rolloutResult).toEqual({ reward: 1, valid: true });
  },
  20000,
);
