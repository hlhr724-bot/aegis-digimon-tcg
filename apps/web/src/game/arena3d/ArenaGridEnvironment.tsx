import { ArenaArtBackdrop } from "@/game/arena3d/ArenaArtBackdrop";
import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaGridFloor } from "@/game/arena3d/ArenaGridFloor";
import { ArenaMotes } from "@/game/arena3d/ArenaMotes";
import type { ArenaMoteStyle } from "@/game/arena3d/ArenaMoteStyle";
import { ArenaSpires } from "@/game/arena3d/ArenaSpires";
import { SIDE_DEPTH } from "@/game/arena3d/arenaSceneLayout";

const GRID_MOTES: ArenaMoteStyle = { count: 360, riseSpeed: 1, size: 1, sway: 1, brightness: 1.4 };

export function ArenaGridEnvironment({
  colors,
  ripples,
  activeSide,
  energy,
  artSrc,
  reducedMotion,
}: ArenaEnvironmentSceneProps) {
  return (
    <>
      <color attach="background" args={[colors.surface]} />
      <fog attach="fog" args={[colors.surface, 18, 52]} />
      <ambientLight intensity={colors.isLight ? 1.2 : 0.35} />
      <pointLight position={[0, 4, SIDE_DEPTH + 2]} color={colors.player} intensity={40} distance={30} />
      <pointLight position={[0, 4, -SIDE_DEPTH - 2]} color={colors.opponent} intensity={40} distance={30} />
      <ArenaArtBackdrop src={artSrc} isLight={colors.isLight} />
      <ArenaGridFloor colors={colors} ripples={ripples} activeSide={activeSide} />
      <ArenaSpires colors={colors} energy={energy} reducedMotion={reducedMotion} />
      <ArenaMotes
        primary={colors.playerAccent}
        secondary={colors.opponentAccent}
        isLight={colors.isLight}
        energy={energy}
        reducedMotion={reducedMotion}
        moteStyle={GRID_MOTES}
      />
    </>
  );
}
