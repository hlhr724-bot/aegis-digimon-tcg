import { ManualBreedingChoice } from "@aegis/shared/manual/ManualBreedingChoice";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { sendManualCommand } from "@/game/manual/sendManualCommand";
import { Zone, Phase } from "@aegis/shared/schema/enums";
/* What a tap or a drop on the board does.

   The board is answered by pointing at it, so one gesture means different things
   depending on what is already picked up: a tap on your own Digimon opens it, unless a
   hand card is selected, in which case it is a digivolution target, unless a link
   declaration is armed, in which case it is a link target. That order is the whole of
   `onYourPerm`, and `handleDrop` is the same order for a card released rather than
   tapped.

   Every "can I do this?" answer here is the server's, read off the state it already
   projects (`CardInstance.digivolveTargetPermanentIds`, `Permanent.attackablePermanentIds`).
   The client renders affordances; it does not re-derive the rules behind them. A gesture
   that cannot mean anything says so through a hint rather than doing nothing. */

import type { RefObject } from "react";
import {
  CardKind,
  getCardDefinition,
  type AttackTarget,
  type GameState,
  type Permanent,
  type PlayerState,
} from "@aegis/shared";
import { playSound, type SoundKind } from "../../design/sound";
import { intents } from "../../net/intents";
import {
  attackTargetIdsOf,
  canAttackWith,
  canMoveFromBreeding,
  canUseBreedingAction,
  canVortexAttackWith,
  parseActivatable,
} from "../boardModel";
import { appFusionRoutesForHost, handCardEvolutionRoute } from "../digivolveModel";
import { ownPermanentTapDestination } from "../ownPermanentStack";
import { Side } from "../side";
import type { HandEntry } from "../piece";
import { dropZoneAt } from "./dropZones";
import { DragKind } from "./enums";
import { stackCardsOf as modelStackCardsOf } from "./model/stackCardsOf";
import type { DragState, LinkDeclaration, OverlayControls, SelectionControls } from "./types";
import type { Translate } from "../../i18n";

type Room = Parameters<typeof intents.hatchEgg>[0];

