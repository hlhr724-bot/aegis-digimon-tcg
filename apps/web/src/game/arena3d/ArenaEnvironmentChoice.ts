import type { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";

export const RANDOM_ARENA_ENVIRONMENT = "random";

export type ArenaEnvironmentChoice = ArenaEnvironment | typeof RANDOM_ARENA_ENVIRONMENT;
