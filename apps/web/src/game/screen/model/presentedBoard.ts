import type { Permanent, PlayerState } from "@aegis/shared";
import type { HeldDeletion, HeldStackStrip, HeldTrashArrival } from "../../match/types";

/**
 * Keep transient server-resolved abilities current while the presentation queue is still
 * rendering an older board revision. A decision can already be actionable against the live
 * state at that point (EX13-060's end-of-turn play grants Rush), so showing the snapshot's
 * stale keywords would contradict both the prompt and the attack the server accepts.
 *
 * Only projection fields are refreshed. Membership, stacks, suspension and zones remain on
 * the presented timeline so arrival and combat animations do not jump ahead.
 */
export function liveProjectionFields({ player, live }: { player: PlayerState; live: PlayerState }): PlayerState {
  let changed = false;
  const battleArea = player.battleArea.map((permanent) => {
    const current = live.battleArea.find((candidate) => candidate.permanentId === permanent.permanentId);
    if (current === undefined) return permanent;
    const currentDP =
      permanent.topCard.instanceId === current.topCard.instanceId ? current.currentDP : permanent.currentDP;
    if (
      permanent.keywords === current.keywords &&
      permanent.grantedKeywords === current.grantedKeywords &&
      permanent.summoningSick === current.summoningSick &&
      permanent.securityAttackModifier === current.securityAttackModifier &&
      permanent.currentDP === currentDP &&
      permanent.immuneToOpponentDigimonEffects === current.immuneToOpponentDigimonEffects
    )
      return permanent;
    changed = true;
    return {
      ...permanent,
      keywords: current.keywords,
      grantedKeywords: current.grantedKeywords,
      summoningSick: current.summoningSick,
      securityAttackModifier: current.securityAttackModifier,
      currentDP,
      immuneToOpponentDigimonEffects: current.immuneToOpponentDigimonEffects,
    } as Permanent;
  });
  return changed ? ({ ...player, battleArea } as PlayerState) : player;
}

/** A seat the board can always read: a state that left the trash list out still gets one. */
export function withTrashList(player: PlayerState): PlayerState {
  return player.trash ? player : ({ ...player, trash: [] } as unknown as PlayerState);
}

export function phaseField(input: { player: PlayerState; held: PlayerState | undefined }): PlayerState {
  const { player, held } = input;
  if (!held) return player;
  return {
    ...player,
    // Hold rotation, not membership: a start-turn effect may introduce a
    // permanent that the viewer must select before Main can open.
    //
    // Only the unsuspend direction is held. The hold exists so the unsuspend phase's own
    // rotation waits for the ribbon and the sweep that announce it (CR 6-2), and that phase
    // never suspends anything. A permanent the live board shows as suspended was suspended
    // by something else — an attack in the outgoing player's end-of-turn window (<Engage>,
    // <Vortex>), milliseconds before the turn flipped — and its snapshot predates that
    // suspension, so holding it left the attacker standing upright until the hold lifted a
    // ribbon later.
    battleArea: player.battleArea.map((permanent) => {
      const previous = held.battleArea.find((candidate) => candidate.permanentId === permanent.permanentId);
      if (previous === undefined || !previous.isSuspended || permanent.isSuspended) return permanent;
      return { ...permanent, isSuspended: true } as Permanent;
    }),
  } as PlayerState;
}

/**
 * Keep the board a security check's battle still needs. The loser is trashed before the
 * check closes, so between the reveal and the clash the live state has already dropped it
 * — the permanent off the field, the cards into the trash — while the scene that kills it
 * is still on screen. Membership and the trash are held at the snapshot the reveal took;
 * everything else (rotation, DP, counters) keeps following the live board, so nothing but
 * the departure itself is delayed.
 */
