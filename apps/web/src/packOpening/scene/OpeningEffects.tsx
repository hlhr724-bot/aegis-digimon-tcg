import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Points,
  ShaderMaterial,
  type Texture,
} from "three";
import { PackOpeningPhase } from "@/packOpening/PackOpeningPhase";

type Vector = [number, number, number];

type Props = {
  playbackRate: number;
  phase: PackOpeningPhase;
  phaseStartedAt: RefObject<number>;
  chargePosition: Vector;
  hitColor: string;
  prismatic: boolean;
  reducedMotion: boolean;
};

const ENERGY_COLOR = new Color("#5ff0ff");
const WHITE = new Color("#ffffff");
const STREAM_COUNT = 170;
const SPARK_COUNT = 300;
const GLITTER_COUNT = 140;

const PLAIN_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PILLAR_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float core = pow(max(across, 0.0), 6.0) * 2.2 + pow(max(across, 0.0), 1.5) * 0.45;
    float fall = smoothstep(1.0, 0.1, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
    float flicker = 0.85 + 0.15 * sin(vUv.y * 40.0 - uTime * 30.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.45) * core * fall * flicker * uIntensity, 1.0);
  }
`;

const SHOCKWAVE_FRAGMENT_SHADER = `
  uniform float uProgress;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float radius = length(vUv - 0.5) * 2.0;
    float front = exp(-pow((radius - uProgress) * 14.0, 2.0));
    float wake = smoothstep(uProgress, 0.0, radius) * 0.25 * step(radius, uProgress);
    float fade = (1.0 - uProgress) * step(0.0, uProgress) * step(uProgress, 1.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), front * 0.4) * (front * 1.8 + wake) * fade, 1.0);
  }
`;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildGlowTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.7)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

const PARTICLE_VERTEX_SHADER = `
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float pointSize = aSize * uScale / max(-viewPosition.z, 0.001);
    vAlpha = aAlpha * smoothstep(2.0, 5.0, pointSize);
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceSquared = dot(point, point) * 4.0;
    if (distanceSquared > 1.0) {
      discard;
    }
    float glow = exp(-distanceSquared * 4.0) * (1.0 - distanceSquared) + exp(-distanceSquared * 30.0) * 0.6;
    gl_FragColor = vec4(uColor * glow * vAlpha * uOpacity, 1.0);
  }
