import { GameState, PlayerState, Phase, Zone, getCardDefinition, resolveCardArt } from "@aegis/shared";
import { clearBattleArea, clearZone, setBreeding } from "../state/access.js";
import { createBoardIds, layBoard, type AliasTable, type CardSpec, type PermanentSpec } from "./board.js";

export type { ScenarioFixture, ScenarioReferences } from "./types.js";
import type { ScenarioFixture, ScenarioReferences } from "./types.js";
import type { Decklist } from "../setup.js";

/** Bind cards dealt from optional staged decks while keeping the fixture's recorded pile order. */
export function bindScenarioDecks(fixture: ScenarioFixture, decks?: readonly [Decklist, Decklist]): ScenarioFixture {
  if (!decks) return fixture;
  const result = structuredClone(fixture);
  const bind = (spec: CardSpec): boolean => {
    if (typeof spec === "string" || !spec.fromDeck) return true;
    const { seat, index, egg } = spec.fromDeck;
    const deck = decks[seat];
    const card = (egg ? deck.eggDeck : deck.mainDeck)[index];
    if (!card) return false;
    spec.card = card;
    spec.artId = resolveCardArt(card, (egg ? deck.eggDeckArts : deck.mainDeckArts)?.[index]).artId;
    return true;
  };
  for (const seat of [0, 1] as const) {
    const player = result.board[seat];
    if (!player) continue;
    for (const zone of ["hand", "deck", "eggDeck", "trash", "delayZone"] as const)
      if (player[zone]) player[zone] = player[zone]!.filter(bind);
    if (Array.isArray(player.security)) player.security = player.security.filter(bind);
    for (const permanent of [...(player.battleArea ?? []), ...(player.breeding ? [player.breeding] : [])]) {
      if (typeof permanent === "string") continue;
      if (permanent.top) {
        if (!bind(permanent.top)) throw new Error("Missing staged deck card for a scenario permanent");
        permanent.card = typeof permanent.top === "string" ? permanent.top : permanent.top.card;
      }
      for (const card of [...(permanent.under ?? []), ...(permanent.linked ?? [])])
        if (!bind(card)) throw new Error("Missing staged deck card for a scenario stack or link");
    }
  }
  return result;
}

