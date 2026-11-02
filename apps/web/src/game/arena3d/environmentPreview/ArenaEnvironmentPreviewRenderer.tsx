import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { ARENA_ENVIRONMENT_SCENES } from "@/game/arena3d/arenaEnvironmentScenes";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { CAMERA_FOV_DEGREES } from "@/game/arena3d/arenaSceneLayout";
import { createArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";
import "@/game/arena3d/environmentPreview/arenaEnvironmentPreview.css";

type Props = {
  colors: ArenaSideColors;
  pending: readonly ArenaEnvironment[];
  onCapture: (environment: ArenaEnvironment, url: string) => void;
};

type CaptureProps = {
  onCapture: (url: string) => void;
};

const PREVIEW_WIDTH = 384;
const PREVIEW_HEIGHT = 216;
const CAPTURE_FRAME = 30;
const CAMERA_POSITION: [number, number, number] = [0, 6.5, 21];
const CAMERA_TARGET: [number, number, number] = [0, 0.5, -4];

function PreviewCapture({ onCapture }: CaptureProps) {
  const canvas = useThree((state) => state.gl.domElement);
  const frames = useRef(0);

  useFrame(() => {
    frames.current += 1;
    if (frames.current === CAPTURE_FRAME) {
      onCapture(canvas.toDataURL("image/webp", 0.85));
    }
  });

  return null;
}

export function ArenaEnvironmentPreviewRenderer({ colors, pending, onCapture }: Props) {
  const ripples = useMemo(createArenaRippleBuffer, []);
  const energy = useRef(0);
  const environment = pending[0];
  if (!environment) {
    return null;
  }
  const Scene = ARENA_ENVIRONMENT_SCENES[environment];

  return (
    <div className="arena-environment-preview" aria-hidden="true">
      <Canvas
        dpr={1}
        style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        camera={{ fov: CAMERA_FOV_DEGREES, near: 0.1, far: 200, position: CAMERA_POSITION }}
        onCreated={({ camera }) => camera.lookAt(...CAMERA_TARGET)}
      >
        <Scene
          key={environment}
          colors={colors}
          ripples={ripples}
          activeSide={0}
          energy={energy}
          artSrc={undefined}
          reducedMotion={false}
          quality={Arena3dQuality.MEDIUM}
        />
        <PreviewCapture key={`capture-${environment}`} onCapture={(url) => onCapture(environment, url)} />
      </Canvas>
    </div>
  );
}
