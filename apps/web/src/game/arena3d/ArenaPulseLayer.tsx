import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  Plane,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Group,
  type InstancedMesh,
  type Mesh,
} from "three";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import type { ArenaCameraImpulse } from "@/game/arena3d/ArenaCameraImpulse";
import type { ArenaPulse, ScreenPoint } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import {
  ARENA_PULSE_HELIX_GEOMETRY,
  ARENA_PULSE_PILLAR_GEOMETRY,
  ARENA_PULSE_PLANE_GEOMETRY,
  ARENA_PULSE_SHARD_GEOMETRY,
} from "@/game/arena3d/effects/arenaPulseGeometry";
import { findArenaPulseKind, type ArenaPulseKindEntry } from "@/game/arena3d/findArenaPulseKind";
import { getOppositeSide } from "@/game/arena3d/getOppositeSide";
import { pushArenaRipple } from "@/game/arena3d/pushArenaRipple";
import { SIDE_DEPTH } from "@/game/arena3d/arenaSceneLayout";
import { Side } from "@/game/side";
import { FINALE_IMPACT_AT_MS } from "@/game/timings";

type Props = {
  pulses: readonly ArenaPulse[];
  projectionCamera: Camera;
  ripples: ArenaRippleBuffer;
  impulse: RefObject<ArenaCameraImpulse>;
  energy: { current: number };
  activity: RefObject<ArenaActivity>;
  isLight: boolean;
  shardCount: number;
  reducedMotion: boolean;
};

type ActiveEffect = {
  key: string;
  entry: ArenaPulseKindEntry;
  color: string;
  position: Vector3;
  target?: Vector3;
  burst?: boolean;
  burstScale?: number;
  shardScale?: number;
  calm?: boolean;
  startedAt: number;
};

type BurstProps = {
  color: string;
  startedAt: number;
  scale: number;
};

type FinaleParams = {
  pulse: ArenaPulse;
  entry: ArenaPulseKindEntry;
  target: Vector3;
  now: number;
  ripples: ArenaRippleBuffer;
  impulse: RefObject<ArenaCameraImpulse>;
  energy: { current: number };
  activity: RefObject<ArenaActivity>;
  reducedMotion: boolean;
};

type BeamProps = {
  from: Vector3;
  to: Vector3;
  color: string;
  isLight: boolean;
  startedAt: number;
  durationSeconds: number;
};

type EffectProps = {
  effect: ActiveEffect;
  isLight: boolean;
  shardCount: number;
  onDone: (key: string) => void;
};

type PulseMaterialParams = {
  entry: ArenaPulseKindEntry;
  color: string;
  isLight: boolean;
  calm: boolean;
};

type PulseMaterials = {
  ring?: ShaderMaterial;
  pillar?: ShaderMaterial;
  helix?: MeshBasicMaterial;
  shard?: MeshBasicMaterial;
};

const BEAM_TRAVEL_SECONDS = 0.38;
const BEAM_WIDTH = 0.55;
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const HELIX_RINGS = [0, 1, 2];
const SHARD_PLACER = new Object3D();
const KEEPER_COLOR = "#ffffff";

const RING_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT_SHADER = `
  uniform float uRadius;
  uniform float uWidth;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float radius = length(vUv * 2.0 - 1.0);
    float gap = abs(radius - uRadius);
    float ring = exp(-gap * gap / (uWidth * uWidth));
    float inner = smoothstep(uRadius, 0.0, radius) * 0.25;
    gl_FragColor = vec4(uColor * 2.2, (ring + inner) * uAlpha);
    #include <colorspace_fragment>
  }
`;

const PILLAR_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PILLAR_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float vertical = 1.0 - vUv.y;
    float scan = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 18.0);
    float streak = 0.6 + 0.4 * sin(vUv.x * 6.2831853 * 6.0 + uTime * 4.0);
    float alpha = pow(vertical, 1.6) * scan * streak * uAlpha;
    gl_FragColor = vec4(uColor * 2.6, alpha);
    #include <colorspace_fragment>
  }
