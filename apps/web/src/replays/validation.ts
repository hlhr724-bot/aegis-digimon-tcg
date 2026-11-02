import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import {
  GameState,
  PlayerState,
  Permanent,
  CardInstance,
  REPLAY_FORMAT_VERSION,
  type MatchReplay,
} from "@aegis/shared";
import { ManualStatus } from "@aegis/shared/manual/ManualStatus";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { Phase, Zone } from "@aegis/shared/schema/enums";
import { validReplayEvent } from "./eventValidation";

const stateDefaults = new GameState().toJSON();
const playerDefaults = new PlayerState().toJSON();
const permanentDefaults = new Permanent().toJSON();
const cardDefaults = new CardInstance().toJSON();
/**
 * Files recorded before a schema field existed lack it, so a missing field takes its current
 * default (mutating the parsed file) instead of rejecting every older replay.
 */
function defaultFields(value: RecordValue, defaults: RecordValue): boolean {
  for (const [key, item] of Object.entries(defaults)) if (!(key in value)) value[key] = structuredClone(item);
  return Object.entries(defaults).every(([key, item]) =>
    Array.isArray(item)
      ? Array.isArray(value[key])
      : typeof item === "object"
        ? record(value[key])
        : typeof value[key] === typeof item,
  );
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const seat = (value: unknown) => value === 0 || value === 1;
const string = (value: unknown): value is string => typeof value === "string" && value.length <= 65536;
const array = (value: unknown, check: (item: unknown) => boolean): boolean =>
  Array.isArray(value) && value.length <= 1000 && value.every(check);

function safeTree(value: unknown, depth = 0): boolean {
  if (depth > 24) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return string(value);
  if (typeof value === "number") return number(value);
  if (Array.isArray(value)) return value.length <= 5000 && value.every((item) => safeTree(item, depth + 1));
  if (!record(value)) return false;
  return Object.entries(value).every(
    ([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && safeTree(item, depth + 1),
  );
}

function card(value: unknown): boolean {
  if (record(value) && value.faceUp === false) {
    if (value.cardId === undefined) {
      value.cardId = "";
    }
    if (value.artId === undefined) {
      value.artId = "";
    }
  }
  return (
    record(value) &&
    defaultFields(value, cardDefaults) &&
    string(value.instanceId) &&
    string(value.cardId) &&
    string(value.artId) &&
    seat(value.ownerSeat) &&
    typeof value.faceUp === "boolean" &&
    array(value.digivolveTargetPermanentIds, string) &&
    array(value.linkTargetPermanentIds, string) &&
    array(value.dnaDigivolveRoutes, record)
  );
}

function permanent(value: unknown): boolean {
  return (
    record(value) &&
    defaultFields(value, permanentDefaults) &&
    string(value.permanentId) &&
    card(value.topCard) &&
    array(value.stack, card) &&
    array(value.linked, card) &&
    number(value.currentDP) &&
    typeof value.isSuspended === "boolean" &&
    array(value.manualStatuses, (status) => Object.values(ManualStatus).some((entry) => entry.value === status)) &&
    [
      "keywords",
      "grantedKeywords",
      "grantedEffectTexts",
      "originalColorsOverride",
      "digiXrosNames",
      "attackablePermanentIds",
      "vortexAttackablePermanentIds",
    ].every((key) => array(value[key], string))
  );
}

function manualTable(value: unknown): boolean {
  if (
    !record(value) ||
    !defaultFields(value, stateDefaults.manual) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !array(value.history, string) ||
    (value.history as unknown[]).length > 200 ||
    ![-1, 0, 1].includes(value.undoRequester as number) ||
    ![-1, 0, 1].includes(value.resultRequester as number) ||
    ![-1, 0, 1].includes(value.proposedWinner as number) ||
    !string(value.revealedJson) ||
    !Object.values(ManualCombatStage).some((entry) => entry.value === value.combatStage) ||
    !Object.values(Phase).some((phase) => phase !== Phase.None && phase === value.turnPhase) ||
    ![-1, 0, 1].includes(value.attackerSeat as number) ||
    ![-1, 0, 1].includes(value.signalSeat as number) ||
    ![-1, 0, 1].includes(value.signalTargetSeat as number) ||
    ![-1, 0, 1].includes(value.restartRequester as number) ||
    ![-1, 0, 1].includes(value.restartFirstSeat as number) ||
    !Number.isInteger(value.signalRevision) ||
    (value.signalRevision as number) < 0 ||
    !Number.isInteger(value.restartCount) ||
    (value.restartCount as number) < 0
  )
    return false;
  try {
    return array(
      JSON.parse(value.revealedJson),
      (item) =>
        record(item) &&
        string(item.cardId) &&
        (item.artId === undefined || string(item.artId)) &&
        (item.instanceId === undefined || string(item.instanceId)) &&
        (item.zone === undefined || Object.values(Zone).includes(item.zone as Zone)) &&
        seat(item.seat),
    );
  } catch {
    return false;
  }
}

function player(value: unknown, index: number): boolean {
  if (
    !record(value) ||
    !defaultFields(value, playerDefaults) ||
    value.seat !== index ||
    !string(value.displayName) ||
    !string(value.sessionId) ||
    !string(value.avatarId) ||
    !string(value.fieldEffectsJson) ||
    typeof value.connected !== "boolean"
  )
    return false;
  try {
    if (!array(JSON.parse(value.fieldEffectsJson), record)) return false;
  } catch {
    return false;
  }
  return (
    ["deck", "eggDeck", "hand", "security", "trash", "delayZone"].every((key) => array(value[key], card)) &&
    array(
      value.securityView,
      (item) =>
        record(item) &&
        string(item.instanceId) &&
        string(item.cardId) &&
        string(item.artId) &&
        typeof item.faceUp === "boolean",
    ) &&
    ["deckCount", "eggDeckCount", "handCount", "securityCount"].every(
      (key) => number(value[key]) && (value[key] as number) >= 0 && (value[key] as number) <= 1000,
    ) &&
    array(value.battleArea, permanent) &&
    (value.breeding === undefined || value.breeding === null || permanent(value.breeding))
  );
}

function isValidReplayDeckMetadata(value: RecordValue): boolean {
  const icons = value.deckIcons;
  if (
    icons !== undefined &&
    (!Array.isArray(icons) || icons.length !== 2 || !icons.every((item) => item === null || string(item)))
  ) {
    return false;
  }
  if (value.decks === undefined) {
    return true;
  }
  if (!Array.isArray(value.decks) || value.decks.length !== 2) {
    return false;
  }
  return value.decks.every((deck, seatIndex) => {
    if (deck === null) {
      return icons === undefined || icons[seatIndex] === null;
    }
    return (
      record(deck) &&
      string(deck.deckName) &&
      deck.deckName.length <= 256 &&
      array(deck.mainDeck, string) &&
      (deck.mainDeck as unknown[]).length <= 100 &&
      array(deck.eggDeck, string) &&
      (deck.eggDeck as unknown[]).length <= 100 &&
      (deck.mainDeckArts === undefined || array(deck.mainDeckArts, string)) &&
      (deck.eggDeckArts === undefined || array(deck.eggDeckArts, string)) &&
      (icons === undefined || icons[seatIndex] === null || (deck.mainDeck as unknown[]).includes(icons[seatIndex]))
    );
  });
}

export function validateReplay(value: unknown): value is MatchReplay {
  if (
    !record(value) ||
    !safeTree(value) ||
    !isValidReplayDeckMetadata(value) ||
    value.format !== "aegis-replay" ||
    value.version !== REPLAY_FORMAT_VERSION ||
    !string(value.id) ||
    (!seat(value.viewerSeat) && value.viewerSeat !== SPECTATOR_REPLAY_SEAT) ||
    !Array.isArray(value.visibleHandSeats) ||
    !array(value.visibleHandSeats, seat) ||
    value.visibleHandSeats.length < (value.viewerSeat === SPECTATOR_REPLAY_SEAT ? 0 : 1) ||
    value.visibleHandSeats.length > 2 ||
    new Set(value.visibleHandSeats).size !== value.visibleHandSeats.length ||
    (value.viewerSeat === SPECTATOR_REPLAY_SEAT
      ? value.visibleHandSeats.length !== 0
      : !value.visibleHandSeats.includes(value.viewerSeat)) ||
    !array(value.players, string) ||
    (value.players as unknown[]).length !== 2 ||
    !string(value.mode) ||
    !number(value.startedAt) ||
    !number(value.finishedAt) ||
    value.finishedAt < value.startedAt ||
    !number(value.winnerSeat) ||
    ![-1, 0, 1].includes(value.winnerSeat) ||
    !Array.isArray(value.frames) ||
    value.frames.length === 0 ||
    value.frames.length > 5000 ||
    value.frameCount !== value.frames.length
  )
    return false;
  let previousTime = -1;
  let previousVersion = -1;
  for (const frame of value.frames) {
    if (!record(frame) || !number(frame.atMs) || frame.atMs < previousTime || !record(frame.state)) return false;
    const state = frame.state;
    if (
      !defaultFields(state, stateDefaults) ||
      !manualTable(state.manual) ||
      !number(state.stateVersion) ||
      state.stateVersion <= previousVersion ||
      !number(state.turnCount) ||
      !seat(state.turnSeat) ||
      !string(state.phase) ||
      !number(state.memory) ||
      Math.abs(state.memory) > 10 ||
      typeof state.gameOver !== "boolean" ||
      !Array.isArray(state.players) ||
      state.players.length !== 2 ||
      !state.players.every(player) ||
      !record(state.series) ||
      !defaultFields(state.series, stateDefaults.series) ||
      !Array.isArray(frame.events) ||
      !array(frame.events, validReplayEvent)
    )
      return false;
    const batch = frame.events[0]?.batch;
    if (
      frame.events.some((event: RecordValue) => event.batch !== batch) ||
      state.players.some(
        (p: RecordValue) => !(value.visibleHandSeats as unknown[]).includes(p.seat) && (p.hand as unknown[]).length > 0,
      )
    )
      return false;
    // Replay never carries resumable prompts or hidden pile order, including imported files.
    if (
      state.pendingDecision != null ||
      state.combatWindow != null ||
      state.players.some(
        (p: RecordValue) =>
          (p.deck as unknown[]).length > 0 ||
          (p.eggDeck as unknown[]).length > 0 ||
          (p.security as unknown[]).length > 0 ||
          p.manualInspectionJson !== "[]",
      )
    )
      return false;
    previousTime = frame.atMs;
    previousVersion = state.stateVersion;
  }
  return value.frames.at(-1).state.gameOver === true;
}
