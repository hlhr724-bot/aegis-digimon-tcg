import { CardInstance, GameState, Permanent, PlayerState } from "@aegis/shared";
import { expect, it, vi } from "vitest";
import { translator } from "../i18n";
import type { HandEntry } from "./piece";
import { boardActions } from "./screen/boardActions";
import { DragKind } from "./screen/enums";

vi.mock("./screen/dropZones", () => ({ dropZoneAt: () => ({ target: "perm-you", id: "gabumon" }) }));

const handEffect = JSON.stringify([
  {
    instanceId: "metal-garurumon",
    effectKey: "BT22-026/ir-27-0",
    description: "[Hand] [Main] If you have [Nokia Shiramine], 1 of your [Gabumon] digivolves into this card.",
  },
]);

function dropMetalGarurumonOnGabumon(activatableEffectsJson: string) {
  const viewer = new PlayerState();
  const gabumon = new Permanent();
  gabumon.permanentId = "gabumon";
  gabumon.topCard = Object.assign(new CardInstance(), { cardId: "BT22-017", instanceId: "gabumon-top" });
  viewer.battleArea.push(gabumon);
  const entry: HandEntry = {
    cardId: "BT22-026",
    instanceId: "metal-garurumon",
    activatableEffectsJson,
    playableFromHand: true,
    projectedPlayCost: 12,
    digivolveTargetPermanentIds: [],
    linkTargetPermanentIds: [],
    dnaDigivolveRoutes: [],
  };
  const playCard = vi.fn<() => void>();
  const setHandPreview = vi.fn<() => void>();
  const actions = boardActions({
    state: new GameState(),
    shownState: new GameState(),
    viewer,
    room: undefined,
    t: translator("en"),
    handEntries: [entry],
    handSel: null,
    selPerm: null,
    selCardId: undefined,
    linkSel: null,
    vortexMode: false,
    isMyTurn: true,
    mainActionBlocked: false,
    breedingActionsOpen: false,
    permanentRefs: { current: {} },
    ping: vi.fn<() => void>(),
    playGameCue: vi.fn<() => void>(),
    selection: {
      clearSel: vi.fn<() => void>(),
      setHandSel: vi.fn<() => void>(),
      setHandPreview,
      setSelPerm: vi.fn<() => void>(),
      setVortexMode: vi.fn<() => void>(),
      setLinkSel: vi.fn<() => void>(),
    },
    overlays: {
      setActionConfirm: vi.fn<() => void>(),
      setCardMenu: vi.fn<() => void>(),
      setStackView: vi.fn<() => void>(),
      setPicks: vi.fn<() => void>(),
      setDualPlay: vi.fn<() => void>(),
      setAssemblyPick: vi.fn<() => void>(),
      setDigiXrosPick: vi.fn<() => void>(),
      setEvoCostChoice: vi.fn<() => void>(),
    },
    setAppFusionChoice: vi.fn<() => void>(),
    playCard,
    attack: vi.fn<() => void>(),
    linkCard: vi.fn<() => void>(),
    digivolveWithChoice: vi.fn<() => void>(),
    digivolveTargetsOf: () => [],
    appFusionHostIdsOf: () => [],
    eligibleBase: () => false,
    linkTargetsOfPermanent: () => [],
  });
  actions.handleDrop(
    {
      kind: DragKind.Play,
      instanceId: "metal-garurumon",
      cardId: "BT22-026",
      started: true,
      index: 0,
      ox: 0,
      oy: 0,
      x: 0,
      y: 0,
    },
    0,
    0,
  );
  return { playCard, setHandPreview };
}

it("opens the hand card actions instead of playing when a card with a hand effect is dropped on a Digimon it cannot digivolve onto", () => {
  const { playCard, setHandPreview } = dropMetalGarurumonOnGabumon(handEffect);

  expect(playCard).not.toHaveBeenCalled();
  expect(setHandPreview).toHaveBeenCalledWith("metal-garurumon");
});

it("still plays a card without a hand effect that is dropped on a Digimon it cannot digivolve onto", () => {
  const { playCard, setHandPreview } = dropMetalGarurumonOnGabumon("");

  expect(playCard).toHaveBeenCalledWith("metal-garurumon", true);
  expect(setHandPreview).not.toHaveBeenCalled();
});
