import type { Decklist } from "#api/engine/setup";
import { parseHeuristic, type HeuristicProgram, type HeuristicRule } from "#api/bot/evolution/heuristic";

export function generateComboPilotPrograms(input: {
  version: string;
  deck: Decklist;
  name: string;
  generic: HeuristicProgram;
}) {
  if (input.generic.basePolicy !== "projected-balanced" || input.generic.rules.length !== 18)
    throw new Error("Combo pilots require the certified 18-rule residual base");
  const proposals: { strategy: string; rule: HeuristicRule }[] = [];
  if (input.version === "ex4-dgo-2022-06-25-1-ulforceveedramon@1") {
    const tamers = ["BT11-112", "BT2-086", "BT3-093", "P-012", "BT9-085"];
    proposals.push(
      {
        strategy: "ulforce-suspended-tamer",
        rule: {
          feature: "playTamer",
          weight: 4,
          advice:
            "Establish a blue Tamer beside a suspended UlforceVeedramon without handing over memory; the legal on-play chain may unsuspend it.",
          when: {
            kind: "main",
            sourceCardIds: tamers,
            ownBoard: { cardIds: ["BT11-032"], suspended: true, minimum: 1 },
            maximum: { handover: 0 },
          },
        },
      },
      {
        strategy: "ulforce-tamer-in-hand",
        rule: {
          feature: "digivolve",
          weight: 4,
          advice:
            "Develop UlforceVeedramon with a blue Tamer in hand and no memory handover, preparing its free-Tamer and unsuspend chain.",
          when: {
            kind: "main",
            sourceCardIds: ["BT11-032"],
            ownHand: { cardIds: tamers, minimum: 1 },
            maximum: { handover: 0 },
          },
        },
      },
    );
  } else if (input.version === "ex6-dgo-2024-07-06-1-miragegaogamon@2") {
    proposals.push(
      {
        strategy: "mirage-thomas-pressure",
        rule: {
          feature: "attackPlayer",
          weight: 4,
          advice:
            "Pressure security with MirageGaogamon Burst Mode beside ready Thomas when the opponent already has nine cards, without depending on simultaneous trigger order.",
          when: {
            kind: "main",
            sourceCardIds: ["BT13-033"],
            ownBoard: { cardIds: ["BT13-097"], suspended: false, minimum: 1 },
            minimum: { opponentHandCount: 9 },
          },
        },
      },
      {
        strategy: "thomas-ready-suspended-gao",
        rule: {
          feature: "activate",
          weight: 4,
          advice:
            "Activate Thomas's legal Main effect at eight opposing hand cards when an own Gao Digimon is suspended; the engine checks remaining effect availability.",
          when: {
            kind: "main",
            sourceCardIds: ["BT4-093"],
            ownBoard: {
              cardIds: [
                "BT11-020",
                "EX4-015",
                "BT16-020",
                "EX4-017",
                "BT13-029",
                "EX4-019",
                "BT11-033",
                "BT13-031",
                "BT13-033",
              ],
              suspended: true,
              minimum: 1,
            },
            minimum: { opponentHandCount: 8 },
          },
        },
      },
    );
  } else if (input.version === "bt25-dgo-2026-06-06-4-shinegreymon@1") {
    proposals.push(
      {
        strategy: "marcus-rize-shine-in-hand",
        rule: {
          feature: "attackPlayer",
          weight: 4,
          advice:
            "Attack with BT12 Marcus when an own ready RizeGreymon and AD1 ShineGreymon in hand support his free evolution effect; live restrictions remain authoritative.",
          when: {
            kind: "main",
            sourceCardIds: ["BT12-092"],
            ownBoard: { cardIds: ["BT17-037", "BT21-044"], suspended: false, minimum: 1 },
            ownHand: { cardIds: ["AD1-016"], minimum: 1 },
          },
        },
      },
      {
        strategy: "rize-ready-marcus-development",
        rule: {
          feature: "digivolve",
          weight: 4,
          advice:
            "Develop BT21 RizeGreymon beside ready Marcus with at most one memory handover, preparing its Rush and Alliance effect attack.",
          when: {
            kind: "main",
            sourceCardIds: ["BT21-044"],
            ownBoard: { cardIds: ["BT12-092", "AD1-021"], suspended: false, minimum: 1 },
            maximum: { handover: 1 },
          },
        },
      },
    );
  } else throw new Error(`Unsupported combo pilot version ${input.version}`);
  for (const { rule } of proposals) {
    const ids = [
      ...(rule.when?.sourceCardIds ?? []),
      ...(rule.when?.ownBoard?.cardIds ?? []),
      ...(rule.when?.ownHand?.cardIds ?? []),
    ];
    if (ids.some((id) => !input.deck.mainDeck.includes(id)))
      throw new Error("Combo predicate card is outside the pinned deck");
  }
  return proposals.flatMap(({ strategy, rule }) =>
    [4, 8, 12].map((weight) => ({
      strategy: `${strategy}-${weight}`,
      program: parseHeuristic({
        ...input.generic,
        title: `${input.name}: ${strategy} ${weight}`.slice(0, 120),
        rules: [...input.generic.rules, { ...rule, weight }],
      }),
    })),
  );
}
