import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { GameEngineHooks } from "#api/engine/gameEngine/types";
import { describe, expect, it, vi } from "vitest";
import { Decoder, Encoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { clearZone } from "#api/engine/state/access";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import { Zone, Phase, CardColor, CardKind, type Seat } from "@aegis/shared/schema/enums";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { ManualController } from "#api/manual/ManualController";
import { GameEngine } from "#api/engine/GameEngine";
import { runSetup, finalizeSecurity } from "#api/engine/setup";
import { RED_DECK, BLUE_DECK } from "#api/engine/testDecks";
import { buildStateView, syncPublicCounts } from "#api/engine/state/visibility";

type TableOptions = { skipBreeding?: boolean };

function createTable({ skipBreeding = true }: TableOptions = {}) {
  const state = new GameState();
  state.gameMode = GameMode.MANUAL.value;
  runSetup(state, {
    seats: [
      { sessionId: "first", displayName: "First", deck: RED_DECK },
      { sessionId: "second", displayName: "Second", deck: BLUE_DECK },
    ],
    seed: 9,
    firstSeat: 0,
    randomKey: "manual-test-key",
  });
  finalizeSecurity(state);
  const emit = vi.fn<(event: ServerEvent) => void>();
  const controller = new ManualController({ state, seed: 9, randomKey: "manual-test-key", emit });
  controller.begin();
  let sequence = 0;
  const send = (seat: Seat, command: ManualCommand) =>
    controller.apply(seat, {
      type: "manual",
      requestId: `operation-${++sequence}`,
      revision: state.manual.revision,
      command,
    });
  const play = (seat: Seat = 0) => {
    const instanceId = state.players[seat]!.hand[0]!.instanceId;
    expect(
      send(seat, {
        action: "move",
        from: { zone: Zone.Hand, instanceId },
        to: { zone: Zone.BattleArea },
        wholePile: false,
      }).ok,
    ).toBe(true);
    return state.players[seat]!.battleArea.at(-1)!;
  };
  if (skipBreeding && state.manual.turnPhase === Phase.Breeding) {
    send(state.turnSeat, { action: "breeding", choice: "skip" });
  }
  return { state, controller, send, play, emit };
}

const encoders = new WeakMap<GameState, Encoder<GameState>>();

function decodeView(state: GameState, seat?: Seat) {
  syncPublicCounts(state);
  let encoder = encoders.get(state);
  if (!encoder) {
    encoder = new Encoder(state);
    encoders.set(state, encoder);
  }
  const view = buildStateView(state, seat);
  const decoder = new Decoder(new GameState());
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  decoder.decode(encoder.encodeAllView(view!, iterator.offset, iterator));
  encoder.discardChanges();
  return decoder.state;
}

describe("manual table operations", () => {
  it("moves cards out of turn without paying costs, drawing for evolution or triggering rules", () => {
    const { state, play, send, emit } = createTable();
    const permanent = play(1);
    const hand = state.players[1]!.hand;
    const card = hand[0]!;
    const count = hand.length;
    expect(
      send(1, {
        action: "move",
        from: { zone: Zone.Hand, instanceId: card.instanceId },
        to: { zone: Zone.BattleArea, permanentId: permanent.permanentId, part: "top" },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(permanent.stack).toHaveLength(1);
    expect(permanent.topCard.instanceId).toBe(card.instanceId);
    expect(hand).toHaveLength(count - 1);
    expect(state.memory).toBe(0);
    expect(state.turnSeat).toBe(0);
    expect(send(1, { action: "dp", permanentId: permanent.permanentId, value: 0 }).ok).toBe(true);
    expect(state.players[1]!.battleArea).toContain(permanent);
    expect(emit.mock.calls.flat().some((event) => event.kind === "effectTriggered" || event.kind === "gameOver")).toBe(
      false,
    );
  });

  it("moves whole piles between creation and battle and merges sources and links", () => {
    const { state, send, play } = createTable();
    const first = play();
    const second = play();
    const card = state.players[0]!.hand[0]!;
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Hand, instanceId: card.instanceId },
        to: { zone: Zone.BattleArea, permanentId: first.permanentId, part: "link" },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.BattleArea, permanentId: first.permanentId },
        to: { zone: Zone.Breeding },
        wholePile: true,
      }).ok,
    ).toBe(true);
    expect(state.players[0]!.breeding).toBe(first);
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Breeding, permanentId: first.permanentId },
        to: { zone: Zone.BattleArea, permanentId: second.permanentId, part: "source" },
        wholePile: true,
      }).ok,
    ).toBe(true);
    expect(second.stack).toHaveLength(1);
    expect(second.linked[0]).toBe(card);
    expect(state.players[0]!.breeding).toBeUndefined();
  });

  it("preserves whole pile blocks for evolution and bottom insertion", () => {
    const { state, send, play } = createTable();
    const target = play();
    const incoming = play();
    for (const permanent of [target, incoming]) {
      const card = state.players[0]!.hand[0]!;
      send(0, {
        action: "move",
        from: { zone: Zone.Hand, instanceId: card.instanceId },
        to: { zone: Zone.BattleArea, permanentId: permanent.permanentId, part: "top" },
        wholePile: false,
      });
    }
    const originalTarget = [...target.stack, target.topCard].map((card) => card.instanceId);
    const originalIncoming = [...incoming.stack, incoming.topCard].map((card) => card.instanceId);
    send(0, {
      action: "move",
      from: { zone: Zone.BattleArea, permanentId: incoming.permanentId },
      to: { zone: Zone.BattleArea, permanentId: target.permanentId, part: "top" },
      wholePile: true,
    });
    expect([...target.stack, target.topCard].map((card) => card.instanceId)).toEqual([
      ...originalTarget,
      ...originalIncoming,
    ]);
    send(0, { action: "requestUndo" });
    send(1, { action: "answerUndo", accept: true });
    send(0, {
      action: "move",
      from: { zone: Zone.BattleArea, permanentId: incoming.permanentId },
      to: { zone: Zone.BattleArea, permanentId: target.permanentId, part: "source", position: "bottom" },
      wholePile: true,
    });
    expect([...target.stack, target.topCard].map((card) => card.instanceId)).toEqual([
      ...originalIncoming,
      ...originalTarget,
    ]);
  });

  it("keeps cards moved to the public Delay area visible to both players", () => {
    const { state, send } = createTable();
    const card = state.players[0]!.hand[0]!;
    send(0, {
      action: "move",
      from: { zone: Zone.Hand, instanceId: card.instanceId },
      to: { zone: Zone.Delay },
      wholePile: false,
    });
    expect(decodeView(state, 1).players[0]!.delayZone[0]!.cardId).toBe(card.cardId);
  });

  it("rejects an occupied breeding area and a top-only move that would orphan links", () => {
    const { state, send, play } = createTable();
    const permanent = play();
    expect(
      send(0, { action: "move", from: { zone: Zone.EggDeck, index: 0 }, to: { zone: Zone.Breeding }, wholePile: false })
        .ok,
    ).toBe(true);
    const snapshot = JSON.stringify(state.toJSON());
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.BattleArea, permanentId: permanent.permanentId },
        to: { zone: Zone.Breeding },
        wholePile: true,
      }).ok,
    ).toBe(false);
    expect(JSON.stringify(state.toJSON())).toBe(snapshot);
    const card = state.players[0]!.hand[0]!;
    send(0, {
      action: "move",
      from: { zone: Zone.Hand, instanceId: card.instanceId },
      to: { zone: Zone.BattleArea, permanentId: permanent.permanentId, part: "link" },
      wholePile: false,
    });
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.BattleArea, permanentId: permanent.permanentId },
        to: { zone: Zone.Trash },
        wholePile: false,
      }).ok,
    ).toBe(false);
    expect(permanent.linked[0]).toBe(card);
  });

  it("refuses opponent cards, malformed commands, duplicate requests and stale revisions", () => {
    const { state, controller, send, play } = createTable();
    const opponent = play(1);
    expect(send(0, { action: "dp", permanentId: opponent.permanentId, value: 999 }).ok).toBe(false);
    expect(
      controller.apply(0, {
        type: "manual",
        requestId: "bad",
        revision: state.manual.revision,
        command: { action: "memory", value: 99 },
      }).ok,
    ).toBe(false);
    const intent = {
      type: "manual",
      requestId: "once",
      revision: state.manual.revision,
      command: { action: "draw", count: 1 },
    };
    const before = state.players[0]!.hand.length;
    expect(controller.apply(0, intent).ok).toBe(true);
    expect(controller.apply(0, intent).ok).toBe(true);
    expect(state.players[0]!.hand).toHaveLength(before + 1);
    expect(controller.apply(1, { ...intent, requestId: "stale" }).ok).toBe(false);
  });

  it("keeps deck and security inspections private across fresh views and recordings", async () => {
    const { state, send } = createTable();
    const hiddenId = state.players[0]!.deck[0]!.instanceId;
    send(0, { action: "inspect", zone: Zone.Deck, count: 3 });
    expect(JSON.parse(decodeView(state, 0).players[0]!.manualInspectionJson)).toHaveLength(3);
    for (const seat of [1, undefined] as const) {
      const view = decodeView(state, seat);
      expect(view.players[0]!.manualInspectionJson).toBe("[]");
      expect(view.players[0]!.deck).toHaveLength(0);
      expect(JSON.stringify(view.toJSON())).not.toContain(hiddenId);
    }
    const { recordingState } = await import("#api/replays/recording");
    expect(recordingState(state).players[0]!.manualInspectionJson).toBe("[]");
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Deck, instanceId: hiddenId },
        to: { zone: Zone.Hand },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(JSON.parse(state.players[0]!.manualInspectionJson)).toHaveLength(2);
    send(0, { action: "inspect", zone: Zone.Security, count: 5 });
    expect(JSON.parse(decodeView(state, 0).players[0]!.manualInspectionJson)).toHaveLength(5);
    expect(decodeView(state, 1).players[0]!.securityView.every((card) => card.cardId === "")).toBe(true);
  });

  it("reveals explicitly and restores privacy when security returns to a hidden pile", () => {
    const { state, send } = createTable();
    const card = state.players[0]!.security[0]!;
    send(0, { action: "reveal", from: { zone: Zone.Security, index: 0 } });
    expect(decodeView(state, 1).players[0]!.securityView[0]!.cardId).toBe(card.cardId);
    send(0, {
      action: "move",
      from: { zone: Zone.Security, index: 0 },
      to: { zone: Zone.Deck, position: "bottom" },
      wholePile: false,
    });
    expect(card.faceUp).toBe(false);
    expect(decodeView(state, 1).players[0]!.deck).toHaveLength(0);
  });

  it("prepares the next turn once and preserves the physical memory position", () => {
    const { state, send, play } = createTable();
    const permanent = play(1);
    send(1, { action: "suspend", permanentId: permanent.permanentId, suspended: true });
    send(0, { action: "memory", value: -4 });
    expect(state.turnSeat).toBe(0);
    const handCount = state.players[1]!.hand.length;
    expect(send(1, { action: "pass" }).ok).toBe(false);
    send(0, { action: "pass" });
    expect(state.turnSeat).toBe(1);
    expect(state.memory).toBe(4);
    expect(state.players[1]!.hand).toHaveLength(handCount + 1);
    expect(permanent.isSuspended).toBe(false);
    expect(state.manual.turnPhase).toBe(Phase.Breeding);
  });

  it("requires opponent agreement to undo and retains the public audit trail", () => {
    const { state, send } = createTable();
    const before = state.players[0]!.deck[0]!.instanceId;
    send(0, { action: "draw", count: 1 });
    send(0, { action: "requestUndo" });
    expect(send(0, { action: "answerUndo", accept: true }).ok).toBe(false);
    expect(send(1, { action: "draw", count: 1 }).ok).toBe(false);
    send(1, { action: "answerUndo", accept: false });
    expect(state.players[0]!.deck[0]!.instanceId).not.toBe(before);
    send(0, { action: "requestUndo" });
    send(1, { action: "answerUndo", accept: true });
    expect(state.players[0]!.deck[0]!.instanceId).toBe(before);
    expect(state.players[0]!.hand).toHaveLength(5);
    expect(state.manual.history.some((line) => line.includes("draw 1"))).toBe(true);
    expect(state.manual.canUndo).toBe(false);
  });

  it("restores merged pile identities and facing after undo", () => {
    const { state, play, send } = createTable();
    const first = play();
    const second = play();
    send(0, {
      action: "move",
      from: { zone: Zone.BattleArea, permanentId: first.permanentId },
      to: { zone: Zone.BattleArea, permanentId: second.permanentId, part: "source" },
      wholePile: true,
    });
    send(1, { action: "requestUndo" });
    send(0, { action: "answerUndo", accept: true });
    expect(state.players[0]!.battleArea.map((entry) => entry.permanentId)).toEqual([
      first.permanentId,
      second.permanentId,
    ]);
    expect(second.stack).toHaveLength(0);
    expect(decodeView(state, 1).players[0]!.battleArea).toHaveLength(2);
  });

  it("requires agreement for a result and never declares victory from an empty deck", () => {
    const { state, send } = createTable();
    send(0, { action: "draw", count: 40 });
    expect(state.players[0]!.deck).toHaveLength(0);
    expect(state.gameOver).toBe(false);
    send(0, { action: "proposeResult", winnerSeat: 0 });
    expect(send(0, { action: "answerResult", accept: true }).ok).toBe(false);
    send(1, { action: "answerResult", accept: false });
    expect(state.gameOver).toBe(false);
    send(1, { action: "proposeResult", winnerSeat: -1 });
    send(0, { action: "answerResult", accept: true });
    expect(state.gameOver).toBe(true);
    expect(state.winnerSeat).toBe(-1);
  });

  it("runs manual preparation through the engine facade and rejects automatic gameplay", async () => {
    const state = new GameState();
    state.gameMode = GameMode.MANUAL.value;
    const emit = vi.fn<(event: ServerEvent) => void>();
    const engine = new GameEngine(state, {
      seed: 0,
      emit,
      requestDecision: vi.fn<GameEngineHooks["requestDecision"]>(),
    });
    engine.seatPlayer(0, "a", { displayName: "First", deck: RED_DECK });
    engine.seatPlayer(1, "b", { displayName: "Second", deck: BLUE_DECK });
    engine.startMatch();
    const choice = state.pendingDecision!;
    expect(choice.kind).toBe("chooseOption");
    engine.applyIntent(choice.seat, {
      type: "respondDecision",
      decisionId: choice.decisionId,
      response: { kind: "chooseOption", optionIndex: 1 },
    });
    await vi.waitFor(() => expect(state.pendingDecision?.kind).toBe("mulligan"));
    expect(state.turnSeat).toBe(1);
    engine.applyIntent(1, { type: "mulligan", keep: false });
    await vi.waitFor(() => expect(state.pendingDecision?.seat).toBe(0));
    engine.applyIntent(0, { type: "mulligan", keep: true });
    await vi.waitFor(() => expect(state.turnCount).toBe(1));
    expect(state.players[0]!.security).toHaveLength(5);
    expect(state.players[1]!.hand).toHaveLength(5);
    expect(engine.applyIntent(1, { type: "playCard", instanceId: state.players[1]!.hand[0]!.instanceId }).ok).toBe(
      false,
    );
    expect(engine.applyIntent(1, { type: "endPhase" }).ok).toBe(false);
    expect(engine.applyIntent(0, { type: "surrender" }).ok).toBe(true);
    expect(state.gameOver).toBe(true);
  });
});

