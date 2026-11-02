import { CardInstance, GameState, Permanent, PlayerState, Phase, Zone } from "@aegis/shared";
import type { AegisRoom } from "@/net/client";
import { translator } from "@/i18n";
import { boardActions } from "@/game/screen/boardActions";
import { DragKind } from "@/game/screen/enums";
import { ManualBreedingChoice } from "@aegis/shared/manual/ManualBreedingChoice";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn<(value: { command: ManualCommand }) => void>());
const hit = vi.hoisted(() => ({ target: "opp-security" }));
vi.mock("@/game/manual/sendManualCommand", () => ({ sendManualCommand: send }));
vi.mock("@/game/screen/dropZones", () => ({ dropZoneAt: () => hit }));

type Params = { state: GameState; viewer: PlayerState; breedingActionsOpen: boolean; isMyTurn?: boolean };

function createActions({ state, viewer, breedingActionsOpen, isMyTurn = true }: Params) {
  return boardActions({
    state,
    shownState: state,
    viewer,
    room: { state } as AegisRoom,
    t: translator("en"),
    handEntries: [],
    handSel: null,
    selPerm: null,
    selCardId: undefined,
    linkSel: null,
    vortexMode: false,
    isMyTurn,
    mainActionBlocked: false,
    breedingActionsOpen,
    permanentRefs: { current: {} },
    ping: vi.fn<() => void>(),
    playGameCue: vi.fn<() => void>(),
    selection: {
      clearSel: vi.fn<() => void>(),
      setHandSel: vi.fn<() => void>(),
      setHandPreview: vi.fn<() => void>(),
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
    playCard: vi.fn<() => void>(),
    attack: vi.fn<() => void>(),
    linkCard: vi.fn<() => void>(),
    digivolveWithChoice: vi.fn<() => void>(),
    digivolveTargetsOf: () => [],
    appFusionHostIdsOf: () => [],
    eligibleBase: () => false,
    linkTargetsOfPermanent: () => [],
  });
}

describe("manual breeding board actions", () => {
  it("does not declare a dragged attack until the breeding choice finishes", () => {
    send.mockClear();
    const state = new GameState();
    state.gameMode = "manual";
    state.manual.turnPhase = Phase.Breeding;
    const viewer = new PlayerState();
    const attacker = new Permanent();
    attacker.permanentId = "attacker";
    attacker.topCard = Object.assign(new CardInstance(), { cardId: "BT1-010" });
    viewer.battleArea.push(attacker);
    state.players.push(viewer);
    const actions = createActions({ state, viewer, breedingActionsOpen: true });
    const drag = {
      kind: DragKind.Attack,
      permanentId: "attacker",
      cardId: "BT1-010",
      started: true,
      ox: 0,
      oy: 0,
      x: 0,
      y: 0,
    } as const;
    actions.handleDrop(drag, 0, 0);
    expect(send).not.toHaveBeenCalled();
    state.manual.turnPhase = Phase.Main;
    createActions({ state, viewer, breedingActionsOpen: false, isMyTurn: false }).handleDrop(drag, 0, 0);
    expect(send).not.toHaveBeenCalled();
    actions.handleDrop(drag, 0, 0);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { action: ManualAction.ATTACK.value, permanentId: "attacker", targetPermanentId: undefined },
      }),
    );
  });

  it("routes the breeding board hatch through the once-per-turn choice", () => {
    send.mockClear();
    const state = new GameState();
    state.gameMode = "manual";
    state.manual.turnPhase = Phase.Breeding;
    const viewer = new PlayerState();
    viewer.eggDeckCount = 1;
    state.manual.canHatch = true;
    createActions({ state, viewer, breedingActionsOpen: true }).onBreeding();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { action: ManualAction.BREEDING.value, choice: ManualBreedingChoice.HATCH.value },
      }),
    );
  });
});

it("stacks a hand card on the existing breeding permanent when dropped onto raising", () => {
  send.mockClear();
  hit.target = "breeding-you";
  const state = new GameState();
  state.gameMode = "manual";
  state.manual.turnPhase = Phase.Main;
  const viewer = new PlayerState();
  const breeding = new Permanent();
  breeding.permanentId = "raising-egg";
  breeding.topCard = Object.assign(new CardInstance(), { cardId: "BT1-001" });
  breeding.inBreeding = true;
  viewer.breeding = breeding;
  state.players.push(viewer);
  createActions({ state, viewer, breedingActionsOpen: false }).handleDrop(
    { kind: DragKind.Play, index: 0, cardId: "BT1-010", instanceId: "agumon", started: true, ox: 0, oy: 0, x: 0, y: 0 },
    0,
    0,
  );
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      command: {
        action: ManualAction.MOVE.value,
        wholePile: false,
        from: { zone: Zone.Hand, instanceId: "agumon" },
        to: { zone: Zone.Breeding, permanentId: "raising-egg", part: "top" },
      },
    }),
  );
  hit.target = "opp-security";
});
