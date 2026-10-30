import { useMemo, useRef, type ComponentType } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { ArenaAuroraEnvironment } from "@/game/arena3d/ArenaAuroraEnvironment";
import type { ArenaCameraImpulse } from "@/game/arena3d/ArenaCameraImpulse";
import { ArenaCameraRig } from "@/game/arena3d/ArenaCameraRig";
import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaFrameDriver } from "@/game/arena3d/ArenaFrameDriver";
import { ArenaGridEnvironment } from "@/game/arena3d/ArenaGridEnvironment";
import { ArenaHaloEnvironment } from "@/game/arena3d/ArenaHaloEnvironment";
import { ArenaPrismEnvironment } from "@/game/arena3d/ArenaPrismEnvironment";
import type { ArenaPulse } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseLayer } from "@/game/arena3d/ArenaPulseLayer";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { ArenaSigils } from "@/game/arena3d/ArenaSigils";
import { CAMERA_POSITION } from "@/game/arena3d/arenaSceneLayout";
import { createArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";

type Props = {
  environment: ArenaEnvironment;
  colors: ArenaSideColors;
  pulses: readonly ArenaPulse[];
  activeSide: number;
  artSrc: string | undefined;
  reducedMotion: boolean;
};

type EnergyProps = {
  energy: { current: number };
};

const ENVIRONMENT_SCENES: Record<ArenaEnvironment, ComponentType<ArenaEnvironmentSceneProps>> = {
  [ArenaEnvironment.PRISM.value]: ArenaPrismEnvironment,
  [ArenaEnvironment.GRID.value]: ArenaGridEnvironment,
  [ArenaEnvironment.HALO.value]: ArenaHaloEnvironment,
  [ArenaEnvironment.AURORA.value]: ArenaAuroraEnvironment,
};

function EnergyDecay({ energy }: EnergyProps) {
  useFrame((_, delta) => {
    energy.current = Math.max(0, energy.current - delta * 0.8);
  });
  return null;
}

export function ArenaScene({ environment, colors, pulses, activeSide, artSrc, reducedMotion }: Props) {
  const ripples = useMemo(createArenaRippleBuffer, []);
  const impulse = useRef<ArenaCameraImpulse>({ strength: 0, startedAt: -100 });
  const energy = useRef(0);
  const activity = useRef<ArenaActivity>({ busyUntil: 0 });
  const EnvironmentScene = ENVIRONMENT_SCENES[environment];

  return (
    <Canvas
      className="arena-3d-scene__canvas"
      dpr={1}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 42, near: 0.1, far: 120, position: [...CAMERA_POSITION] }}
    >
      <EnvironmentScene
        colors={colors}
        ripples={ripples}
        activeSide={activeSide}
        energy={energy}
        artSrc={artSrc}
        reducedMotion={reducedMotion}
      />
      <ArenaSigils colors={colors} activeSide={activeSide} reducedMotion={reducedMotion} />
      <ArenaPulseLayer
        pulses={pulses}
        ripples={ripples}
        impulse={impulse}
        energy={energy}
        activity={activity}
        isLight={colors.isLight}
        reducedMotion={reducedMotion}
      />
      <ArenaCameraRig impulse={impulse} activeSide={activeSide} reducedMotion={reducedMotion} />
      <EnergyDecay energy={energy} />
      <ArenaFrameDriver activity={activity} />
    </Canvas>
  );
}
