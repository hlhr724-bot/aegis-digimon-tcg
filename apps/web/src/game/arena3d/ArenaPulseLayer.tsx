import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  NormalBlending,
  Plane,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import type { ArenaCameraImpulse } from "@/game/arena3d/ArenaCameraImpulse";
import type { ArenaPulse, ScreenPoint } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import { findArenaPulseKind, type ArenaPulseKindEntry } from "@/game/arena3d/findArenaPulseKind";
import { getOppositeSide } from "@/game/arena3d/getOppositeSide";
import { pushArenaRipple } from "@/game/arena3d/pushArenaRipple";
import { SIDE_DEPTH } from "@/game/arena3d/arenaSceneLayout";
import { Side } from "@/game/side";

type Props = {
  pulses: readonly ArenaPulse[];
  ripples: ArenaRippleBuffer;
  impulse: RefObject<ArenaCameraImpulse>;
  energy: { current: number };
  activity: RefObject<ArenaActivity>;
  isLight: boolean;
  reducedMotion: boolean;
};

type ActiveEffect = {
  key: string;
  entry: ArenaPulseKindEntry;
  color: string;
  position: Vector3;
  target?: Vector3;
  burst?: boolean;
  startedAt: number;
};

type BurstProps = {
  color: string;
  startedAt: number;
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
  onDone: (key: string) => void;
};

const SHARD_COUNT = 8;
const BEAM_TRAVEL_SECONDS = 0.38;
const BEAM_WIDTH = 0.9;
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

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

const BURST_SECONDS = 0.75;
const BURST_SIZE = 7.5;

function ImpactBurst({ color, startedAt }: BurstProps) {
  const camera = useThree((state) => state.camera);
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: RING_VERTEX_SHADER,
        fragmentShader: BURST_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 },
          uSpin: { value: Math.random() * 6 },
          uColor: { value: new Color(color) },
        },
      }),
    [color],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const age = state.clock.elapsedTime - startedAt;
    material.uniforms.uProgress!.value = Math.min(1, Math.max(0, age / BURST_SECONDS));
    material.uniforms.uSpin!.value += 0.02;
    if (mesh.current) {
      mesh.current.quaternion.copy(camera.quaternion);
      mesh.current.visible = age >= 0 && age < BURST_SECONDS;
    }
  });

  return (
    <mesh ref={mesh} position-y={1.4} material={material} renderOrder={10}>
      <planeGeometry args={[BURST_SIZE, BURST_SIZE]} />
    </mesh>
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
      material={material}
    >
      <planeGeometry args={[layout.length, BEAM_WIDTH]} />
    </mesh>
  );
}

