import { useEffect, useRef, type RefObject } from "react";
import type { Permanent } from "@aegis/shared";
import { animateArenaCard } from "@/game/arena3d/animateArenaCard";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { findArenaZoneElement } from "@/game/arena3d/findArenaZoneElement";
import { findAttackerPermanentId } from "@/game/arena3d/findAttackerPermanentId";
import { getOppositeSide } from "@/game/arena3d/getOppositeSide";
import type { FieldClashScene } from "@/game/fieldClash";
import type { TurnTransitionCue } from "@/game/match/types";
import type { PermanentBurst } from "@/game/showcases";
import type { AttackAnnouncement } from "@/game/sidePanels";
import { Side } from "@/game/side";

type Params = {
  board: RefObject<HTMLElement | null>;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  viewerSeat: number;
  viewerBattleArea: Iterable<Permanent> | undefined;
  opponentBattleArea: Iterable<Permanent> | undefined;
  attackAnnouncement: AttackAnnouncement | null;
  fieldClash: FieldClashScene | null;
  combatImpactIds: ReadonlySet<string>;
  permanentBursts: ReadonlyMap<string, PermanentBurst>;
  turnTransition: TurnTransitionCue | null;
  securityHitSeat: number | null;
};

type Vector = { x: number; y: number };

const CARD_SELECTOR = ".game-card-enter";
const TILT_DEGREES = 16;

function findCard(element: HTMLElement | null | undefined): Element | null {
  return element?.querySelector(CARD_SELECTOR) ?? null;
}

function findTiltTarget(target: Element | null): HTMLElement | null {
  const host = target?.closest<HTMLElement>(
    ".game-battle-row .game-permanent, .game-breeding-slot, .game-pile, :has(> .game-pile)",
  );
  if (!host) {
    return null;
  }
  if (host.matches(".game-pile")) {
    return host;
  }
  return host.querySelector<HTMLElement>(`${CARD_SELECTOR}, :scope > .game-pile`);
}

function getCenter(element: Element): Vector {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getOffset(from: Element, to: Element): Vector {
  const start = getCenter(from);
  const end = getCenter(to);
  return { x: end.x - start.x, y: end.y - start.y };
}

function playLunge(card: Element, reach: Vector): void {
  animateArenaCard({
    element: card,
    duration: 980,
    easing: "cubic-bezier(0.3, 0, 0.2, 1)",
    keyframes: [
      { transform: "translate3d(0, 0, 0)" },
      {
        transform: `translate3d(${-reach.x * 0.08}px, ${-reach.y * 0.08}px, 90px) rotateX(-28deg) scale(1.08)`,
        offset: 0.3,
      },
      {
        transform: `translate3d(${reach.x * 0.75}px, ${reach.y * 0.75}px, 160px) rotateX(${reach.y < 0 ? 24 : -24}deg) rotateZ(${reach.x * 0.02}deg) scale(1.18)`,
        offset: 0.55,
        easing: "cubic-bezier(0.5, 0, 0.3, 1)",
      },
      { transform: "translate3d(0, 0, 40px) rotateX(-8deg)", offset: 0.85 },
      { transform: "translate3d(0, 0, 0)" },
    ],
  });
}

function playKnockback(card: Element, push: Vector): void {
  const length = Math.hypot(push.x, push.y) || 1;
  const direction = { x: (push.x / length) * 40, y: (push.y / length) * 40 };
  animateArenaCard({
    element: card,
    duration: 820,
    delay: 320,
    easing: "cubic-bezier(0.2, 0.8, 0.25, 1)",
    keyframes: [
      { transform: "translate3d(0, 0, 0)" },
      {
        transform: `translate3d(${direction.x}px, ${direction.y}px, -140px) rotateX(55deg) rotateY(-25deg) rotateZ(14deg)`,
        offset: 0.2,
      },
      { transform: "translate3d(0, 0, 30px) rotateX(-14deg) rotateY(8deg)", offset: 0.55 },
      { transform: "translate3d(0, 0, 0) rotateX(4deg)", offset: 0.8 },
      { transform: "translate3d(0, 0, 0)" },
    ],
  });
}

function playEvolve(card: Element): void {
  animateArenaCard({
    element: card,
    duration: 1300,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    keyframes: [
      { transform: "translate3d(0, 0, 0)" },
      { transform: "translate3d(0, -30px, 180px) rotateY(0deg) scale(1.15)", offset: 0.25 },
      { transform: "translate3d(0, -40px, 220px) rotateY(720deg) scale(1.25)", offset: 0.75 },
      { transform: "translate3d(0, 6px, -30px) rotateY(720deg) rotateX(12deg)", offset: 0.88 },
      { transform: "translate3d(0, 0, 0) rotateY(720deg)" },
    ],
  });
}

function playDrop(card: Element): void {
  animateArenaCard({
    element: card,
    duration: 900,
    easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)",
    keyframes: [
      { transform: "translate3d(0, -160px, 420px) rotateY(-180deg) rotateX(60deg) scale(1.3)" },
      { transform: "translate3d(0, 10px, -40px) rotateY(0deg) rotateX(-12deg)", offset: 0.6 },
      { transform: "translate3d(0, -6px, 16px) rotateX(5deg)", offset: 0.8 },
      { transform: "translate3d(0, 0, 0)" },
    ],
  });
}

