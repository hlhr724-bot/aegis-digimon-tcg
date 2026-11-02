import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  type InstancedMesh,
  type Mesh,
  type ShaderMaterial,
} from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { buildArenaCueColumnMaterial } from "@/game/arena3d/cues/buildArenaCueColumnMaterial";
import { buildArenaCueDecalMaterial } from "@/game/arena3d/cues/buildArenaCueDecalMaterial";
import { buildArenaSpotlightMaterial } from "@/game/arena3d/cues/buildArenaSpotlightMaterial";
import { ArenaCuePace } from "@/game/arena3d/cues/ArenaCuePace";
import { collectArenaCueDecals } from "@/game/arena3d/cues/collectArenaCueDecals";
import { resolveArenaCuePace } from "@/game/arena3d/cues/resolveArenaCuePace";
import type { ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";

type Props = {
  field: ArenaTrackedField;
  isLight: boolean;
  activity: RefObject<ArenaActivity>;
  reducedMotion: boolean;
};

type AttributeSpec = {
  name: string;
  size: number;
};

const MAX_DECALS = 48;
const MAX_COLUMNS = 12;
const DECAL_SPAN = 2.4;
const COLUMN_HALF_WIDTH = 0.5 * Math.SQRT2 * 1.06;
const COLUMN_HALF_DEPTH = COLUMN_HALF_WIDTH * CARD_DIMENSIONS.height;
const COLUMN_HEIGHT = 1.25;
const DECAL_HEIGHT = 0.03;
const SPOTLIGHT_HEIGHT = 0.028;
const DARK_ARRIVAL_COLOR = "#8fe9ff";
const LIGHT_ARRIVAL_COLOR = "#3f74c9";
const DARK_SPOTLIGHT_STRENGTH = 0.5;
const LIGHT_SPOTLIGHT_STRENGTH = 0.26;
const PACE_HOLD_MS = 250;
const DECAL_ATTRIBUTES: readonly AttributeSpec[] = [
  { name: "aColor", size: 3 },
  { name: "aProgress", size: 1 },
  { name: "aStrength", size: 1 },
  { name: "aKind", size: 1 },
];
const COLUMN_ATTRIBUTES: readonly AttributeSpec[] = [
  { name: "aColor", size: 3 },
  { name: "aStrength", size: 1 },
];

function attachInstanceAttributes(geometry: BufferGeometry, count: number, specs: readonly AttributeSpec[]) {
  for (const spec of specs) {
    geometry.setAttribute(spec.name, new InstancedBufferAttribute(new Float32Array(count * spec.size), spec.size));
  }
  return geometry;
}

function buildDecalGeometry(): BufferGeometry {
  return attachInstanceAttributes(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), MAX_DECALS, DECAL_ATTRIBUTES);
}

