import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { CarouselState } from "@/packOpening/carousel/createCarouselState";
import { PackOpeningPhase } from "@/packOpening/PackOpeningPhase";
import type { PackWrapperTextures } from "@/packOpening/scene/buildPackWrapperTextures";
import { getCarouselSlot } from "@/packOpening/scene/getCarouselSlot";
import type { StageLayout } from "@/packOpening/scene/getStageLayout";
import { PACK_STRIP_RATIO } from "@/packOpening/scene/packStripRatio";

type Props = {
  playbackRate: number;
  index: number;
  count: number;
  textures: PackWrapperTextures;
  layout: StageLayout;
  carousel: RefObject<CarouselState>;
  phase: PackOpeningPhase;
  phaseStartedAt: RefObject<number>;
  selected: boolean;
  hitColor: string;
  reducedMotion: boolean;
  onActivate: (index: number) => void;
};

const WIDTH = 1.1;
const HEIGHT = 2;
const DEPTH = 0.07;
const STRIP_HEIGHT = HEIGHT * PACK_STRIP_RATIO;
const BODY_HEIGHT = HEIGHT - STRIP_HEIGHT;
const SEAM_Y = (BODY_HEIGHT - STRIP_HEIGHT) / 2;
const TURN_SHARE = 0.55;
const BASE_GLOW = new Color("#2fd6ff");

const SEAM_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SEAM_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float along = abs(vUv.x - 0.5) * 2.0;
    float flicker = 0.75 + 0.25 * sin(vUv.x * 38.0 + uTime * 21.0) * sin(vUv.x * 13.0 - uTime * 9.0);
    float core = exp(-across * across * 400.0) * 1.8;
    float leak = exp(-across * 10.0) * 0.25 * flicker;
    float ends = smoothstep(1.0, 0.72, along);
    vec3 color = mix(uColor, vec3(1.0), core * 0.35);
    gl_FragColor = vec4(color * (core + leak) * ends * uIntensity, 1.0);
  }
