import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Group, MathUtils, type PerspectiveCamera, type ShaderMaterial, type Texture } from "three";
import { buildCardAuraMaterial } from "@/design/webglCard/buildCardAuraMaterial";
import { buildCardFaceMaterial } from "@/design/webglCard/buildCardFaceMaterial";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { CardFinish, type CardFinishEntry } from "@/design/webglCard/CardFinish";
import type { CardGrip } from "@/design/webglCard/createCardGrip";
import { disposeCardTexture } from "@/design/webglCard/disposeCardTexture";
import { getCardAuraRayStrength } from "@/design/webglCard/getCardAuraRayStrength";
import { loadCardBitmapTexture } from "@/design/webglCard/loadCardBitmapTexture";
import type { CardViewerPointer } from "@/game/overlay/viewer/cardViewer3d/CardViewerPointer";

type Props = {
  frontUrls: readonly string[];
  backUrl: string | undefined;
  finish: CardFinishEntry;
  reducedMotion: boolean;
  grip: CardGrip;
  pointer: RefObject<CardViewerPointer>;
  frame: RefObject<HTMLDivElement | null>;
  onReady: () => void;
  onFail: () => void;
};

type CameraProps = Pick<Props, "frame">;

type ModelProps = Pick<Props, "finish" | "reducedMotion" | "grip" | "pointer" | "onReady"> & {
  front: Texture;
  back: Texture | undefined;
};

type LoadedTexture = {
  key: string;
  texture: Texture | undefined;
};

type Offset = {
  yaw: number;
  pitch: number;
  pointerX: number;
  pointerY: number;
};

const TEXTURE_WIDTH = 1024;
const FIELD_OF_VIEW = 30;
const FACE_OFFSET = 0.002;
const HOVER_YAW = 0.28;
const HOVER_PITCH = 0.2;
const SWAY_YAW = 0.07;
const SWAY_PITCH = 0.04;
const INERTIA_DECAY = 3.5;
const SETTLE_VELOCITY = 0.6;
const SETTLE_RATE = 5;
const TILT_RATE = 6;
const REVEAL_SWEEP_SECONDS = 1.1;
const BURST_SECONDS = 1;
const AURA_SIZE = 6;
const AURA_OFFSET = -0.03;
const AURA_HALO = 0.6;
const REDUCED_MOTION_FOIL_TIME = 2;
const SETTLED_EPSILON = 0.0005;
const WAKE_EVENTS = ["pointermove", "pointerdown", "pointerup", "blur"] as const;

async function loadFirstTexture(urls: readonly string[]): Promise<Texture | undefined> {
  for (const url of urls) {
    try {
      return await loadCardBitmapTexture({ url, width: TEXTURE_WIDTH });
    } catch {
      continue;
    }
  }
  return undefined;
}

function useLoadedTexture(urls: readonly string[]): LoadedTexture | undefined {
  const key = urls.join("|");
  const [loaded, setLoaded] = useState<LoadedTexture>();

  useEffect(() => {
    let active = true;
    let texture: Texture | undefined;
    void loadFirstTexture(urls).then((result) => {
      if (!active) {
        if (result) {
          disposeCardTexture(result);
        }
        return;
      }
      texture = result;
      setLoaded({ key, texture: result });
    });
    return () => {
      active = false;
      if (texture) {
        disposeCardTexture(texture);
      }
    };
  }, [key]);

  return loaded?.key === key ? loaded : undefined;
}

function applyTexture(material: ShaderMaterial, texture: Texture | undefined) {
  material.uniforms.uMap!.value = texture ?? null;
  material.uniforms.uHasMap!.value = texture ? 1 : 0;
  material.uniforms.uBaseColor!.value.set(texture ? "#ffffff" : "#16324d");
}