function playDeletion(card: Element): void {
  animateArenaCard({
    element: card,
    duration: 760,
    easing: "cubic-bezier(0.5, 0, 0.8, 0.4)",
    keyframes: [
      { transform: "translate3d(0, 0, 0)" },
      { transform: "translate3d(0, -20px, 60px) rotateX(-20deg) rotateZ(-6deg)", offset: 0.3 },
      { transform: "translate3d(0, 40px, -260px) rotateX(95deg) rotateZ(18deg)" },
    ],
  });
}

function playHop(card: Element, delay: number): void {
  animateArenaCard({
    element: card,
    duration: 560,
    delay,
    easing: "cubic-bezier(0.3, 0.7, 0.4, 1)",
    keyframes: [
      { transform: "translate3d(0, 0, 0)" },
      { transform: "translate3d(0, -14px, 70px) rotateX(-20deg)", offset: 0.4 },
      { transform: "translate3d(0, 2px, -8px) rotateX(4deg)", offset: 0.75 },
      { transform: "translate3d(0, 0, 0)" },
    ],
  });
}

function playShieldShake(element: Element | null): void {
  animateArenaCard({
    element,
    duration: 700,
    easing: "ease-out",
    keyframes: [
      { transform: "perspective(700px) translate3d(0, 0, 0)" },
      { transform: "perspective(700px) translate3d(-8px, 0, 60px) rotateY(-30deg) rotateX(14deg)", offset: 0.15 },
      { transform: "perspective(700px) translate3d(8px, 0, 30px) rotateY(24deg) rotateX(-8deg)", offset: 0.35 },
      { transform: "perspective(700px) translate3d(-4px, 0, 10px) rotateY(-10deg)", offset: 0.6 },
      { transform: "perspective(700px) translate3d(0, 0, 0)" },
    ],
  });
}

function getDefaultReach(side: Side): Vector {
  return { x: 0, y: side === Side.Viewer ? -220 : 220 };
}

