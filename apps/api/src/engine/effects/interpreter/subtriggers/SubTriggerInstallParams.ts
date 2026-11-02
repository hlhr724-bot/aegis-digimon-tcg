import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Seat } from "@aegis/shared/schema/enums";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { SubTriggerEventName } from "#api/engine/effects/EffectContext";
import type { MatchedTriggerHistory } from "#api/engine/effects/interpreter/subtriggers/MatchedTriggerHistory";

export type SubTriggerInstallParams = {
  ctx: EffectContext;
  action: Extract<Action, { kind: "SubTrigger" }>;
  event: SubTriggerEventName;
  playerScoped: boolean;
  isLinkedSource: boolean;
  isInheritedSource: boolean;
  printedWatcherClause: string | undefined;
  printedTiming: EffectContext["activeTiming"];
  anchorPermanentId: string | undefined;
  expiresOnTurnEndOf: Seat | undefined;
  matchedEvents: MatchedTriggerHistory;
  sourceSelfInstanceId: string;
  bindsPrintedSource: boolean;
  linkedSelfSourceAtInstall: boolean;
};