function approach(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

function isNear(value: number, target: number): boolean {
  return Math.abs(value - target) < SETTLED_EPSILON;
}

function isOffsetSettled(offset: Offset, target: Offset): boolean {
  return (
    isNear(offset.yaw, target.yaw) &&
    isNear(offset.pitch, target.pitch) &&
    isNear(offset.pointerX, target.pointerX) &&
    isNear(offset.pointerY, target.pointerY)
  );
}

function isGripSettled(grip: CardGrip): boolean {
  return (
    grip.pointerId === undefined && isNear(grip.yaw, Math.round(grip.yaw / Math.PI) * Math.PI) && isNear(grip.pitch, 0)
  );
}

function ViewerWake() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const wake = () => invalidate();
    for (const name of WAKE_EVENTS) {
      window.addEventListener(name, wake);
    }
    window.addEventListener("scroll", wake, true);
    window.addEventListener("resize", wake);
    return () => {
      for (const name of WAKE_EVENTS) {
        window.removeEventListener(name, wake);
      }
      window.removeEventListener("scroll", wake, true);
      window.removeEventListener("resize", wake);
    };
  }, [invalidate]);

  return null;
}

function FrameCamera({ frame }: CameraProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const canvas = useThree((state) => state.gl.domElement);

  useFrame(() => {
    const frameRect = frame.current?.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    if (!frameRect || frameRect.height === 0 || canvasRect.width === 0 || canvasRect.height === 0) {
      return;
    }
    const centerX = frameRect.left + frameRect.width / 2 - canvasRect.left;
    const centerY = frameRect.top + frameRect.height / 2 - canvasRect.top;
    const fullWidth = 2 * Math.max(centerX, canvasRect.width - centerX, 1);
    const fullHeight = 2 * Math.max(centerY, canvasRect.height - centerY, 1);
    const halfAngle = Math.tan(MathUtils.degToRad(FIELD_OF_VIEW / 2));
    camera.fov = FIELD_OF_VIEW;
    camera.aspect = fullWidth / fullHeight;
    camera.position.set(0, 0, (CARD_DIMENSIONS.height * fullHeight) / (2 * halfAngle * frameRect.height));
    camera.setViewOffset(
      fullWidth,
      fullHeight,
      fullWidth / 2 - centerX,
      fullHeight / 2 - centerY,
      canvasRect.width,
      canvasRect.height,
    );
    camera.updateProjectionMatrix();
  }, -1);

  return null;
}