`;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutBack(progress: number): number {
  const overshoot = 1.70158;
  const shifted = progress - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

function easeInOutCubic(progress: number): number {
  if (progress < 0.5) {
    return 4 * progress ** 3;
  }
  return 1 - (-2 * progress + 2) ** 3 / 2;
}

type PieceProps = {
  height: number;
  frontMaterial: MeshPhysicalMaterial;
  backMaterial: MeshPhysicalMaterial;
  sideMaterial: MeshStandardMaterial;
};

type WrapperMaterialParams = {
  map: Texture;
  relief: Texture;
};

function buildWrapperMaterial({ map, relief }: WrapperMaterialParams): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map,
    metalness: 0.36,
    roughness: 0.44,
    bumpMap: relief,
    bumpScale: 0.025,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.7,
  });
}

function PackPiece({ height, frontMaterial, backMaterial, sideMaterial }: PieceProps) {
  const geometry = useMemo(() => new RoundedBoxGeometry(WIDTH, height, DEPTH, 3, 0.025), [height]);
  const surface = useMemo(() => {
    const foil = new PlaneGeometry(WIDTH - 0.03, height - 0.01, 32, 48);
    const positions = foil.attributes.position!;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const bulge = Math.cos((x / WIDTH) * Math.PI) * Math.cos((y / height) * Math.PI);
      positions.setZ(index, bulge * 0.045);
    }
    foil.computeVertexNormals();
    return foil;
  }, [height]);
  useEffect(
    () => () => {
      geometry.dispose();
      surface.dispose();
    },
    [geometry, surface],
  );
  return (
    <group>
      <mesh castShadow receiveShadow geometry={geometry} material={sideMaterial} />
      <mesh castShadow geometry={surface} position-z={DEPTH / 2 + 0.002} material={frontMaterial} />
      <mesh geometry={surface} position-z={-DEPTH / 2 - 0.002} rotation-y={Math.PI} material={backMaterial} />
    </group>
  );
}

function buildSeamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SEAM_VERTEX_SHADER,
    fragmentShader: SEAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: new Color() } },
  });
}

export function BoosterPack({
  playbackRate,
  index,
  count,
  textures,
  layout,
  carousel,
  phase,
  phaseStartedAt,
  selected,
  hitColor,
  reducedMotion,
  onActivate,
}: Props) {
  const root = useRef<Group>(null);
  const strip = useRef<Group>(null);
  const body = useRef<Group>(null);
  const seam = useRef<Mesh>(null);
  const seamMaterial = useMemo(buildSeamMaterial, []);
  const target = useMemo(() => new Vector3(), []);
  const chargePosition = useMemo(() => new Vector3(...layout.chargePosition), [layout.chargePosition]);
  const hit = useMemo(() => new Color(hitColor), [hitColor]);
  const sideMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#d9f8ff",
        emissive: BASE_GLOW.clone(),
        emissiveIntensity: 0.04,
        metalness: 0.85,
        roughness: 0.34,
      }),
    [],
  );
  const wrapperMaterials = useMemo(
    () => ({
      stripFront: buildWrapperMaterial({ map: textures.stripFront, relief: textures.stripRelief }),
      stripBack: buildWrapperMaterial({ map: textures.stripBack, relief: textures.stripRelief }),
      bodyFront: buildWrapperMaterial({ map: textures.bodyFront, relief: textures.bodyRelief }),
      bodyBack: buildWrapperMaterial({ map: textures.bodyBack, relief: textures.bodyRelief }),
    }),
    [textures],
  );

  useEffect(
    () => () => {
      sideMaterial.dispose();
      seamMaterial.dispose();
    },
    [sideMaterial, seamMaterial],
  );

  useEffect(
    () => () => {
      for (const material of Object.values(wrapperMaterials)) {
        material.dispose();
      }
    },
    [wrapperMaterials],
  );

  useFrame((state, rawDelta) => {
    const group = root.current;
    if (!group || !strip.current || !body.current) {
      return;
    }
    const delta = Math.min(rawDelta, 1 / 20);
    const time = state.clock.elapsedTime;
    const elapsed = (time - (phaseStartedAt.current ?? 0)) * playbackRate;
    const motion = reducedMotion ? 0 : 1;
    const ease = Math.min(1, delta * 6);
    const slot = getCarouselSlot({ index, count, angle: carousel.current.angle, layout: layout.carousel });
    const front = slot.frontness ** 6;
    let scale = layout.packScale * (0.78 + 0.32 * front);
    let emissiveIntensity = 0.02 + front * 0.05;
    let glowMix = 0;
    let stripOffset = 0;
    let bodyDrop = 0;
    let opacity = 1;
    let snap = true;
    let rotationZ = 0;
    let rotationX = 0;
    let seamIntensity = 0;

    if (phase === PackOpeningPhase.INTRO.value) {
      const rise = clampUnit((elapsed - index * 0.08) / 0.8);
      target.set(slot.x, slot.y + (easeOutBack(rise) - 1) * 3.6, slot.z);
      group.rotation.y = slot.rotationY;
    } else if (phase === PackOpeningPhase.CHOOSING.value) {
      target.set(slot.x, slot.y + front * (0.18 + Math.sin(time * 1.5) * 0.05 * motion), slot.z + front * 0.25);
      group.rotation.y = slot.rotationY;
    } else if (selected && phase === PackOpeningPhase.CHARGING.value) {
      const charge = clampUnit(elapsed / PackOpeningPhase.CHARGING.durationSeconds);
      const rapid = playbackRate > 1;
      const turn = rapid ? 0 : easeInOutCubic(clampUnit(charge / TURN_SHARE));
      const tension = rapid ? clampUnit((charge - 0.4) / 0.6) : clampUnit((charge - TURN_SHARE) / (1 - TURN_SHARE));
      if (rapid) {
        target.copy(chargePosition);
        target.y += (1 - easeOutBack(clampUnit(charge / 0.4))) * 2.2;
      } else {
        target.set(slot.x, slot.y, slot.z).lerp(chargePosition, easeInOutCubic(clampUnit(charge / 0.4)));
      }
      target.y += Math.sin(turn * Math.PI) * 0.3 + Math.sin(time * 2.2) * 0.04 * motion;
      group.rotation.y = turn * Math.PI * 2 * motion;
      rotationX = -Math.sin(turn * Math.PI) * 0.25 * motion;
      const shake = tension ** 2.5 * motion;
      target.x += (Math.sin(time * 71) * 0.035 + Math.sin(time * 113) * 0.02) * shake;
      target.y += Math.sin(time * 59) * 0.03 * shake;
      rotationZ = Math.sin(time * 43) * 0.06 * shake;
      const inhale = Math.sin(clampUnit((charge - 0.86) / 0.14) * Math.PI) * 0.06;
      scale = layout.packScale * (1.08 + tension * 0.16 - inhale);
      emissiveIntensity = 0.2 + charge * 0.6;
      glowMix = clampUnit((charge - 0.4) / 0.45);
      seamIntensity = clampUnit((charge - 0.55) / 0.45) ** 2 * 1.1;
    } else if (selected && phase === PackOpeningPhase.BURST.value) {
      const tear = easeInOutCubic(clampUnit(elapsed / 0.5));
      const fade = clampUnit((elapsed - 0.2) / 0.55);
      seamIntensity = 1.6 * (1 - clampUnit(elapsed / 0.3));
      target.copy(chargePosition);
      group.rotation.y = 0;
      scale = layout.packScale * (1.28 + Math.sin(clampUnit(elapsed / 0.2) * Math.PI) * 0.12);
      stripOffset = tear;
      bodyDrop = fade * fade * 1.4;
      opacity = 1 - fade;
      emissiveIntensity = 1;
      glowMix = 1;
    } else if (phase === PackOpeningPhase.CHARGING.value) {
      const scatter = easeInOutCubic(clampUnit(elapsed / 0.9));
      target.set(slot.x * (1 + scatter * 1.2), slot.y - scatter * 4.5, slot.z - scatter * 1.5);
      group.rotation.y = slot.rotationY + scatter * 4 * motion;
      opacity = 1 - scatter;
    } else {
      target.set(slot.x, -6, slot.z);
      opacity = 0;
      snap = false;
    }

    if (snap) {
      group.position.copy(target);
    } else {
      group.position.lerp(target, ease);
    }
    group.rotation.z = rotationZ;
    group.rotation.x = rotationX;
    group.scale.setScalar(group.scale.x + (scale - group.scale.x) * ease);
    strip.current.position.set(stripOffset * 1.6, BODY_HEIGHT / 2 + stripOffset * 2.6, stripOffset * 1.1);
    strip.current.rotation.set(stripOffset * 2.2, stripOffset * 1.4, -stripOffset * 4.2);
    body.current.position.y = -STRIP_HEIGHT / 2 - bodyDrop;
    const fading = opacity < 0.999;
    sideMaterial.opacity = opacity;
    sideMaterial.transparent = fading;
    sideMaterial.emissive.copy(BASE_GLOW).lerp(hit, glowMix);
    sideMaterial.emissiveIntensity += (emissiveIntensity - sideMaterial.emissiveIntensity) * ease;
    for (const material of Object.values(wrapperMaterials)) {
      material.opacity = opacity;
      material.transparent = fading;
    }
    group.visible = opacity > 0.01 && group.position.y > -4;
    if (seam.current) {
      seam.current.visible = seamIntensity > 0.01;
      seamMaterial.uniforms.uTime!.value = time;
      seamMaterial.uniforms.uIntensity!.value = seamIntensity;
      seamMaterial.uniforms.uColor!.value.copy(BASE_GLOW).lerp(hit, glowMix);
    }
  });

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onActivate(index);
  }

  return (
    <group ref={root} position={[0, -6, 0]} scale={0.8} onClick={handleClick}>
      <group ref={strip} position-y={BODY_HEIGHT / 2}>
        <PackPiece
          height={STRIP_HEIGHT}
          frontMaterial={wrapperMaterials.stripFront}
          backMaterial={wrapperMaterials.stripBack}
          sideMaterial={sideMaterial}
        />
      </group>
      <mesh ref={seam} position={[0, SEAM_Y, DEPTH / 2 + 0.06]} material={seamMaterial} visible={false}>
        <planeGeometry args={[WIDTH * 1.5, 0.6]} />
      </mesh>
      <group ref={body} position-y={-STRIP_HEIGHT / 2}>
        <PackPiece
          height={BODY_HEIGHT}
          frontMaterial={wrapperMaterials.bodyFront}
          backMaterial={wrapperMaterials.bodyBack}
          sideMaterial={sideMaterial}
        />
      </group>
    </group>
  );
}