describe("manual structured table tools", () => {
  it("changes structured modifiers only on owned permanents and restores them through agreed undo", () => {
    const { state, play, send } = createTable();
    const permanent = play();
    const command = {
      action: "modifiers",
      permanentId: permanent.permanentId,
      securityAttackModifier: -2,
      keywords: ["Blocker", "Rush"],
      colors: [CardColor.Blue],
    } as const;
    expect(send(1, { ...command, keywords: [...command.keywords], colors: [...command.colors] }).ok).toBe(false);
    expect(send(0, { ...command, keywords: [...command.keywords], colors: [...command.colors] }).ok).toBe(true);
    expect(permanent.securityAttack).toBe(0);
    expect(Array.from(permanent.keywords)).toEqual(["Blocker", "Rush"]);
    expect(Array.from(permanent.originalColorsOverride)).toEqual([CardColor.Blue]);
    expect(send(0, { action: "requestUndo" }).ok).toBe(true);
    expect(send(1, { action: "answerUndo", accept: true }).ok).toBe(true);
    expect(permanent.securityAttackModifier).toBe(0);
    expect(permanent.keywords).toHaveLength(0);
    expect(state.manual.history.at(-1)).toContain("accept undo");
  });

  it("creates only registered tokens with deterministic identities and refuses destruction of attached real cards", () => {
    const { state, send } = createTable();
    expect(send(0, { action: "createToken", cardId: "BT1-010" }).ok).toBe(false);
    const cardId = tokenDefinitions[0]!.cardId;
    expect(send(0, { action: "createToken", cardId }).ok).toBe(true);
    const permanent = state.players[0]!.battleArea[0]!;
    expect(permanent.topCard.instanceId).toBe(`manual-token-0-${state.manual.revision}`);
    expect(permanent.currentDP).toBe(tokenDefinitions[0]!.dp ?? 0);
    expect(send(1, { action: "removeToken", permanentId: permanent.permanentId }).ok).toBe(false);
    const card = state.players[0]!.hand[0]!;
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Hand, instanceId: card.instanceId },
        to: { zone: Zone.BattleArea, permanentId: permanent.permanentId, part: "source" },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(send(0, { action: "removeToken", permanentId: permanent.permanentId }).ok).toBe(false);
    expect(
      send(0, {
        action: "move",
        from: {
          zone: Zone.BattleArea,
          permanentId: permanent.permanentId,
          part: "source",
          instanceId: card.instanceId,
        },
        to: { zone: Zone.Hand },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(send(0, { action: "removeToken", permanentId: permanent.permanentId }).ok).toBe(true);
    expect(state.players[0]!.battleArea).toHaveLength(0);
    expect(send(0, { action: "requestUndo" }).ok).toBe(true);
    expect(send(1, { action: "answerUndo", accept: true }).ok).toBe(true);
    expect(state.players[0]!.battleArea[0]!.topCard.cardId).toBe(cardId);
  });

  it("appends batches without replacing opponent reveals and clears only the actor gallery", () => {
    const { state, send } = createTable();
    expect(send(0, { action: "reveal", from: { zone: Zone.Deck }, count: 3 }).ok).toBe(true);
    expect(send(0, { action: "reveal", from: { zone: Zone.Deck }, count: 2 }).ok).toBe(true);
    expect(send(1, { action: "reveal", from: { zone: Zone.Hand }, count: 2 }).ok).toBe(true);
    expect(JSON.parse(state.manual.revealedJson)).toHaveLength(5);
    expect(send(0, { action: "clearReveals" }).ok).toBe(true);
    expect(JSON.parse(state.manual.revealedJson)).toHaveLength(2);
    expect(send(0, { action: "reveal", from: { zone: Zone.Deck, index: 49 }, count: 55 }).ok).toBe(false);
    expect(state.players[0]!.deck[0]!.faceUp).toBe(false);
  });

  it("controls security and field faces without exposing private hand or deck zones", () => {
    const { state, play, send } = createTable();
    const permanent = play();
    expect(
      send(0, { action: "flip", from: { zone: Zone.BattleArea, permanentId: permanent.permanentId }, faceUp: false })
        .ok,
    ).toBe(true);
    expect(decodeView(state, 1).players[0]!.battleArea[0]!.topCard.cardId).toBeUndefined();
    expect(decodeView(state, 0).players[0]!.battleArea[0]!.topCard.cardId).toBe(permanent.topCard.cardId);
    expect(send(0, { action: "flip", from: { zone: Zone.Security }, faceUp: true }).ok).toBe(true);
    expect(decodeView(state, 1).players[0]!.securityView[0]!.cardId).toBe(state.players[0]!.security[0]!.cardId);
    expect(send(0, { action: "flip", from: { zone: Zone.Deck }, faceUp: true }).ok).toBe(false);
    expect(send(0, { action: "flip", from: { zone: Zone.Hand }, faceUp: true }).ok).toBe(false);
  });

  it("tracks phases and combat decisions without executing rules or changing suspension", () => {
    const { state, play, send } = createTable();
    const attacker = play();
    const blocker = play(1);
    expect(send(1, { action: "phase", phase: Phase.Draw }).ok).toBe(false);
    expect(send(0, { action: "phase", phase: Phase.Draw }).ok).toBe(false);
    expect(state.phase).toBe(Phase.Main);
    const handCount = state.players[0]!.hand.length;
    expect(send(1, { action: "attack", permanentId: blocker.permanentId }).ok).toBe(false);
    expect(send(0, { action: "attack", permanentId: attacker.permanentId }).ok).toBe(true);
    expect(send(1, { action: "combat", stage: ManualCombatStage.COUNTER.value }).ok).toBe(false);
    expect(send(1, { action: "combat", stage: ManualCombatStage.RESOLUTION.value }).ok).toBe(false);
    expect(send(0, { action: "combat", stage: ManualCombatStage.COUNTER.value }).ok).toBe(true);
    expect(send(1, { action: "combat", stage: ManualCombatStage.BLOCK.value }).ok).toBe(true);
    expect(
      send(1, { action: "combat", stage: ManualCombatStage.RESOLUTION.value, blockerPermanentId: blocker.permanentId })
        .ok,
    ).toBe(true);
    expect(state.manual.blockerPermanentId).toBe(blocker.permanentId);
    expect(send(0, { action: "combat", stage: ManualCombatStage.SECURITY.value }).ok).toBe(false);
    expect(state.combatWindow).toBeUndefined();
    expect(attacker.isSuspended).toBe(false);
    expect(blocker.isSuspended).toBe(false);
    expect(state.players[0]!.hand).toHaveLength(handCount);
    expect(send(1, { action: "combat", stage: ManualCombatStage.NONE.value }).ok).toBe(true);
    expect(state.manual.attackerPermanentId).toBe("");
    expect(send(0, { action: "pass" }).ok).toBe(true);
    expect(state.manual.turnPhase).toBe(Phase.Breeding);
  });
});

describe("manual statuses, training and public signals", () => {
  it("keeps simultaneous statuses and resets all modifiers without changing suspension", () => {
    const { play, send } = createTable();
    const permanent = play();
    expect(send(1, { action: "statuses", permanentId: permanent.permanentId, statuses: ["sick"] }).ok).toBe(false);
    expect(
      send(0, { action: "statuses", permanentId: permanent.permanentId, statuses: ["sick", "taunt", "immune"] }).ok,
    ).toBe(true);
    expect(Array.from(permanent.manualStatuses)).toEqual(["sick", "taunt", "immune"]);
    send(0, { action: "dp", permanentId: permanent.permanentId, value: 24000 });
    send(0, {
      action: "modifiers",
      permanentId: permanent.permanentId,
      securityAttackModifier: 4,
      keywords: ["Rush"],
      colors: [CardColor.White],
    });
    send(0, { action: "marker", permanentId: permanent.permanentId, text: "custom" });
    send(0, { action: "suspend", permanentId: permanent.permanentId, suspended: true });
    expect(send(0, { action: "resetModifiers", permanentId: permanent.permanentId }).ok).toBe(true);
    expect(permanent.currentDP).toBe(permanent.baseDP);
    expect(permanent.securityAttack).toBe(1);
    expect(permanent.securityAttackModifier).toBe(0);
    expect(permanent.keywords).toHaveLength(0);
    expect(permanent.originalColorsOverride).toHaveLength(0);
    expect(permanent.manualMarker).toBe("");
    expect(permanent.manualStatuses).toHaveLength(0);
    expect(permanent.isSuspended).toBe(true);
    send(0, { action: "requestUndo" });
    expect(send(1, { action: "answerUndo", accept: true }).ok).toBe(true);
    expect(Array.from(permanent.manualStatuses)).toEqual(["sick", "taunt", "immune"]);
    expect(permanent.currentDP).toBe(24000);
  });

  it("trains with exactly the top deck card under an owned battle permanent and supports undo", () => {
    const { state, play, send } = createTable();
    const permanent = play();
    const card = state.players[0]!.deck[0]!;
    const deckCount = state.players[0]!.deck.length;
    const handCount = state.players[0]!.hand.length;
    expect(send(1, { action: "training", permanentId: permanent.permanentId }).ok).toBe(false);
    expect(send(0, { action: "training", permanentId: permanent.permanentId }).ok).toBe(true);
    expect(permanent.stack.at(-1)).toBe(card);
    expect(card.faceUp).toBe(true);
    expect(state.players[0]!.deck).toHaveLength(deckCount - 1);
    expect(state.players[0]!.hand).toHaveLength(handCount);
    expect(state.memory).toBe(0);
    send(0, { action: "requestUndo" });
    send(1, { action: "answerUndo", accept: true });
    expect(state.players[0]!.deck[0]).toBe(card);
    expect(card.faceUp).toBe(false);
    expect(permanent.stack).toHaveLength(0);
  });

  it("exposes only explicitly signaled hand information and clears signals when their source moves", () => {
    const { state, send, play } = createTable();
    const target = play(1);
    const hand = state.players[0]!.hand;
    const card = hand[0]!;
    expect(send(0, { action: "signal", from: { zone: Zone.Deck }, targetSeat: 1 }).ok).toBe(false);
    expect(
      send(0, {
        action: "signal",
        from: { zone: Zone.Hand, instanceId: card.instanceId },
        targetPermanentId: target.permanentId,
      }).ok,
    ).toBe(true);
    const opponent = decodeView(state, 1);
    expect(opponent.manual.signalCardId).toBe(card.cardId);
    expect(opponent.manual.signalTargetPermanentId).toBe(target.permanentId);
    expect(opponent.players[0]!.hand).toHaveLength(0);
    expect(send(1, { action: "clearSignal" }).ok).toBe(false);
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Hand, instanceId: card.instanceId },
        to: { zone: Zone.Trash },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(state.manual.signalSeat).toBe(-1);
    send(0, { action: "requestUndo" });
    send(1, { action: "answerUndo", accept: true });
    expect(state.manual.signalCardId).toBe(card.cardId);
    expect(send(0, { action: "clearSignal" }).ok).toBe(true);
    expect(state.manual.signalCardId).toBe("");
  });

  it("allows revealed hidden cards to move without inspection and removes stale gallery entries", () => {
    const { state, send } = createTable();
    const first = state.players[0]!.deck[0]!;
    const second = state.players[0]!.deck[1]!;
    send(0, { action: "reveal", from: { zone: Zone.Deck }, count: 2 });
    const gallery = JSON.parse(state.manual.revealedJson);
    expect(gallery[0].zone).toBe(Zone.Deck);
    expect(
      send(1, {
        action: "move",
        from: { zone: Zone.Deck, instanceId: first.instanceId },
        to: { zone: Zone.Hand },
        wholePile: false,
      }).ok,
    ).toBe(false);
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Deck, instanceId: second.instanceId },
        to: { zone: Zone.Hand },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(JSON.parse(state.manual.revealedJson)).toHaveLength(1);
    expect(state.players[0]!.hand.at(-1)).toBe(second);
    send(0, { action: "requestUndo" });
    send(1, { action: "answerUndo", accept: true });
    expect(JSON.parse(state.manual.revealedJson)).toHaveLength(2);
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Deck, instanceId: second.instanceId },
        to: { zone: Zone.Hand },
        wholePile: false,
      }).ok,
    ).toBe(true);
    expect(send(0, { action: "shuffle", zone: Zone.Deck }).ok).toBe(true);
    expect(JSON.parse(state.manual.revealedJson)).toHaveLength(0);
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Deck, instanceId: first.instanceId },
        to: { zone: Zone.Hand },
        wholePile: false,
      }).ok,
    ).toBe(false);
  });
});

