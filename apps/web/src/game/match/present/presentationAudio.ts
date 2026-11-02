import { CardKind, getCardDefinition, Phase, type Permanent, type Seat } from "@aegis/shared";
import type { SoundDetails, SoundKind } from "../../../design/sound";
import type { presentedSeats } from "../../screen/model/presentedSeats";
import type { MatchCues } from "../types";
import type { NoticeKeyword } from "../../notices";
import { SecurityBreakPhase } from "../enums";
import { SECURITY_CLASH_OUTCOME_AT_MS, SECURITY_DESTROY_OUTCOME_AT_MS } from "../../securityClash";

const PROTECTION_KEYWORDS: ReadonlySet<NoticeKeyword> = new Set([
  "scapegoat",
  "decoy",
  "guard",
  "fragment",
  "armorPurge",
]);

export interface PresentationSound {
  id: string;
  kind: SoundKind;
  details?: SoundDetails;
}

type AudioPermanent = Pick<Permanent, "permanentId" | "topCard" | "stack">;
export interface PresentationAudioBoard {
  players: readonly { battleArea: readonly AudioPermanent[]; breeding?: AudioPermanent }[];
}

/** Use the same field and independently held breeding slots the screen paints. */
export function audioBoardFromPresentedSeats(
  seats: Pick<
    ReturnType<typeof presentedSeats>,
    "shownViewer" | "shownOpponent" | "breedingViewer" | "breedingOpponent"
  >,
  viewerSeat: Seat,
): PresentationAudioBoard {
  const viewer = { battleArea: seats.shownViewer.battleArea, breeding: seats.breedingViewer.breeding };
  const opponent = { battleArea: seats.shownOpponent.battleArea, breeding: seats.breedingOpponent.breeding };
  return { players: viewerSeat === 0 ? [viewer, opponent] : [opponent, viewer] };
}

