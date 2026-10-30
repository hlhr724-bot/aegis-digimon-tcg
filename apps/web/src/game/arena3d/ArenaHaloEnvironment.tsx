import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaHaloFloor } from "@/game/arena3d/ArenaHaloFloor";

export function ArenaHaloEnvironment({ colors, ripples, activeSide }: ArenaEnvironmentSceneProps) {
  const haze = colors.isLight ? "#ede8e0" : "#0e1019";
  return (
    <>
      <color attach="background" args={[haze]} />
      <ArenaHaloFloor colors={colors} ripples={ripples} activeSide={activeSide} />
    </>
  );
}