it("clears public signals when a source or target is turned face down", () => {
  const { state, play, send } = createTable();
  const source = play();
  const target = play(1);
  expect(
    send(0, {
      action: "signal",
      from: { zone: Zone.BattleArea, permanentId: source.permanentId },
      targetPermanentId: target.permanentId,
    }).ok,
  ).toBe(true);
  expect(
    send(1, { action: "flip", from: { zone: Zone.BattleArea, permanentId: target.permanentId }, faceUp: false }).ok,
  ).toBe(true);
  expect(state.manual.signalSeat).toBe(-1);
  expect(
    send(0, {
      action: "signal",
      from: { zone: Zone.BattleArea, permanentId: source.permanentId },
      targetPermanentId: target.permanentId,
    }).ok,
  ).toBe(false);
  expect(
    send(0, { action: "signal", from: { zone: Zone.BattleArea, permanentId: source.permanentId }, targetSeat: 1 }).ok,
  ).toBe(true);
  expect(
    send(0, { action: "flip", from: { zone: Zone.BattleArea, permanentId: source.permanentId }, faceUp: false }).ok,
  ).toBe(true);
  expect(state.manual.signalCardId).toBe("");
  expect(send(0, { action: "attack", permanentId: source.permanentId }).ok).toBe(false);
});