/** Only committed visible presentations earn audio; receipt/intent timing has no role. */
export function soundsForPresentation(cues: MatchCues, board?: PresentationAudioBoard): PresentationSound[] {
  const sounds: PresentationSound[] = [];
  const add = (id: string, kind: SoundKind, details?: SoundDetails) =>
    sounds.push({ id, kind, ...(details ? { details } : {}) });
  const cardDetails = (cardId: string): SoundDetails => {
    const card = getCardDefinition(cardId);
    return {
      cost: card?.playCost,
      targetLevel: card?.level,
      assembly: /[＜<]Assembly\b/i.test(card?.effectText ?? ""),
    };
  };
  const evolutionDetails = (cardId: string, permanent?: AudioPermanent): SoundDetails => {
    // A showcase has no physical ID: ambiguous or absent hosts keep neutral source metadata.
    // Never search older card IDs inside a newer stack to reconstruct a past occurrence.
    const source = permanent?.topCard?.cardId === cardId ? permanent.stack.at(-1) : undefined;
    return { ...cardDetails(cardId), sourceLevel: source ? getCardDefinition(source.cardId)?.level : undefined };
  };
  if (cues.zoneShowcase) {
    const scene = cues.zoneShowcase;
    // Only a matching physical arrival occurrence can identify the showcase's host.
    const arrival = [...cues.permanentBursts.values()].find((burst) => burst.key === scene.key);
    const player = board?.players[scene.seat];
    const permanent = arrival
      ? (arrival.inBreeding ? (player?.breeding ? [player.breeding] : []) : [...(player?.battleArea ?? [])]).find(
          (item) => item.permanentId === arrival.permanentId,
        )
      : undefined;
    const option = getCardDefinition(scene.cardId)?.kinds.includes(CardKind.Option) === true;
    add(
      `arrival:${scene.key}`,
      scene.kind === "digivolve" ? "digivolve" : option ? "optionUse" : "cardPlay",
      scene.kind === "play" ? cardDetails(scene.cardId) : evolutionDetails(scene.cardId, permanent),
    );
  }
  for (const burst of cues.permanentBursts.values()) {
    if (burst.moveFromBreeding) add(`move:${burst.key}`, "move");
    else if (burst.variant === "hatch") add(`hatch:${burst.key}`, "hatch");
    else if (burst.variant === "play" || burst.variant === "evolve") {
      const permanent = board?.players
        .flatMap((player) => (burst.inBreeding ? (player.breeding ? [player.breeding] : []) : [...player.battleArea]))
        .find((item) => item.permanentId === burst.permanentId);
      const cardId = permanent?.topCard?.cardId ?? "";
      // Showcase and landing share occurrence keys; the landing is a fallback, never a second play.
      add(
        `arrival:${burst.key}`,
        burst.variant === "play" ? "cardPlay" : "digivolve",
        burst.variant === "play" ? cardDetails(cardId) : evolutionDetails(cardId, permanent),
      );
    }
  }
  if (cues.attackAnnouncement) add(`attack:${cues.attackAnnouncement.id}`, "attackDeclare");
  if (cues.securityBreak?.phase === SecurityBreakPhase.Break) add(`shield:${cues.securityBreak.key}`, "securityHit");
  if (cues.securityClash && !cues.securityClash.revealedReady)
    add(`security-reveal:${cues.securityClash.key}`, "reveal");
  for (const id of cues.combatImpactIds)
    add(`impact:${cues.fieldClash?.key ?? cues.securityClash?.key ?? id}`, "impact");
  for (const burst of cues.deleteBursts) {
    const topStrip = burst.stackStripKind === "top";
    add(`departure:${burst.key}`, burst.stackStrip ? (topStrip ? "deDigivolve" : "sourceTrash") : "delete");
  }
  for (const source of cues.effectSources) {
    // Field focus owns its geometry-validated cue in EffectFocus. Linked holds are silent.
    if (source.site.zone !== "field" && source.linked !== true) add(`source:${source.key}`, "effectActivate");
  }
  for (const [pile, key] of cues.deckRiffles) add(`shuffle:${pile}:${key}`, "shuffle");
  for (const [key] of cues.securityFlights) add(`recovery:${key}`, "recover");
  for (const flight of cues.drawFlights) {
    if (!flight.handTrash) {
      add(`flight:${flight.key}`, flight.deckReturn || flight.handReturn ? "move" : "draw");
    }
  }
  if (cues.revealShowcase) add(`reveal:${cues.revealShowcase.key}`, "reveal");
  for (const pulse of cues.dpPulses.values()) add(`dp:${pulse.key}`, pulse.kind === "buff" ? "buff" : "debuff");
  for (const pulse of cues.freezePulses.values()) {
    if (pulse.kind === "buff" || pulse.kind === "debuff") {
      add(`status:${pulse.key}`, pulse.kind);
    } else {
      add(`freeze:${pulse.key}`, "freeze");
    }
  }
  // Unsuspend and Draw already sound through their sweep and draw flight.
  if (cues.phaseBanner && (cues.phaseBanner.phase === Phase.Breeding || cues.phaseBanner.phase === Phase.Main))
    add(`phase:${cues.phaseBanner.key}`, "phase");
  for (const [seat, dealt] of cues.securityDealCounts) if (dealt > 0) add(`deal:${seat}:${dealt}`, "securityDeal");
  if (cues.unsuspendSweep) add(`unsuspend:${cues.unsuspendSweep.key}`, "move");
  for (const notice of cues.notices) {
    const body = notice.body;
    if (body.variant === "effect") {
      // A physical source focus already explains this activation. Unlocated sources still have the painted clause.
      if (
        body.isContinuation !== true &&
        !cues.effectSources.some((source) => source.itemId === notice.id || source.cardId === body.cardId)
      )
        add(`notice:${notice.id}`, "effectActivate");
    } else if (notice.body.variant === "keyword")
      add(`notice:${notice.id}`, PROTECTION_KEYWORDS.has(notice.body.keyword) ? "protect" : "group");
  }
  for (const panel of cues.sidePanels) {
    if (panel.titleKey === "panel.discardedCards") add(`panel:${panel.id}`, "handTrash");
    else if (panel.titleKey === "panel.trashedCards") add(`panel:${panel.id}`, "handTrash");
    else if (panel.titleKey === "panel.digivolutionCards" || panel.titleKey === "panel.selectedCards")
      add(`panel:${panel.id}`, "group");
  }
  return sounds;
}

/** Bound memory, preserving a played occurrence across linked holds and geometry updates. */
export function takeNewPresentationSounds(
  sounds: readonly PresentationSound[],
  seen: Set<string>,
): PresentationSound[] {
  const fresh = sounds.filter((sound) => {
    if (seen.has(sound.id)) return false;
    seen.add(sound.id);
    return true;
  });
  while (seen.size > 512) seen.delete(seen.values().next().value!);
  return fresh;
}

/** CSS-owned security outcomes have a public scene clock, so they need no polling. */
export function securityOutcomeSound(
  scene: MatchCues["securityClash"],
): (PresentationSound & { delayMs: number }) | null {
  if (!scene || (scene.cause !== "destruction" && scene.resolution !== "battle")) return null;
  return {
    id: `security-outcome:${scene.key}`,
    kind: scene.cause === "destruction" ? "delete" : "impact",
    delayMs:
      scene.outcomeAtMs ??
      (scene.cause === "destruction" ? SECURITY_DESTROY_OUTCOME_AT_MS : SECURITY_CLASH_OUTCOME_AT_MS),
  };
}
