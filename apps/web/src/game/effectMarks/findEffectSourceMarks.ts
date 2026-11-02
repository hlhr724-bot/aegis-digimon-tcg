import type { DecisionRequest, SequencedServerEvent } from "@aegis/shared/protocol/events";
import { parseTriggerKey } from "@aegis/shared/protocol/triggerKey";
import { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";

type Params = {
  events: readonly SequencedServerEvent[];
  presentedStateVersion: number | undefined;
  viewerDecision: DecisionRequest | undefined;
};

export function findEffectSourceMarks({
  events,
  presentedStateVersion,
  viewerDecision,
}: Params): ReadonlyMap<string, EffectSourceMark> {
  const marks = new Map<string, EffectSourceMark>();
  for (const instanceId of getPendingSourceInstanceIds(viewerDecision)) {
    marks.set(instanceId, EffectSourceMark.PENDING.value);
  }
  for (const instanceId of getResolvingSourceInstanceIds({ events, presentedStateVersion })) {
    marks.set(instanceId, EffectSourceMark.RESOLVING.value);
  }
  return marks;
}

function getPendingSourceInstanceIds(decision: DecisionRequest | undefined): string[] {
  if (decision?.kind === "orderTriggers") {
    return (decision.options?.triggerKeys ?? []).map((key) => parseTriggerKey(key).instanceId).filter(Boolean);
  }
  if (decision?.kind === "optional" && decision.sourceInstanceId) {
    return [decision.sourceInstanceId];
  }
  return [];
}

type ResolvingParams = Pick<Params, "events" | "presentedStateVersion">;

function getResolvingSourceInstanceIds({ events, presentedStateVersion }: ResolvingParams): string[] {
  const openLifecycles = new Map<string, { instanceId: string; count: number }>();
  for (const event of events) {
    if (presentedStateVersion !== undefined && event.stateVersion > presentedStateVersion) {
      continue;
    }
    if ((event.kind !== "effectTriggered" && event.kind !== "effectResolved") || !event.sourceInstanceId) {
      continue;
    }
    const lifecycleKey = `${event.seat}:${event.sourceInstanceId}:${event.effectKey}`;
    const lifecycle = openLifecycles.get(lifecycleKey) ?? { instanceId: event.sourceInstanceId, count: 0 };
    lifecycle.count += event.kind === "effectTriggered" ? 1 : -1;
    if (lifecycle.count > 0) {
      openLifecycles.set(lifecycleKey, lifecycle);
    } else {
      openLifecycles.delete(lifecycleKey);
    }
  }
  return [...openLifecycles.values()].map((lifecycle) => lifecycle.instanceId);
}
