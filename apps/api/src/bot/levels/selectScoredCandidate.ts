type ScoredCandidate<T> = {
  candidate: T;
  score: number;
  lethal?: boolean;
  forced?: boolean;
};

type Params<T> = {
  candidates: readonly ScoredCandidate<T>[];
  temperature: number;
  topK: number;
  random: () => number;
  passThreshold?: number;
};

export function selectScoredCandidate<T>({
  candidates,
  temperature,
  topK,
  random,
  passThreshold,
}: Params<T>): T | undefined {
  const ranked = candidates
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);
  const forced = ranked.find((entry) => entry.forced);
  if (forced !== undefined) {
    return forced.candidate;
  }
  const lethal = ranked.find((entry) => entry.lethal);
  if (lethal !== undefined) {
    return lethal.candidate;
  }
  const eligible = ranked.filter((entry) => passThreshold === undefined || entry.score > passThreshold);
  const best = eligible[0];
  if (best === undefined) {
    return undefined;
  }
  if (temperature <= 0 || !Number.isFinite(temperature)) {
    return best.candidate;
  }
  const pool = eligible.slice(0, Math.max(1, Math.floor(topK)));
  const weights = pool.map((entry) => Math.exp((entry.score - best.score) / temperature));
  let remaining = random() * weights.reduce((total, weight) => total + weight, 0);
  for (let index = 0; index < pool.length; index += 1) {
    remaining -= weights[index]!;
    if (remaining < 0) {
      return pool[index]!.candidate;
    }
  }
  return pool[pool.length - 1]!.candidate;
}
