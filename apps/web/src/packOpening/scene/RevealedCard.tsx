import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Group, Mesh, Vector3, type Texture } from "three";
import { CardFinish, type CardFinishEntry } from "@/packOpening/CardFinish";
import { buildCardAuraMaterial } from "@/packOpening/scene/buildCardAuraMaterial";
import { buildCardFaceMaterial } from "@/packOpening/scene/buildCardFaceMaterial";
import { CARD_DIMENSIONS } from "@/packOpening/scene/cardDimensions";
import { CardRevealState } from "@/packOpening/scene/CardRevealState";
import type { CardGrip } from "@/packOpening/scene/createCardGrip";
import { dragCardGrip } from "@/packOpening/scene/dragCardGrip";

type Vector = [number, number, number];

type Props = {
  playbackRate: number;
  index: number;
  inspected: boolean;
  dimmed: boolean;
  cardCount: number;
  revealState: CardRevealState;
  nextToReveal: boolean;
  front: Texture | undefined;
  back: Texture | undefined;
  finish: CardFinishEntry;
  glowColor: string | undefined;
  spawnPosition: Vector;
  stackPosition: Vector;
  focusPosition: Vector;
  focusScale: number;
  inspectPosition: Vector;
  inspectScale: number;
  slotPosition: Vector;
  slotScale: number;
  phaseStartedAt: RefObject<number>;
  reducedMotion: boolean;
  tiltWithPointer: boolean;
  foilEnabled: boolean;
  grip: CardGrip;
  onActivate: () => void;
};

const STACK_TILT = -1.42;
const STACK_CARD_THICKNESS = 0.01;
const STACK_SCALE = 0.85;
const FULL_TURN = Math.PI * 2;
const AURA_SIZE = 6;
const REVEAL_SWEEP_SECONDS = 1.1;
const BURST_SECONDS = 1;
const FOUNTAIN_FLIGHT_SECONDS = 0.95;
const FOUNTAIN_FAN = 1.7;
const INERTIA_DECAY = 3.5;
const FOUNTAIN_RENDER_ORDER = 1000;

function ignoreRaycast() {
  return undefined;
}

