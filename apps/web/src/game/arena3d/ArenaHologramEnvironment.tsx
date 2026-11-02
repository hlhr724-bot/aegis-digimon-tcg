import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaHologramFloor } from "@/game/arena3d/ArenaHologramFloor";
import { ArenaMotes } from "@/game/arena3d/ArenaMotes";
import { ArenaSigils } from "@/game/arena3d/ArenaSigils";

const SPARSE_MOTE_COUNT = 40;

export function ArenaHologramEnvironment({
  colors,
  ripples,
  activeSide,
  energy,
  reducedMotion,
  quality,
}: ArenaEnvironmentSceneProps) {
  const haze = colors.isLight ? "#e8eefb" : "#03060f";
  return (
    <>
      <color attach="background" args={[haze]} />
      <fog attach="fog" args={[haze, 26, 64]} />
      <ArenaHologramFloor colors={colors} ripples={ripples} activeSide={activeSide} quality={quality} />
      <ArenaSigils colors={colors} activeSide={activeSide} reducedMotion={reducedMotion} />
      {quality.bloom ? (
        <ArenaMotes
          primary={colors.playerAccent}
          secondary={colors.opponentAccent}
          isLight={colors.isLight}
          energy={energy}
          reducedMotion={reducedMotion}
          moteStyle={{ count: SPARSE_MOTE_COUNT, riseSpeed: 0.2, size: 0.6, sway: 0.25, brightness: 0.6 }}
        />
      ) : null}
    </>
  );
}
