import { CardInstance, Permanent, PlayerState } from "@aegis/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { intents } from "../net/intents";
import type { AegisRoom } from "../net/client";
import { matchIntents } from "./screen/matchIntents";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { playChoiceAnswers } from "./screen/playChoiceAnswers";
import type { HandEntry } from "./piece";

vi.mock("../net/intents", () => ({ intents: { dnaDigivolve: vi.fn<() => void>() } }));
beforeEach(() => vi.clearAllMocks());

function fixture() {
  const viewer = new PlayerState();
  for (const id of ["yellow", "purple-one", "purple-two"]) {
    const permanent = new Permanent();
    permanent.permanentId = id;
    permanent.topCard = Object.assign(new CardInstance(), { instanceId: id, cardId: "ST10-05" });
    viewer.battleArea.push(permanent);
  }
  const entry: HandEntry = {
    cardId: "ST10-06",
    instanceId: "mastemon",
    activatableEffectsJson: "",
    playableFromHand: true,
    projectedPlayCost: 13,
    digivolveTargetPermanentIds: [],
    linkTargetPermanentIds: [],
    dnaDigivolveRoutes: [
      { materialPermanentIds: ["yellow", "purple-one"], projectedCost: 0 },
      { materialPermanentIds: ["yellow", "purple-two"], projectedCost: 0 },
    ],
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
  return { viewer, entry, room, overlays, selection };
}

it("#5166: disabling action confirmations still opens material choice before sending DNA", () => {
  const { viewer, entry, room, overlays, selection } = fixture();
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
    cardConfirmationMode: CardConfirmationMode.NEVER.value,
    playGameCue: vi.fn<() => void>(),
    lastPlayAttemptRef: { current: undefined },
    playAttemptEventSeqRef: { current: -1 },
    setOptimisticPlayedInstanceId: vi.fn<() => void>(),
  });
  actions.playCard(entry.instanceId);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "dna" }));
  expect(intents.dnaDigivolve).not.toHaveBeenCalled();
});

it.each(["valid", "gone", "illegal", "unspecified"])(
  "#5166: confirmation sends only the explicit live projected pair (%s)",
  (kind) => {
    const { viewer, entry, room, overlays, selection } = fixture();
    if (kind === "gone") entry.dnaDigivolveRoutes = [entry.dnaDigivolveRoutes![0]!];
    const answers = playChoiceAnswers({
      room,
      viewer,
      handEntries: [entry],
      mainActionBlocked: false,
      appFusionAvailable: () => false,
      dualPlay: null,
      actionConfirm: {
        kind: "dna",
        instanceId: entry.instanceId,
        cardId: entry.cardId,
        materialPermanentIds: ["yellow", "purple-one"],
      },
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
      dispatchPlayCard: vi.fn<() => void>(),
      digivolveWithChoice: vi.fn<() => void>(),
      findPermanent: () => undefined,
    });
    answers.onConfirmAction(
      kind === "unspecified" ? undefined : kind === "illegal" ? ["yellow", "missing"] : ["yellow", "purple-two"],
    );
    expect(vi.mocked(intents.dnaDigivolve).mock.calls).toEqual(
      kind === "valid" ? [[room, ["yellow", "purple-two"], entry.instanceId]] : [],
    );
  },
);

it.each(["playable", "unplayable", "blocked", "missing"])(
  "normal play from a DNA prompt rechecks the live hand (%s)",
  (state) => {
    const { viewer, entry, room, overlays, selection } = fixture();
    entry.playableFromHand = state !== "unplayable";
    const dispatchPlayCard = vi.fn<() => void>();
    const answers = playChoiceAnswers({
      room,
      viewer,
      handEntries: state === "missing" ? [] : [entry],
      mainActionBlocked: state === "blocked",
      appFusionAvailable: () => false,
      dualPlay: null,
      actionConfirm: {
        kind: "dna",
        instanceId: entry.instanceId,
        cardId: entry.cardId,
        materialPermanentIds: ["yellow", "purple-one"],
      },
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
      dispatchPlayCard,
      digivolveWithChoice: vi.fn<() => void>(),
      findPermanent: () => undefined,
    });
    answers.onPlayNormally();
    expect(dispatchPlayCard.mock.calls).toEqual(state === "playable" ? [[room, entry.instanceId]] : []);
    expect(intents.dnaDigivolve).not.toHaveBeenCalled();
    expect(selection.clearSel).toHaveBeenCalledTimes(state === "blocked" ? 0 : 1);
  },
);