function buildColumnGeometry(): BufferGeometry {
  return attachInstanceAttributes(
    new CylinderGeometry(1, 1, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    MAX_COLUMNS,
    COLUMN_ATTRIBUTES,
  );
}

function getAttribute(geometry: BufferGeometry, name: string): InstancedBufferAttribute {
  return geometry.getAttribute(name) as InstancedBufferAttribute;
}

function markAttributesDirty(geometry: BufferGeometry, specs: readonly AttributeSpec[]) {
  for (const spec of specs) {
    getAttribute(geometry, spec.name).needsUpdate = true;
  }
}

function setBlending(materials: readonly ShaderMaterial[], isLight: boolean) {
  for (const material of materials) {
    material.blending = isLight ? NormalBlending : AdditiveBlending;
    material.uniforms.uLight!.value = isLight ? 1 : 0;
    material.needsUpdate = true;
  }
}

export function ArenaCardCueLayer({ field, isLight, activity, reducedMotion }: Props) {
  const decals = useRef<InstancedMesh>(null);
  const columns = useRef<InstancedMesh>(null);
  const spotlight = useRef<Mesh>(null);
  const decalGeometry = useMemo(buildDecalGeometry, []);
  const columnGeometry = useMemo(buildColumnGeometry, []);
  const spotlightGeometry = useMemo(() => new PlaneGeometry(40, 24).rotateX(-Math.PI / 2), []);
  const decalMaterial = useMemo(buildArenaCueDecalMaterial, []);
  const columnMaterial = useMemo(buildArenaCueColumnMaterial, []);
  const spotlightMaterial = useMemo(buildArenaSpotlightMaterial, []);
  const placer = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  useEffect(
    () => () => {
      decalGeometry.dispose();
      columnGeometry.dispose();
      spotlightGeometry.dispose();
      decalMaterial.dispose();
      columnMaterial.dispose();
      spotlightMaterial.dispose();
    },
    [decalGeometry, columnGeometry, spotlightGeometry, decalMaterial, columnMaterial, spotlightMaterial],
  );

  useEffect(() => {
    setBlending([decalMaterial, columnMaterial], isLight);
    spotlightMaterial.uniforms.uColor!.value.set(isLight ? "#2a2140" : "#04060e");
  }, [decalMaterial, columnMaterial, spotlightMaterial, isLight]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const shaderTime = reducedMotion ? 0 : time;
    decalMaterial.uniforms.uTime!.value = shaderTime;
    columnMaterial.uniforms.uTime!.value = shaderTime;
    const entries = collectArenaCueDecals({
      permanents: field.permanents.values(),
      time,
      reducedMotion,
      arrivalColor: isLight ? LIGHT_ARRIVAL_COLOR : DARK_ARRIVAL_COLOR,
    });
    const decalColors = getAttribute(decalGeometry, "aColor");
    const decalProgress = getAttribute(decalGeometry, "aProgress");
    const decalStrength = getAttribute(decalGeometry, "aStrength");
    const decalKinds = getAttribute(decalGeometry, "aKind");
    const columnColors = getAttribute(columnGeometry, "aColor");
    const columnStrength = getAttribute(columnGeometry, "aStrength");
    let decalCount = 0;
    let columnCount = 0;
    for (const entry of entries) {
      color.set(entry.color);
      placer.rotation.set(0, entry.yaw, 0);
      if (entry.kind.isColumn) {
        if (!columns.current || columnCount >= MAX_COLUMNS) {
          continue;
        }
        placer.position.set(entry.x, DECAL_HEIGHT, entry.z);
        placer.scale.set(entry.width * COLUMN_HALF_WIDTH, entry.width * COLUMN_HEIGHT, entry.width * COLUMN_HALF_DEPTH);
        placer.updateMatrix();
        columns.current.setMatrixAt(columnCount, placer.matrix);
        columnColors.setXYZ(columnCount, color.r, color.g, color.b);
        columnStrength.setX(columnCount, entry.strength);
        columnCount += 1;
        continue;
      }
      if (!decals.current || decalCount >= MAX_DECALS) {
        continue;
      }
      placer.position.set(entry.x, DECAL_HEIGHT, entry.z);
      placer.scale.set(entry.width * DECAL_SPAN, 1, entry.width * DECAL_SPAN);
      placer.updateMatrix();
      decals.current.setMatrixAt(decalCount, placer.matrix);
      decalColors.setXYZ(decalCount, color.r, color.g, color.b);
      decalProgress.setX(decalCount, entry.progress);
      decalStrength.setX(decalCount, entry.strength);
      decalKinds.setX(decalCount, entry.kind.shaderCode);
      decalCount += 1;
    }
    if (decals.current) {
      decals.current.count = decalCount;
      decals.current.visible = decalCount > 0;
      decals.current.instanceMatrix.needsUpdate = true;
      markAttributesDirty(decalGeometry, DECAL_ATTRIBUTES);
    }
    if (columns.current) {
      columns.current.count = columnCount;
      columns.current.visible = columnCount > 0;
      columns.current.instanceMatrix.needsUpdate = true;
      markAttributesDirty(columnGeometry, COLUMN_ATTRIBUTES);
    }
    const focus = field.focus;
    const focused = focus.permanentId ? field.permanents.get(focus.permanentId) : undefined;
    const lit = focused !== undefined && focus.level > 0;
    if (spotlight.current) {
      spotlight.current.visible = lit;
    }
    if (focused && lit) {
      const across = Math.abs(Math.sin(focused.top.yaw)) > 0.5;
      const halfWidth = focused.top.width * 0.5;
      const halfHeight = halfWidth * CARD_DIMENSIONS.height;
      spotlightMaterial.uniforms.uCenter!.value.set(focused.top.x, focused.top.z);
      spotlightMaterial.uniforms.uHalf!.value.set(across ? halfHeight : halfWidth, across ? halfWidth : halfHeight);
      spotlightMaterial.uniforms.uStrength!.value =
        focus.level * (isLight ? LIGHT_SPOTLIGHT_STRENGTH : DARK_SPOTLIGHT_STRENGTH);
    }
    const pace = resolveArenaCuePace({ permanents: field.permanents.values(), focus, time, reducedMotion });
    if (pace === ArenaCuePace.TRANSITION.value) {
      activity.current.busyUntil = Math.max(activity.current.busyUntil, performance.now() + PACE_HOLD_MS);
    } else if (pace === ArenaCuePace.SETTLED.value) {
      activity.current.pacedUntil = Math.max(activity.current.pacedUntil, performance.now() + PACE_HOLD_MS);
    }
  });

  return (
    <>
      <mesh
        ref={spotlight}
        geometry={spotlightGeometry}
        material={spotlightMaterial}
        position-y={SPOTLIGHT_HEIGHT}
        renderOrder={4}
        visible={false}
      />
      <instancedMesh
        ref={decals}
        args={[decalGeometry, decalMaterial, MAX_DECALS]}
        frustumCulled={false}
        renderOrder={5}
        visible={false}
      />
      <instancedMesh
        ref={columns}
        args={[columnGeometry, columnMaterial, MAX_COLUMNS]}
        frustumCulled={false}
        renderOrder={6}
        visible={false}
      />
    </>
  );
}
