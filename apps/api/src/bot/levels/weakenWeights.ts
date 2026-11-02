import type { BotWeights } from "#api/bot/profiles";

export type WeightScales = Readonly<Partial<Record<keyof BotWeights, number>>>;

type Params = {
  weights: BotWeights;
  scales: WeightScales;
};

export function weakenWeights({ weights, scales }: Params): BotWeights {
  const weakened = { ...weights };
  for (const [name, scale] of Object.entries(scales) as [keyof BotWeights, number][]) {
    weakened[name] = weights[name] * scale;
  }
  return weakened;
}
