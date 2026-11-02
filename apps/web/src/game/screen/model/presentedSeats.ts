/* Each seat as the board shows it, which is not always the seat the server has.

   Three holds stack, in this order. The presented snapshot is the board at the revision
   the queue is narrating. A phase hold keeps the rotation the phase ribbon has not
   announced yet. A turn-start draw hold keeps the hand, hand count and deck count of the
   seat whose Draw ribbon is still queued — only that seat, because the other's cards
   belong to a turn the ribbons have already announced. A breeding hold keeps the raising
   area on its own clock. A security-effect hold keeps the battle area and trash as they were
   at the reveal until the card's [Security] clause has been read. A deletion hold keeps a deleted permanent in its slot until the
   shatter that takes it has begun. A trash-arrival hold keeps a card out of the trash until
   the batch that moved it there is narrated. A source-strip hold keeps its host in place
   and its return out of the hand until the last source has peeled away.

   The viewer's hand count also drops the card an optimistic play has already taken out
   of the hand, so the readout matches the cards on screen. */

import type { GameState, PlayerState, Seat } from "@aegis/shared";
import type { PresentationPacing } from "../../presentationProbe";
import { otherSeat } from "../../boardModel";
import {
  blowField,
  deletionField,
  liveProjectionFields,
  phaseField,
  securityEffectField,
  trashArrivalField,
  withTrashList,
  stackStripField,
  stackCostDpField,
} from "./presentedBoard";
import type { PresentedPlayer } from "../types";
import { stackStripHand } from "../../match/heldStackStrip";
import type { HeldDeletion, HeldStackStrip, HeldTrashArrival, HeldHandArrival } from "../../match/types";

