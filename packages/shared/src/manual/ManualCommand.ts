import type { ManualBreedingChoice } from "#shared/manual/ManualBreedingChoice";
import type { ManualStatus } from "#shared/manual/ManualStatus";
import { ManualAction } from "#shared/manual/ManualAction";
import type { ManualCombatStage } from "#shared/manual/ManualCombatStage";
import type { Seat, Zone, CardColor, Phase } from "#shared/schema/enums";

export type ManualLocation = {
  zone: Zone;
  permanentId?: string;
  part?: "top" | "source" | "link";
  instanceId?: string;
  index?: number;
};

export type ManualDestination = {
  zone: Zone;
  permanentId?: string;
  part?: "top" | "source" | "link";
  position?: "top" | "bottom";
};

export type ManualCommand =
  | { action: typeof ManualAction.BREEDING.value; choice: ManualBreedingChoice }
  | { action: typeof ManualAction.STATUSES.value; permanentId: string; statuses: ManualStatus[] }
  | { action: typeof ManualAction.RESET_MODIFIERS.value; permanentId: string }
  | { action: typeof ManualAction.TRAINING.value; permanentId: string }
  | { action: typeof ManualAction.SIGNAL.value; from: ManualLocation; targetPermanentId?: string; targetSeat?: Seat }
  | { action: typeof ManualAction.CLEAR_SIGNAL.value }
  | { action: typeof ManualAction.PROPOSE_RESTART.value; firstSeat: Seat }
  | { action: typeof ManualAction.ANSWER_RESTART.value; accept: boolean }
  | {
      action: typeof ManualAction.MODIFIERS.value;
      permanentId: string;
      securityAttackModifier: number;
      keywords: string[];
      colors: CardColor[];
    }
  | { action: typeof ManualAction.CREATE_TOKEN.value; cardId: string }
  | { action: typeof ManualAction.REMOVE_TOKEN.value; permanentId: string }
  | { action: typeof ManualAction.FLIP.value; from: ManualLocation; faceUp: boolean }
  | { action: typeof ManualAction.CLEAR_REVEALS.value }
  | { action: typeof ManualAction.PHASE.value; phase: Phase }
  | { action: typeof ManualAction.COMBAT.value; stage: ManualCombatStage; blockerPermanentId?: string }
  | { action: typeof ManualAction.DRAW.value; count: number }
  | { action: typeof ManualAction.MOVE.value; from: ManualLocation; to: ManualDestination; wholePile: boolean }
  | { action: typeof ManualAction.SHUFFLE.value; zone: Zone.Deck | Zone.EggDeck | Zone.Security }
  | { action: typeof ManualAction.INSPECT.value; zone: Zone.Deck | Zone.EggDeck | Zone.Security; count: number }
  | { action: typeof ManualAction.CLOSE_INSPECTION.value }
  | { action: typeof ManualAction.REVEAL.value; from: ManualLocation; count?: number }
  | { action: typeof ManualAction.REORDER.value; permanentId: string; part: "source" | "link"; instanceIds: string[] }
  | { action: typeof ManualAction.SUSPEND.value; permanentId: string; suspended: boolean }
  | { action: typeof ManualAction.UNSUSPEND_ALL.value }
  | { action: typeof ManualAction.DP.value; permanentId: string; value: number }
  | { action: typeof ManualAction.MARKER.value; permanentId: string; text: string }
  | { action: typeof ManualAction.MEMORY.value; value: number }
  | { action: typeof ManualAction.PASS.value }
  | { action: typeof ManualAction.ATTACK.value; permanentId: string; targetPermanentId?: string }
  | { action: typeof ManualAction.PROPOSE_RESULT.value; winnerSeat: Seat | -1 }
  | { action: typeof ManualAction.ANSWER_RESULT.value; accept: boolean }
  | { action: typeof ManualAction.REQUEST_UNDO.value }
  | { action: typeof ManualAction.ANSWER_UNDO.value; accept: boolean };

export type ManualIntent = {
  type: "manual";
  requestId: string;
  revision: number;
  command: ManualCommand;
};