export function blowField(input: { player: PlayerState; held: PlayerState | undefined }): PlayerState {
  const { player, held } = input;
  if (!held) return player;
  const leaving = held.battleArea.filter(
    (previous) => !player.battleArea.some((permanent) => permanent.permanentId === previous.permanentId),
  );
  if (leaving.length === 0 && player.trash.length === held.trash.length) return player;
  // Put each held permanent back in the slot it had, so the survivors do not shuffle
  // around it while the clash plays.
  const battleArea = [...player.battleArea];
  for (const permanent of leaving) {
    battleArea.splice(Math.min(held.battleArea.indexOf(permanent), battleArea.length), 0, permanent);
  }
  return { ...player, battleArea, trash: held.trash } as PlayerState;
}

/**
 * Keep the battle area and trash as they stood when a security card with a [Security] effect
 * was revealed, until its clause has been read. The server applies the effect straight after
 * the reveal, so without this a suspended or deleted Digimon changed before the viewer had
 * even seen which card did it.
 */
export function securityEffectField(input: { player: PlayerState; held: PlayerState | undefined }): PlayerState {
  const { player, held } = input;
  if (!held) return player;
  return { ...player, battleArea: held.battleArea, trash: held.trash } as PlayerState;
}

/**
 * Keep each deleted permanent where it stood until its shatter has begun. Only membership
 * is held: a card the board has already dropped is put back in its slot, and the trash stays
 * as it was before the oldest of them reached it. Everything else keeps following the board.
 */
/** The trash without the cards whose move there the screen has not reached yet. */
export function trashArrivalField(input: { player: PlayerState; held: readonly HeldTrashArrival[] }): PlayerState {
  const { player, held } = input;
  if (held.length === 0) return player;
  const pending = new Set(held.flatMap((arrival) => arrival.instanceIds));
  const trash = player.trash.filter((card) => !pending.has(card.instanceId));
  return trash.length === player.trash.length ? player : ({ ...player, trash } as PlayerState);
}

export function deletionField(input: { player: PlayerState; held: readonly HeldDeletion[] }): PlayerState {
  const { player, held } = input;
  if (held.length === 0) return player;
  const departed = new Set(
    held.filter((deletion) => deletion.departed).map((deletion) => deletion.permanent.permanentId),
  );
  const battleArea = player.battleArea.filter((permanent) => !departed.has(permanent.permanentId));
  let restored = false;
  for (const deletion of held) {
    if (deletion.departed || battleArea.some((permanent) => permanent.permanentId === deletion.permanent.permanentId))
      continue;
    battleArea.splice(Math.min(deletion.index, battleArea.length), 0, deletion.permanent);
    restored = true;
  }
  if (!restored && battleArea.length === player.battleArea.length) return player;
  return {
    ...player,
    battleArea,
    trash: restored ? held.find((deletion) => !deletion.departed)!.trash : player.trash,
  } as PlayerState;
}

/** Restore only the host whose sources the current peel sequence is removing. */
export function stackStripField({
  player,
  held,
}: {
  player: PlayerState;
  held: readonly HeldStackStrip[];
}): PlayerState {
  if (held.length === 0) return player;
  const battleArea = [...player.battleArea];
  for (const strip of held) {
    const index = battleArea.findIndex((permanent) => permanent.permanentId === strip.permanent.permanentId);
    if (index >= 0) battleArea[index] = strip.permanent;
    else battleArea.splice(Math.min(strip.index, battleArea.length), 0, strip.permanent);
  }
  return { ...player, battleArea } as PlayerState;
}

/** A Digi-Burst result follows the cost's last peel, including a figure on the other seat. */
export function stackCostDpField({
  player,
  held,
}: {
  player: PlayerState;
  held: readonly HeldStackStrip[];
}): PlayerState {
  const figures = new Map<string, number>();
  for (const strip of held) {
    for (const [permanentId, dp] of strip.beforeCostDps ?? []) {
      // Multiple costs can be queued together. Keep the earliest unfinished cost's figure.
      if (!figures.has(permanentId)) figures.set(permanentId, dp);
    }
  }
  if (figures.size === 0) return player;
  const battleArea = player.battleArea.map((permanent) => {
    const currentDP = figures.get(permanent.permanentId);
    return currentDP === undefined || currentDP === permanent.currentDP
      ? permanent
      : ({ ...permanent, currentDP } as Permanent);
  });
  return { ...player, battleArea } as PlayerState;
}
