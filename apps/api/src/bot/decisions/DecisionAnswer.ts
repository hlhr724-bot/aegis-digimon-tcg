import type { Intent } from "@aegis/shared/protocol/intents";
import type { DecisionBasis } from "#api/bot/decisions/DecisionBasis";

export type DecisionAnswer = { intent: Intent; basis: DecisionBasis };
