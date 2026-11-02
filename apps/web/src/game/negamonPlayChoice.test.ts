import { canDragCard } from "@/game/screen/model/screenDragIntents";
import { DragKind } from "@/game/screen/enums";
import { CardInstance, Permanent, PlayerState } from "@aegis/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { intents } from "@/net/intents";
import type { AegisRoom } from "@/net/client";
import { matchIntents } from "@/game/screen/matchIntents";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { playChoiceAnswers } from "@/game/screen/playChoiceAnswers";
import type { HandEntry } from "@/game/piece/types";
import type { PendingActionConfirmation } from "@/game/screen/types";

vi.mock("@/net/intents", () => ({ intents: { activateEffect: vi.fn<() => void>(), playCard: vi.fn<() => void>() } }));
beforeEach(() => vi.clearAllMocks());

function buildFixture(cardConfirmationMode: CardConfirmationMode = CardConfirmationMode.NEVER.value) {
  const viewer = new PlayerState();
  viewer.breeding = new Permanent();
  viewer.breeding.topCard = Object.assign(new CardInstance(), { instanceId: "negamon", cardId: "EX9-005" });
  const entry: HandEntry = {
    instanceId: "eyesmon",
    cardId: "EX9-047",
    activatableEffectsJson: "",
    negamonPlayEffectKey: "negamon-main",
    playableFromHand: true,
    projectedPlayCost: 7,
    digivolveTargetPermanentIds: [],
    linkTargetPermanentIds: [],
  };
  const room = {} as AegisRoom;
  const overlays = {
    setActionConfirm: vi.fn<() => void>(),
    setCardMenu: vi.fn<() => void>(),
    setStackView: vi.fn<() => void>(),
    setPicks: vi.fn<() => void>(),
    setDualPlay: vi.fn<() => void>(),
    setAssemblyPick: vi.fn<() => void>(),
    setDigiXrosPick: vi.fn<() => void>(),
    setEvoCostChoice: vi.fn<() => void>(),
  };
  const selection = {
    clearSel: vi.fn<() => void>(),
    setHandSel: vi.fn<() => void>(),
    setHandPreview: vi.fn<() => void>(),
    setSelPerm: vi.fn<() => void>(),
    setVortexMode: vi.fn<() => void>(),
    setLinkSel: vi.fn<() => void>(),
  };

  const actions = matchIntents({
    viewer,
    opponent: new PlayerState(),
    handEntries: [entry],
    room,
    overlays,
    selection,
    localConnection: undefined,
    decision: undefined,
    acknowledgeDecision: undefined,
    events: [],
    digivolveRoutesOf: () => [],
    mainActionBlocked: false,
    cardConfirmationMode,
    playGameCue: vi.fn<() => void>(),
    lastPlayAttemptRef: { current: undefined },
    playAttemptEventSeqRef: { current: -1 },
    setOptimisticPlayedInstanceId: vi.fn<() => void>(),
  });
  const choice: PendingActionConfirmation = {
    kind: "negamon",
    instanceId: "eyesmon",
    cardId: "EX9-047",
    sourceInstanceId: "negamon",
    effectKey: "negamon-main",
    confirmDrop: false,
  };
  const answers = playChoiceAnswers({
    room,
    viewer,
    handEntries: [entry],
    mainActionBlocked: false,
    appFusionAvailable: () => false,
    dualPlay: null,
    actionConfirm: choice,
    appFusionChoice: null,
    appFusionRoutes: undefined,
    evoCostChoice: null,
    assemblyPick: null,
    digiXrosPick: null,
    overlays,
    setAppFusionChoice: vi.fn<() => void>(),
    clearSel: selection.clearSel,
    playGameCue: vi.fn<() => void>(),
    lastPlayAttemptRef: { current: undefined },
    dispatchPlayCard: actions.dispatchPlayCard,
    digivolveWithChoice: actions.digivolveWithChoice,
    findPermanent: () => undefined,
    playNormally: (instanceId, confirmDrop) => actions.playCard(instanceId, confirmDrop, false, true),
  });
  return { viewer, entry, room, actions, answers, overlays };
}

it.each([false, true])("offers Negamon before a hand play, including drag %s", (drag) => {
  const { actions, entry, overlays } = buildFixture();
  actions.playCard(entry.instanceId, drag);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "negamon", confirmDrop: drag }),
  );
  expect(intents.playCard).not.toHaveBeenCalled();
});

it("activates the projected breeding effect instead of playing normally", () => {
  const { answers, room } = buildFixture();
  answers.onConfirmAction();
  expect(intents.activateEffect).toHaveBeenCalledWith(room, "negamon", "negamon-main");
  expect(intents.playCard).not.toHaveBeenCalled();
});

it("plays normally without repeating the Negamon prompt", () => {
  const { answers, room, overlays } = buildFixture();
  answers.onPlayNormally();
  expect(intents.playCard).toHaveBeenCalledWith(room, "eyesmon", undefined, undefined, undefined, undefined);
  expect(intents.activateEffect).not.toHaveBeenCalled();
  expect(overlays.setActionConfirm).toHaveBeenCalledExactlyOnceWith(null);
});

it("cancels without sending an intent", () => {
  const { answers } = buildFixture();
  answers.onConfirmCancel();
  expect(intents.activateEffect).not.toHaveBeenCalled();
  expect(intents.playCard).not.toHaveBeenCalled();
});

it.each(["source", "effect"])("revalidates the %s before activating", (changed) => {
  const { answers, viewer, entry } = buildFixture();
  if (changed === "source") {
    viewer.breeding = undefined;
  } else {
    entry.negamonPlayEffectKey = "";
  }
  answers.onConfirmAction();
  expect(intents.activateEffect).not.toHaveBeenCalled();
});

it("keeps the Assembly material prompt when playing normally", () => {
  const { viewer, answers, overlays } = buildFixture();
  for (let i = 0; i < 4; i += 1) {
    viewer.trash.push(Object.assign(new CardInstance(), { instanceId: `scatter-${i}`, cardId: "EX9-048" }));
  }
  answers.onPlayNormally();
  expect(overlays.setAssemblyPick).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "assembly", instanceId: "eyesmon" }),
  );
  expect(intents.playCard).not.toHaveBeenCalled();
});

it("offers only Negamon when the normal play is unaffordable", () => {
  const { entry, viewer, actions, overlays, answers } = buildFixture();
  entry.playableFromHand = false;
  expect(
    canDragCard({
      drag: {
        kind: DragKind.Play,
        instanceId: entry.instanceId,
        cardId: entry.cardId,
        x: 0,
        y: 0,
        ox: 0,
        oy: 0,
        index: 0,
        started: false,
      },
      you: viewer,
      handEntries: [entry],
    }),
  ).toBe(true);
  actions.playCard(entry.instanceId);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "negamon" }));
  answers.onPlayNormally();
  expect(intents.playCard).not.toHaveBeenCalled();
});

it("offers a cancellable confirmation before a click evolution in breeding", () => {
  const { viewer, actions, entry, overlays } = buildFixture(CardConfirmationMode.ALWAYS.value);
  const base = viewer.breeding!;
  base.permanentId = "breeding";
  actions.digivolveWithChoice(base.permanentId, entry.instanceId, entry.cardId, base);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "digivolve",
      permanentId: "breeding",
      instanceId: entry.instanceId,
    }),
  );
});
