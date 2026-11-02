import { CardInstance, PlayerState, Permanent, DnaDigivolveRoute } from "@aegis/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { sendIntent, type AegisRoom } from "../net/client";
import { matchIntents } from "./screen/matchIntents";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { playChoiceAnswers } from "./screen/playChoiceAnswers";
import { dnaFieldChoice } from "./screen/model/dnaMaterialSelection";
import { handEntriesOf } from "./screen/model/handEntries";
import type { HandEntry } from "./piece";
vi.mock("../net/client", () => ({ sendIntent: vi.fn<typeof sendIntent>() }));
beforeEach(() => vi.clearAllMocks());
function fixture() {
  const viewer = new PlayerState();
  for (const id of ["yellow", "blue", "black"]) {
    const permanent = new Permanent();
    permanent.permanentId = id;
    permanent.topCard = Object.assign(new CardInstance(), {
      instanceId: id,
      cardId: id === "yellow" ? "BT1-051" : id === "blue" ? "BT25-023" : "BT25-066",
    });
    viewer.battleArea.push(permanent);
  }
  const entry: HandEntry = {
    cardId: "BT25-038",
    instanceId: "shakkou",
    activatableEffectsJson: "",
    playableFromHand: true,
    projectedPlayCost: 8,
    digivolveTargetPermanentIds: [],
    linkTargetPermanentIds: [],
    dnaDigivolveRoutes: [
      { materialPermanentIds: ["yellow", "blue"], projectedCost: 0 },
      { materialPermanentIds: ["yellow", "black"], projectedCost: 0 },
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

it.each([0, 1] as const)(
  "#5358 exposes both combinations and sends the selected public DNA intent, seat %s",
  (seat) => {
    for (const partner of ["blue", "black"]) {
      for (const reverse of [false, true]) {
        vi.clearAllMocks();
        const { viewer, entry, room, overlays, selection } = fixture();
        viewer.seat = seat;
        viewer.battleArea.forEach((p) => {
          p.controllerSeat = seat;
          p.topCard.ownerSeat = seat;
        });
        const card = Object.assign(new CardInstance(), {
          cardId: entry.cardId,
          instanceId: entry.instanceId,
          ownerSeat: seat,
        });
        for (const route of entry.dnaDigivolveRoutes!)
          card.dnaDigivolveRoutes.push(
            Object.assign(new DnaDigivolveRoute(), {
              materialPermanentIdsJson: JSON.stringify(route.materialPermanentIds),
              projectedCost: route.projectedCost,
            }),
          );
        viewer.hand.push(card);
        const { handEntries } = handEntriesOf({
          viewer,
          shownHand: undefined,
          handHeld: false,
          optimisticPlayedInstanceId: undefined,
        });
        expect(handEntries[0]!.dnaDigivolveRoutes).toEqual(entry.dnaDigivolveRoutes);
        const actions = matchIntents({
          viewer,
          opponent: new PlayerState(),
          handEntries,
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
        expect(overlays.setActionConfirm).toHaveBeenCalledWith(
          expect.objectContaining({ kind: "dna", cardId: "BT25-038" }),
        );
        expect(sendIntent).not.toHaveBeenCalled();
        const picks = reverse ? [partner, "yellow"] : ["yellow", partner];
        const choice = dnaFieldChoice(handEntries[0]!.dnaDigivolveRoutes!, [...viewer.battleArea], picks);
        expect(choice.available).toBe(true);
        expect(choice.selected?.projectedCost).toBe(0);
        const answers = playChoiceAnswers({
          room,
          viewer,
          handEntries,
          mainActionBlocked: false,
          appFusionAvailable: () => false,
          dualPlay: null,
          actionConfirm: {
            kind: "dna",
            instanceId: entry.instanceId,
            cardId: entry.cardId,
            materialPermanentIds: ["yellow", "blue"],
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
        answers.onConfirmAction([...choice.orderedPicks]);
        expect(sendIntent).toHaveBeenCalledExactlyOnceWith(room, {
          type: "dnaDigivolve",
          instanceId: "shakkou",
          materialPermanentIds: ["yellow", partner],
        });
      }
    }
  },
);
