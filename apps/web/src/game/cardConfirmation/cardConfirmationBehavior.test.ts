import { Permanent } from "@aegis/shared/schema/Permanent";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { beforeEach, expect, it, vi } from "vitest";
import { intents } from "@/net/intents";
import type { AegisRoom } from "@/net/client";
import type { HandEntry } from "@/game/piece/types";
import { matchIntents } from "@/game/screen/matchIntents";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";

vi.mock("@/net/intents", () => ({ intents: { playCard: vi.fn<() => void>(), digivolve: vi.fn<() => void>() } }));
beforeEach(() => vi.clearAllMocks());

function buildFixture() {
  const viewer = new PlayerState();
  for (const id of ["yellow", "purple-one", "purple-two"]) {
    const permanent = new Permanent();
    permanent.permanentId = id;
    permanent.topCard = Object.assign(new CardInstance(), { instanceId: id, cardId: "ST1-03" });
    viewer.battleArea.push(permanent);
  }
  const entry: HandEntry = {
    cardId: "ST1-04",
    instanceId: "hand-card",
    activatableEffectsJson: "",
    playableFromHand: true,
    projectedPlayCost: 13,
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
  return { viewer, entry, room, overlays, selection };
}

type ActionParams = { entryPatch?: Partial<HandEntry>; mainActionBlocked?: boolean; mode?: CardConfirmationMode };

function buildActions({
  entryPatch = {},
  mainActionBlocked = false,
  mode = CardConfirmationMode.ALWAYS.value,
}: ActionParams = {}) {
  const fixture = buildFixture();
  Object.assign(fixture.entry, entryPatch);
  const { viewer, entry, room, overlays, selection } = fixture;
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
    mainActionBlocked,
    cardConfirmationMode: mode,
    playGameCue: vi.fn<() => void>(),
    lastPlayAttemptRef: { current: undefined },
    playAttemptEventSeqRef: { current: -1 },
    setOptimisticPlayedInstanceId: vi.fn<() => void>(),
  });
  return { ...fixture, actions };
}

it("keeps play and evolution confirmations by default", () => {
  const { actions, entry, viewer, overlays } = buildActions();
  actions.playCard(entry.instanceId, true);
  expect(overlays.setActionConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "play" }));
  actions.digivolveWithChoice("yellow", entry.instanceId, entry.cardId, viewer.battleArea[0]!, true);
  expect(overlays.setActionConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "digivolve" }));
  expect(intents.playCard).not.toHaveBeenCalled();
  expect(intents.digivolve).not.toHaveBeenCalled();
});

const SKIP_PLAY_ONLY = CardConfirmationMode.SKIP_PLAY_ONLY.value;
const NEVER = CardConfirmationMode.NEVER.value;

it.each(["ST1-03", "ST1-12", "ST1-16"])("skips play-only confirmation for %s", (cardId) => {
  const { actions, entry, room, overlays } = buildActions({ entryPatch: { cardId }, mode: SKIP_PLAY_ONLY });
  actions.playCard(entry.instanceId, true);
  expect(overlays.setActionConfirm).not.toHaveBeenCalled();
  expect(intents.playCard).toHaveBeenCalledWith(room, entry.instanceId, undefined, undefined, undefined, undefined);
});

it.each<Partial<HandEntry>>([
  { digivolveTargetPermanentIds: ["yellow"] },
  {
    digivolveRoutes: [
      { permanentId: "yellow", projectedCost: 0, alternateRequirementIndex: -1 },
    ] as HandEntry["digivolveRoutes"],
  },
  {
    activatableEffectsJson: JSON.stringify([
      { instanceId: "hand-card", effectKey: "hand-main", description: "Activate from hand" },
    ]),
  },
  { linkTargetPermanentIds: ["yellow"] },
  { appFusionRoutes: [{ hostPermanentId: "yellow", linkedInstanceId: "linked", projectedCost: 0 }] },
])("preserves confirmation when a legal alternative exists: %j", (patch) => {
  const { actions, entry, overlays } = buildActions({ entryPatch: patch, mode: SKIP_PLAY_ONLY });
  actions.playCard(entry.instanceId, true);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "play" }));
  expect(intents.playCard).not.toHaveBeenCalled();
});

it("keeps evolution confirmation when skipping only play-only cards", () => {
  const { actions, entry, viewer, overlays } = buildActions({ mode: SKIP_PLAY_ONLY });
  actions.digivolveWithChoice("yellow", entry.instanceId, entry.cardId, viewer.battleArea[0]!, true);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "digivolve" }));
});

it("sends play and evolution without confirmation when never asking", () => {
  const { actions, entry, viewer, overlays } = buildActions({
    entryPatch: { digivolveTargetPermanentIds: ["yellow"] },
    mode: NEVER,
  });
  actions.playCard(entry.instanceId, true);
  actions.digivolveWithChoice("yellow", entry.instanceId, entry.cardId, viewer.battleArea[0]!, true);
  expect(overlays.setActionConfirm).not.toHaveBeenCalled();
  expect(intents.playCard).toHaveBeenCalledTimes(1);
  expect(intents.digivolve).toHaveBeenCalledTimes(1);
});

it.each([SKIP_PLAY_ONLY, NEVER])("keeps DNA material choice and blocked-action guards (%s)", (mode) => {
  const { actions, entry, overlays } = buildActions({
    entryPatch: {
      dnaDigivolveRoutes: [{ materialPermanentIds: ["yellow", "purple-one"], projectedCost: 0 }],
    },
    mode,
  });
  actions.playCard(entry.instanceId, true);
  expect(overlays.setActionConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "dna" }));
  const blocked = buildActions({ mainActionBlocked: true, mode });
  blocked.actions.playCard(blocked.entry.instanceId, true);
  expect(intents.playCard).not.toHaveBeenCalled();
});

it.each([
  ["BT25-043", "setDualPlay"],
  ["BT10-063", "setDigiXrosPick"],
] as const)("keeps mode or material choice for %s when never asking", (cardId, setter) => {
  const { actions, entry, overlays } = buildActions({ entryPatch: { cardId }, mode: NEVER });
  actions.playCard(entry.instanceId, true);
  expect(overlays[setter]).toHaveBeenCalled();
  expect(intents.playCard).not.toHaveBeenCalled();
});

it("keeps distinct evolution costs when never asking", () => {
  const { actions, entry, viewer, overlays } = buildActions({ entryPatch: { cardId: "EX5-054" }, mode: NEVER });
  const base = viewer.battleArea[0]!;
  base.topCard!.cardId = "EX13-031";
  actions.digivolveWithChoice(base.permanentId, entry.instanceId, entry.cardId, base, true);
  expect(overlays.setEvoCostChoice).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.arrayContaining([expect.objectContaining({ cost: 4 }), expect.objectContaining({ cost: 3 })]),
    }),
  );
  expect(intents.digivolve).not.toHaveBeenCalled();
});