export function useArenaCardMotion({
  board,
  permanents,
  viewerSeat,
  viewerBattleArea,
  opponentBattleArea,
  attackAnnouncement,
  fieldClash,
  combatImpactIds,
  permanentBursts,
  turnTransition,
  securityHitSeat,
}: Params): void {
  const battleAreas = useRef({ viewer: viewerBattleArea, opponent: opponentBattleArea });
  battleAreas.current = { viewer: viewerBattleArea, opponent: opponentBattleArea };
  const seenBursts = useRef(new Set<number>());
  const seenImpacts = useRef(new Set<string>());

  useEffect(() => {
    if (!attackAnnouncement) {
      return;
    }
    const area = attackAnnouncement.side === Side.Viewer ? battleAreas.current.viewer : battleAreas.current.opponent;
    const attackerId = findAttackerPermanentId({ battleArea: area, cardId: attackAnnouncement.cardId });
    const card = findCard(attackerId ? permanents.current?.[attackerId] : undefined);
    if (!card) {
      return;
    }
    const security = findArenaZoneElement({
      board: board.current,
      side: getOppositeSide(attackAnnouncement.side),
      zone: ArenaZone.SECURITY.value,
    });
    playLunge(card, security ? getOffset(card, security) : getDefaultReach(attackAnnouncement.side));
  }, [attackAnnouncement, permanents, board]);

  useEffect(() => {
    if (!fieldClash) {
      return;
    }
    const attacker = findCard(permanents.current?.[fieldClash.attacker.permanentId]);
    const defender = findCard(permanents.current?.[fieldClash.defender.permanentId]);
    if (!attacker || !defender) {
      return;
    }
    const reach = getOffset(attacker, defender);
    playLunge(attacker, reach);
    playKnockback(defender, reach);
  }, [fieldClash, permanents]);

  useEffect(() => {
    for (const permanentId of combatImpactIds) {
      if (seenImpacts.current.has(permanentId)) {
        continue;
      }
      seenImpacts.current.add(permanentId);
      const card = findCard(permanents.current?.[permanentId]);
      if (card) {
        playKnockback(card, { x: 0, y: card.closest(".game-battle-row--opp") ? -1 : 1 });
      }
    }
    for (const permanentId of seenImpacts.current) {
      if (!combatImpactIds.has(permanentId)) {
        seenImpacts.current.delete(permanentId);
      }
    }
  }, [combatImpactIds, permanents]);

  useEffect(() => {
    for (const burst of permanentBursts.values()) {
      if (seenBursts.current.has(burst.key) || burst.moveFromBreeding) {
        continue;
      }
      seenBursts.current.add(burst.key);
      const card = findCard(permanents.current?.[burst.permanentId]);
      if (!card) {
        continue;
      }
      if (burst.variant === "evolve") {
        playEvolve(card);
      } else if (burst.variant === "delete") {
        playDeletion(card);
      } else if (burst.variant === "hatch") {
        playDrop(card);
      }
    }
  }, [permanentBursts, permanents]);

  useEffect(() => {
    if (!turnTransition) {
      return;
    }
    const rowSelector = turnTransition.nextSeat === viewerSeat ? ".game-battle-row--you" : ".game-battle-row--opp";
    const cards = board.current?.querySelectorAll(`${rowSelector} ${CARD_SELECTOR}`) ?? [];
    cards.forEach((card, index) => playHop(card, 250 + index * 70));
  }, [turnTransition, viewerSeat, board]);

  useEffect(() => {
    if (securityHitSeat === null) {
      return;
    }
    const sideClass = securityHitSeat === viewerSeat ? "--you" : "--opp";
    playShieldShake(board.current?.querySelector(`.game-security-shield${sideClass}`) ?? null);
  }, [securityHitSeat, viewerSeat, board]);

  useEffect(() => {
    const element = board.current;
    if (!element) {
      return;
    }
    let tilted: HTMLElement | null = null;
    const reset = () => {
      tilted?.style.removeProperty("--arena-3d-tilt-x");
      tilted?.style.removeProperty("--arena-3d-tilt-y");
      tilted = null;
    };
    let frame = 0;
    let latest: PointerEvent | null = null;
    const track = (event: PointerEvent) => {
      latest = event;
      if (frame === 0) {
        frame = requestAnimationFrame(applyTilt);
      }
    };
    const applyTilt = () => {
      frame = 0;
      const event = latest;
      if (!event) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const card = findTiltTarget(target);
      if (card !== tilted) {
        reset();
      }
      if (!card) {
        return;
      }
      tilted = card;
      const rect = card.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      card.style.setProperty("--arena-3d-tilt-x", `${(-y * TILT_DEGREES).toFixed(2)}deg`);
      card.style.setProperty("--arena-3d-tilt-y", `${(x * TILT_DEGREES).toFixed(2)}deg`);
    };
    element.addEventListener("pointermove", track, { passive: true });
    element.addEventListener("pointerleave", reset);
    return () => {
      element.removeEventListener("pointermove", track);
      element.removeEventListener("pointerleave", reset);
      cancelAnimationFrame(frame);
      reset();
    };
  }, [board]);
}
