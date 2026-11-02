import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { Seat } from "@aegis/shared/schema/enums";
import type { CollectedEffect } from "#api/engine/effects/collect";
import type { ArmedSubTrigger } from "#api/engine/gameEngine/subTriggerIdentity";

export type ResolutionDependencySnapshot = {
  turnSeat: Seat;
  listCandidate: () => readonly CardInstance[];
  outermost?: boolean;
  extraPending?: readonly CollectedEffect[];
  excludeNestedPending?: ReadonlySet<CollectedEffect>;
  excludedWindowWatchers: ReadonlySet<ArmedSubTrigger>;
  derivedPending: CollectedEffect[];
  announced: Set<CollectedEffect>;
};