function CardModel({ front, back, finish, reducedMotion, grip, pointer, onReady }: ModelProps) {
  const root = useRef<Group>(null);
  const offset = useRef<Offset>({ yaw: 0, pitch: 0, pointerX: 0, pointerY: 0 });
  const openedAt = useRef<number | undefined>(undefined);
  const reported = useRef(false);
  const foiled = finish.value !== CardFinish.NONE.value;
  const frontMaterial = useMemo(
    () => buildCardFaceMaterial({ finishShaderIndex: finish.shaderIndex, glowColor: finish.glowColor }),
    [finish],
  );
  const backMaterial = useMemo(
    () => buildCardFaceMaterial({ finishShaderIndex: CardFinish.NONE.shaderIndex, glowColor: undefined }),
    [],
  );
  const auraMaterial = useMemo(
    () =>
      buildCardAuraMaterial({
        glowColor: finish.glowColor,
        prismatic: finish.value === CardFinish.PRISMATIC.value,
        size: AURA_SIZE,
        transparentCanvas: true,
      }),
    [finish],
  );
  const rayStrength = getCardAuraRayStrength(finish);

  useEffect(() => () => frontMaterial.dispose(), [frontMaterial]);
  useEffect(() => () => backMaterial.dispose(), [backMaterial]);
  useEffect(() => () => auraMaterial.dispose(), [auraMaterial]);
  useEffect(() => applyTexture(frontMaterial, front), [front, frontMaterial]);
  useEffect(() => applyTexture(backMaterial, back), [back, backMaterial]);

  useFrame((state, rawDelta) => {
    const group = root.current;
    if (!group) {
      return;
    }
    const delta = Math.min(rawDelta, 1 / 20);
    const time = state.clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    const dragging = grip.pointerId !== undefined;
    const hovering = pointer.current.active && !dragging;
    const settle = Math.min(1, delta * SETTLE_RATE);
    const tilt = Math.min(1, delta * TILT_RATE);
    openedAt.current ??= time;

    if (!dragging) {
      grip.yaw += grip.yawVelocity * delta * motion;
      grip.yawVelocity *= Math.exp(-delta * INERTIA_DECAY);
      grip.pitchVelocity = 0;
      if (Math.abs(grip.yawVelocity) < SETTLE_VELOCITY || motion === 0) {
        grip.yaw = approach(grip.yaw, Math.round(grip.yaw / Math.PI) * Math.PI, settle);
      }
      grip.pitch = approach(grip.pitch, 0, settle);
    }

    const swaying = !dragging && !hovering ? motion : 0;
    const targetYaw = (hovering ? pointer.current.x * HOVER_YAW : 0) + Math.sin(time * 0.7) * SWAY_YAW * swaying;
    const targetPitch =
      (hovering ? -pointer.current.y * HOVER_PITCH : 0) + Math.sin(time * 0.5 + 1) * SWAY_PITCH * swaying;
    const target: Offset = {
      yaw: targetYaw,
      pitch: targetPitch,
      pointerX: hovering ? pointer.current.x : 0,
      pointerY: hovering ? pointer.current.y : 0,
    };
    const current = offset.current;
    current.yaw = approach(current.yaw, target.yaw, tilt);
    current.pitch = approach(current.pitch, target.pitch, tilt);
    current.pointerX = approach(current.pointerX, target.pointerX, tilt);
    current.pointerY = approach(current.pointerY, target.pointerY, tilt);
    group.rotation.set(grip.pitch + current.pitch, grip.yaw + current.yaw, 0);

    const uniforms = frontMaterial.uniforms;
    uniforms.uTime!.value = reducedMotion ? REDUCED_MOTION_FOIL_TIME : time;
    uniforms.uPointer!.value.set(current.pointerX, current.pointerY);
    const revealProgress = (time - openedAt.current) / REVEAL_SWEEP_SECONDS;
    uniforms.uReveal!.value = foiled && motion > 0 && revealProgress < 1 ? revealProgress : -1;

    const auraUniforms = auraMaterial.uniforms;
    const openAge = time - openedAt.current;
    auraUniforms.uTime!.value = reducedMotion ? 0 : time;
    auraUniforms.uHalo!.value = approach(auraUniforms.uHalo!.value, foiled ? AURA_HALO : 0, tilt);
    auraUniforms.uRays!.value = approach(auraUniforms.uRays!.value, rayStrength, Math.min(1, delta * 3));
    auraUniforms.uBurst!.value = foiled && motion > 0 && openAge < BURST_SECONDS ? openAge / BURST_SECONDS : -1;

    if (!reported.current) {
      reported.current = true;
      onReady();
    }
    const auraSettled =
      isNear(auraUniforms.uHalo!.value, foiled ? AURA_HALO : 0) && isNear(auraUniforms.uRays!.value, rayStrength);
    const settled = motion === 0 && auraSettled && isGripSettled(grip) && isOffsetSettled(current, target);
    if (!settled) {
      state.invalidate();
    }
  });

  return (
    <group ref={root}>
      {foiled ? (
        <mesh position-z={AURA_OFFSET} material={auraMaterial}>
          <planeGeometry args={[AURA_SIZE, AURA_SIZE]} />
        </mesh>
      ) : null}
      <mesh position-z={FACE_OFFSET} material={frontMaterial}>
        <planeGeometry args={[CARD_DIMENSIONS.width, CARD_DIMENSIONS.height]} />
      </mesh>
      <mesh position-z={-FACE_OFFSET} rotation-y={Math.PI} material={backMaterial}>
        <planeGeometry args={[CARD_DIMENSIONS.width, CARD_DIMENSIONS.height]} />
      </mesh>
    </group>
  );
}

export function CardViewer3d({
  frontUrls,
  backUrl,
  finish,
  reducedMotion,
  grip,
  pointer,
  frame,
  onReady,
  onFail,
}: Props) {
  const backUrls = useMemo(() => (backUrl ? [backUrl] : []), [backUrl]);
  const front = useLoadedTexture(frontUrls);
  const back = useLoadedTexture(backUrls);
  const frontFailed = front !== undefined && front.texture === undefined;

  useEffect(() => {
    if (frontFailed) {
      onFail();
    }
  }, [frontFailed, onFail]);

  if (!front?.texture || !back) {
    return null;
  }
  return (
    <Canvas
      flat
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: FIELD_OF_VIEW, near: 0.1, far: 20, manual: true }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", onFail);
      }}
    >
      <ViewerWake />
      <FrameCamera frame={frame} />
      <CardModel
        front={front.texture}
        back={back.texture}
        finish={finish}
        reducedMotion={reducedMotion}
        grip={grip}
        pointer={pointer}
        onReady={onReady}
      />
    </Canvas>
  );
}