/** Check local authoring errors before clearing the receiving board. */
export function validateScenarioFixture(fixture: ScenarioFixture): void {
  if (!Number.isInteger(fixture.memory) || Math.abs(fixture.memory) > (fixture.allowOutOfRangeMemory ? 127 : 10))
    throw new Error("Scenario memory must be an integer from -10 to 10");
  if (fixture.turnSeat !== 0 && fixture.turnSeat !== 1) throw new Error("Scenario turnSeat must be 0 or 1");
  if (!Number.isInteger(fixture.turnCount) || fixture.turnCount < 0 || fixture.turnCount >= 4294967295)
    throw new Error("Scenario turnCount must leave room for the next uint32 turn");
  if (typeof fixture.isFirstPlayersFirstTurn !== "boolean")
    throw new Error("Scenario isFirstPlayersFirstTurn must be explicit");
  if (!fixture.board || Object.keys(fixture.board).some((seat) => seat !== "0" && seat !== "1"))
    throw new Error("Scenario board must contain only seats 0 and 1");
  const aliases = new Set<string>();
  const permanentAliases = new Set<string>();
  const checkNumber = (value: number | undefined, label: string, uint = false) => {
    if (value !== undefined && (!Number.isInteger(value) || (uint && (value < 0 || value > 4294967295))))
      throw new Error(`Invalid scenario ${label}`);
  };
  const checkCard = (spec: CardSpec | PermanentSpec) => {
    const card = typeof spec === "string" ? spec : spec.card;
    if (!getCardDefinition(card)) throw new Error(`Unknown scenario card: ${card}`);
    const alias = typeof spec === "string" ? undefined : spec.as;
    if (alias !== undefined) {
      if (!alias || aliases.has(alias)) throw new Error(`Duplicate or empty scenario alias: ${alias}`);
      aliases.add(alias);
    }
    if (typeof spec !== "string") {
      const cardSpec = spec as Exclude<CardSpec, string>;
      if (cardSpec.ownerSeat !== undefined && cardSpec.ownerSeat !== 0 && cardSpec.ownerSeat !== 1)
        throw new Error("Invalid scenario ownerSeat");
      if (cardSpec.faceUp !== undefined && typeof cardSpec.faceUp !== "boolean")
        throw new Error("Invalid scenario faceUp");
      if (cardSpec.artId !== undefined && typeof cardSpec.artId !== "string") throw new Error("Invalid scenario artId");
      if (cardSpec.fromDeck) {
        if (cardSpec.fromDeck.seat !== 0 && cardSpec.fromDeck.seat !== 1) throw new Error("Invalid scenario deck seat");
        checkNumber(cardSpec.fromDeck.index, "deck index", true);
        if (cardSpec.fromDeck.index === undefined) throw new Error("Missing scenario deck index");
        if (cardSpec.fromDeck.egg !== undefined && typeof cardSpec.fromDeck.egg !== "boolean")
          throw new Error("Invalid scenario egg recipe");
      }
    }
  };
  for (const seat of [0, 1] as const) {
    const player = fixture.board[seat];
    if (!player) continue;
    for (const zone of ["hand", "deck", "eggDeck", "trash", "delayZone"] as const)
      for (const card of player[zone] ?? []) checkCard(card);
    if (typeof player.security === "number") {
      if (!Number.isInteger(player.security) || player.security < 0)
        throw new Error("Scenario security count must be a non-negative integer");
    } else for (const card of player.security ?? []) checkCard(card);
    for (const permanent of [...(player.battleArea ?? []), ...(player.breeding ? [player.breeding] : [])]) {
      checkCard(permanent);
      if (typeof permanent !== "string") {
        if (permanent.as) permanentAliases.add(permanent.as);
        checkNumber(permanent.dp, "base DP");
        checkNumber(permanent.currentDP, "current DP");
        checkNumber(permanent.enterFieldTurnCount, "entry turn");
        if (
          permanent.enterFieldTurnCount !== undefined &&
          (permanent.enterFieldTurnCount < -1 || permanent.enterFieldTurnCount > 4294967295)
        )
          throw new Error("Invalid scenario entry turn");
        for (const key of ["suspended", "enteredThisTurn", "placedByEffect", "inBreeding"] as const)
          if (permanent[key] !== undefined && typeof permanent[key] !== "boolean")
            throw new Error(`Invalid scenario ${key}`);
        if (permanent.top) {
          checkCard(permanent.top);
          if ((typeof permanent.top === "string" ? permanent.top : permanent.top.card) !== permanent.card)
            throw new Error("Scenario top card must match permanent card");
        }
        for (const card of [...(permanent.under ?? []), ...(permanent.linked ?? [])]) checkCard(card);
      }
    }
  }
  for (const effect of fixture.effects ?? []) {
    if (!["suspendLock", "holyProtection"].includes(effect.kind)) throw new Error("Invalid scenario effect kind");
    if (!permanentAliases.has(effect.permanent))
      throw new Error(`Unknown scenario effect permanent: ${effect.permanent}`);
  }
  const presentation = fixture.presentation;
  if (presentation?.timed !== undefined && typeof presentation.timed !== "boolean")
    throw new Error("Invalid scenario timer");
  checkNumber(presentation?.holdBotAfterTurn, "opponent hold turn", true);
  const opponent = presentation?.opponent;
  if (opponent) {
    if (opponent.fallbackMain !== undefined && !["end", "evaluate"].includes(opponent.fallbackMain))
      throw new Error("Invalid scenario opponent fallback");
    if (opponent.endBreeding !== undefined && typeof opponent.endBreeding !== "boolean")
      throw new Error("Invalid scenario opponent breeding");
    if (opponent.blockerCard) checkCard(opponent.blockerCard);
    for (const action of opponent.main ?? []) {
      if (!["attack", "play", "digivolve"].includes(action.kind)) throw new Error("Invalid scenario opponent action");
      if (action.kind !== "attack") checkCard(action.card);
      if (action.kind === "digivolve") checkCard(action.base);
      if (action.kind === "play" && action.whenOpponentCard) checkCard(action.whenOpponentCard);
    }
    for (const rule of opponent.decisions ?? []) {
      checkCard(rule.sourceCard);
      if (!["optional", "orderTriggers", "chooseTargets", "selectCards", "chooseOption"].includes(rule.kind))
        throw new Error("Invalid scenario opponent decision");
      if ((rule.kind === "chooseTargets" || rule.kind === "selectCards") && !aliases.has(rule.target ?? ""))
        throw new Error("Unknown scenario opponent target");
      if (rule.kind === "chooseOption" && !rule.choice && !rule.choiceStartsWith)
        throw new Error("Missing scenario opponent choice");
    }
  }
}