describe("manual guided turn preparation", () => {
  it("starts in breeding after unsuspend and first-player draw skip and accepts exactly one owned choice", () => {
    const { state, send, emit } = createTable({ skipBreeding: false });
    const player = state.players[0]!;
    const eggCount = player.eggDeck.length;
    expect(state.phase).toBe(Phase.Main);
    expect(state.manual.turnPhase).toBe(Phase.Breeding);
    expect(state.manual.canHatch).toBe(true);
    expect(state.manual.canMoveFromBreeding).toBe(false);
    expect(player.hand).toHaveLength(5);
    expect(
      emit.mock.calls
        .filter(([event]) => event.kind === "phaseChanged")
        .map(([event]) => event.kind === "phaseChanged" && event.phase),
    ).toEqual([Phase.Active, Phase.Draw, Phase.Breeding]);
    expect(send(1, { action: "breeding", choice: "hatch" }).ok).toBe(false);
    expect(send(0, { action: "pass" }).ok).toBe(false);
    const egg = player.eggDeck[0]!;
    expect(send(0, { action: "breeding", choice: "hatch" }).ok).toBe(true);
    expect(player.eggDeck).toHaveLength(eggCount - 1);
    expect(player.breeding!.topCard).toBe(egg);
    expect(egg.faceUp).toBe(true);
    expect(state.manual.turnPhase).toBe(Phase.Main);
    expect(send(0, { action: "breeding", choice: "move" }).ok).toBe(false);
    expect(send(0, { action: "breeding", choice: "skip" }).ok).toBe(false);
    expect(state.manual.canHatch).toBe(false);
    expect(state.manual.canMoveFromBreeding).toBe(false);
  });

  it("restores the whole incoming-turn draw and unsuspend on agreed undo and replays preparation only once", () => {
    const { state, play, send, controller, emit } = createTable();
    const permanent = play(1);
    const ownPermanent = play(0);
    send(1, { action: "suspend", permanentId: permanent.permanentId, suspended: true });
    send(0, { action: "suspend", permanentId: ownPermanent.permanentId, suspended: true });
    send(0, {
      action: "modifiers",
      permanentId: ownPermanent.permanentId,
      securityAttackModifier: 0,
      keywords: ["Reboot"],
      colors: [],
    });
    const handCount = state.players[1]!.hand.length;
    const next = state.players[1]!.deck[0]!;
    const request = {
      type: "manual",
      requestId: "pass-once",
      revision: state.manual.revision,
      command: { action: "pass" },
    };
    expect(controller.apply(0, request).ok).toBe(true);
    expect(controller.apply(0, request).ok).toBe(true);
    expect(emit).toHaveBeenCalledWith({ kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 });
    expect(state.players[1]!.hand).toHaveLength(handCount + 1);
    expect(state.players[1]!.hand.at(-1)).toBe(next);
    expect(next.faceUp).toBe(false);
    expect(permanent.isSuspended).toBe(false);
    expect(ownPermanent.isSuspended).toBe(true);
    expect(state.manual.turnPhase).toBe(Phase.Breeding);
    expect(send(1, { action: "pass" }).ok).toBe(false);
    expect(
      emit.mock.calls.filter(
        ([event]) => event.kind === "cardsMoved" && event.from === Zone.Deck && event.to === Zone.Hand,
      ),
    ).toEqual([]);
    send(1, { action: "requestUndo" });
    send(0, { action: "answerUndo", accept: true });
    expect(state.turnSeat).toBe(0);
    expect(state.turnCount).toBe(1);
    expect(state.isFirstPlayersFirstTurn).toBe(true);
    expect(state.manual.turnPhase).toBe(Phase.Main);
    expect(state.players[1]!.hand).toHaveLength(handCount);
    expect(state.players[1]!.deck[0]).toBe(next);
    expect(permanent.isSuspended).toBe(true);
    expect(send(0, { action: "pass" }).ok).toBe(true);
    expect(state.players[1]!.hand).toHaveLength(handCount + 1);
  });

  it("automatically skips unavailable breeding actions and allows DP-bearing Digi-Egg movement", () => {
    const { state, send } = createTable({ skipBreeding: false });
    send(0, { action: "breeding", choice: "hatch" });
    const raising = state.players[0]!.breeding!;
    expect(getCardDefinition(raising.topCard.cardId)?.kinds).toContain(CardKind.DigiEgg);
    send(0, { action: "pass" });
    send(1, { action: "breeding", choice: "skip" });
    send(1, { action: "pass" });
    expect(state.turnSeat).toBe(0);
    expect(state.manual.turnPhase).toBe(Phase.Main);
    expect(state.manual.canMoveFromBreeding).toBe(false);
    raising.topCard.cardId = "EX2-007";
    send(0, { action: "pass" });
    send(1, { action: "breeding", choice: "skip" });
    send(1, { action: "pass" });
    expect(state.manual.turnPhase).toBe(Phase.Breeding);
    expect(state.manual.canMoveFromBreeding).toBe(true);
    expect(send(0, { action: "breeding", choice: "hatch" }).ok).toBe(false);
    expect(send(0, { action: "breeding", choice: "move" }).ok).toBe(true);
    expect(state.players[0]!.breeding).toBeUndefined();
    expect(state.players[0]!.battleArea[0]).toBe(raising);
    expect(state.manual.turnPhase).toBe(Phase.Main);
  });

  it("moves a raised Digimon with its whole pile and keeps effects manual", () => {
    const { state, send, emit } = createTable({ skipBreeding: false });
    send(0, { action: "breeding", choice: "hatch" });
    const player = state.players[0]!;
    const raising = player.breeding!;
    const egg = raising.topCard;
    const digimon = player.hand.find(
      (card) => getCardDefinition(card.cardId)?.kinds.includes(CardKind.Digimon) === true,
    )!;
    expect(
      send(0, {
        action: "move",
        from: { zone: Zone.Hand, instanceId: digimon.instanceId },
        to: { zone: Zone.Breeding, permanentId: raising.permanentId, part: "top" },
        wholePile: false,
      }).ok,
    ).toBe(true);
    const handCount = player.hand.length;
    send(0, { action: "pass" });
    send(1, { action: "breeding", choice: "skip" });
    send(1, { action: "pass" });
    expect(state.manual.canMoveFromBreeding).toBe(true);
    const memory = state.memory;
    expect(send(0, { action: "breeding", choice: "move" }).ok).toBe(true);
    expect(player.battleArea[0]).toBe(raising);
    expect(raising.stack[0]).toBe(egg);
    expect(player.hand).toHaveLength(handCount + 1);
    expect(state.memory).toBe(memory);
    expect(emit.mock.calls.some(([event]) => event.kind === "movedFromBreeding")).toBe(true);
    expect(emit.mock.calls.some(([event]) => event.kind === "effectActivated")).toBe(false);
  });

  it("uses only the scheduled draw for deck-out and automatically bypasses an empty breeding choice", () => {
    const { state, send, emit } = createTable();
    clearZone(state.players[1]!, Zone.EggDeck);
    expect(send(0, { action: "pass" }).ok).toBe(true);
    expect(state.manual.turnPhase).toBe(Phase.Main);
    expect(state.manual.canHatch).toBe(false);
    expect(send(1, { action: "pass" }).ok).toBe(true);
    expect(send(0, { action: "breeding", choice: "skip" }).ok).toBe(true);
    clearZone(state.players[1]!, Zone.Deck);
    expect(send(1, { action: "draw", count: 1 }).ok).toBe(false);
    expect(state.gameOver).toBe(false);
    expect(send(0, { action: "pass" }).ok).toBe(true);
    expect(state.gameOver).toBe(true);
    expect(state.winnerSeat).toBe(0);
    expect(state.players[1]!.lost).toBe(true);
    expect(state.manual.canUndo).toBe(false);
    expect(emit).toHaveBeenCalledWith({
      kind: "gameOver",
      reason: "deckOut",
      result: { outcome: "win", winnerSeat: 0 },
    });
  });

  it("does not re-open phases through the legacy correction command", () => {
    const { state, send } = createTable({ skipBreeding: false });
    expect(send(1, { action: "phase", phase: Phase.Main }).ok).toBe(false);
    expect(send(0, { action: "phase", phase: Phase.Draw }).ok).toBe(false);
    expect(send(0, { action: "phase", phase: Phase.Main }).ok).toBe(true);
    expect(state.manual.turnPhase).toBe(Phase.Main);
    expect(send(0, { action: "phase", phase: Phase.Breeding }).ok).toBe(false);
    expect(send(0, { action: "phase", phase: Phase.Main }).ok).toBe(false);
  });
});
