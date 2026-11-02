import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Seat } from "@aegis/shared";
import type { GameEngine } from "../engine/GameEngine.js";
import type { Decklist } from "../engine/setup.js";
import type { BotOptions } from "./BotPlayer.js";
import { mainActionReady } from "./training/actions.js";
import { trainingDeck, TRAINING_DECK_VERSIONS } from "./training/decks.js";
import { InferenceClient } from "./training/inferenceClient.js";
import { trainingMetadata } from "./training/metadata.js";
import { createAsyncTrainingPolicy } from "./training/policy.js";
import { startEvolvedBots, stopEvolvedBots } from "./evolution/livePolicy.js";
import { startBotExperiment, stopBotExperiment } from "#api/bot/experiment/activeBotExperiment";

let client: InferenceClient | undefined;
let startup: Promise<void> | undefined;

/** Called once before admitting rooms. An explicitly configured incompatible model fails startup. */
export async function startBotInference(environment: NodeJS.ProcessEnv): Promise<void> {
  await Promise.all([startBotPolicy(environment), startBotExperiment(environment)]);
}

async function startBotPolicy(environment: NodeJS.ProcessEnv): Promise<void> {
  if (environment.AEGIS_BOT_HEURISTIC) {
    if (client !== undefined || startup !== undefined) throw new Error("Bot inference is already started");
    startup = startEvolvedBots(environment);
    try {
      await startup;
    } finally {
      startup = undefined;
    }
    return;
  }
  const checkpoint = environment.AEGIS_BOT_CHECKPOINT;
  if (!checkpoint) return;
  if (client !== undefined || startup !== undefined) throw new Error("Bot inference is already started");
  startup = InferenceClient.start({
    command: environment.AEGIS_BOT_PYTHON ?? "python3",
    args: [
      fileURLToPath(new URL("../../../../tools/bot-training/inference.py", import.meta.url)),
      "--checkpoint",
      resolve(checkpoint),
      "--device",
      "cpu",
    ],
    metadata: trainingMetadata(),
    requestTimeoutMs: 2_000,
  }).then((loaded) => {
    client = loaded;
  });
  try {
    await startup;
  } finally {
    startup = undefined;
  }
}

export async function stopBotInference(): Promise<void> {
  // Shutdown may arrive while Python is still loading its checkpoint.
  await startup?.catch(() => undefined);
  stopEvolvedBots();
  await stopBotExperiment();
  const active = client;
  client = undefined;
  await active?.close();
}

function deckKey(deck: Pick<Decklist, "mainDeck" | "eggDeck">): string {
  return JSON.stringify([[...deck.mainDeck].sort(), [...deck.eggDeck].sort()]);
}

/** Deck membership is checked before dealing; only player-visible observations reach the scorer. */
export function trainedBotOptions(input: {
  engine: GameEngine;
  seat: Seat;
  decks: readonly [Decklist, Decklist];
}): BotOptions | undefined {
  const active = client;
  if (active === undefined) return undefined;
  const supported = new Set(TRAINING_DECK_VERSIONS.map((version) => deckKey(trainingDeck(version).deck)));
  if (!input.decks.every((deck) => supported.has(deckKey(deck)))) return undefined;
  let rejected = false;
  const disable = () => {
    rejected = true;
  };
  const policy = createAsyncTrainingPolicy(input.engine, input.seat, (window, signal) => {
    if (rejected) return Promise.reject(new Error("Model action rejected; using fallback for the rest of this match"));
    return active.choose(window, signal);
  });
  return {
    policy: {
      ...policy,
      // Training fails loudly on a rejection. A live room must recover without killing the server.
      noteRejected: disable,
      onEngineRejection: disable,
    },
    canChooseMainAction: () => mainActionReady(input.engine),
    policyTimeoutMs: 1_000,
  };
}
