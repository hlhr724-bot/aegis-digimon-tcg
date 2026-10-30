import { ArenaAuroraFloor } from "@/game/arena3d/ArenaAuroraFloor";
import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaGiantForms } from "@/game/arena3d/ArenaGiantForms";

export function ArenaAuroraEnvironment({
  colors,
  ripples,
  activeSide,
  energy,
  reducedMotion,
}: ArenaEnvironmentSceneProps) {
  const haze = colors.isLight ? "#f3dcef" : "#140c26";
  return (
    <>
      <color attach="background" args={[haze]} />
      <fog attach="fog" args={[haze, 26, 70]} />
      <hemisphereLight
        args={[
          colors.isLight ? "#ffffff" : "#c9a6ff",
          colors.isLight ? "#bfe6ff" : "#0b2a3a",
          colors.isLight ? 2 : 1.2,
        ]}
      />
      <ArenaAuroraFloor colors={colors} ripples={ripples} activeSide={activeSide} />
      <ArenaGiantForms isLight={colors.isLight} energy={energy} reducedMotion={reducedMotion} />
    </>
  );
}
