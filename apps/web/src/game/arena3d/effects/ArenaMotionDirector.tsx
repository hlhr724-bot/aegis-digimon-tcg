import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Camera } from "three";
import type { ArenaPulse } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import { ArenaCardMotionKind, type ArenaCardMotionKindEntry } from "@/game/arena3d/effects/ArenaCardMotionKind";
import type { ArenaCardMotionRegistry } from "@/game/arena3d/effects/createArenaCardMotionRegistry";
import type { ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";
import { createArenaFloorProjector } from "@/game/arena3d/field/createArenaFloorProjector";
import { Side } from "@/game/side";

type Props = {
  pulses: readonly ArenaPulse[];
  field: ArenaTrackedField;
  motions: ArenaCardMotionRegistry;
  projectionCamera: Camera;
  reducedMotion: boolean;
};

type MotionRequest = {
  permanentId: string;
  kind: ArenaCardMotionKindEntry;
  startedAt: number;
  from?: Vector3;
  to?: Vector3;
  maxDistance?: number;
};

const HOP_DELAY_SECONDS = 0.25;
const HOP_STAGGER_SECONDS = 0.07;
const KNOCKBACK_DISTANCE = 0.55;
const ANNOUNCED_LUNGE_DISTANCE = 1.8;

const BURST_MOTIONS: Partial<Record<ArenaPulseKind, ArenaCardMotionKindEntry>> = {
  [ArenaPulseKind.EVOLVE.value]: ArenaCardMotionKind.EVOLVE,
  [ArenaPulseKind.DELETE.value]: ArenaCardMotionKind.DELETE,
  [ArenaPulseKind.SUMMON.value]: ArenaCardMotionKind.DROP,
};

function findPosition(field: ArenaTrackedField, permanentId: string | undefined): Vector3 | undefined {
  const tracked = permanentId ? field.permanents.get(permanentId) : undefined;
  return tracked ? new Vector3(tracked.top.x, 0, tracked.top.z) : undefined;
}

function addMotion(
  motions: ArenaCardMotionRegistry,
  { permanentId, kind, startedAt, from, to, maxDistance = Number.POSITIVE_INFINITY }: MotionRequest,
) {
  const direction = from && to ? new Vector3().subVectors(to, from) : new Vector3();
  const length = direction.length();
  if (length > 0) {
    direction.divideScalar(length);
  }
  const distance = Math.min(length, maxDistance);
  motions.add({ permanentId, kind, startedAt, directionX: direction.x, directionZ: direction.z, distance });
}

export function ArenaMotionDirector({ pulses, field, motions, projectionCamera, reducedMotion }: Props) {
  const canvas = useThree((state) => state.gl.domElement);
  const clock = useThree((state) => state.clock);
  const projector = useMemo(createArenaFloorProjector, []);
  const started = useRef(new Set<string>());

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    projector.begin(projectionCamera, canvas.getBoundingClientRect());
    const now = clock.elapsedTime;
    for (const pulse of pulses) {
      if (started.current.has(pulse.key)) {
        continue;
      }
      started.current.add(pulse.key);
      if (pulse.kind === ArenaPulseKind.ATTACK.value && pulse.permanentId) {
        const from = findPosition(field, pulse.permanentId);
        let to = findPosition(field, pulse.targetPermanentId);
        if (!to && pulse.targetPoint) {
          const projected = new Vector3();
          to = projector.project(pulse.targetPoint.x, pulse.targetPoint.y, projected) ? projected : undefined;
        }
        addMotion(motions, {
          permanentId: pulse.permanentId,
          kind: ArenaCardMotionKind.LUNGE,
          startedAt: now,
          from,
          to,
          maxDistance: pulse.targetPermanentId ? undefined : ANNOUNCED_LUNGE_DISTANCE,
        });
        if (pulse.targetPermanentId && from && to) {
          const away = new Vector3().subVectors(to, from).setLength(KNOCKBACK_DISTANCE);
          addMotion(motions, {
            permanentId: pulse.targetPermanentId,
            kind: ArenaCardMotionKind.KNOCKBACK,
            startedAt: now,
            from: to,
            to: to.clone().add(away),
          });
        }
        continue;
      }
      if (pulse.kind === ArenaPulseKind.IMPACT.value && pulse.permanentId) {
        const origin = findPosition(field, pulse.permanentId);
        const push = pulse.side === Side.Viewer ? 1 : -1;
        addMotion(motions, {
          permanentId: pulse.permanentId,
          kind: ArenaCardMotionKind.KNOCKBACK,
          startedAt: now - ArenaCardMotionKind.KNOCKBACK.delaySeconds,
          from: origin,
          to: origin?.clone().setZ(origin.z + push * KNOCKBACK_DISTANCE),
        });
        continue;
      }
      const burstMotion = BURST_MOTIONS[pulse.kind];
      if (burstMotion && pulse.permanentId) {
        addMotion(motions, { permanentId: pulse.permanentId, kind: burstMotion, startedAt: now });
        continue;
      }
      if (pulse.kind === ArenaPulseKind.TURN.value) {
        let index = 0;
        for (const tracked of field.permanents.values()) {
          if (tracked.side !== pulse.side) {
            continue;
          }
          addMotion(motions, {
            permanentId: tracked.id,
            kind: ArenaCardMotionKind.HOP,
            startedAt: now + HOP_DELAY_SECONDS + index * HOP_STAGGER_SECONDS,
          });
          index += 1;
        }
      }
    }
  }, [pulses, field, motions, projectionCamera, canvas, clock, projector, reducedMotion]);

  return null;
}
