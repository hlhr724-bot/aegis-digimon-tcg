/* Projections from the synchronized GameState into the shapes the React board
   renders. Pure reads of @aegis/shared state — no rules, no mutation. The server
   owns legality; these helpers only shape what the viewer sees. */

import {
  getCardDefinition,
  parseTriggerKey,
  type GameState,
  type Permanent,
  type PlayerState,
  type Seat,
  type ServerEvent,
  CardKind,
  Phase,
} from "@aegis/shared";
import { colorKey, type ColorName } from "../design/theme";
import type { Translate } from "../i18n";

export interface ActivatableEntry {
  instanceId: string;
  effectKey: string;
  description: string;
}

/** Deep stacks keep every source but bound the fan to a quarter of the card width. */
export function sourceFanStepLimit(width: number, count: number): number {
  return Math.max(4, width / 4) / Math.max(1, count - 1);
}

/** Events appended after `previous`, resilient to useRoom's rolling 100-event window. */
export function eventsAfter(events: readonly ServerEvent[], previous?: ServerEvent): readonly ServerEvent[] {
  if (previous === undefined) return events;
  return events.slice(events.indexOf(previous) + 1);
}

export function parseActivatable(json: string): ActivatableEntry[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as ActivatableEntry[];
  } catch {
    return [];
  }
}

export interface LinkCardSlot {
  /** Width/height of the box the (sideways) link card mini occupies, post-rotation. */
  width: number;
  height: number;
  /** Position relative to the host card's own top-left corner. */
  left: number;
  top: number;
}

/**
 * Lays out a permanent's `linked` cards plugged in sideways under the host, per
 * Comprehensive Rules 4-8-3: each link card is inserted from the right so its link
 * portion stays visible, and a newly inserted link card must be placed so its own
 * link portion is visible under any cards already there. `hostWidth` is the host
 * card's mini width (matches CardMini's aspect ratio of height = width * 1.4).
 * Anchored toward the host's bottom-right corner (not its vertical middle) so it
 * reads as tucked under the host rather than pinned to its side.
 *
 * The "how much must peek" question is answered from CardMini's own TokenInfo
 * layout (apps/web/src/design/cards.tsx ~L305-320), not guessed: the readable
 * name+DP band is a full-width strip pinned to the card's bottom edge, sized
 * `paddingTop(12) + nameLineHeight(~9.5) + paddingBottom(4)` at width=92 scale,
 * i.e. ~29-30px of a 92*1.4=128.8px-tall mini card — about 23% of the card's
 * long edge. Below that, the strip carrying the card's name/cost/DP is clipped
 * and the link card is unreadable. `peek` below exposes 36%, with margin.
 *
 * The caller must rotate the link card counter-clockwise (not clockwise): a
 * counter-clockwise turn maps the card's original BOTTOM edge (where the
 * name/cost/DP band lives) onto the edge that ends up exposed on the right, so
 * the peeking strip is actually the readable band, not a stray edge of the
 * card's middle artwork.
 */
/** How far a permanent's link cards stick out past its right edge, so neighbours can clear them. */
export function linkCardOverhang(count: number, hostWidth: number): number {
  const slot = linkCardSlots(count, hostWidth)[0];
  return slot === undefined ? 0 : slot.left + slot.width - hostWidth;
}

export function linkCardSlots(count: number, hostWidth: number): LinkCardSlot[] {
  const hostHeight = Math.round(hostWidth * 1.4);
  const linkWidth = Math.round(hostWidth * 0.62);
  const linkHeight = Math.round(linkWidth * 1.4);
  const peek = Math.round(linkHeight * 0.36);
  const stagger = Math.round(linkWidth * 0.42);
  const slots: LinkCardSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push({
      width: linkHeight,
      height: linkWidth,
      left: hostWidth - (linkHeight - peek),
      top: hostHeight - Math.round(linkWidth * 0.9) + i * stagger,
    });
  }
  return slots;
}

/** This client's seat: the player whose sessionId matches ours; default 0. */
/**
 * Whether the breeding-area Digimon may move to the battle area. Comprehensive
 * Rules §4-16-2: only a Digimon with DP can move, which excludes the Lv.2 Digi-Egg
 * a hatch puts there. Mirrors the server's `validateMoveFromBreeding`.
 */
export function canMoveFromBreeding(breeding: Permanent | undefined): boolean {
  if (breeding === undefined) return false;
  const definition = getCardDefinition(breeding.topCard?.cardId ?? "");
  if (definition === undefined) return false;
  // Printed DP is the client-visible movement criterion. This intentionally
  // includes EX2-007 Mother D-Reaper, a Digi-Egg card with 15000 DP that
  // official Q3276 permits to move without digivolving first.
  return definition.kinds.includes(CardKind.Digimon) || (definition.dp ?? 0) > 0;
}

