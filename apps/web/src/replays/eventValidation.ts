import type { ServerEventKind } from "@aegis/shared";

type RecordValue = Record<string, unknown>;
const string = (value: unknown) => typeof value === "string";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const boolean = (value: unknown) => typeof value === "boolean";
const seat = (value: unknown) => value === 0 || value === 1;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(string);
const records = (value: unknown) => Array.isArray(value) && value.every(record);
const target = (value: unknown) =>
  record(value) && (value.kind === "player" || (value.kind === "permanent" && string(value.permanentId)));
const result = (value: unknown) =>
  record(value) && (value.outcome === "draw" || (value.outcome === "win" && seat(value.winnerSeat)));

type Check = (value: unknown) => boolean;
const shapes = {
  manualAction: { seat, action: string },
  matchStarted: { firstSeat: seat },
  phaseChanged: { phase: string, turnSeat: seat, turnCount: number },
  cardPlayed: { seat, cardId: string },
  digivolved: { seat, permanentId: string, cardId: string, mechanic: string },
  hatched: { seat, permanentId: string, cardId: string },
  movedFromBreeding: { seat, permanentId: string, cardId: string },
  memoryChanged: { from: number, to: number, reason: string },
  dpModifierApplied: { permanentId: string, delta: number },
  attackDeclared: { seat, attackerPermanentId: string, attackerCardId: string, target },
  blockWindowOpened: { attackerPermanentId: string, eligibleBlockerIds: strings },
  blocked: { blockerPermanentId: string },
  blockDeclined: { attackerPermanentId: string },
  counterWindowOpened: { attackerPermanentId: string, defendingSeat: seat, eligibleCounters: records },
  counterResolved: { attackerPermanentId: string, activated: boolean },
  alliancePrompt: { permanentId: string, eligibleAllyIds: strings },
  allianceResolved: { permanentId: string },
  evadePrompt: { permanentId: string },
  evadeResolved: { permanentId: string, accepted: boolean },
  barrierPrompt: { permanentId: string },
  barrierResolved: { permanentId: string, accepted: boolean },
  battleCompared: { attackerPermanentId: string, defenderPermanentId: string, loserPermanentIds: strings },
  combatResolved: { seat, attackerPermanentId: string, deletedPermanentIds: strings },
  attackEnded: { seat, attackerPermanentId: string },
  deletionPrevented: { seat, permanentId: string, keyword: string },
  securityRevealed: { seat, revealedCardId: string, attackerPermanentId: string },
  securityChecked: { seat, revealedCardId: string, resolution: string },
  securityRecovered: { seat, amount: number },
  deckShuffled: { seat, deck: string },
  cardRevealed: { seat, cardId: string },
  effectTargetsSelected: { seat, sourcePermanentId: string, targetPermanentIds: strings },
  effectActivated: { seat, sourceCardId: string, effectKey: string, description: string },
  effectTriggered: { seat, sourceCardId: string, effectKey: string, description: string },
  resolutionOrderChosen: { seat, entries: records },
  effectOptionChosen: { seat, sourceCardId: string, clause: string },
  effectClauseAdvanced: { seat, sourceCardId: string, clause: string },
  effectResolved: { seat, sourceCardId: string, effectKey: string, description: string },
  effectHadNoEffect: { seat, sourceCardId: string, effectKey: string, description: string },
  cardsMoved: { instanceIds: strings, from: string, to: string },
  stackTopResolved: {
    sequenceId: string,
    permanentId: string,
    strippedInstanceId: string,
    topInstanceId: string,
    baseDP: number,
    currentDP: number,
  },
  turnEnded: { endingSeat: seat, nextSeat: seat, turnCount: number },
  actionRejected: { intent: string, reason: string },
  gameOver: { result, reason: string },
  finalReveal: { players: records },
  batchClosed: { lastSeq: number },
} satisfies Record<ServerEventKind, Record<string, Check>>;

/** Imported narration is untrusted, just like the board snapshots. */
export function validReplayEvent(value: unknown): boolean {
  if (
    !record(value) ||
    typeof value.kind !== "string" ||
    !Object.hasOwn(shapes, value.kind) ||
    !number(value.seq) ||
    !string(value.batch) ||
    !number(value.stateVersion)
  )
    return false;
  if (value.kind === "finalReveal" || value.kind === "actionRejected" || value.kind === "batchClosed") return false;
  const shape: Record<string, Check> = shapes[value.kind as ServerEventKind];
  if (!Object.entries(shape).every(([key, check]) => check(value[key]))) return false;
  for (const [key, check] of Object.entries({
    seat,
    cardId: string,
    fromSeat: seat,
    fromHost: (host: unknown) => record(host) && string(host.permanentId) && string(host.hostCardId),
    artId: string,
    permanentId: string,
    instanceId: string,
    sourceCardId: string,
    sourceInstanceId: string,
    sourcePermanentId: string,
    sourceCardIds: strings,
    sourceArtIds: strings,
    cardIds: strings,
    artIds: strings,
    attackerArtId: string,
    targetCardId: string,
    targetArtId: string,
    redirected: boolean,
    inBreeding: boolean,
    mustBlock: boolean,
    isInherited: boolean,
    digivolutionPerformed: boolean,
    timing: string,
    hasSecurityEffect: boolean,
    isDigimon: boolean,
    securityCountBefore: number,
    attackerDP: number,
    securityCardDP: number,
    deletedPermanents: records,
    returnedPermanents: records,
    trashedPermanents: records,
  }))
    if (value[key] !== undefined && !check(value[key])) return false;
  for (const key of [
    "deckToUnder",
    "placedUnder",
    "strippedStackTops",
    "trashedSources",
    "turnEndDeletion",
    "battle",
    "effectBattle",
  ])
    if (value[key] !== undefined && !record(value[key])) return false;
  return true;
}