function wrapAngle(angle: number): number {
  return angle - FULL_TURN * Math.round(angle / FULL_TURN);
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function setTexture(material: ReturnType<typeof buildCardFaceMaterial>, texture: Texture | undefined) {
  material.uniforms.uMap!.value = texture ?? null;
  material.uniforms.uHasMap!.value = texture ? 1 : 0;
  material.uniforms.uBaseColor!.value.set(texture ? "#ffffff" : "#16324d");
}

export function RevealedCard({
  playbackRate,
  index,
  inspected,
  dimmed,
  cardCount,
  revealState,
  nextToReveal,
  front,
  back,
  finish,
  glowColor,
  spawnPosition,
  stackPosition,
  focusPosition,
  focusScale,
  inspectPosition,
  inspectScale,
  slotPosition,
  slotScale,
  phaseStartedAt,
  reducedMotion,
  tiltWithPointer,
  foilEnabled,
  grip,
  onActivate,
}: Props) {
  const root = useRef<Group>(null);
  const frontFace = useRef<Mesh>(null);
  const backFace = useRef<Mesh>(null);
  const revealedAt = useRef<number | undefined>(undefined);
  const target = useMemo(() => new Vector3(), []);
  const foiled = finish.value !== CardFinish.NONE.value;
  const frontMaterial = useMemo(() => buildCardFaceMaterial({ finish, glowColor }), [finish, glowColor]);
  const backMaterial = useMemo(() => buildCardFaceMaterial({ finish: CardFinish.NONE, glowColor: undefined }), []);
  const auraMaterial = useMemo(
    () =>
      buildCardAuraMaterial({
        glowColor,
        prismatic: finish.value === CardFinish.PRISMATIC.value,
        size: AURA_SIZE,
      }),
    [finish, glowColor],
  );
  const restTurn = foiled ? -FULL_TURN : 0;
  const rayStrength =
    finish.shaderIndex >= CardFinish.STARLIGHT.shaderIndex
      ? 0.25 + (finish.shaderIndex - CardFinish.STARLIGHT.shaderIndex) * 0.08
      : 0;

  useEffect(() => () => backMaterial.dispose(), [backMaterial]);
  useEffect(() => () => frontMaterial.dispose(), [frontMaterial]);
  useEffect(() => () => auraMaterial.dispose(), [auraMaterial]);
  useEffect(() => setTexture(frontMaterial, front), [front, frontMaterial]);
  useEffect(() => {
    frontMaterial.uniforms.uFinish!.value = foilEnabled ? finish.shaderIndex : CardFinish.NONE.shaderIndex;
  }, [finish, foilEnabled, frontMaterial]);
  useEffect(() => setTexture(backMaterial, back), [back, backMaterial]);

  useEffect(() => {
    if (revealState === CardRevealState.FOCUS.value) {
      revealedAt.current = undefined;
    }
  }, [revealState]);

  useFrame((state, rawDelta) => {
    const group = root.current;
    if (!group) {
      return;
    }
    const delta = Math.min(rawDelta, 1 / 20);
    const time = state.clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    const ease = Math.min(1, delta * 7);
    const pointerTilt = tiltWithPointer && motion > 0;
    let scale = slotScale;
    let rotationX = 0;
    let rotationY = restTurn;
    let rotationZ = 0;
    let haloLevel = 0;
    let rayLevel = 0;
    let snap = false;
    group.visible = true;

    if (revealState === CardRevealState.HIDDEN.value) {
      target.set(...spawnPosition);
      scale = 0.01;
      group.visible = false;
      snap = true;
    } else if (revealState === CardRevealState.FOUNTAIN.value) {
      const launch = (time - (phaseStartedAt.current ?? 0)) * playbackRate - 0.18 - index * 0.04;
      const flight = Math.min(1, Math.max(0, launch) / FOUNTAIN_FLIGHT_SECONDS);
      const fan = (cardCount > 1 ? index / (cardCount - 1) - 0.5 : 0) * FOUNTAIN_FAN;
      const travel = easeOutCubic(flight);
      const arc = Math.sin(flight * Math.PI * 0.9);
      target.set(
        spawnPosition[0] + Math.sin(fan) * 2.1 * travel,
        spawnPosition[1] + 0.25 + arc * (1.15 + Math.cos(fan) * 0.45) - flight * flight * 0.5,
        spawnPosition[2] - 0.35 - travel * 0.6 + Math.abs(fan) * 0.2 * travel,
      );
      group.visible = launch > 0;
      group.rotation.set(
        -0.35 + Math.sin(flight * 5 + index) * 0.25 * motion,
        Math.PI + Math.sin(flight * Math.PI) * 0.5 * motion,
        -fan * 0.55 * travel,
      );
      const vanish = playbackRate > 1 ? 1 - Math.min(1, Math.max(0, (flight - 0.55) / 0.45)) : 1;
      scale = slotScale * (0.35 + travel * 0.55) * vanish;
      snap = true;
    } else if (revealState === CardRevealState.STACK.value) {
      target.set(
        stackPosition[0] + Math.sin(index * 12.9) * 0.012,
        stackPosition[1] + (cardCount - index) * STACK_CARD_THICKNESS,
        stackPosition[2] + Math.cos(index * 7.3) * 0.01,
      );
      rotationX = STACK_TILT;
      rotationY = Math.PI;
      rotationZ = Math.sin(index * 4.7) * 0.035;
      scale = slotScale * STACK_SCALE;
      group.rotation.y = rotationY + wrapAngle(group.rotation.y - rotationY);
      haloLevel = nextToReveal && foiled ? 0.35 + Math.sin(time * 3.2) * 0.2 : 0;
    } else if (revealState === CardRevealState.FOCUS.value) {
      target.set(focusPosition[0], focusPosition[1] + Math.sin(time * 1.6) * 0.04 * motion, focusPosition[2]);
      rotationY = restTurn + (pointerTilt ? state.pointer.x * 0.32 : Math.sin(time * 1.1) * 0.06 * motion);
      rotationX = pointerTilt ? -state.pointer.y * 0.22 : 0;
      scale = focusScale;
      haloLevel = foiled ? 0.6 : 0;
      rayLevel = rayStrength;
      if (foiled && revealedAt.current === undefined && Math.abs(group.rotation.y - restTurn) < 0.5) {
        revealedAt.current = time;
      }
    } else {
      target.set(...slotPosition);
      haloLevel = foiled ? 0.3 + finish.shaderIndex * 0.06 : 0;
    }

    if (inspected) {
      if (grip.pointerId === undefined) {
        const decay = Math.exp(-delta * INERTIA_DECAY);
        grip.yaw += grip.yawVelocity * delta * motion;
        grip.pitch = Math.max(-1.2, Math.min(1.2, grip.pitch + grip.pitchVelocity * delta * motion));
        grip.yawVelocity *= decay;
        grip.pitchVelocity *= decay;
      }
      const hover = pointerTilt && grip.pointerId === undefined;
      target.set(inspectPosition[0] + grip.panX, inspectPosition[1] + grip.panY, inspectPosition[2]);
      scale = inspectScale * grip.zoom;
      rotationX = grip.pitch + (hover ? -state.pointer.y * 0.18 : 0);
      rotationY = restTurn + grip.yaw + (hover ? state.pointer.x * 0.25 : 0);
      haloLevel = foiled ? 0.45 : 0;
      rayLevel = rayStrength * 0.4;
      snap = false;
    }
    if (dimmed) {
      group.visible = false;
    }
    const fountain = revealState === CardRevealState.FOUNTAIN.value;
    const renderOrder = fountain ? FOUNTAIN_RENDER_ORDER - group.position.distanceTo(state.camera.position) : 0;
    frontMaterial.depthWrite = !fountain;
    backMaterial.depthWrite = !fountain;
    if (frontFace.current) {
      frontFace.current.renderOrder = renderOrder;
    }
    if (backFace.current) {
      backFace.current.renderOrder = renderOrder;
    }
    if (snap) {
      group.position.copy(target);
    } else {
      group.position.lerp(target, ease);
      group.rotation.x += (rotationX - group.rotation.x) * ease;
      const turnRate = inspected ? 14 : foiled ? 4 : 6;
      group.rotation.y += (rotationY - group.rotation.y) * Math.min(1, delta * turnRate);
      group.rotation.z += (rotationZ - group.rotation.z) * ease;
    }
    group.scale.setScalar(group.scale.x + (scale - group.scale.x) * ease);

    const faceUniforms = frontMaterial.uniforms;
    faceUniforms.uTime!.value = reducedMotion ? 2 : time;
    if (pointerTilt) {
      faceUniforms.uPointer!.value.set(state.pointer.x, state.pointer.y);
    } else {
      faceUniforms.uPointer!.value.set(0, 0);
    }
    const startedAt = revealedAt.current;
    const revealAge = startedAt === undefined ? -1 : time - startedAt;
    faceUniforms.uReveal!.value = revealAge < 0 || motion === 0 ? -1 : revealAge / REVEAL_SWEEP_SECONDS;

    const auraUniforms = auraMaterial.uniforms;
    auraUniforms.uTime!.value = reducedMotion ? 0 : time;
    auraUniforms.uHalo!.value += (haloLevel - auraUniforms.uHalo!.value) * ease;
    auraUniforms.uRays!.value += (rayLevel - auraUniforms.uRays!.value) * Math.min(1, delta * 3);
    auraUniforms.uBurst!.value = revealAge < 0 || motion === 0 ? -1 : revealAge / BURST_SECONDS;
  });

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (inspected && grip.dragged) {
      grip.dragged = false;
      return;
    }
    onActivate();
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!inspected) {
      return;
    }
    event.stopPropagation();
    if (grip.pointerId !== undefined || grip.pinching) {
      return;
    }
    (event.target as Element).setPointerCapture(event.pointerId);
    Object.assign(grip, {
      pointerId: event.pointerId,
      lastX: event.nativeEvent.clientX,
      lastY: event.nativeEvent.clientY,
      lastTime: event.nativeEvent.timeStamp,
      travel: 0,
      dragged: false,
      yawVelocity: 0,
      pitchVelocity: 0,
    });
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (!inspected || grip.pointerId !== event.pointerId) {
      return;
    }
    dragCardGrip({
      grip,
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      time: event.nativeEvent.timeStamp,
    });
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (grip.pointerId !== event.pointerId) {
      return;
    }
    (event.target as Element).releasePointerCapture(event.pointerId);
    grip.pointerId = undefined;
  }

  const interactive = !dimmed && revealState !== CardRevealState.HIDDEN.value;
  const raycast = interactive ? Mesh.prototype.raycast : ignoreRaycast;

  return (
    <group
      ref={root}
      position={spawnPosition}
      scale={0.01}
      rotation-y={Math.PI}
      visible={false}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {foiled ? (
        <mesh position-z={-0.03} material={auraMaterial} raycast={ignoreRaycast}>
          <planeGeometry args={[AURA_SIZE, AURA_SIZE]} />
        </mesh>
      ) : null}
      <mesh ref={frontFace} position-z={0.002} material={frontMaterial} raycast={raycast}>
        <planeGeometry args={[CARD_DIMENSIONS.width, CARD_DIMENSIONS.height]} />
      </mesh>
      <mesh ref={backFace} position-z={-0.002} rotation-y={Math.PI} material={backMaterial} raycast={raycast}>
        <planeGeometry args={[CARD_DIMENSIONS.width, CARD_DIMENSIONS.height]} />
      </mesh>
    </group>
  );
}