function buildShardDirections(): Vector3[] {
  return Array.from({ length: SHARD_COUNT }, (_, index) => {
    const angle = (index / SHARD_COUNT) * Math.PI * 2 + Math.random() * 0.4;
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

function PulseEffect({ effect, isLight, onDone }: EffectProps) {
  const { entry, color, position, target, burst, startedAt, key } = effect;
  const root = useRef<Group>(null);
  const pillar = useRef<Group>(null);
  const helix = useRef<Group>(null);
  const shards = useRef<Group>(null);
  const finished = useRef(false);
  const ringMaterial = useMemo(() => createRingMaterial(color, isLight), [color, isLight]);
  const pillarMaterial = useMemo(() => createPillarMaterial(color, isLight), [color, isLight]);
  const helixMaterial = useMemo(
    () => new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.4), transparent: true }),
    [color],
  );
  const shardMaterial = useMemo(
    () => new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.8), transparent: true }),
    [color],
  );
  const shardDirections = useMemo(buildShardDirections, []);
  const ringSize = entry.ringRadius * 2.4;

  useEffect(
    () => () => {
      ringMaterial.dispose();
      pillarMaterial.dispose();
      helixMaterial.dispose();
      shardMaterial.dispose();
    },
    [ringMaterial, pillarMaterial, helixMaterial, shardMaterial],
  );

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
    ringMaterial.uniforms.uRadius!.value = getRingRadius(entry, progress) * 0.8;
    ringMaterial.uniforms.uAlpha!.value = fade * fade;
    ringMaterial.uniforms.uWidth!.value = 0.03 + progress * 0.05;
    if (pillar.current) {
      const rise = easeOutCubic(Math.min(1, progress * 2.5));
      pillar.current.scale.set(1 + progress * 0.6, Math.max(0.001, rise), 1 + progress * 0.6);
      pillarMaterial.uniforms.uTime!.value = age;
      pillarMaterial.uniforms.uAlpha!.value = fade;
    }
    if (helix.current) {
      helix.current.rotation.y = age * 6;
      helix.current.children.forEach((child, index) => {
        const climb = (progress * 1.6 + index * 0.33) % 1;
        child.position.y = climb * entry.pillarHeight;
        child.scale.setScalar(1 - climb * 0.6);
      });
      helixMaterial.opacity = fade;
    }
    if (shards.current) {
      shards.current.children.forEach((child, index) => {
        const direction = shardDirections[index]!;
        child.position.set(direction.x * age, direction.y * age - 4.9 * age * age + 0.3, direction.z * age);
        child.rotation.set(age * 7 + index, age * 5, 0);
      });
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
        {burst ? <ImpactBurst color={color} startedAt={startedAt} /> : null}
        {entry.hasRing ? (
          <mesh rotation-x={-Math.PI / 2} position-y={0.06} material={ringMaterial}>
            <planeGeometry args={[ringSize, ringSize]} />
          </mesh>
        ) : null}
        {entry.pillarHeight > 0 ? (
          <group ref={pillar}>
            <mesh position-y={entry.pillarHeight / 2} material={pillarMaterial}>
              <cylinderGeometry args={[0.7, 0.9, entry.pillarHeight, 16, 1, true]} />
            </mesh>
          </group>
        ) : null}
        {entry.value === ArenaPulseKind.EVOLVE.value ? (
          <group ref={helix}>
            {[0, 1, 2].map((index) => (
              <mesh key={index} rotation-x={Math.PI / 2} material={helixMaterial}>
                <torusGeometry args={[1.05, 0.04, 6, 32]} />
              </mesh>
            ))}
          </group>
        ) : null}
        {entry.value === ArenaPulseKind.DELETE.value || entry.value === ArenaPulseKind.IMPACT.value ? (
          <group ref={shards}>
            {shardDirections.map((_, index) => (
              <mesh key={index} material={shardMaterial}>
                <tetrahedronGeometry args={[0.16, 0]} />
              </mesh>
            ))}
          </group>
        ) : null}
      </group>
    </group>
  );
}

function getSideAnchor(side: Side): Vector3 {
  return new Vector3(0, 0, side === Side.Viewer ? SIDE_DEPTH : -SIDE_DEPTH);
}

export function ArenaPulseLayer({ pulses, ripples, impulse, energy, activity, isLight, reducedMotion }: Props) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const clock = useThree((state) => state.clock);
  const [effects, setEffects] = useState<readonly ActiveEffect[]>([]);
  const started = useRef(new Set<string>());
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    const projectToFloor = (point: ScreenPoint | undefined, side: Side): Vector3 => {
      const rect = canvas.getBoundingClientRect();
      if (!point || rect.width === 0 || rect.height === 0) {
        return getSideAnchor(side);
      }
      const normalized = new Vector2(
        ((point.x - rect.left) / rect.width) * 2 - 1,
        -((point.y - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(normalized, camera);
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
      if (entry.hasRing) {
        pushArenaRipple({
          buffer: ripples,
          x: position.x,
          z: position.z,
          startedAt: now,
          strength: 0.8,
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
          strength: 1.2,
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
  }, [pulses, camera, canvas, clock, raycaster, ripples, impulse, energy, activity, reducedMotion]);

  const removeEffect = (key: string) => {
    setEffects((current) => current.filter((effect) => effect.key !== key));
  };

  return (
    <>
      {effects.map((effect) => (
        <PulseEffect key={effect.key} effect={effect} isLight={isLight} onDone={removeEffect} />
      ))}
    </>
  );
}
