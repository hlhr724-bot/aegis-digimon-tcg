import type { DecisionRequest, ServerEvent } from "@aegis/shared/protocol/events";
import type { Seat } from "@aegis/shared/schema/enums";

export type SnapshotOpenPrompts = {
  attack?: ServerEvent;
  window?: ServerEvent;
  decision?: { seat: Seat; request: DecisionRequest };
};