export function boardActions({
  state,
  shownState,
  viewer,
  room,
  t,
  handEntries,
  handSel,
  selPerm,
  selCardId,
  linkSel,
  vortexMode,
  isMyTurn,
  mainActionBlocked,
  breedingActionsOpen,
  permanentRefs,
  ping,
  selection,
  overlays,
  setAppFusionChoice,
  playCard,
  attack,
  linkCard,
  digivolveWithChoice,
  digivolveTargetsOf,
  appFusionHostIdsOf,
  eligibleBase,
  linkTargetsOfPermanent,
}: {
  state: GameState;
  /** The board the narration has reached, which the detail surfaces read. */
  shownState: GameState;
  viewer: PlayerState;
  room: Room | undefined;
  t: Translate;
  handEntries: HandEntry[];
  handSel: string | null;
  selPerm: string | null;
  selCardId: string | undefined;
  linkSel: LinkDeclaration | null;
  vortexMode: boolean;
  isMyTurn: boolean;
  mainActionBlocked: boolean;
  breedingActionsOpen: boolean;
  permanentRefs: RefObject<Record<string, HTMLDivElement | null>>;
  /** Refuse out loud: a shake, a sound and a corner notice. */
  ping: (message: string) => void;
  playGameCue: (kind: SoundKind) => void;
  selection: SelectionControls;
  overlays: OverlayControls;
  setAppFusionChoice: (choice: { handInstanceId: string; hostPermanentId: string } | null) => void;
  playCard: (instanceId: string, confirmDrop?: boolean, preferDna?: boolean) => void;
  attack: (attackerPermanentId: string, target: AttackTarget, vortex?: boolean) => void;
  linkCard: (instanceId: string, targetPermanentId: string) => void;
  digivolveWithChoice: (
    permanentId: string,
    instanceId: string,
    cardId: string,
    base: Permanent,
    confirmDrop?: boolean,
  ) => void;
  digivolveTargetsOf: (instanceId: string | undefined) => readonly string[];
  appFusionHostIdsOf: (instanceId: string | undefined) => readonly string[];
  eligibleBase: (perm: Permanent) => boolean;
  linkTargetsOfPermanent: (perm: Permanent) => readonly string[];
}) {
  const { clearSel, setHandSel, setHandPreview, setSelPerm, setVortexMode } = selection;
  const { setCardMenu, setStackView, setActionConfirm } = overlays;

  const findPermanent = (permanentId: string): Permanent | undefined => {
    for (const player of state.players) {
      const inBattle = player.battleArea.find((p) => p.permanentId === permanentId);
      if (inBattle) return inBattle;
      if (player.breeding?.permanentId === permanentId) return player.breeding;
    }
    return undefined;
  };

  const findPresentedPermanent = (permanentId: string): Permanent | undefined => {
    for (const player of shownState.players) {
      const inBattle = player.battleArea.find((permanent) => permanent.permanentId === permanentId);
      if (inBattle) return inBattle;
      if (player.breeding?.permanentId === permanentId) return player.breeding;
    }
    return undefined;
  };

  const appFusionActionAvailable = () => Boolean(!mainActionBlocked);

  const openAppFusionChoice = (handInstanceId: string, hostPermanentId: string) => {
    if (!appFusionActionAvailable()) return;
    const entry = handEntries.find((candidate) => candidate.instanceId === handInstanceId);
    const host = viewer.battleArea.find((candidate) => candidate.permanentId === hostPermanentId);
    if (!entry || !host) return;
    setAppFusionChoice({ handInstanceId, hostPermanentId });
  };

  /** Open the action menu anchored above a field card. */
  const showCardMenu = (permanentId: string, side: Side, { preserveSelection = false } = {}) => {
    // Breeding-area permanents register no `permanentRefs` entry, so there is no anchor
    // rect for them. The bottom sheet ignores the anchor, so fall back to the
    // viewport centre rather than dropping the tap.
    const rect = permanentRefs.current[permanentId]?.getBoundingClientRect();
    setStackView(null);
    setCardMenu({
      permanentId,
      side,
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top : window.innerHeight / 2,
    });
    if (!preserveSelection) setHandSel(null);
  };

  /** Begin attack-target selection with `permanentId` as the attacker; `vortex` declares a ＜Vortex＞ attack. */
  const beginAttack = (permanentId: string, vortex = false) => {
    playSound("select");
    setSelPerm(permanentId);
    setVortexMode(vortex);
    setHandSel(null);
    setCardMenu(null);
    setStackView(null);
  };

  const stackCardsOf = (perm: Permanent) => modelStackCardsOf({ perm, viewerSeat: viewer.seat });

  function openOwnPermanent(permanentId: string) {
    const perm = findPermanent(permanentId);
    if (!perm) return;
    const canPromote =
      perm.inBreeding &&
      canUseBreedingAction({
        phase: state.phase,
        isMyTurn,
        canHatch: false,
        canMove: canMoveFromBreeding(perm),
      });
    const activatable = isMyTurn ? parseActivatable(perm.activatableEffectsJson) : [];
    const destination = ownPermanentTapDestination({
      canAttack: canAttackWith(perm),
      canVortex: canVortexAttackWith(perm),
      canPromote,
      canLink: linkTargetsOfPermanent(perm).length > 0,
      hasEffects: activatable.length > 0,
    });
    if (destination === "menu") showCardMenu(perm.permanentId, Side.Viewer);
    else {
      setCardMenu(null);
      setStackView(perm.permanentId);
    }
  }

  const selectHandCard = (entry: HandEntry) => {
    if (state.gameMode === GameMode.MANUAL.value) {
      setHandSel(entry.instanceId);
      setSelPerm(null);
      return;
    }
    playSound("select");
    setHandSel(entry.instanceId);
    setHandPreview(entry.instanceId);
    setSelPerm(null);
    setCardMenu(null);
    setStackView(null);
  };

  const handleTap = (d: DragState) => {
    if (state.gameMode === GameMode.MANUAL.value && d.kind === DragKind.Attack) {
      setSelPerm(d.permanentId);
      setHandSel(null);
      return;
    }
    if (d.kind === DragKind.Play) {
      const entry = handEntries.find((candidate) => candidate.instanceId === d.instanceId);
      if (entry) selectHandCard(entry);
    } else if (!handSel) {
      if (selPerm === d.permanentId) clearSel();
      else openOwnPermanent(d.permanentId);
    }
  };

  const handleDrop = (d: DragState, cx: number, cy: number) => {
    const zone = dropZoneAt(cx, cy);
    if (!zone) return;
    const { target, id } = zone;
    if (state.gameMode === GameMode.MANUAL.value && room) {
      if (mainActionBlocked) return;
      if (d.kind === DragKind.Play) {
        const targetPermanentId = target === "breeding-you" ? viewer.breeding?.permanentId : id;
        if (target === "battle-you" || target === "breeding-you" || target === "perm-you") {
          sendManualCommand({
            room,
            command: {
              action: ManualAction.MOVE.value,
              wholePile: false,
              from: { zone: Zone.Hand, instanceId: d.instanceId },
              to: {
                zone: target === "breeding-you" ? Zone.Breeding : Zone.BattleArea,
                ...((target === "perm-you" || target === "breeding-you") && targetPermanentId
                  ? { permanentId: targetPermanentId, part: "top" as const }
                  : {}),
              },
            },
          });
        }
      } else if (target === "battle-you" || target === "breeding-you" || target === "perm-you") {
        const permanent = findPermanent(d.permanentId);
        if (permanent) {
          if (permanent.inBreeding && target === "battle-you" && breedingActionsOpen) {
            if (state.manual.canMoveFromBreeding) {
              sendManualCommand({
                room,
                command: { action: ManualAction.BREEDING.value, choice: ManualBreedingChoice.MOVE.value },
              });
            }
            return;
          }
          sendManualCommand({
            room,
            command: {
              action: ManualAction.MOVE.value,
              wholePile: true,
              from: {
                zone: permanent.inBreeding ? Zone.Breeding : Zone.BattleArea,
                permanentId: permanent.permanentId,
                part: "top",
              },
              to: {
                zone: target === "breeding-you" ? Zone.Breeding : Zone.BattleArea,
                ...(target === "perm-you" && id ? { permanentId: id, part: "source" as const } : {}),
              },
            },
          });
        }
      } else if (target === "opp-security" || (target === "perm-opp" && id)) {
        const attacker = findPermanent(d.permanentId);
        if (
          !isMyTurn ||
          state.manual.turnPhase !== Phase.Main ||
          state.manual.combatStage !== ManualCombatStage.NONE.value ||
          !attacker ||
          attacker.inBreeding ||
          attacker.topCard.faceUp === false
        ) {
          return;
        }
        sendManualCommand({
          room,
          command: {
            action: ManualAction.ATTACK.value,
            permanentId: d.permanentId,
            targetPermanentId: target === "perm-opp" ? id : undefined,
          },
        });
      }
      return;
    }

    if (d.kind === DragKind.Play) {
      if (mainActionBlocked) return;
      const def = getCardDefinition(d.cardId);
      if (def?.kinds.includes(CardKind.DigiEgg)) {
        ping(t("game.hint.eggsHatch"));
        return;
      }
      if (target === "perm-you" && id) {
        const perm =
          viewer.battleArea.find((p) => p.permanentId === id) ??
          (viewer.breeding?.permanentId === id ? viewer.breeding : undefined);
        const appFusionRoute = handEntries
          .find((entry) => entry.instanceId === d.instanceId)
          ?.appFusionRoutes?.some((route) => {
            const host = viewer.battleArea.find((candidate) => candidate.permanentId === id);
            return host !== undefined && appFusionRoutesForHost([route], host).length > 0;
          });
        if (perm && appFusionRoute) return openAppFusionChoice(d.instanceId, id);
        const evolutionRoute =
          perm && !perm.inBreeding
            ? handCardEvolutionRoute(
                d.cardId,
                viewer.battleArea,
                digivolveTargetsOf(d.instanceId).includes(perm.permanentId),
                handEntries.find((entry) => entry.instanceId === d.instanceId)?.dnaDigivolveRoutes,
                perm.permanentId,
              )
            : undefined;
        if (perm && evolutionRoute?.kind === "normal")
          return digivolveWithChoice(perm.permanentId, d.instanceId, d.cardId, perm, true);
        if (evolutionRoute?.kind === "dna") {
          setActionConfirm({
            kind: "dna",
            instanceId: d.instanceId,
            cardId: d.cardId,
            materialPermanentIds: evolutionRoute.materialPermanentIds,
            initialPermanentId: perm?.permanentId,
          });
          return;
        }
        if (perm && evolutionRoute?.kind === "both") {
          setActionConfirm({
            kind: "dna",
            instanceId: d.instanceId,
            cardId: d.cardId,
            materialPermanentIds: evolutionRoute.materialPermanentIds,
            initialPermanentId: perm?.permanentId,
            normalPermanentId: perm.permanentId,
          });
          return;
        }
        const droppedEntry = handEntries.find((entry) => entry.instanceId === d.instanceId);
        if (droppedEntry && parseActivatable(droppedEntry.activatableEffectsJson).length > 0)
          return selectHandCard(droppedEntry);
        if (!def?.kinds.includes(CardKind.Option)) return playCard(d.instanceId, true);
        ping(t("game.hint.dropOption"));
        return;
      }
      if (target === "breeding-you") {
        if (viewer.breeding && digivolveTargetsOf(d.instanceId).includes(viewer.breeding.permanentId)) {
          return digivolveWithChoice(viewer.breeding.permanentId, d.instanceId, d.cardId, viewer.breeding, true);
        }
        ping(t("game.hint.cantDigivolveHere"));
        return;
      }
      if (target === "battle-you") return playCard(d.instanceId, true);
      if (target === "opp-security" || target === "perm-opp") {
        ping(t("game.hint.cantPlayOnOpponent"));
        return;
      }
    }

    if (d.kind === DragKind.Attack) {
      if (target === "opp-security") {
        const attacker = viewer.battleArea.find((x) => x.permanentId === d.permanentId);
        if (attacker?.canAttackPlayer) return attack(d.permanentId, { kind: "player" });
        ping(t("game.hint.onlySuspended"));
        return;
      }
      if (target === "perm-opp" && id) {
        const attacker = viewer.battleArea.find((x) => x.permanentId === d.permanentId);
        if (attacker?.attackablePermanentIds.includes(id)) {
          return attack(d.permanentId, { kind: "permanent", permanentId: id });
        }
        ping(t("game.hint.onlySuspended"));
        return;
      }
      ping(t("game.hint.dragTarget"));
    }
  };

  const onYourPerm = (perm: Permanent): (() => void) | undefined => {
    if (state.gameMode === GameMode.MANUAL.value) {
      return () => {
        setSelPerm(perm.permanentId);
        setHandSel(null);
      };
    }
    if (selPerm === perm.permanentId) return clearSel;
    if (linkSel) {
      if (linkSel.targetPermanentIds.includes(perm.permanentId)) {
        return () => linkCard(linkSel.instanceId, perm.permanentId);
      }
      return () => ping(t("game.hint.cantLinkHere"));
    }
    if (selCardId && handSel) {
      if (mainActionBlocked) return undefined;
      if (appFusionHostIdsOf(handSel).includes(perm.permanentId)) {
        return () => openAppFusionChoice(handSel, perm.permanentId);
      }
      const route = handCardEvolutionRoute(
        selCardId,
        viewer.battleArea,
        eligibleBase(perm),
        handEntries.find((entry) => entry.instanceId === handSel)?.dnaDigivolveRoutes,
        perm.permanentId,
      );
      if (route?.kind === "both")
        return () =>
          setActionConfirm({
            kind: "dna",
            instanceId: handSel,
            cardId: selCardId,
            materialPermanentIds: route.materialPermanentIds,
            initialPermanentId: perm?.permanentId,
            normalPermanentId: perm.permanentId,
          });
      if (route?.kind === "dna")
        return () =>
          setActionConfirm({
            kind: "dna",
            instanceId: handSel,
            cardId: selCardId,
            materialPermanentIds: route.materialPermanentIds,
            initialPermanentId: perm?.permanentId,
          });
      if (route?.kind === "normal") return () => digivolveWithChoice(perm.permanentId, handSel, selCardId, perm);
    }
    if (handSel) return undefined;
    return () => openOwnPermanent(perm.permanentId);
  };

  const onOppPerm = (perm: Permanent): (() => void) | undefined => {
    const attacker = selPerm ? viewer.battleArea.find((candidate) => candidate.permanentId === selPerm) : undefined;
    if (attackTargetIdsOf(attacker, vortexMode).includes(perm.permanentId)) {
      return () => attack(selPerm!, { kind: "permanent", permanentId: perm.permanentId }, vortexMode);
    }
    return () => showCardMenu(perm.permanentId, Side.Opponent);
  };

  const onBreeding = () => {
    if (state.gameMode === GameMode.MANUAL.value) {
      if (breedingActionsOpen && room) {
        if (viewer.breeding && !state.manual.canMoveFromBreeding) {
          return;
        }
        if (!viewer.breeding && !state.manual.canHatch) {
          return;
        }
        sendManualCommand({
          room,
          command: {
            action: ManualAction.BREEDING.value,
            choice: viewer.breeding ? ManualBreedingChoice.MOVE.value : ManualBreedingChoice.HATCH.value,
          },
        });
      } else if (viewer.breeding) {
        setSelPerm(viewer.breeding.permanentId);
      }
      return;
    }
    if (selCardId && viewer.breeding && eligibleBase(viewer.breeding)) {
      if (!mainActionBlocked)
        return digivolveWithChoice(viewer.breeding.permanentId, handSel!, selCardId!, viewer.breeding);
      return;
    }
    if (!breedingActionsOpen) return;
    if (viewer.breeding) {
      if (canMoveFromBreeding(viewer.breeding) && room) {
        playSound("confirm");
        intents.moveFromBreeding(room, viewer.breeding.permanentId);
        return;
      }
      ping(t("game.hint.needLevel3"));
      return;
    }
    if (room) {
      intents.hatchEgg(room);
    }
  };

  return {
    findPermanent,
    findPresentedPermanent,
    showCardMenu,
    beginAttack,
    stackCardsOf,
    selectHandCard,
    handleTap,
    handleDrop,
    onYourPerm,
    onOppPerm,
    onBreeding,
  };
}