`;

function buildParticleMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0 }, uScale: { value: 1 } },
  });
}

type ShaderParams = {
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
};

function buildGlowShader({ fragmentShader, uniforms }: ShaderParams): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: PLAIN_VERTEX_SHADER,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

function buildSeeds(count: number, dimensions: number): Float32Array {
  return Float32Array.from({ length: count * dimensions }, () => Math.random());
}

type ParticleGeometryParams = {
  count: number;
  minimumSize: number;
  maximumSize: number;
};

function buildParticleGeometry({ count, minimumSize, maximumSize }: ParticleGeometryParams): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aAlpha", new BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute(
    "aSize",
    new BufferAttribute(
      Float32Array.from({ length: count }, () => minimumSize + Math.random() * (maximumSize - minimumSize)),
      1,
    ),
  );
  return geometry;
}

type ParticleUniformParams = {
  material: ShaderMaterial;
  color: Color;
  opacity: number;
  scale: number;
};

function setParticleUniforms({ material, color, opacity, scale }: ParticleUniformParams) {
  material.uniforms.uColor!.value.copy(color);
  material.uniforms.uOpacity!.value = opacity;
  material.uniforms.uScale!.value = scale;
}

export function OpeningEffects({
  playbackRate,
  phase,
  phaseStartedAt,
  chargePosition,
  hitColor,
  prismatic,
  reducedMotion,
}: Props) {
  const pillar = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);
  const shockwave = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const stream = useRef<Points>(null);
  const sparks = useRef<Points>(null);
  const glitter = useRef<Points>(null);
  const hit = useMemo(() => new Color(hitColor), [hitColor]);
  const color = useMemo(() => new Color(), []);
  const glowSprite = useMemo(buildGlowTexture, []);
  const particleColor = useMemo(() => new Color(), []);
  const materials = useMemo(
    () => ({
      pillar: buildGlowShader({
        fragmentShader: PILLAR_FRAGMENT_SHADER,
        uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: new Color() } },
      }),
      shockwave: buildGlowShader({
        fragmentShader: SHOCKWAVE_FRAGMENT_SHADER,
        uniforms: { uProgress: { value: -1 }, uColor: { value: new Color() } },
      }),
      halo: buildGlowShader({
        fragmentShader: SHOCKWAVE_FRAGMENT_SHADER,
        uniforms: { uProgress: { value: -1 }, uColor: { value: new Color() } },
      }),
      stream: buildParticleMaterial(),
      sparks: buildParticleMaterial(),
      glitter: buildParticleMaterial(),
    }),
    [],
  );
  const streamSeeds = useMemo(() => buildSeeds(STREAM_COUNT, 3), []);
  const sparkSeeds = useMemo(() => buildSeeds(SPARK_COUNT, 3), []);
  const glitterSeeds = useMemo(() => buildSeeds(GLITTER_COUNT, 3), []);
  const streamGeometry = useMemo(
    () => buildParticleGeometry({ count: STREAM_COUNT, minimumSize: 0.07, maximumSize: 0.14 }),
    [],
  );
  const sparkGeometry = useMemo(
    () => buildParticleGeometry({ count: SPARK_COUNT, minimumSize: 0.06, maximumSize: 0.13 }),
    [],
  );
  const glitterGeometry = useMemo(
    () => buildParticleGeometry({ count: GLITTER_COUNT, minimumSize: 0.06, maximumSize: 0.11 }),
    [],
  );

  useEffect(
    () => () => {
      for (const material of Object.values(materials)) {
        material.dispose();
      }
      for (const geometry of [streamGeometry, sparkGeometry, glitterGeometry]) {
        geometry.dispose();
      }
      glowSprite.dispose();
    },
    [materials, streamGeometry, sparkGeometry, glitterGeometry, glowSprite],
  );

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const elapsed = (time - (phaseStartedAt.current ?? 0)) * playbackRate;
    const motion = reducedMotion ? 0 : 1;
    const charging = phase === PackOpeningPhase.CHARGING.value;
    const bursting = phase === PackOpeningPhase.BURST.value;
    const charge = charging ? clampUnit(elapsed / PackOpeningPhase.CHARGING.durationSeconds) : 0;
    const blast = bursting ? clampUnit(elapsed / PackOpeningPhase.BURST.durationSeconds) : 1;
    const colorMix = bursting ? 1 : clampUnit((charge - 0.4) / 0.45);
    const pointScale = state.size.height * state.viewport.dpr * 0.5;
    if (prismatic && colorMix > 0) {
      color.setHSL((time * 0.45) % 1, 0.95, 0.62);
      color.lerp(ENERGY_COLOR, 1 - colorMix);
    } else {
      color.copy(ENERGY_COLOR).lerp(hit, colorMix);
    }

    if (stream.current) {
      stream.current.visible = charging && motion > 0;
      if (stream.current.visible) {
        const positions = streamGeometry.getAttribute("position") as BufferAttribute;
        const alphas = streamGeometry.getAttribute("aAlpha") as BufferAttribute;
        for (let index = 0; index < STREAM_COUNT; index += 1) {
          const seedAngle = (streamSeeds[index * 3] ?? 0) * Math.PI * 2;
          const seedRadius = 0.9 + (streamSeeds[index * 3 + 1] ?? 0) * 1.1;
          const seedPhase = streamSeeds[index * 3 + 2] ?? 0;
          const travel = (seedPhase + time * (0.35 + charge * 1.1)) % 1;
          const pull = travel ** 2.2;
          const radius = seedRadius * (1 - pull);
          const angle = seedAngle + travel * (1.5 + charge * 3);
          positions.setXYZ(
            index,
            Math.cos(angle) * radius,
            -chargePosition[1] * (1 - travel),
            Math.sin(angle) * radius * 0.7,
          );
          alphas.setX(index, Math.sin(travel * Math.PI) ** 1.5);
        }
        positions.needsUpdate = true;
        alphas.needsUpdate = true;
      }
      setParticleUniforms({
        material: materials.stream,
        color,
        opacity: clampUnit(charge * 2.2) * 0.85,
        scale: pointScale,
      });
    }

    if (sparks.current) {
      sparks.current.visible = bursting && elapsed < 1.6 && motion > 0;
      if (sparks.current.visible) {
        const positions = sparkGeometry.getAttribute("position") as BufferAttribute;
        const alphas = sparkGeometry.getAttribute("aAlpha") as BufferAttribute;
        const travel = (1 - Math.exp(-elapsed * 3.2)) / 3.2;
        for (let index = 0; index < SPARK_COUNT; index += 1) {
          const theta = (sparkSeeds[index * 3] ?? 0) * Math.PI * 2;
          const lift = (sparkSeeds[index * 3 + 1] ?? 0) * 2 - 1;
          const speed = 2.8 + (sparkSeeds[index * 3 + 2] ?? 0) * 5.5;
          const spread = Math.sqrt(1 - lift * lift);
          positions.setXYZ(
            index,
            Math.cos(theta) * spread * speed * travel,
            (lift + 0.18) * speed * travel - 1.6 * elapsed * elapsed,
            Math.sin(theta) * spread * speed * travel * 0.7,
          );
          const lifetime = 0.7 + (sparkSeeds[index * 3 + 2] ?? 0) * 0.9;
          alphas.setX(index, (1 - clampUnit(elapsed / lifetime)) ** 1.5);
        }
        positions.needsUpdate = true;
        alphas.needsUpdate = true;
      }
      setParticleUniforms({
        material: materials.sparks,
        color: particleColor.copy(WHITE).lerp(color, 0.6),
        opacity: 0.95,
        scale: pointScale,
      });
    }

    if (glitter.current) {
      glitter.current.visible = bursting && motion > 0;
      if (glitter.current.visible) {
        const positions = glitterGeometry.getAttribute("position") as BufferAttribute;
        const alphas = glitterGeometry.getAttribute("aAlpha") as BufferAttribute;
        for (let index = 0; index < GLITTER_COUNT; index += 1) {
          const seedX = (glitterSeeds[index * 3] ?? 0) * 2 - 1;
          const seedY = glitterSeeds[index * 3 + 1] ?? 0;
          const seedZ = glitterSeeds[index * 3 + 2] ?? 0;
          const bloom = 1 - Math.exp(-elapsed * 2.5);
          positions.setXYZ(
            index,
            seedX * 3.4 * bloom + Math.sin(time * 1.3 + index) * 0.08,
            (seedY * 2.6 - 0.4) * bloom + 0.4 - elapsed * 0.35,
            (seedZ - 0.5) * 1.6 * bloom,
          );
          alphas.setX(index, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 4 + seedX * 23 + seedY * 17)));
        }
        positions.needsUpdate = true;
        alphas.needsUpdate = true;
      }
      setParticleUniforms({
        material: materials.glitter,
        color: particleColor.copy(WHITE).lerp(color, 0.35),
        opacity: clampUnit(elapsed / 0.3) * (1 - blast) * 0.8,
        scale: pointScale,
      });
    }

    if (pillar.current) {
      const rise = bursting ? clampUnit(elapsed / 0.25) : 0;
      const pillarIntensity = bursting ? rise * (1 - clampUnit((elapsed - 0.3) / 0.8)) * 1.1 : 0;
      pillar.current.visible = pillarIntensity > 0.01;
      pillar.current.scale.set(0.3 + rise * 0.4 + blast * 0.3, 0.2 + rise * 0.8, 1);
      const uniforms = materials.pillar.uniforms;
      uniforms.uTime!.value = time;
      uniforms.uIntensity!.value = pillarIntensity;
      uniforms.uColor!.value.copy(color);
    }

    const flashLevel = bursting ? Math.max(0, 1 - elapsed / 0.35) : 0;
    if (flash.current) {
      flash.current.visible = flashLevel > 0;
      flash.current.scale.setScalar(1 + (1 - flashLevel) * 3.5);
      flash.current.lookAt(state.camera.position);
      const material = flash.current.material as MeshBasicMaterial;
      material.color.copy(WHITE).lerp(color, 0.25);
      material.opacity = flashLevel * 0.8;
    }

    if (shockwave.current) {
      const wave = bursting ? clampUnit(elapsed / 1.2) : -1;
      shockwave.current.visible = wave >= 0 && wave < 1;
      materials.shockwave.uniforms.uProgress!.value = wave;
      materials.shockwave.uniforms.uColor!.value.copy(color);
    }

    if (halo.current) {
      const ring = bursting ? clampUnit((elapsed - 0.05) / 0.8) : -1;
      halo.current.visible = ring >= 0 && ring < 1;
      halo.current.lookAt(state.camera.position);
      materials.halo.uniforms.uProgress!.value = ring;
      materials.halo.uniforms.uColor!.value.copy(color);
    }

    if (light.current) {
      light.current.color.copy(color);
      light.current.intensity = charging ? charge * charge * 7 : flashLevel * 22 + (1 - blast) * 4;
    }
  });

  return (
    <>
      <group position={chargePosition}>
        <pointLight ref={light} distance={10} intensity={0} />
        <points ref={stream} geometry={streamGeometry} material={materials.stream} visible={false} />
        <points ref={sparks} geometry={sparkGeometry} material={materials.sparks} visible={false} />
        <points ref={glitter} geometry={glitterGeometry} material={materials.glitter} visible={false} />
        <mesh ref={pillar} position-y={4} position-z={-0.2} material={materials.pillar} visible={false}>
          <planeGeometry args={[1.6, 8]} />
        </mesh>
        <mesh ref={flash} visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={glowSprite}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            opacity={0}
          />
        </mesh>
        <mesh ref={halo} material={materials.halo} visible={false}>
          <planeGeometry args={[7, 7]} />
        </mesh>
      </group>
      <mesh
        ref={shockwave}
        position={[chargePosition[0], 0.02, chargePosition[2]]}
        rotation-x={-Math.PI / 2}
        material={materials.shockwave}
        visible={false}
      >
        <planeGeometry args={[16, 16]} />
      </mesh>
    </>
  );
}
