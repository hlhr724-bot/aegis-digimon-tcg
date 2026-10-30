import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Permanent } from "@aegis/shared";
import { COLORS } from "@/design/theme";
import type { ArenaPulse } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { findArenaZoneElement } from "@/game/arena3d/findArenaZoneElement";
import { findAttackerPermanentId } from "@/game/arena3d/findAttackerPermanentId";
import { getElementCenter } from "@/game/arena3d/getElementCenter";
import { getOppositeSide } from "@/game/arena3d/getOppositeSide";
import type { FieldClashScene } from "@/game/fieldClash";
import type { TurnTransitionCue } from "@/game/match/types";
import type { BurstVariant, PermanentBurst } from "@/game/showcases";
import type { AttackAnnouncement } from "@/game/sidePanels";
import { Side } from "@/game/side";

type PileCounts = {
  viewerDeck: number;
  opponentDeck: number;
  viewerTrash: number;
  opponentTrash: number;
};

type Params = {
  board: RefObject<HTMLElement | null>;
  viewerSeat: number;
  sideColors: ArenaSideColors;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  viewerBattleArea: Iterable<Permanent> | undefined;
  opponentBattleArea: Iterable<Permanent> | undefined;
  attackAnnouncement: AttackAnnouncement | null;
  fieldClash: FieldClashScene | null;
  turnTransition: TurnTransitionCue | null;
  combatImpactIds: ReadonlySet<string>;
  permanentBursts: ReadonlyMap<string, PermanentBurst>;
  securityHitSeat: number | null;
  pileCounts: PileCounts;
};

type PileWatch = {
  count: number;
  side: Side;
  zone: ArenaZone;
  kind: ArenaPulseKind;
  grows: boolean;
};

const MAX_PULSES = 24;

function getBurstKind(variant: BurstVariant): ArenaPulseKind {
  if (variant === "evolve") {
    return ArenaPulseKind.EVOLVE.value;
  }
  if (variant === "delete") {
    return ArenaPulseKind.DELETE.value;
  }
  return ArenaPulseKind.SUMMON.value;
}

function getElementSide(element: HTMLElement | null | undefined): Side {
  return element?.closest(".game-battle-row--opp, .game-opponent-breeding, [class*='--opp']")
    ? Side.Opponent
    : Side.Viewer;
}

function buildPileWatches(counts: PileCounts): PileWatch[] {
  return [
    {
      count: counts.viewerDeck,
      side: Side.Viewer,
      zone: ArenaZone.DECK.value,
      kind: ArenaPulseKind.DRAW.value,
      grows: false,
    },
    {
      count: counts.opponentDeck,
      side: Side.Opponent,
      zone: ArenaZone.DECK.value,
      kind: ArenaPulseKind.DRAW.value,
      grows: false,
    },
    {
      count: counts.viewerTrash,
      side: Side.Viewer,
      zone: ArenaZone.TRASH.value,
      kind: ArenaPulseKind.TRASH.value,
      grows: true,
    },
    {
      count: counts.opponentTrash,
      side: Side.Opponent,
      zone: ArenaZone.TRASH.value,
      kind: ArenaPulseKind.TRASH.value,
      grows: true,
    },
  ];
}

