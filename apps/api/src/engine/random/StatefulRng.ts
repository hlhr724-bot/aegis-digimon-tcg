import type { SeededRandom } from "#api/engine/random/SeededRandom";

export type StatefulRng = (() => number) & { readonly generator: SeededRandom };
