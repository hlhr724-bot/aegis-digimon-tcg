import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { RANDOM_ARENA_ENVIRONMENT, type ArenaEnvironmentChoice } from "@/game/arena3d/ArenaEnvironmentChoice";

type Params = {
  choice: ArenaEnvironmentChoice;
  matchKey: string | undefined;
};

const PAGE_MATCH_KEY = Math.random().toString(36);
const RANDOM_POOL = Object.values(ArenaEnvironment).map((entry) => entry.value);

function hashKey(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveArenaEnvironment({ choice, matchKey }: Params): ArenaEnvironment {
  if (choice !== RANDOM_ARENA_ENVIRONMENT) {
    return choice;
  }
  return RANDOM_POOL[hashKey(`environment:${matchKey ?? PAGE_MATCH_KEY}`) % RANDOM_POOL.length]!;
}