export function useArenaPulses({
  board,
  viewerSeat,
  sideColors,
  permanents,
  viewerBattleArea,
  opponentBattleArea,
  attackAnnouncement,
  fieldClash,
  turnTransition,
  combatImpactIds,
  permanentBursts,
  securityHitSeat,
  pileCounts,
}: Params): readonly ArenaPulse[] {
  const [pulses, setPulses] = useState<readonly ArenaPulse[]>([]);
  const seenImpacts = useRef(new Set<string>());
  const seenBursts = useRef(new Set<number>());
  const previousPiles = useRef<PileWatch[] | null>(null);
  const colors = useRef(sideColors);
  colors.current = sideColors;
  const battleAreas = useRef({ viewer: viewerBattleArea, opponent: opponentBattleArea });
  battleAreas.current = { viewer: viewerBattleArea, opponent: opponentBattleArea };

  const emit = useCallback((pulse: ArenaPulse) => {
    setPulses((current) => [...current, pulse].slice(-MAX_PULSES));
  }, []);

  const getSideColor = useCallback((side: Side) => {
    return side === Side.Viewer ? colors.current.player : colors.current.opponent;
  }, []);

  useEffect(() => {
    if (!attackAnnouncement) {
      return;
    }
    const side = attackAnnouncement.side;
    const area = side === Side.Viewer ? battleAreas.current.viewer : battleAreas.current.opponent;
    const attackerId = findAttackerPermanentId({ battleArea: area, cardId: attackAnnouncement.cardId });
    const attacker = attackerId ? permanents.current?.[attackerId] : undefined;
    const security = findArenaZoneElement({
      board: board.current,
      side: getOppositeSide(side),
      zone: ArenaZone.SECURITY.value,
    });
    emit({
      key: `attack:${attackAnnouncement.id}`,
      kind: ArenaPulseKind.ATTACK.value,
      color: getSideColor(side),
      side,
      screenPoint: getElementCenter(attacker),
      targetPoint: getElementCenter(security),
    });
  }, [attackAnnouncement, board, permanents, emit, getSideColor]);

  useEffect(() => {
    if (!fieldClash) {
      return;
    }
    const attacker = permanents.current?.[fieldClash.attacker.permanentId];
    const defender = permanents.current?.[fieldClash.defender.permanentId];
    const side = getElementSide(attacker);
    emit({
      key: `clash:${fieldClash.key}`,
      kind: ArenaPulseKind.ATTACK.value,
      color: getSideColor(side),
      side,
      screenPoint: getElementCenter(attacker),
      targetPoint: getElementCenter(defender),
    });
  }, [fieldClash, permanents, emit, getSideColor]);

  useEffect(() => {
    if (!turnTransition) {
      return;
    }
    const side = turnTransition.nextSeat === viewerSeat ? Side.Viewer : Side.Opponent;
    emit({
      key: `turn:${turnTransition.turnCount}:${turnTransition.nextSeat}`,
      kind: ArenaPulseKind.TURN.value,
      color: getSideColor(side),
      side,
    });
  }, [turnTransition, viewerSeat, emit, getSideColor]);

  useEffect(() => {
    for (const permanentId of combatImpactIds) {
      if (seenImpacts.current.has(permanentId)) {
        continue;
      }
      seenImpacts.current.add(permanentId);
      const element = permanents.current?.[permanentId];
      const side = getElementSide(element);
      emit({
        key: `impact:${permanentId}:${Date.now()}`,
        kind: ArenaPulseKind.IMPACT.value,
        color: getSideColor(getOppositeSide(side)),
        side,
        screenPoint: getElementCenter(element),
      });
    }
    for (const permanentId of seenImpacts.current) {
      if (!combatImpactIds.has(permanentId)) {
        seenImpacts.current.delete(permanentId);
      }
    }
  }, [combatImpactIds, permanents, emit, getSideColor]);

  useEffect(() => {
    for (const burst of permanentBursts.values()) {
      if (seenBursts.current.has(burst.key) || burst.moveFromBreeding) {
        continue;
      }
      seenBursts.current.add(burst.key);
      const element = permanents.current?.[burst.permanentId];
      const side = getElementSide(element);
      const anchor =
        element ??
        (burst.inBreeding ? findArenaZoneElement({ board: board.current, side, zone: ArenaZone.RAISING.value }) : null);
      emit({
        key: `burst:${burst.key}`,
        kind: getBurstKind(burst.variant),
        color: COLORS[burst.color].base,
        side,
        screenPoint: getElementCenter(anchor),
      });
    }
  }, [permanentBursts, permanents, board, emit]);

  useEffect(() => {
    if (securityHitSeat === null) {
      return;
    }
    const side = securityHitSeat === viewerSeat ? Side.Viewer : Side.Opponent;
    emit({
      key: `security:${securityHitSeat}:${Date.now()}`,
      kind: ArenaPulseKind.SECURITY.value,
      color: getSideColor(getOppositeSide(side)),
      side,
      screenPoint: getElementCenter(
        findArenaZoneElement({ board: board.current, side, zone: ArenaZone.SECURITY.value }),
      ),
    });
  }, [securityHitSeat, viewerSeat, board, emit, getSideColor]);

  const { viewerDeck, opponentDeck, viewerTrash, opponentTrash } = pileCounts;
  useEffect(() => {
    const watches = buildPileWatches({ viewerDeck, opponentDeck, viewerTrash, opponentTrash });
    const previous = previousPiles.current;
    previousPiles.current = watches;
    if (!previous) {
      return;
    }
    watches.forEach((watch, index) => {
      const before = previous[index]!.count;
      const changed = watch.grows ? watch.count > before : watch.count < before;
      if (!changed) {
        return;
      }
      emit({
        key: `${watch.zone}:${watch.side}:${watch.count}:${Date.now()}`,
        kind: watch.kind,
        color: getSideColor(watch.side),
        side: watch.side,
        screenPoint: getElementCenter(
          findArenaZoneElement({ board: board.current, side: watch.side, zone: watch.zone }),
        ),
      });
    });
  }, [viewerDeck, opponentDeck, viewerTrash, opponentTrash, board, emit, getSideColor]);

  return pulses;
}
