import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { runBattleFuzz, type BattleFuzzOptions } from "#api/bot/battleFuzzer";
import { createAuditedLevelPolicy } from "#api/bot/decisionAudit/createAuditedLevelPolicy";
import { createFixedDefaultTally } from "#api/bot/decisionAudit/createFixedDefaultTally";
import type { FixedDefaultTally } from "#api/bot/decisionAudit/FixedDefaultTally";

type Params = Omit<BattleFuzzOptions, "createSeatPolicy" | "runMatch"> & {
  difficulties: readonly BotDifficulty[];
  styles: readonly BotStyle[];
  maximumExamples?: number;
};

export type FixedDefaultAuditEntry = FixedDefaultTally & { matchCount: number; failureCount: number };

export type FixedDefaultAudit = {
  fixedDefaults: number;
  nontrivialDecisions: number;
  matchCount: number;
  combinations: Record<string, FixedDefaultAuditEntry>;
};

export async function runFixedDefaultAudit({
  difficulties,
  styles,
  maximumExamples,
  ...fuzzOptions
}: Params): Promise<FixedDefaultAudit> {
  const audit: FixedDefaultAudit = { fixedDefaults: 0, nontrivialDecisions: 0, matchCount: 0, combinations: {} };
  for (const difficulty of difficulties) {
    for (const style of styles) {
      const tally = createFixedDefaultTally({ maximumExamples });
      const report = await runBattleFuzz({
        ...fuzzOptions,
        createSeatPolicy: ({ engine, seat, deck, seed }) =>
          createAuditedLevelPolicy({ difficulty, style, engine, seat, deck, seed, onDecisionAnswer: tally.observe }),
      });
      const entry = { ...tally.report(), matchCount: report.matchCount, failureCount: report.failures.length };
      audit.combinations[`${difficulty}:${style}`] = entry;
      audit.fixedDefaults += entry.fixedDefaults;
      audit.nontrivialDecisions += entry.nontrivialDecisions;
      audit.matchCount += entry.matchCount;
    }
  }
  return audit;
}
