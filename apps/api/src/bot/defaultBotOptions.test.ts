import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Seat } from "@aegis/shared/schema/enums";
import { ALL_FAMOUS_DECKS } from "@aegis/shared/decks/index";
import type { GameEngine } from "#api/engine/GameEngine";
import { setupEngine } from "#api/engine/testkit/harness";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { defaultBotOptions } from "#api/bot/defaultBotOptions";
import { createEvaluationPolicy } from "#api/bot/policy";
import { createProjectedEvaluationPolicy } from "#api/bot/projectedPolicy";
import { mainActionReady } from "#api/bot/training/actions";
import { parseHeuristic } from "#api/bot/evolution/heuristic";
import { randomDeck } from "#api/bot/evolution/randomDecks";
import { runResidualMatch } from "#api/bot/evolution/residualMatch";
import { runBotMatch } from "#api/bot/matchHarness";
import pilotCatalog from "#api/bot/evolution/programs/certified-pilots.json" with { type: "json" };
import genericCatalog from "#api/bot/evolution/programs/certified-balanced.json" with { type: "json" };

describe("certified default bot options", () => {
  it.each([0, 1] as const)(
    "replays the validated Chronomon pilot through default options in seat %i",
    async (learnerSeat) => {
      const version = "bt26-dgo-2026-08-28-7-chronomon@1";
      const learnerPreset = ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === version)!.decklist;
      const opponentPreset = ALL_FAMOUS_DECKS.find((deck) => deck.deckId === "bt6-red-jesmon")!.decklist;
      const learner = { mainDeck: [...learnerPreset.mainDeck], eggDeck: [...learnerPreset.eggDeck] };
      const opponent = { mainDeck: [...opponentPreset.mainDeck], eggDeck: [...opponentPreset.eggDeck] };
      const decks = learnerSeat === 0 ? ([learner, opponent] as const) : ([opponent, learner] as const);
      const seed = 1_300_000_019;
      const direct = await runResidualMatch({
        seed,
        learnerSeat,
        decks,
        program: parseHeuristic(pilotCatalog.pilots[version]),
        opponent: "heuristic",
        opponentProgram: parseHeuristic(genericCatalog.generic),
      });
      const seats = decks.map((deck) => ({
        deck,
        canChooseMainAction: mainActionReady,
        policyFactory(engine: GameEngine, seat: Seat) {
          const options = defaultBotOptions({ engine, seat, deck });
          expect(options.policy?.name).toBe(
            seat === learnerSeat
              ? "validated-pilot:Deterministic residual: sourceDp=0.25"
              : "certified:Deterministic residual: sourceDp=0.2",
          );
          return options.policy!;
        },
      }));
      const live = await runBotMatch({
        seed,
        seats: [seats[0]!, seats[1]!],
        captureEvents: true,
        verifyProjections: true,
      });
      expect(direct.valid).toBe(true);
      expect(live.timedOut).toBe(false);
      expect(live.errors).toEqual([]);
      expect(live.rejections).toEqual([]);
      expect(live.events).toEqual(direct.result.events);
      expect(live.projectionChecks).toBe(direct.result.projectionChecks);
      expect(live.seats.map((seat) => seat.inferenceFallbacks)).toEqual([
        { timeout: 0, error: 0 },
        { timeout: 0, error: 0 },
      ]);
    },
  );

  it("preserves explicit policies, profiles, seeds, pacing and action limits", () => {
    const setup = setupEngine({});
    const explicit = { policy: createEvaluationPolicy({ seed: 17 }), minThinkMs: 8 };
    expect(defaultBotOptions({ engine: setup.engine, seat: 0, options: explicit })).toBe(explicit);
    const defaults = defaultBotOptions({ engine: setup.engine, seat: 0 });
    expect(defaults.policy?.name).toBe("certified:Deterministic residual: sourceDp=0.2");
    expect(defaults.seed).toBe(setup.engine.hooks.seed);
    expect(defaults.canChooseMainAction?.()).toBe(true);
    setup.engine.mainEntryPending = true;
    expect(defaults.canChooseMainAction?.()).toBe(false);
    const customProfile = { ...DEFAULT_BOT_PROFILE, weights: { ...DEFAULT_BOT_PROFILE.weights, tamer: 99 } };
    const custom = defaultBotOptions({ engine: setup.engine, seat: 0, options: { profile: customProfile } });
    expect(custom.policy?.name).toBe("projected:balanced");
    expect(custom.profile).toBe(customProfile);
    const readiness = () => true;
    const options = defaultBotOptions({
      engine: setup.engine,
      seat: 1,
      options: {
        profile: "defensive",
        seed: 17,
        minThinkMs: 9,
        maxMainPhaseActions: 23,
        canChooseMainAction: readiness,
      },
    });
    expect(options.policy?.name).toBe("projected:defensive");
    expect(options.seed).toBe(17);
    expect(options.minThinkMs).toBe(9);
    expect(options.maxMainPhaseActions).toBe(23);
    expect(options.canChooseMainAction).toBe(readiness);
    expect(defaultBotOptions({ engine: setup.engine, seat: 1 }).seed).toBe(setup.engine.hooks.seed + 7919);
  });

  it.each([0, 1] as const)("reproduces the certified evaluation policy in seat %i", async (learnerSeat) => {
    const seed = 31_000_019;
    const decks = [randomDeck(1).deck, randomDeck(2).deck] as const;
    const catalog = JSON.parse(
      await readFile(new URL("./evolution/programs/certified-balanced.json", import.meta.url), "utf8"),
    );
    const program = parseHeuristic(catalog.generic);
    const direct = await runResidualMatch({ seed, learnerSeat, decks, program });
    const seats = decks.map((deck, index) => ({
      deck,
      canChooseMainAction: mainActionReady,
      policyFactory(engine: GameEngine, seat: Seat) {
        return index === learnerSeat
          ? defaultBotOptions({ engine, seat }).policy!
          : createProjectedEvaluationPolicy({ engine, seat, seed: seed + seat * 7919 });
      },
    }));
    const live = await runBotMatch({
      seed,
      seats: [seats[0]!, seats[1]!],
      captureEvents: true,
      verifyProjections: true,
    });
    expect(direct.valid).toBe(true);
    expect(live.timedOut).toBe(false);
    expect(live.errors).toEqual([]);
    expect(live.rejections).toEqual([]);
    expect(live.events).toEqual(direct.result.events);
    expect(live.projectionChecks).toBe(direct.result.projectionChecks);
    expect(live.seats.map((seat) => seat.inferenceFallbacks)).toEqual([
      { timeout: 0, error: 0 },
      { timeout: 0, error: 0 },
    ]);
  });
});
