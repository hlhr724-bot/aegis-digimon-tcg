import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaFloatingShapes } from "@/game/arena3d/ArenaFloatingShapes";
import { ArenaPrismFloor } from "@/game/arena3d/ArenaPrismFloor";

export function ArenaPrismEnvironment({
  colors,
  ripples,
  activeSide,
  energy,
  reducedMotion,
}: ArenaEnvironmentSceneProps) {
  const haze = colors.isLight ? "#efe6ff" : "#120f2a";
  return (
    <>
      <color attach="background" args={[haze]} />
      <fog attach="fog" args={[haze, 24, 60]} />
      <hemisphereLight
        args={[
          colors.isLight ? "#ffffff" : "#b9a6ff",
          colors.isLight ? "#ffd2c2" : "#14304a",
          colors.isLight ? 2.2 : 1.4,
        ]}
      />
      <directionalLight position={[5, 10, 6]} intensity={colors.isLight ? 1.4 : 0.9} />
      <ArenaPrismFloor colors={colors} ripples={ripples} activeSide={activeSide} />
      <ArenaFloatingShapes isLight={colors.isLight} energy={energy} reducedMotion={reducedMotion} />
    </>
  );
}
