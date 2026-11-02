import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";

export type ArenaEnvironmentEntry = (typeof ArenaEnvironment)[keyof typeof ArenaEnvironment];

export function findArenaEnvironmentEntry(value: unknown): ArenaEnvironmentEntry | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return Object.values(ArenaEnvironment).find((entry) => entry.value === value);
}
