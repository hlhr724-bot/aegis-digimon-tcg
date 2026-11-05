import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Camera, type Mesh, type ShaderMaterial } from "three";
import type { CardTextureCache } from "@/design/webglCard/createCardTextureCache";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { CARD_FLOOR_HEIGHT } from "@/game/arena3d/arenaSceneLayout";
import { getArenaDeleteBurstBoardPoint } from "@/game/arena3d/cues/getArenaDeleteBurstBoardPoint";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import { buildArenaCardUrls } from "@/game/arena3d/field/buildArenaCardUrls";
import { createArenaFloorProjector } from "@/game/arena3d/field/createArenaFloorProjector";
import { ArenaCardFace } from "@/game/arena3d/meshes/ArenaCardFace";
import type { DeleteBurst } from "@/game/match/types";

type Props = {
  deleteBursts: readonly DeleteBurst[];
  backUrl: string;
  cache: CardTextureCache;
  projectionCamera: Camera;
  activity: RefObject<ArenaActivity>;
  reducedMotion: boolean;
};

type Departure = {
  key: number;
  urls: readonly string[];
  x: number;
  z: number;
  width: number;
  yaw: number;
};

type DepartureProps = {
  departure: Departure;
  cache: CardTextureCache;
  onDone: (key: number) => void;
};

const DEPARTURE_SECONDS = 0.5;
const FLASH_RISE = 0.24;
const PEAK_LIFT = 0.28;
const PEAK_FLASH = 0.55;
const MIN_SCALE = 0.15;

function smooth(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function DepartingCard({ departure, cache, onDone }: DepartureProps) {
  const mesh = useRef<Mesh | null>(null);
  const finished = useRef(false);
  const startedAt = useRef<number | undefined>(undefined);

  useFrame((state) => {
    startedAt.current ??= state.clock.elapsedTime;
    const progress = (state.clock.elapsedTime - startedAt.current) / DEPARTURE_SECONDS;
    if (progress >= 1) {
      if (mesh.current) {
        mesh.current.visible = false;
      }
      if (!finished.current) {
        finished.current = true;
        onDone(departure.key);
      }
      return;
    }
    if (!mesh.current) {
      return;
    }
    const rise = smooth(progress / FLASH_RISE);
    const fall = smooth((progress - FLASH_RISE) / (1 - FLASH_RISE));
    mesh.current.visible = true;
    mesh.current.position.set(departure.x, CARD_FLOOR_HEIGHT + PEAK_LIFT * rise * (1 - fall * 0.5), departure.z);
    mesh.current.rotation.set(-0.25 * fall, departure.yaw + 0.35 * fall, 0, "YXZ");
    mesh.current.scale.setScalar(departure.width * (1 + 0.06 * rise) * (1 - (1 - MIN_SCALE) * fall));
    const material = mesh.current.material as ShaderMaterial;
    material.uniforms.uFlash!.value = PEAK_FLASH * rise;
    material.uniforms.uShade!.value = 1;
  });

  return (
    <ArenaCardFace
      urls={departure.urls}
      cache={cache}
      registerMesh={(registered) => {
        mesh.current = registered;
      }}
    />
  );
}

export function ArenaCardDepartures({
  deleteBursts,
  backUrl,
  cache,
  projectionCamera,
  activity,
  reducedMotion,
}: Props) {
  const size = useThree((state) => state.size);
  const projector = useMemo(createArenaFloorProjector, []);
  const seen = useRef(new Set<number>());
  const [departures, setDepartures] = useState<readonly Departure[]>([]);

  useEffect(() => {
    const fresh: Departure[] = [];
    projector.begin(projectionCamera, new DOMRect(0, 0, size.width, size.height));
    for (const burst of deleteBursts) {
      if (seen.current.has(burst.key) || burst.stackStrip || !burst.cardId) {
        continue;
      }
      seen.current.add(burst.key);
      const center = getArenaDeleteBurstBoardPoint(burst);
      const position = new Vector3();
      if (reducedMotion || !projector.project(center.x, center.y, position)) {
        continue;
      }
      const edge = new Vector3();
      const faceWidth = burst.face?.width ?? 0;
      const width =
        faceWidth > 0 && projector.project(center.x + faceWidth, center.y, edge)
          ? position.distanceTo(edge)
          : ARENA_ROW_LAYOUT.cardWidth;
      fresh.push({
        key: burst.key,
        urls: buildArenaCardUrls({ cardId: burst.cardId, artId: burst.artId, faceUp: true, backUrl }),
        x: position.x,
        z: position.z,
        width,
        yaw: (-(burst.face?.angle ?? 0) * Math.PI) / 180,
      });
    }
    if (fresh.length > 0) {
      activity.current.busyUntil = Math.max(
        activity.current.busyUntil,
        performance.now() + (DEPARTURE_SECONDS + 0.3) * 1000,
      );
      setDepartures((current) => [...current, ...fresh]);
    }
  }, [deleteBursts, backUrl, projector, projectionCamera, size, activity, reducedMotion]);

  const removeDeparture = (key: number) => {
    setDepartures((current) => current.filter((departure) => departure.key !== key));
  };

  return (
    <>
      {departures.map((departure) => (
        <DepartingCard key={departure.key} departure={departure} cache={cache} onDone={removeDeparture} />
      ))}
    </>
  );
}
