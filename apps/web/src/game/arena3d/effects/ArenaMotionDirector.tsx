import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Camera } from "three";
import type { ArenaPulse } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import { ArenaCardMotionKind, type ArenaCardMotionKindEntry } from "@/game/arena3d/effects/ArenaCardMotionKind";
import type { ArenaCardMotionRegistry } from "@/game/arena3d/effects/createArenaCardMotionRegistry";
import type { ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";
import { createArenaPulseAnchorResolver } from "@/game/arena3d/createArenaPulseAnchorResolver";
import { getOppositeSide } from "@/game/arena3d/getOppositeSide";
import { Side } from "@/game/side";
import { FINALE_IMPACT_AT_MS } from "@/game/timings";

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
const FINALE_IMPACT_SECONDS = FINALE_IMPACT_AT_MS / 1000;
const FINALE_RECOIL_DISTANCE = 0.7;

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
  const size = useThree((state) => state.size);
  const started = useRef(new Set<string>());

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const resolve = createArenaPulseAnchorResolver({ field, camera: projectionCamera, canvas, size });
    const now = clock.elapsedTime;
    for (const pulse of pulses) {
      if (started.current.has(pulse.key)) {
        continue;
      }
      started.current.add(pulse.key);
      if (pulse.kind === ArenaPulseKind.ATTACK.value && pulse.permanentId) {
        const from = findPosition(field, pulse.permanentId);
        const to = findPosition(field, pulse.targetPermanentId) ?? resolve(pulse.target);
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
      if (pulse.kind === ArenaPulseKind.FINALE.value) {
        const resolvedImpact = resolve(pulse.target);
        const impact = resolvedImpact ?? new Vector3();
        const hasImpact = resolvedImpact !== undefined;
        if (pulse.permanentId) {
          addMotion(motions, {
            permanentId: pulse.permanentId,
            kind: ArenaCardMotionKind.FINALE_LUNGE,
            startedAt: now,
            from: findPosition(field, pulse.permanentId),
            to: hasImpact ? impact : undefined,
          });
        }
        const loser = getOppositeSide(pulse.side);
        for (const tracked of field.permanents.values()) {
          if (tracked.side !== loser) {
            continue;
          }
          const origin = new Vector3(tracked.top.x, 0, tracked.top.z);
          const away = hasImpact ? new Vector3().subVectors(origin, impact).setY(0) : new Vector3();
          if (away.lengthSq() < 0.0001) {
            away.set(0, 0, loser === Side.Viewer ? 1 : -1);
          }
          addMotion(motions, {
            permanentId: tracked.id,
            kind: ArenaCardMotionKind.KNOCKBACK,
            startedAt: now + FINALE_IMPACT_SECONDS - ArenaCardMotionKind.KNOCKBACK.delaySeconds,
            from: origin,
            to: origin.clone().add(away.setLength(FINALE_RECOIL_DISTANCE)),
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
  }, [pulses, field, motions, projectionCamera, canvas, size, clock, reducedMotion]);

  return null;
}
