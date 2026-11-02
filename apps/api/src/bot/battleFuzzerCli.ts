import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { ALL_FAMOUS_DECKS, VALIDATED_FAMOUS_DECKS, isFamousDeckAvailable, type FamousDeck } from "@aegis/shared";
import { assertLegalDeck, type Decklist } from "../engine/testDecks.js";
import { runBattleFuzz, type FuzzDeck } from "./battleFuzzer.js";
import { newestDeckSources, parseDeckCorpus } from "./deckCorpus.js";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { isBotDifficulty } from "@aegis/shared/bot/isBotDifficulty";
import { isBotStyle } from "@aegis/shared/bot/isBotStyle";
import { runFixedDefaultAudit } from "#api/bot/decisionAudit/runFixedDefaultAudit";

function integerFlag(name: string, fallback: number | undefined): number | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} requires a positive integer`);
  return parsed;
}

function stringFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function listFlag<Value extends string>(
  name: string,
  allowed: readonly Value[],
  isAllowed: (value: unknown) => value is Value,
): Value[] {
  const raw = stringFlag(name);
  if (raw === undefined) return [...allowed];
  const values = raw.split(",").map((value) => value.trim());
  const invalid = values.filter((value) => !isAllowed(value));
  if (invalid.length > 0) throw new Error(`${name} has unknown values: ${invalid.join(", ")}`);
  return values.filter(isAllowed);
}

async function writeReceipt(receipt: unknown): Promise<void> {
  const output = stringFlag("--output");
  if (!output) return;
  const outputPath = invocationPath(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function invocationPath(value: string): string {
  if (isAbsolute(value)) return value;
  return resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

function fuzzDeck(source: FamousDeck): FuzzDeck {
  const deck: Decklist = { mainDeck: [...source.decklist.mainDeck], eggDeck: [...source.decklist.eggDeck] };
  assertLegalDeck(deck);
  return { id: source.deckVersion, deck };
}

async function main(): Promise<void> {
  const exhaustive = process.argv.includes("--exhaustive");
  const useAvailableCatalog = process.argv.includes("--available-catalog");
  const selectedSources = useAvailableCatalog ? ALL_FAMOUS_DECKS.filter(isFamousDeckAvailable) : VALIDATED_FAMOUS_DECKS;
  const sources = process.argv.includes("--newest") ? newestDeckSources(selectedSources) : selectedSources;
  const unique = new Map<string, FuzzDeck>();
  for (const source of sources) {
    const candidate = fuzzDeck(source);
    const fingerprint = JSON.stringify({
      m: [...candidate.deck.mainDeck].sort(),
      e: [...candidate.deck.eggDeck].sort(),
    });
    if (!unique.has(fingerprint)) unique.set(fingerprint, candidate);
  }
  const deckFile = stringFlag("--deck-file");
  if (deckFile) {
    const saved = parseDeckCorpus(JSON.parse(await readFile(invocationPath(deckFile), "utf8")) as unknown);
    for (const candidate of saved) {
      const fingerprint = JSON.stringify({
        m: [...candidate.deck.mainDeck].sort(),
        e: [...candidate.deck.eggDeck].sort(),
      });
      if (!unique.has(fingerprint)) unique.set(fingerprint, candidate);
    }
  }
  const deckLimit = integerFlag("--deck-limit", undefined);
  const decks = [...unique.values()].slice(0, deckLimit);
  const maximumMatchups = exhaustive ? undefined : integerFlag("--matchups", decks.length);
  const started = Date.now();
  const fuzzOptions = {
    decks,
    baseSeed: integerFlag("--seed", 20_260_914),
    seedsPerMatchup: integerFlag("--seeds", 1),
    orderedSeats: !process.argv.includes("--unordered"),
    maximumMatchups,
    turnLimit: integerFlag("--turn-limit", 60),
    maximumPresentationBurst: integerFlag("--maximum-burst", 40),
  };
  if (process.argv.includes("--report-fixed-defaults")) {
    const audit = await runFixedDefaultAudit({
      ...fuzzOptions,
      difficulties: listFlag(
        "--levels",
        Object.values(BotDifficulty).map((entry) => entry.value),
        isBotDifficulty,
      ),
      styles: listFlag(
        "--styles",
        Object.values(BotStyle).map((entry) => entry.value),
        isBotStyle,
      ),
    });
    const receipt = { ...audit, durationMs: Date.now() - started };
    await writeReceipt(receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (audit.fixedDefaults > 0) process.exitCode = 1;
    return;
  }
  const report = await runBattleFuzz(fuzzOptions);
  const receipt = { ...report, durationMs: Date.now() - started };
  await writeReceipt(receipt);
  console.log(JSON.stringify(receipt, null, 2));
  if (report.failures.length > 0) process.exitCode = 1;
}

await main();