`;

const BEAM_FRAGMENT_SHADER = `
  uniform float uHead;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float core = pow(across, 6.0);
    float glow = pow(across, 1.5) * 0.35;
    float behind = uHead - vUv.x;
    float trail = behind >= 0.0 ? exp(-behind * 3.0) : 0.0;
    float head = exp(-pow((vUv.x - uHead) * 18.0, 2.0)) * 2.0;
    float alpha = (core + glow) * (trail + head) * uAlpha;
    gl_FragColor = vec4(uColor * (2.0 + head), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

const BURST_FRAGMENT_SHADER = `
  uniform float uProgress;
  uniform float uSpin;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float grow = 1.0 - pow(1.0 - uProgress, 3.0);
    float reach = mix(0.2, 1.0, grow);
    float rays = pow(abs(sin(angle * 13.0 + uSpin)), 14.0) + pow(abs(sin(angle * 7.0 - uSpin * 0.6 + 1.3)), 24.0) * 0.8;
    float rayMask = rays * smoothstep(reach, reach * 0.25, radius);
    float core = exp(-radius * radius * 10.0 / (0.15 + uProgress));
    float ring = exp(-pow((radius - reach * 0.8) * 12.0, 2.0)) * 0.7;
    vec3 warm = mix(uColor, vec3(1.0, 0.78, 0.25), 0.55);
    vec3 color = mix(warm, vec3(1.0, 0.97, 0.88), clamp(core * 1.4, 0.0, 1.0));
    float fade = pow(1.0 - uProgress, 1.4);
    float alpha = (rayMask * 1.2 + core * 1.6 + ring) * fade;
    gl_FragColor = vec4(color * 1.6, clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

const BURST_SECONDS = 0.55;
const BURST_SIZE = 3.6;
const FINALE_IMPACT_SECONDS = FINALE_IMPACT_AT_MS / 1000;
const FINALE_ECHO_SECONDS = 0.14;
const FINALE_RIPPLES = [
  { delay: 0, strength: 1.5 },
  { delay: 0.16, strength: 1 },
  { delay: 0.38, strength: 0.6 },
];

function createBurstMaterial(color: string, spin: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: BURST_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uSpin: { value: spin },
      uColor: { value: new Color(color) },
    },
  });
}

function ImpactBurst({ color, startedAt, scale }: BurstProps) {
  const camera = useThree((state) => state.camera);
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => createBurstMaterial(color, Math.random() * 6), [color]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const age = state.clock.elapsedTime - startedAt;
    const seconds = BURST_SECONDS * Math.sqrt(scale);
    material.uniforms.uProgress!.value = Math.min(1, Math.max(0, age / seconds));
    material.uniforms.uSpin!.value += 0.02;
    if (mesh.current) {
      mesh.current.quaternion.copy(camera.quaternion);
      mesh.current.visible = age >= 0 && age < seconds;
    }
  });

  return (
    <mesh
      ref={mesh}
      position-y={1.4 * scale}
      scale={BURST_SIZE * scale}
      geometry={ARENA_PULSE_PLANE_GEOMETRY}
      material={material}
      renderOrder={10}
    />
  );
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function createRingMaterial(color: string, isLight: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: RING_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: isLight ? NormalBlending : AdditiveBlending,
    uniforms: {
      uRadius: { value: 0 },
      uWidth: { value: 0.05 },
      uAlpha: { value: 1 },
      uColor: { value: new Color(color) },
    },
  });
}

function createPillarMaterial(color: string, isLight: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: PILLAR_VERTEX_SHADER,
    fragmentShader: PILLAR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: isLight ? NormalBlending : AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uColor: { value: new Color(color) },
    },
  });
}

function createBeamMaterial(color: string, isLight: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: isLight ? NormalBlending : AdditiveBlending,
    uniforms: {
      uHead: { value: 0 },
      uAlpha: { value: 1 },
      uColor: { value: new Color(color) },
    },
  });
}

function createHelixMaterial(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.4), transparent: true });
}

function createShardMaterial(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.8), transparent: true });
}

function hasHelix(entry: ArenaPulseKindEntry): boolean {
  return entry.value === ArenaPulseKind.EVOLVE.value;
}

function hasShards(entry: ArenaPulseKindEntry): boolean {
  return (
    entry.value === ArenaPulseKind.DELETE.value ||
    entry.value === ArenaPulseKind.IMPACT.value ||
    entry.value === ArenaPulseKind.FINALE.value
  );
}

function createPulseMaterials({ entry, color, isLight, calm }: PulseMaterialParams): PulseMaterials {
  return {
    ring: entry.hasRing ? createRingMaterial(color, isLight) : undefined,
    pillar: !calm && entry.pillarHeight > 0 ? createPillarMaterial(color, isLight) : undefined,
    helix: !calm && hasHelix(entry) ? createHelixMaterial(color) : undefined,
    shard: !calm && hasShards(entry) ? createShardMaterial(color) : undefined,
  };
}

function disposePulseMaterials(materials: PulseMaterials) {
  materials.ring?.dispose();
  materials.pillar?.dispose();
  materials.helix?.dispose();
  materials.shard?.dispose();
}

function Beam({ from, to, color, isLight, startedAt, durationSeconds }: BeamProps) {
  const material = useMemo(() => createBeamMaterial(color, isLight), [color, isLight]);
  const layout = useMemo(() => {
    const delta = new Vector3().subVectors(to, from);
    return {
      length: Math.max(0.01, Math.hypot(delta.x, delta.z)),
      angle: Math.atan2(-delta.z, delta.x),
      middle: new Vector3().addVectors(from, to).multiplyScalar(0.5),
    };
  }, [from, to]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const age = state.clock.elapsedTime - startedAt;
    material.uniforms.uHead!.value = Math.min(1.15, age / BEAM_TRAVEL_SECONDS);
    material.uniforms.uAlpha!.value = Math.max(0, 1 - age / durationSeconds);
  });

  return (
    <mesh
      position={[layout.middle.x, 0.08, layout.middle.z]}
      rotation={[-Math.PI / 2, 0, layout.angle]}
      scale={[layout.length, BEAM_WIDTH, 1]}
      geometry={ARENA_PULSE_PLANE_GEOMETRY}
      material={material}
    />
  );
}

function buildShardDirections(count: number): Vector3[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
    return new Vector3(Math.cos(angle), 1.2 + Math.random() * 1.4, Math.sin(angle)).multiplyScalar(
      2 + Math.random() * 2,
    );
  });
}

function getRingRadius(entry: ArenaPulseKindEntry, progress: number): number {
  if (entry.value === ArenaPulseKind.DELETE.value) {
    return 1 - easeOutCubic(progress);
  }
  return easeOutCubic(progress);
}

function PulseEffect({ effect, isLight, shardCount, onDone }: EffectProps) {
  const {
    entry,
    color,
    position,
    target,
    burst,
    burstScale = 1,
    shardScale = 1,
    calm = false,
    startedAt,
    key,
  } = effect;
  const root = useRef<Group>(null);
  const pillar = useRef<Group>(null);
  const helix = useRef<Group>(null);
  const shards = useRef<InstancedMesh>(null);
  const finished = useRef(false);
  const materials = useMemo(() => createPulseMaterials({ entry, color, isLight, calm }), [entry, color, isLight, calm]);
  const shardDirections = useMemo(
    () => buildShardDirections(Math.round(shardCount * shardScale)),
    [shardCount, shardScale],
  );
  const ringSize = entry.ringRadius * 2.4;

  useEffect(() => () => disposePulseMaterials(materials), [materials]);

  useFrame((state) => {
    const age = state.clock.elapsedTime - startedAt;
    if (root.current) {
      root.current.visible = age >= 0;
    }
    if (age < 0) {
      return;
    }
    const progress = Math.min(1, age / entry.durationSeconds);
    if (progress >= 1 && !finished.current) {
      finished.current = true;
      onDone(key);
      return;
    }
    const fade = 1 - progress;
    const { ring, pillar: pillarMaterial, helix: helixMaterial, shard: shardMaterial } = materials;
    if (ring) {
      ring.uniforms.uRadius!.value = getRingRadius(entry, progress) * 0.8;
      ring.uniforms.uAlpha!.value = fade * fade;
      ring.uniforms.uWidth!.value = 0.03 + progress * 0.05;
    }
    if (pillar.current && pillarMaterial) {
      const rise = easeOutCubic(Math.min(1, progress * 2.5));
      pillar.current.scale.set(1 + progress * 0.6, Math.max(0.001, rise), 1 + progress * 0.6);
      pillarMaterial.uniforms.uTime!.value = age;
      pillarMaterial.uniforms.uAlpha!.value = fade;
    }
    if (helix.current && helixMaterial) {
      helix.current.rotation.y = age * 6;
      const rings = helix.current.children;
      for (let index = 0; index < rings.length; index += 1) {
        const climb = (progress * 1.6 + index * 0.33) % 1;
        rings[index]!.position.y = climb * entry.pillarHeight;
        rings[index]!.scale.setScalar(1 - climb * 0.6);
      }
      helixMaterial.opacity = fade;
    }
    if (shards.current && shardMaterial) {
      for (let index = 0; index < shardDirections.length; index += 1) {
        const direction = shardDirections[index]!;
        SHARD_PLACER.position.set(direction.x * age, direction.y * age - 4.9 * age * age + 0.3, direction.z * age);
        SHARD_PLACER.rotation.set(age * 7 + index, age * 5, 0);
        SHARD_PLACER.updateMatrix();
        shards.current.setMatrixAt(index, SHARD_PLACER.matrix);
      }
      shards.current.instanceMatrix.needsUpdate = true;
      shardMaterial.opacity = fade;
    }
  });

  return (
    <group ref={root}>
      {target ? (
        <Beam
          from={position}
          to={target}
          color={color}
          isLight={isLight}
          startedAt={startedAt}
          durationSeconds={entry.durationSeconds}
        />
      ) : null}
      <group position={position}>
        {burst ? <ImpactBurst color={color} startedAt={startedAt} scale={burstScale} /> : null}
        {materials.ring ? (
          <mesh
            rotation-x={-Math.PI / 2}
            position-y={0.06}
            scale={ringSize}
            geometry={ARENA_PULSE_PLANE_GEOMETRY}
            material={materials.ring}
          />
        ) : null}
        {materials.pillar ? (
          <group ref={pillar}>
            <mesh
              position-y={entry.pillarHeight / 2}
              scale-y={entry.pillarHeight}
              geometry={ARENA_PULSE_PILLAR_GEOMETRY}
              material={materials.pillar}
            />
          </group>
        ) : null}
        {materials.helix ? (
          <group ref={helix}>
            {HELIX_RINGS.map((index) => (
              <mesh
                key={index}
                rotation-x={Math.PI / 2}
                geometry={ARENA_PULSE_HELIX_GEOMETRY}
                material={materials.helix}
              />
            ))}
          </group>
        ) : null}
        {materials.shard ? (
          <instancedMesh
            ref={shards}
            args={[ARENA_PULSE_SHARD_GEOMETRY, materials.shard, shardDirections.length]}
            frustumCulled={false}
          />
        ) : null}
      </group>
    </group>
  );
}

function PulseShaderKeepers() {
  const materials = useMemo(
    () => ({
      ring: createRingMaterial(KEEPER_COLOR, false),
      pillar: createPillarMaterial(KEEPER_COLOR, false),
      beam: createBeamMaterial(KEEPER_COLOR, false),
      burst: createBurstMaterial(KEEPER_COLOR, 0),
      helix: createHelixMaterial(KEEPER_COLOR),
      shard: createShardMaterial(KEEPER_COLOR),
    }),
    [],
  );

  useEffect(
    () => () => {
      for (const material of Object.values(materials)) {
        material.dispose();
      }
    },
    [materials],
  );

  return (
    <group visible={false}>
      <mesh geometry={ARENA_PULSE_PLANE_GEOMETRY} material={materials.ring} />
      <mesh geometry={ARENA_PULSE_PILLAR_GEOMETRY} material={materials.pillar} />
      <mesh geometry={ARENA_PULSE_PLANE_GEOMETRY} material={materials.beam} />
      <mesh geometry={ARENA_PULSE_PLANE_GEOMETRY} material={materials.burst} />
      <mesh geometry={ARENA_PULSE_HELIX_GEOMETRY} material={materials.helix} />
      <instancedMesh args={[ARENA_PULSE_SHARD_GEOMETRY, materials.shard, 1]} frustumCulled={false} />
    </group>
  );
}

function startFinale({
  pulse,
  entry,
  target,
  now,
  ripples,
  impulse,
  energy,
  activity,
  reducedMotion,
}: FinaleParams): ActiveEffect[] {
  const impactAt = now + (reducedMotion ? 0 : FINALE_IMPACT_SECONDS);
  const waves = reducedMotion ? FINALE_RIPPLES.slice(0, 1) : FINALE_RIPPLES;
  for (const wave of waves) {
    pushArenaRipple({
      buffer: ripples,
      x: target.x,
      z: target.z,
      startedAt: impactAt + wave.delay,
      strength: reducedMotion ? 0.6 : wave.strength,
      color: pulse.color,
    });
  }
  if (!reducedMotion) {
    impulse.current = { strength: entry.shake, startedAt: impactAt };
  }
  energy.current = 1.5;
  activity.current.busyUntil = Math.max(
    activity.current.busyUntil,
    performance.now() + (impactAt - now + entry.durationSeconds + 1.2) * 1000,
  );
  const finale: ActiveEffect = {
    key: pulse.key,
    entry,
    color: pulse.color,
    position: target,
    burst: !reducedMotion,
    burstScale: 2.2,
    shardScale: 3,
    calm: reducedMotion,
    startedAt: impactAt,
  };
  if (reducedMotion) {
    return [finale];
  }
  return [
    finale,
    {
      key: `${pulse.key}:echo`,
      entry: findArenaPulseKind(ArenaPulseKind.SECURITY.value),
      color: pulse.color,
      position: target,
      startedAt: impactAt + FINALE_ECHO_SECONDS,
    },
  ];
}

function getSideAnchor(side: Side): Vector3 {
  return new Vector3(0, 0, side === Side.Viewer ? SIDE_DEPTH : -SIDE_DEPTH);
}

export function ArenaPulseLayer({
  pulses,
  projectionCamera,
  ripples,
  impulse,
  energy,
  activity,
  isLight,
  shardCount,
  reducedMotion,
}: Props) {
  const canvas = useThree((state) => state.gl.domElement);
  const clock = useThree((state) => state.clock);
  const [effects, setEffects] = useState<readonly ActiveEffect[]>([]);
  const started = useRef(new Set<string>());
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    let canvasRect: DOMRect | undefined;
    const projectToFloor = (point: ScreenPoint | undefined, side: Side): Vector3 => {
      canvasRect ??= canvas.getBoundingClientRect();
      const rect = canvasRect;
      if (!point || rect.width === 0 || rect.height === 0) {
        return getSideAnchor(side);
      }
      const normalized = new Vector2(
        ((point.x - rect.left) / rect.width) * 2 - 1,
        -((point.y - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(normalized, projectionCamera);
      const hit = raycaster.ray.intersectPlane(FLOOR_PLANE, new Vector3());
      return hit ?? getSideAnchor(side);
    };
    const fresh: ActiveEffect[] = [];
    for (const pulse of pulses) {
      if (started.current.has(pulse.key)) {
        continue;
      }
      started.current.add(pulse.key);
      const entry = findArenaPulseKind(pulse.kind);
      const now = clock.elapsedTime;
      const position = projectToFloor(pulse.screenPoint, pulse.side);
      const target = pulse.targetPoint ? projectToFloor(pulse.targetPoint, getOppositeSide(pulse.side)) : undefined;
      if (entry.value === ArenaPulseKind.FINALE.value) {
        fresh.push(
          ...startFinale({
            pulse,
            entry,
            target: target ?? getSideAnchor(getOppositeSide(pulse.side)),
            now,
            ripples,
            impulse,
            energy,
            activity,
            reducedMotion,
          }),
        );
        continue;
      }
      if (entry.hasRing) {
        pushArenaRipple({
          buffer: ripples,
          x: position.x,
          z: position.z,
          startedAt: now,
          strength: 0.5,
          color: pulse.color,
        });
      }
      if (target) {
        const arrival = now + BEAM_TRAVEL_SECONDS;
        pushArenaRipple({
          buffer: ripples,
          x: target.x,
          z: target.z,
          startedAt: arrival,
          strength: 0.7,
          color: pulse.color,
        });
        fresh.push({
          key: `${pulse.key}:arrival`,
          entry: findArenaPulseKind(ArenaPulseKind.IMPACT.value),
          color: pulse.color,
          position: target,
          burst: true,
          startedAt: arrival,
        });
      }
      if (entry.value === ArenaPulseKind.TURN.value) {
        ripples.sweepStart = now;
        ripples.sweepDirection = pulse.side === Side.Viewer ? 1 : -1;
        ripples.sweepColor.set(pulse.color);
      }
      if (!reducedMotion && entry.shake > 0) {
        impulse.current = { strength: Math.max(entry.shake, impulse.current.strength), startedAt: now };
      }
      energy.current = Math.min(1.5, energy.current + entry.shake * 3 + 0.2);
      const burst =
        !target && (entry.value === ArenaPulseKind.IMPACT.value || entry.value === ArenaPulseKind.SECURITY.value);
      activity.current.busyUntil = Math.max(
        activity.current.busyUntil,
        performance.now() + (entry.durationSeconds + BEAM_TRAVEL_SECONDS + 1.2) * 1000,
      );
      fresh.push({ key: pulse.key, entry, color: pulse.color, position, target, burst, startedAt: now });
    }
    if (fresh.length > 0) {
      setEffects((current) => [...current, ...fresh]);
    }
  }, [pulses, projectionCamera, canvas, clock, raycaster, ripples, impulse, energy, activity, reducedMotion]);

  const removeEffect = (key: string) => {
    setEffects((current) => current.filter((effect) => effect.key !== key));
  };

  return (
    <>
      <PulseShaderKeepers />
      {effects.map((effect) => (
        <PulseEffect key={effect.key} effect={effect} isLight={isLight} shardCount={shardCount} onDone={removeEffect} />
      ))}
    </>
  );
}
