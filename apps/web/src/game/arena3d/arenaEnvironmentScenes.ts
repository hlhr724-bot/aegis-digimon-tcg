import type { ComponentType } from "react";
import { ArenaAuroraEnvironment } from "@/game/arena3d/ArenaAuroraEnvironment";
import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaGridEnvironment } from "@/game/arena3d/ArenaGridEnvironment";
import { ArenaHaloEnvironment } from "@/game/arena3d/ArenaHaloEnvironment";
import { ArenaHologramEnvironment } from "@/game/arena3d/ArenaHologramEnvironment";
import { ArenaPrismEnvironment } from "@/game/arena3d/ArenaPrismEnvironment";

export const ARENA_ENVIRONMENT_SCENES: Record<ArenaEnvironment, ComponentType<ArenaEnvironmentSceneProps>> = {
  [ArenaEnvironment.HOLOGRAM.value]: ArenaHologramEnvironment,
  [ArenaEnvironment.PRISM.value]: ArenaPrismEnvironment,
  [ArenaEnvironment.GRID.value]: ArenaGridEnvironment,
  [ArenaEnvironment.HALO.value]: ArenaHaloEnvironment,
  [ArenaEnvironment.AURORA.value]: ArenaAuroraEnvironment,
};