export function arrangeScenarioTurn(state: GameState, fixture: ScenarioFixture): void {
  state.phase = Phase.None;
  state.memory = fixture.memory;
  state.turnSeat = fixture.turnSeat;
  state.turnCount = fixture.turnCount;
  state.isFirstPlayersFirstTurn = fixture.isFirstPlayersFirstTurn;
  // Fixtures start before Active increments turnCount; fresh cards belong to that upcoming turn.
  for (const seat of [0, 1] as const) {
    const player = state.players[seat];
    const spec = fixture.board[seat];
    if (!player || !spec) continue;
    for (const [index, permanent] of (spec.battleArea ?? []).entries()) {
      if (typeof permanent !== "string" && permanent.enteredThisTurn)
        player.battleArea[index]!.enterFieldTurnCount = fixture.turnCount + 1;
    }
    if (spec.breeding && typeof spec.breeding !== "string" && spec.breeding.enteredThisTurn && player.breeding)
      player.breeding.enterFieldTurnCount = fixture.turnCount + 1;
  }
}

/** Materialize fresh identities on each board, preserving the seated players and visibility ports. */
export function layScenarioFixture(
  state: GameState,
  value: ScenarioFixture,
  decks?: readonly [Decklist, Decklist],
  preservePhase = false,
): ScenarioReferences {
  validateScenarioFixture(value);
  const fixture = bindScenarioDecks(value, decks);
  const phase = state.phase;
  validateScenarioFixture(fixture);
  for (const seat of [0, 1] as const) if (!state.players[seat]) throw new Error(`Scenario seat ${seat} is not seated`);
  for (const seat of [0, 1] as const) {
    const player = state.players[seat]!;
    for (const zone of [Zone.Hand, Zone.Deck, Zone.EggDeck, Zone.Trash, Zone.Security, Zone.Delay] as const)
      clearZone(player, zone);
    clearBattleArea(player);
    setBreeding(player, undefined);
  }
  const aliases: AliasTable = new Map();
  layBoard(state, fixture.board, aliases, { ...createBoardIds("scenario-"), named: true });
  arrangeScenarioTurn(state, fixture);
  if (preservePhase) state.phase = phase;
  const lookup = (alias: string) => {
    const entry = aliases.get(alias);
    if (!entry) throw new Error(`Unknown scenario alias: ${alias}`);
    return entry;
  };
  return {
    instanceId(alias) {
      const entry = lookup(alias);
      return entry.kind === "instance" ? entry.id : entry.instanceId!;
    },
    permanentId(alias) {
      const entry = lookup(alias);
      if (entry.kind !== "permanent") throw new Error(`Scenario alias ${alias} is not a permanent`);
      return entry.id;
    },
  };
}

/** References are deterministic and can be obtained before a browser room starts. */
export function scenarioReferences(fixture: ScenarioFixture): ScenarioReferences {
  const state = new GameState();
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    state.players[seat] = player;
  }
  return layScenarioFixture(state, fixture);
}
