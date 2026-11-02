import { ManualBreedingChoice } from "#shared/manual/ManualBreedingChoice";
import { ManualStatus } from "#shared/manual/ManualStatus";
import { ManualAction } from "#shared/manual/ManualAction";
import type { ManualCommand, ManualDestination, ManualIntent, ManualLocation } from "#shared/manual/ManualCommand";
import { ManualCombatStage } from "#shared/manual/ManualCombatStage";
import { ManualKeyword } from "#shared/manual/ManualKeyword";
import { Zone, CardColor, Phase } from "#shared/schema/enums";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isZone(value: unknown): value is Zone {
  return Object.values(Zone).some((zone) => zone === value);
}

function isDestination(value: unknown): value is ManualDestination {
  return (
    isRecord(value) &&
    isZone(value.zone) &&
    (value.permanentId === undefined || isText(value.permanentId)) &&
    (value.part === undefined || value.part === "top" || value.part === "source" || value.part === "link") &&
    (value.position === undefined || value.position === "top" || value.position === "bottom")
  );
}

function isLocation(value: unknown): value is ManualLocation {
  return (
    isRecord(value) &&
    (value.instanceId === undefined || isText(value.instanceId)) &&
    (value.index === undefined || (isInteger(value.index) && value.index >= 0 && value.index < 256)) &&
    isDestination(value)
  );
}

function isCommand(value: unknown): value is ManualCommand {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.action) {
    case ManualAction.BREEDING.value:
      return Object.values(ManualBreedingChoice).some((entry) => entry.value === value.choice);
    case ManualAction.STATUSES.value:
      return (
        isText(value.permanentId) &&
        Array.isArray(value.statuses) &&
        value.statuses.length <= Object.keys(ManualStatus).length &&
        value.statuses.every((status) => Object.values(ManualStatus).some((entry) => entry.value === status)) &&
        new Set(value.statuses).size === value.statuses.length
      );
    case ManualAction.RESET_MODIFIERS.value:
    case ManualAction.TRAINING.value:
      return isText(value.permanentId);
    case ManualAction.SIGNAL.value:
      return (
        isLocation(value.from) &&
        (value.targetPermanentId === undefined || isText(value.targetPermanentId)) &&
        (value.targetSeat === undefined || value.targetSeat === 0 || value.targetSeat === 1) &&
        !(value.targetPermanentId !== undefined && value.targetSeat !== undefined)
      );
    case ManualAction.PROPOSE_RESTART.value:
      return value.firstSeat === 0 || value.firstSeat === 1;
    case ManualAction.ANSWER_RESTART.value:
      return typeof value.accept === "boolean";
    case ManualAction.MODIFIERS.value:
      return (
        isText(value.permanentId) &&
        isInteger(value.securityAttackModifier) &&
        value.securityAttackModifier >= -99 &&
        value.securityAttackModifier <= 99 &&
        Array.isArray(value.keywords) &&
        value.keywords.length <= 40 &&
        value.keywords.every((keyword) => Object.values(ManualKeyword).some((entry) => entry.value === keyword)) &&
        new Set(value.keywords).size === value.keywords.length &&
        Array.isArray(value.colors) &&
        value.colors.length <= 8 &&
        value.colors.every((color) => Object.values(CardColor).includes(color)) &&
        new Set(value.colors).size === value.colors.length
      );
    case ManualAction.CREATE_TOKEN.value:
      return isText(value.cardId);
    case ManualAction.REMOVE_TOKEN.value:
      return isText(value.permanentId);
    case ManualAction.FLIP.value:
      return isLocation(value.from) && typeof value.faceUp === "boolean";
    case ManualAction.PHASE.value:
      return Object.values(Phase).includes(value.phase as Phase) && value.phase !== Phase.None;
    case ManualAction.COMBAT.value:
      return (
        Object.values(ManualCombatStage).some((entry) => entry.value === value.stage) &&
        (value.blockerPermanentId === undefined || isText(value.blockerPermanentId))
      );
    case ManualAction.DRAW.value:
      return isInteger(value.count) && value.count >= 1 && value.count <= 50;
    case ManualAction.MOVE.value:
      return isLocation(value.from) && isDestination(value.to) && typeof value.wholePile === "boolean";
    case ManualAction.SHUFFLE.value:
      return value.zone === Zone.Deck || value.zone === Zone.EggDeck || value.zone === Zone.Security;
    case ManualAction.INSPECT.value:
      return (
        (value.zone === Zone.Deck || value.zone === Zone.EggDeck || value.zone === Zone.Security) &&
        isInteger(value.count) &&
        value.count >= 1 &&
        value.count <= 55
      );
    case ManualAction.CLOSE_INSPECTION.value:
    case ManualAction.UNSUSPEND_ALL.value:
    case ManualAction.CLEAR_SIGNAL.value:
    case ManualAction.CLEAR_REVEALS.value:
    case ManualAction.PASS.value:
    case ManualAction.REQUEST_UNDO.value:
      return true;
    case ManualAction.REVEAL.value:
      return (
        isLocation(value.from) &&
        (value.count === undefined || (isInteger(value.count) && value.count >= 1 && value.count <= 55))
      );
    case ManualAction.REORDER.value:
      return (
        isText(value.permanentId) &&
        (value.part === "source" || value.part === "link") &&
        Array.isArray(value.instanceIds) &&
        value.instanceIds.length <= 110 &&
        value.instanceIds.every(isText)
      );
    case ManualAction.SUSPEND.value:
      return isText(value.permanentId) && typeof value.suspended === "boolean";
    case ManualAction.DP.value:
      return isText(value.permanentId) && isInteger(value.value) && value.value >= -999999 && value.value <= 999999;
    case ManualAction.MARKER.value:
      return isText(value.permanentId) && typeof value.text === "string" && value.text.length <= 120;
    case ManualAction.MEMORY.value:
      return isInteger(value.value) && value.value >= -10 && value.value <= 10;
    case ManualAction.ATTACK.value:
      return isText(value.permanentId) && (value.targetPermanentId === undefined || isText(value.targetPermanentId));
    case ManualAction.PROPOSE_RESULT.value:
      return value.winnerSeat === -1 || value.winnerSeat === 0 || value.winnerSeat === 1;
    case ManualAction.ANSWER_RESULT.value:
    case ManualAction.ANSWER_UNDO.value:
      return typeof value.accept === "boolean";
    default:
      return false;
  }
}

export function parseManualIntent(value: unknown): ManualIntent | undefined {
  if (
    !isRecord(value) ||
    value.type !== "manual" ||
    !isText(value.requestId) ||
    !isInteger(value.revision) ||
    value.revision < 0 ||
    !isCommand(value.command)
  ) {
    return undefined;
  }
  return { type: "manual", requestId: value.requestId, revision: value.revision, command: value.command };
}