/**
 * Whether the breeding action (hatch a Digi-Egg, or move the raised Digimon out)
 * can actually be taken right now. Both verbs are gated on the turn player's
 * breeding phase (§4-16 / §4-17), which the server enforces in `gateBreedingPhase`
 * and would otherwise reject as `wrong-phase`.
 *
 * The action bar, the card sheet and the breeding prompt all offer these verbs, so
 * the rule lives here rather than being spelled out at each call site.
 */
export function canUseBreedingAction({
  phase,
  isMyTurn,
  canHatch,
  canMove,
}: {
  phase: Phase;
  isMyTurn: boolean;
  canHatch: boolean;
  canMove: boolean;
}): boolean {
  if (phase !== Phase.Breeding) return false;
  if (!isMyTurn) return false;
  return canHatch || canMove;
}

/**
 * What a click on the occupied breeding slot means. During the breeding step a
 * Digimon that may move answers with the move itself, since that is the only verb
 * the step offers for it; outside that step the slot behaves like any other own
 * card and opens the detail menu. A pending selection keeps the detail routing,
 * because the click then belongs to that selection (digivolve, link, deselect).
 */
export function breedingSlotClickAction({
  breedingActionsOpen,
  canMove,
  hasPendingSelection,
}: {
  breedingActionsOpen: boolean;
  canMove: boolean;
  hasPendingSelection: boolean;
}): "move" | "detail" {
  return breedingActionsOpen && canMove && !hasPendingSelection ? "move" : "detail";
}

/**
 * Whether `perm` may declare a normal attack right now, and whether it may declare a
 * ＜Vortex＞ attack right now. Both read the server's own projection rather than
 * re-deriving the rules: turn, phase, summoning sickness (§16-1), the once-per-turn
 * limit (§11-2-3), suspension, `can't attack`/`can't suspend` restrictions and a
 * pending ＜Blitz＞ declaration are all already resolved server-side, and a Digimon that has no legal
 * object has no attack to offer either way.
 *
 * ＜Vortex＞ is projected separately because §16-33-1 makes it a same-turn-attack grant
 * in its own right — a Vortex Digimon played this turn can Vortex-attack while it
 * cannot attack normally, so the normal projection cannot stand in for it.
 */
export function canAttackWith(perm: Permanent): boolean {
  return perm.canAttackPlayer || perm.attackablePermanentIds.length > 0;
}

export function canVortexAttackWith(perm: Permanent): boolean {
  return perm.canVortexAttackPlayer || perm.vortexAttackablePermanentIds.length > 0;
}

/** The permanent ids `attacker` may target in the current (normal or ＜Vortex＞) declaration. */
export function attackTargetIdsOf(attacker: Permanent | undefined, vortex: boolean): readonly string[] {
  if (!attacker) return [];
  return vortex ? attacker.vortexAttackablePermanentIds : attacker.attackablePermanentIds;
}

/** Those targets resolved against a battle area, in board order. */
export function attackTargetsOf(
  attacker: Permanent | undefined,
  battleArea: readonly Permanent[],
  vortex: boolean,
): Permanent[] {
  const legal = attackTargetIdsOf(attacker, vortex);
  return battleArea.filter((permanent) => legal.includes(permanent.permanentId));
}

/** Whether `attacker` may hit the opponent's security in the current declaration mode. */
export function canAttackPlayerWith(attacker: Permanent | undefined, vortex: boolean): boolean {
  if (!attacker) return false;
  return vortex ? attacker.canVortexAttackPlayer : attacker.canAttackPlayer;
}

export function viewerSeatOf(state: GameState | undefined, sessionId: string | undefined): Seat {
  if (state && sessionId) {
    for (let seat = 0 as Seat; seat <= 1; seat = (seat + 1) as Seat) {
      if (state.players[seat]?.sessionId === sessionId) return seat;
    }
  }
  return 0;
}

export const otherSeat = (seat: Seat): Seat => (1 - seat) as Seat;

/** Memory from the viewer's perspective: positive favors the viewer. */
export function displayMemory(state: Pick<GameState, "turnSeat" | "memory">, viewerSeat: Seat): number {
  return state.turnSeat === viewerSeat ? state.memory : -state.memory;
}

/** Both seats are occupied (a real opponent has joined). */
export function bothSeated(state: GameState | undefined): boolean {
  return Boolean(state && state.players[0]?.sessionId && state.players[1]?.sessionId);
}

/* Digivolve LEGALITY is deliberately absent here: the server projects it per (hand card,
   base) pair onto `CardInstance.digivolveTargetPermanentIds`, and a second client-side
   answer would only drift from it. What remains below is PRICING — which cost paths a
   legal digivolution offers — because the cost-choice overlay must label them and the
   server has no reason to project prose. */