export function presentedSeats({
  shownState,
  viewer,
  opponent,
  viewerSeat,
  heldPhaseState,
  heldBlowState,
  heldSecurityEffectState,
  heldDrawState,
  heldBreedingState,
  heldDeletions,
  heldStackStrips = new Map(),
  heldTrashArrivals,
  heldHandArrivals = new Map(),
  optimisticPlayedInstanceId,
  presentationPacing = "current",
}: {
  shownState: GameState;
  viewer: PlayerState;
  opponent: PlayerState;
  viewerSeat: Seat;
  heldPhaseState: GameState | undefined;
  heldBlowState: GameState | undefined;
  heldSecurityEffectState: GameState | undefined;
  heldDrawState: { seat: Seat; state: GameState } | undefined;
  heldBreedingState: { seat: Seat; player: PlayerState } | undefined;
  heldDeletions: ReadonlyMap<number, HeldDeletion>;
  heldStackStrips?: ReadonlyMap<number, HeldStackStrip>;
  heldTrashArrivals: ReadonlyMap<number, HeldTrashArrival>;
  heldHandArrivals?: ReadonlyMap<number, HeldHandArrival>;
  /** A card a play has already taken out of the hand, pending the server's word. */
  optimisticPlayedInstanceId: string | undefined;
  /** Paced effect results follow the narrated revision; live legality remains separate. */
  presentationPacing?: PresentationPacing;
}) {
  const paced = presentationPacing === "sequential";
  function fullStateHold(state: GameState | undefined) {
    // Coalesced server patches can enqueue a later scene while an earlier effect is
    // still being narrated. Its hold may delay that scene, but must not import its
    // future field, rotation or draw into the earlier presented revision.
    return state !== undefined && state.stateVersion > shownState.stateVersion ? undefined : state;
  }
  const phaseHold = fullStateHold(heldPhaseState);
  const blowHold = fullStateHold(heldBlowState);
  const securityEffectHold = fullStateHold(heldSecurityEffectState);
  const drawHold = fullStateHold(heldDrawState?.state);
  function projectionFields(input: { player: PlayerState; live: PlayerState }) {
    // Future DP and abilities are effect results too. Live legality is read separately;
    // a paced decision opens only after its own public board revision has been reached.
    return stackCostDpField({
      player: paced ? input.player : liveProjectionFields(input),
      held: [...heldStackStrips.values()].filter((strip) => !paced || strip.stateVersion <= shownState.stateVersion),
    });
  }
  const heldStripsOf = (seat: Seat) =>
    [...heldStackStrips.values()].filter(
      (strip) => strip.seat === seat && (!paced || strip.stateVersion <= shownState.stateVersion),
    );
  viewer = stackStripHand(viewer, heldStripsOf(viewerSeat));
  opponent = stackStripHand(opponent, heldStripsOf(otherSeat(viewerSeat)));
  const heldDeletionsOf = (seat: Seat) => [...heldDeletions.values()].filter((deletion) => deletion.seat === seat);
  const heldTrashArrivalsOf = (seat: Seat) =>
    [...heldTrashArrivals.values()].filter((arrival) => arrival.seat === seat);
  const presentedViewer = projectionFields({
    player: stackStripField({
      player: trashArrivalField({
        player: deletionField({
          player: blowField({
            player: securityEffectField({
              player: phaseField({
                player: withTrashList(shownState.players[viewerSeat] ?? viewer),
                held: phaseHold?.players[viewerSeat],
              }),
              held: securityEffectHold?.players[viewerSeat],
            }),
            held: blowHold?.players[viewerSeat],
          }),
          held: heldDeletionsOf(viewerSeat),
        }),
        held: heldTrashArrivalsOf(viewerSeat),
      }),
      held: heldStripsOf(viewerSeat),
    }),
    live: viewer,
  });
  const presentedOpponent = projectionFields({
    player: stackStripField({
      player: trashArrivalField({
        player: deletionField({
          player: blowField({
            player: securityEffectField({
              player: phaseField({
                player: withTrashList(shownState.players[otherSeat(viewerSeat)] ?? opponent),
                held: phaseHold?.players[otherSeat(viewerSeat)],
              }),
              held: securityEffectHold?.players[otherSeat(viewerSeat)],
            }),
            held: blowHold?.players[otherSeat(viewerSeat)],
          }),
          held: heldDeletionsOf(otherSeat(viewerSeat)),
        }),
        held: heldTrashArrivalsOf(otherSeat(viewerSeat)),
      }),
      held: heldStripsOf(otherSeat(viewerSeat)),
    }),
    live: opponent,
  });
  const heldViewer = heldDrawState?.seat === viewerSeat ? drawHold?.players[viewerSeat] : undefined;
  const heldOpponent =
    heldDrawState?.seat === otherSeat(viewerSeat) ? drawHold?.players[otherSeat(viewerSeat)] : undefined;
  function holdHand(player: PlayerState, seat: Seat, version: number) {
    // A patch can carry a later hand arrival into the snapshot frozen for an earlier batch
    // (digivolve at sv 7, its bonus draw at sv 8; a security reveal, then its [Security]
    // effect adding the card to hand). That snapshot already shows the source zone at the
    // arrival's resulting count, so its hold applies there too.
    const sourceAlreadyLeft = (hold: HeldHandArrival) =>
      hold.fromDeck !== false
        ? player.deckCount <= hold.deckCountAfter
        : hold.fromSecurity === true &&
          hold.securityCountAfter !== undefined &&
          player.securityCount <= hold.securityCountAfter;
    const leakedAhead = (hold: HeldHandArrival) =>
      sourceAlreadyLeft(hold) &&
      (hold.instanceId
        ? player.hand?.some((card) => card.instanceId === hold.instanceId) === true
        : player.handCount >= hold.handCountAfter);
    const holds = [...heldHandArrivals.values()].filter(
      (hold) => hold.seat === seat && (hold.stateVersion <= version || leakedAhead(hold)),
    );
    const pending = holds.filter((hold) =>
      seat === viewerSeat && hold.instanceId
        ? player.hand?.some((card) => card.instanceId === hold.instanceId)
        : player.handCount >= hold.handCountAfter,
    );
    if (!pending.length) return player;
    const ids = new Set(pending.map((hold) => hold.instanceId));
    return {
      ...player,
      // Private seat views omit this list. Opaque draws still hold their public
      // counts without fabricating identities or requiring a decoded hand array.
      hand: player.hand?.filter((card) => !ids.has(card.instanceId)),
      handCount: Math.max(0, player.handCount - pending.length),
      deckCount:
        player.deckCount +
        pending.filter((hold) => hold.fromDeck !== false && player.deckCount <= hold.deckCountAfter).length,
    } as PlayerState;
  }
  const handViewer = holdHand(
    heldViewer ?? (paced ? (shownState.players[viewerSeat] ?? viewer) : viewer),
    viewerSeat,
    heldViewer
      ? drawHold!.stateVersion
      : paced
        ? shownState.stateVersion
        : Math.max(shownState.stateVersion, ...[...heldHandArrivals.values()].map((hold) => hold.stateVersion)),
  );
  const handOpponent = holdHand(
    heldOpponent ?? (paced ? (shownState.players[otherSeat(viewerSeat)] ?? opponent) : opponent),
    otherSeat(viewerSeat),
    heldOpponent
      ? drawHold!.stateVersion
      : paced
        ? shownState.stateVersion
        : Math.max(shownState.stateVersion, ...[...heldHandArrivals.values()].map((hold) => hold.stateVersion)),
  );
  const shownViewer: PresentedPlayer = {
    ...presentedViewer,
    hand: handViewer.hand,
    handCount: handViewer.handCount,
    deckCount: heldViewer
      ? handViewer.deckCount
      : holdHand(presentedViewer, viewerSeat, shownState.stateVersion).deckCount,
  };
  const shownOpponent: PresentedPlayer = {
    ...presentedOpponent,
    hand: handOpponent.hand,
    handCount: handOpponent.handCount,
    deckCount: heldOpponent
      ? handOpponent.deckCount
      : holdHand(presentedOpponent, otherSeat(viewerSeat), shownState.stateVersion).deckCount,
  };
  return {
    shownViewer,
    shownOpponent,
    breedingViewer: heldBreedingState?.seat === viewerSeat ? heldBreedingState.player : shownViewer,
    breedingOpponent: heldBreedingState?.seat === otherSeat(viewerSeat) ? heldBreedingState.player : shownOpponent,
    /** The hand the viewer can see, which a draw hold may keep behind the server's. */
    shownHand: handViewer.hand,
    shownHandCount: Math.max(
      0,
      handViewer.handCount -
        (optimisticPlayedInstanceId && handViewer.hand?.some((card) => card.instanceId === optimisticPlayedInstanceId)
          ? 1
          : 0),
    ),
    shownOpponentHandCount: handOpponent.handCount,
    /** Draw ribbons and paced snapshot membership both render the shown hand. */
    handHeld:
      heldViewer !== undefined ||
      paced ||
      heldHandArrivals.size > 0 ||
      heldStripsOf(viewerSeat).some((strip) => strip.returnedInstanceId !== undefined),
  };
}