/** Identity color for a player: derived from their visible cards, else a fallback. */
export function playerColorKey(player: PlayerState | undefined, fallback: ColorName): ColorName {
  if (!player) return fallback;
  const sources: (string | undefined)[] = [
    player.battleArea?.[0]?.topCard?.cardId,
    player.breeding?.topCard?.cardId,
    player.trash?.at(-1)?.cardId,
    player.hand?.[0]?.cardId,
  ];
  for (const cardId of sources) {
    if (!cardId) continue;
    const def = getCardDefinition(cardId);
    const key = colorKey(def?.colors[0]);
    if (key !== "Neutral") return key;
  }
  return fallback;
}

/**
 * Derive a human label from an `orderTriggers` decision's trigger key
 * (`<instanceId>::<cardId>/<slug>`, built by `buildTriggerKey` — the instance
 * prefix is what makes two permanents of the same card independently
 * addressable in the decision; see resolverDecisions.ts). Only the effectKey
 * half is shown; when multiple triggering permanents share a card (and thus a
 * label), `triggerLabels` below appends a disambiguating suffix.
 */
export function triggerLabel(triggerKey: string): string {
  const { effectKey } = parseTriggerKey(triggerKey);
  const slashAt = effectKey.indexOf("/");
  if (slashAt === -1) return effectKey;
  const cardId = triggerCardId(triggerKey);
  const name = getCardDefinition(cardId)?.nameEn;
  const slug = effectKey.slice(slashAt + 1).replace(/-/g, " ");
  return name ? `${name} · ${slug}` : effectKey;
}

/** Card definition id carried by a pending trigger's effect key. */
export function triggerCardId(triggerKey: string): string {
  const { effectKey } = parseTriggerKey(triggerKey);
  const slashAt = effectKey.indexOf("/");
  return slashAt === -1 ? effectKey : effectKey.slice(0, slashAt);
}

/**
 * Label every triggerKey in an `orderTriggers` decision, appending "(copy N)"
 * only when two DIFFERENT permanents share a card — the one thing a copy number
 * can honestly mean.
 *
 * A permanent can queue two effects at once (Megadramon's [On Play] and [When
 * Digivolving] both fire when it is played onto a base). Those entries share an
 * instanceId, so numbering them as copies claimed a second Megadramon that was
 * never on the board. They are told apart by their firing window instead, which
 * the chooser renders beside the name (see DecisionOverlay).
 */
export function triggerLabels(
  triggerKeys: readonly string[],
  t: Translate,
  triggerCardIds: readonly string[] = [],
  getDisplayName: (cardId: string) => string = (cardId) => getCardDefinition(cardId)?.nameEn ?? cardId,
): string[] {
  if (triggerKeys.length === 1) {
    const cardId = triggerCardIds[0] ?? triggerCardId(triggerKeys[0]!);
    return [getDisplayName(cardId)];
  }
  // Effect-key suffixes are implementation details (`ir-6-0`, `GainMemory`) and
  // are neither stable nor meaningful to a player. The server now carries timing
  // separately for the printed clause; rows identify the actual source card only.
  const entries = triggerKeys.map((key, index) => {
    const cardId = triggerCardIds[index] ?? triggerCardId(key);
    return { label: getCardDefinition(cardId)?.nameEn ?? cardId, cardId, instanceId: parseTriggerKey(key).instanceId };
  });
  // Copy numbers are per PERMANENT, not per entry, so a permanent that queued two
  // effects keeps one identity and a card with no second permanent keeps none.
  const instancesByLabel = new Map<string, string[]>();
  for (const entry of entries) {
    const seen = instancesByLabel.get(entry.label) ?? [];
    if (!seen.includes(entry.instanceId)) seen.push(entry.instanceId);
    instancesByLabel.set(entry.label, seen);
  }
  return entries.map(({ label, cardId, instanceId }) => {
    const instances = instancesByLabel.get(label) ?? [];
    const displayLabel = getDisplayName(cardId);
    if (instances.length <= 1) {
      return displayLabel;
    }
    return t("log.copySuffix", { label: displayLabel, n: instances.indexOf(instanceId) + 1 });
  });
}

/**
 * Label for the action-bar "play" button. Tamers share the `battleArea` zone
 * server-side with Digimon (apps/api/src/engine/actions/playCard.ts), but a
 * player picking a Tamer or Option from hand should not see "Play Digimon" —
 * that's misleading about what's about to happen. A selected Digi-Egg uses the
 * hatch verb even on surfaces that reuse this shared action label.
 */
export function playButtonLabel(kinds: readonly CardKind[], t: Translate): string {
  if (kinds.includes(CardKind.DigiEgg)) return t("game.hatchEgg");
  if (kinds.includes(CardKind.Option)) return t("game.playOption");
  if (kinds.includes(CardKind.Tamer)) return t("game.playTamer");
  return t("game.playDigimon");
}
