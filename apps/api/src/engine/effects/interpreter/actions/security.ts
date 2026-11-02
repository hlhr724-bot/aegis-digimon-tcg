// Security-stack manipulation.

import { requireOpponentAsk } from "../../../decisions/decisionApi.js";
import type { EffectContext } from "../../EffectContext.js";
import { evaluateCondition } from "../conditions.js";
import { describeAction } from "../describe.js";
import { type ActionScope, runAction } from "../dispatch.js";
import { toDuration } from "../duration.js";
import { unsupported } from "../errors.js";
import { DefinitionFacts, definitionMatches } from "../matching/definition.js";
import { scaleFactor } from "../scaling.js";
import { candidateLooseInstances, type LooseCandidate, looseCardsInZone, pickLoose } from "../targeting/loose.js";
import { revealPrivateRequirementPicks } from "../targeting/privateReveal.js";
import { permanentMatchesFilter } from "../matching/permanent.js";
import { candidatePermanents, resolvePermanentTargets, topInstanceIds } from "../targeting/permanents.js";
import { extractCardAt, insertCard } from "../../../state/access.js";
import { EffectDuration, Zone, type Action, type Filter, type Seat, type Target, type ZoneRef } from "@aegis/shared";

/**
 * A face-up placement is already public, so it needs no separate reveal. `revealChosen`
 * forces one (LM-023 Q4025).
 */
function revealSecurityPlacement(
  ctx: EffectContext,
  action: Extract<Action, { kind: "SecurityManipulation" }>,
  target: Target,
  candidates: readonly LooseCandidate[],
  chosen: readonly string[],
): void {
  if (action.revealChosen !== true && action.faceUp === true) return;
  revealPrivateRequirementPicks(ctx, target, candidates, chosen, action.revealChosen === true);
}

/** ST23-05: optional trash of a most-security player's top, then ＜Recovery +N＞. */
export async function runRecoverByTrashingMostSecurity(
  ctx: EffectContext,
  action: Extract<Action, { kind: "RecoverByTrashingMostSecurity" }>,
): Promise<void> {
  const mine = ctx.source.ownerSeat;
  const { trashed } = await ctx.fx.trashTopSecurityOfPlayerWithMostSecurity(mine);
  ctx.lastEffectActed = trashed.length > 0;
  if (trashed.length === 0) return;
  if (action.recover !== false) await ctx.fx.recoverToSecurity(mine, action.amount ?? 1);
}

export async function runRecover(ctx: EffectContext, action: Extract<Action, { kind: "Recover" }>): Promise<void> {
  const baseAmount = action.amount ?? 1;
  const amount =
    action.scaling === undefined
      ? baseAmount
      : action.scaling.bonus !== undefined
        ? baseAmount + action.scaling.bonus * scaleFactor(ctx, action.scaling)
        : baseAmount * scaleFactor(ctx, action.scaling);
  const seat = ctx.source.ownerSeat;
  if (action.untilSecurityCount === undefined) {
    await ctx.fx.recoverToSecurity(seat, Math.max(0, amount));
    return;
  }
  while (ctx.game.player(seat).security.length < action.untilSecurityCount) {
    const moved = await ctx.fx.recoverToSecurity(seat, Math.max(0, amount));
    if (moved.length === 0) break;
  }
}

/** Security-stack manipulation: shuffle / trash top N / place cards as security. */
export async function runSecurityManipulation(
  ctx: EffectContext,
  action: Extract<Action, { kind: "SecurityManipulation" }>,
): Promise<void> {
  if (action.amountFromNamedCount !== undefined) {
    const count = ctx.namedCounts?.get(action.amountFromNamedCount.countSource) ?? 0;
    action = {
      ...action,
      amount: Math.max(
        action.amountFromNamedCount.floor ?? 0,
        action.amountFromNamedCount.base + count * action.amountFromNamedCount.per,
      ),
    };
  }
  const mine = ctx.source.ownerSeat;
  const opp = ctx.game.opponentOf(mine);
  const seat = action.controller === "opponent" ? opp : mine;
  if (action.op === "placeAsSecurity" && action.source === "lastOptionUsed") {
    const id = ctx.lastOptionUsedInstanceId;
    if (id !== undefined && ctx.game.player(seat).trash.some((card) => card.instanceId === id)) {
      await ctx.fx.addSecurity(seat, [id], { toTop: action.toTop ?? true, faceUp: action.faceUp });
    }
    return;
  }
  // "both players' security": apply the op to each seat's stack (e.g. BT3-090 trashes
  // 1 from the top of each player's security).
  if (action.bothPlayers && (action.op === "trashTop" || action.op === "trash" || action.op === "shuffle")) {
    for (const s of [mine, opp]) {
      if (action.op === "trashTop" || action.op === "trash") {
        const amount =
          action.leaveCount !== undefined
            ? Math.max(0, ctx.game.player(s).security.length - action.leaveCount)
            : (action.amount ?? 1);
        if (amount > 0) await ctx.fx.trashFromSecurity(s, amount, { fromTop: true });
      } else ctx.fx.shuffleSecurity(s);
    }
    return;
  }
  if (action.optionalFor !== undefined) {
    const optionalSeat = action.optionalFor === "opponent" ? opp : mine;
    const decisionCtx =
      optionalSeat === ctx.source.ownerSeat
        ? ctx
        : { ...ctx, source: { ...ctx.source, ownerSeat: optionalSeat }, presetOptionalAnswer: undefined };
    const accepted = await ctx.ask.optional(decisionCtx, describeAction(action));
    ctx.lastOpponentDeclined = !accepted;
    if (!accepted) {
      ctx.lastEffectActed = false;
      if (action.bindResultAs) {
        if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
        ctx.boundPlayed!.set(action.bindResultAs, new Set());
      }
      return;
    }
  }
  switch (action.op) {
    case "revealAllChooseToDeckTopShuffleRest": {
      const security = ctx.game.player(seat).security;
      if (security.length === 0) return;
      const selected = await ctx.ask.selectCards(ctx, {
        candidates: security.map((card) => card.instanceId),
        min: 1,
        max: 1,
        visible: security.map((card) => card.instanceId),
        visibleCards: security.map((card) => ({
          instanceId: card.instanceId,
          cardId: card.cardId,
          ...(card.artId ? { artId: card.artId } : {}),
        })),
      });
      if (selected.length === 0) return;
      const selectedIndex = security.findIndex((card) => card.instanceId === selected[0]);
      if (selectedIndex < 0) return;
      const toDeck = extractCardAt(ctx.game.player(seat), Zone.Security, selectedIndex);
      if (toDeck === undefined) return;
      toDeck.faceUp = false;
      insertCard(ctx.game.player(seat), Zone.Deck, toDeck, "top");
      ctx.fx.shuffleSecurity(seat);
      ctx.lastEffectActed = true;
      return;
    }
    case "moveTopToBottom": {
      const security = ctx.game.player(seat).security;
      if (security.length === 0) {
        ctx.lastEffectActed = false;
        return;
      }
      const top = extractCardAt(ctx.game.player(seat), Zone.Security, 0);
      if (top === undefined) {
        ctx.lastEffectActed = false;
        return;
      }
      insertCard(ctx.game.player(seat), Zone.Security, top, "bottom");
      ctx.lastEffectActed = true;
      return;
    }
    case "shuffle":
      ctx.fx.shuffleSecurity(seat);
      return;
    case "trash": // alias for trashTop — "trash top security" (BT18-101)
    case "trashTop": {
      const baseAmount = action.amount ?? 1;
      const scaledAmount =
        action.scaling === undefined
          ? baseAmount
          : action.scaling.bonus !== undefined
            ? baseAmount + action.scaling.bonus * scaleFactor(ctx, action.scaling)
            : baseAmount * scaleFactor(ctx, action.scaling);
      const maximum =
        action.leaveCount !== undefined
          ? Math.max(0, ctx.game.player(seat).security.length - action.leaveCount)
          : scaledAmount;
      const amount =
        action.upTo === true && maximum > 0
          ? await ctx.ask.chooseOption(
              ctx,
              Array.from(
                { length: maximum + 1 },
                (_, count) => `Trash ${count} security card${count === 1 ? "" : "s"}`,
              ),
            )
          : maximum;
      if (amount <= 0) {
        ctx.lastEffectActed = false;
        if (action.bindResultAs) {
          if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
          ctx.boundPlayed!.set(action.bindResultAs, new Set());
        }
        return;
      }
      let selectedSecurityIds: string[] | undefined;
      if (action.source === "reveal") {
        const security = ctx.game.player(seat).security;
        const candidates = security.map((card) => card.instanceId);
        const count = Math.min(amount, candidates.length);
        selectedSecurityIds =
          count > 0
            ? await ctx.ask.selectCards(ctx, {
                candidates,
                min: count,
                max: count,
                visible: candidates,
              })
            : [];
      }
      const fromTop =
        action.chooseTopOrBottom === true
          ? (await ctx.ask.chooseOption(ctx, ["Security Top", "Security Bottom"])) === 0
          : true;
      const trashed = await ctx.fx.trashFromSecurity(seat, amount, {
        fromTop,
        ...(selectedSecurityIds !== undefined ? { instanceIds: selectedSecurityIds } : {}),
      });
      ctx.lastEffectActed = trashed.length > 0;
      if (action.optionalFor !== undefined && trashed.length === 0) ctx.lastOpponentDeclined = true;
      if (action.trackCount !== undefined) {
        ctx.namedCounts ??= new Map();
        ctx.namedCounts.set(action.trackCount, trashed.length);
      }
      if (action.bindResultAs) {
        if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
        ctx.boundPlayed!.set(action.bindResultAs, new Set(trashed.map((c) => c.instanceId)));
      }
      return;
    }
    case "toHand": {
      const amount = action.amount ?? 1;
      let moved;
      if (action.chooseFromSecurity) {
        const visibleSecurity = looseCardsInZone(ctx, seat, "security");
        const candidates = visibleSecurity
          .filter(
            (card) =>
              action.selectionFilter === undefined ||
              definitionMatches(
                action.selectionFilter,
                ctx.game.definitionOf({ cardId: card.cardId } as never) as DefinitionFacts,
              ),
          )
          .map((card) => card.instanceId);
        const chosen =
          candidates.length === 0
            ? []
            : visibleSecurity.length <= amount && candidates.length <= amount
              ? candidates.slice(0, amount)
              : await ctx.ask.selectCards(ctx, {
                  candidates,
                  min: Math.min(amount, candidates.length),
                  max: Math.min(amount, candidates.length),
                  // A security search reveals the whole private zone to its owner even when
                  // only a subset is eligible. Keep the full visible set distinct from the
                  // candidates so the UI can render non-matching cards disabled (BT7-088).
                  visible: visibleSecurity.map((card) => card.instanceId),
                  visibleCards: visibleSecurity.map((card) => ({
                    instanceId: card.instanceId,
                    cardId: card.cardId,
                    ...(card.artId ? { artId: card.artId } : {}),
                  })),
                });
        for (const instanceId of chosen) {
          const card = visibleSecurity.find(({ instanceId: candidateId }) => candidateId === instanceId);
          if (card !== undefined) ctx.fx.revealCard(seat, card.cardId, ctx.source.cardId);
        }
        moved = await ctx.fx.securityToHand(seat, amount, { instanceIds: chosen });
      } else if (action.faceDownOnly) {
        const security = ctx.game.player(seat).security;
        const ordered = action.toTop === false ? [...security].reverse() : security;
        const chosen = ordered.filter((card) => card.faceUp !== true).slice(0, amount);
        moved = await ctx.fx.securityToHand(seat, amount, {
          instanceIds: chosen.map((card) => card.instanceId),
        });
      } else {
        moved = await ctx.fx.securityToHand(seat, amount, { fromTop: action.toTop ?? true });
      }
      ctx.lastEffectActed = moved.length > 0;
      if (action.bindResultAs) {
        if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
        ctx.boundPlayed!.set(action.bindResultAs, new Set(moved.map((c) => c.instanceId)));
      }
      return;
    }
    case "lookAndMayAddToHand": {
      // The card remains face-down in the same top position when declined (BT9-034 Q1833),
      // so there is no temporary zone move to undo. The owning player can inspect their private
      // security stack before answering; no information is exposed to the opponent.
      if (ctx.game.player(seat).security[0] === undefined) return;
      const addToHand = await ctx.ask.optional(ctx, "Add the top security card to your hand?");
      const branch = addToHand ? action.ifAddedToHand : action.ifNotAddedToHand;
      if (addToHand) {
        await ctx.fx.securityToHand(seat, 1, { fromTop: true });
      } else {
        // Q1833 explicitly returns the card face-down, including when another effect
        // had already left the top security card face-up.
        ctx.game.player(seat).security[0]!.faceUp = false;
      }
      for (const followUp of branch ?? []) {
        const abort = await runAction(ctx, followUp);
        if (abort) break;
      }
      return;
    }
    case "flipFaceUp":
      // Flip the first FACE-DOWN security card of the targeted stack face up (EX11-064).
      ctx.lastEffectActed = ctx.fx.flipSecurityFaceUp(seat, { fromTop: true });
      return;
    case "placeAsSecurity": {
      const placementToTop = async (placedPermanentIds: readonly string[] = []): Promise<boolean> =>
        action.position === "choice"
          ? (await ctx.ask.chooseOption(
              placedPermanentIds.length === 0 ? ctx : { ...ctx, affectedPermanentIds: placedPermanentIds },
              ["Top of security", "Bottom of security"],
            )) === 0
          : (action.toTop ?? action.position !== "bottom");
      // Place cards onto the security stack. Two source shapes:
      //  - LOOSE source ("place 1 card from your hand/trash/deck as security"): resolve
      //    the candidate loose instances by filter across the stated zones, prompt the
      //    controller, and add the chosen instances directly.
      //  - FIELD source ("place 1 of your Digimon ... on top of security"): resolve the
      //    permanents and add their top-card instances.
      const fromLoose =
        action.from && (action.from.includes("hand") || action.from.includes("trash") || action.from.includes("deck"));
      if (fromLoose) {
        if (action.source === "revealed") {
          // A preceding reveal cost binds the exact hand card(s) that were exposed. Resolve
          // those instance ids in their current loose zones; do not re-run a filter/pick, since
          // another card can satisfy the same filter (EX4-023).
          const candidates = (ctx.lastRevealedCards ?? []).flatMap((revealed) =>
            action.from!.flatMap((zone) =>
              looseCardsInZone(ctx, revealed.ownerSeat, zone).filter(
                (candidate) => candidate.instanceId === revealed.instanceId,
              ),
            ),
          );
          const chosen = [...new Set(candidates.map((candidate) => candidate.instanceId))];
          if (chosen.length > 0) {
            await ctx.fx.addSecurity(seat, chosen, { toTop: await placementToTop(), faceUp: action.faceUp });
            // A reveal cost conceptually exposes the card for the effect's processing. If a
            // continuous prohibition prevents the follow-up security placement, that revealed
            // card is trashed by the rules instead of returning to hidden hand (EX4-023 Q3464).
            const notAdded = chosen.filter(
              (instanceId) => !ctx.game.player(seat).security.some((card) => card.instanceId === instanceId),
            );
            if (notAdded.length > 0) await ctx.fx.trash(notAdded, { byEffectSeat: ctx.source.ownerSeat });
          }
          return;
        }
        if (action.source === undefined || typeof action.source === "string") {
          unsupported(ctx, action, "SecurityManipulation placeAsSecurity from a loose zone without a source target");
          return;
        }
        const zones = action.from!.filter((z): z is ZoneRef => z === "hand" || z === "trash" || z === "deck");
        const sourceScale = action.scaling === undefined ? 1 : scaleFactor(ctx, action.scaling);
        const baseCount = action.source.count === "all" ? "all" : action.source.count;
        const scaledSource = baseCount === "all" ? action.source : { ...action.source, count: baseCount * sourceScale };
        let candidates = candidateLooseInstances(ctx, scaledSource, zones);
        // Deletion observers are matched while the subject is still live so their printed
        // controller/kind/color filters remain available. A follow-up that places that same
        // card "from trash" (BT13-015 Q2274) therefore resolves one step before the generic
        // deletion mover has put it there. Admit the currently-deleting permanent's top
        // card as a virtual trash candidate; addSecurity relocates that exact instance, and
        // the deletion pass then removes only what remains of the permanent. Keep any ordinary
        // trash candidates too so the owner may choose among all eligible cards.
        if (zones.includes("trash") && ctx.trigger.deletedPermanentId !== undefined) {
          const deleting = ctx.game.permanentById(ctx.trigger.deletedPermanentId);
          if (
            deleting?.topCard !== undefined &&
            permanentMatchesFilter(ctx, deleting, scaledSource.filter, ctx.source)
          ) {
            const byInstanceId = new Map(candidates.map((candidate) => [candidate.instanceId, candidate]));
            byInstanceId.set(deleting.topCard.instanceId, deleting.topCard);
            candidates = [...byInstanceId.values()];
          }
        }
        const chosen = await pickLoose(ctx, scaledSource, candidates);
        revealSecurityPlacement(ctx, action, scaledSource, candidates, chosen);
        if (chosen.length > 0)
          await ctx.fx.addSecurity(seat, chosen, { toTop: await placementToTop(), faceUp: action.faceUp });
        return;
      }
      if (action.source === undefined) {
        // Self form: the resolving card becomes security (common on [Security] effects).
        const selfInstanceId = ctx.source.permanent()?.topCard?.instanceId ?? ctx.source.instanceId;
        await ctx.fx.addSecurity(seat, [selfInstanceId], {
          toTop: await placementToTop(),
          faceUp: action.faceUp,
        });
        return;
      }
      if (typeof action.source === "string") {
        unsupported(ctx, action, `SecurityManipulation placeAsSecurity source ${action.source} unsupported`);
        return;
      }
      let source = action.source;
      if (action.sourceDpCeilingScaling !== undefined && source.filter.dp?.value !== undefined) {
        source = {
          ...source,
          filter: {
            ...source.filter,
            dp: {
              ...source.filter.dp,
              value:
                source.filter.dp.value +
                scaleFactor(ctx, action.sourceDpCeilingScaling) * action.sourceDpCeilingScaling.amount,
            },
          },
        };
      }
      // "The top card of a Digimon" needs cards under it, so a Digimon with no digivolution
      // cards is never offered as a target (BT17-098 Q2892).
      if (action.detachPermanentTop === true) {
        source = { ...source, filter: { ...source.filter, hasDigivolutionCards: true } };
      }
      const resolvedPermanentIds = await resolvePermanentTargets(ctx, source);
      // Some cards place the top card of a Digimon's digivolution stack as security
      // rather than the Digimon's current top card (BT20-084). Keep this separate from
      // `detachPermanentTop`: the former removes one stack card, while the latter
      // promotes the permanent's identity after detaching its current top card.
      if (action.fromDigivolutionTop === true) {
        for (const permanentId of resolvedPermanentIds) {
          const permanent = ctx.game.permanentById(permanentId);
          const topDigivolutionCard = permanent?.stack[permanent.stack.length - 1];
          if (topDigivolutionCard === undefined) continue;
          const destinationSeat = action.ownerSecurity === true ? topDigivolutionCard.ownerSeat : seat;
          await ctx.fx.addSecurity(destinationSeat, [topDigivolutionCard.instanceId], {
            toTop: await placementToTop(),
            faceUp: action.faceUp,
          });
        }
        return;
      }
      const ids = topInstanceIds(ctx, resolvedPermanentIds);
      if (ids.length === 0) return;
      // "on top of ITS OWNER's security stack" (LM-020): the destination follows each placed
      // card, not the resolving player, so a chosen opposing Digimon lands in that player's
      // stack. Without the flag the destination stays the single `seat` above.
      if (action.ownerSecurity === true) {
        for (const permanentId of resolvedPermanentIds) {
          const permanent = ctx.game.permanentById(permanentId);
          const top = permanent?.topCard;
          if (permanent === undefined || top === undefined) continue;
          await ctx.fx.addSecurity(top.ownerSeat, [top.instanceId], {
            toTop: await placementToTop([permanentId]),
            faceUp: action.faceUp,
            detachPermanentTop: action.detachPermanentTop,
          });
        }
        return;
      }
      // When multiple permanents are placed on top of one security stack, the activating
      // player chooses their order (KB Q4095). addSecurity unshifts each id, so reverse the
      // chosen top-to-bottom order before applying a top placement.
      const orderedIds =
        ids.length > 1 && action.toTop === true && ctx.ask.orderCards !== undefined
          ? [...(await ctx.ask.orderCards(ctx, { candidates: ids }))].reverse()
          : ids;
      await ctx.fx.addSecurity(seat, orderedIds, {
        toTop: await placementToTop(resolvedPermanentIds),
        faceUp: action.faceUp,
        detachPermanentTop: action.detachPermanentTop,
      });
      return;
    }
    case "placeFromDeck": {
      // "Place the top card of your deck on top/bottom of your security" (EX4-029 and
      // related recovery clauses). addSecurity removes the loose card from the deck and
      // applies the security face-down default.
      const amount = Math.max(0, action.amount ?? 1);
      const deckCards = ctx.game.player(seat).deck.slice(0, amount);
      if (deckCards.length === 0) {
        ctx.lastEffectActed = false;
        return;
      }
      await ctx.fx.addSecurity(
        seat,
        deckCards.map((card) => card.instanceId),
        {
          toTop: action.toTop ?? true,
        },
      );
      ctx.lastEffectActed = true;
      return;
    }
    case "addTop":
    case "addBottom":
    case "addTopOrBottom": {
      // Checked AFTER the cost above is paid — a `postCostCondition` gates only the Recovery
      // itself, not the right to pay the cost (EX9-029 KB Q4783).
      if (action.postCostCondition && !evaluateCondition(ctx, action.postCostCondition)) return;
      await runSecurityAdd(ctx, action, seat);
      return;
    }
    case "revealTop":
    case "revealBottom": {
      // "Reveal the top/bottom card of <controller>'s security stack" (RB1-027 / P-078):
      // the card flips face up IN PLACE (revealed to both players; it stays in security).
      // The same effects later place it back face down — the `source:"revealed"` add in
      // runSecurityAdd flips it back.
      const security = ctx.game.player(seat).security;
      const revealed = action.op === "revealTop" ? security[0] : security[security.length - 1];
      if (revealed === undefined) return;
      ctx.fx.flipSecurityFaceUp(seat, { fromTop: action.op === "revealTop" });
      ctx.lastRevealedCards = [{ instanceId: revealed.instanceId, cardId: revealed.cardId, ownerSeat: seat }];
      return;
    }
    case "flipUp": {
      // "Flip <controller>'s top face-down security card face up" (EX11-041/-043),
      // `amount` times (one card per flip, scanning from the top).
      const n = action.amount ?? 1;
      for (let i = 0; i < n; i++) ctx.fx.flipSecurityFaceUp(seat, { fromTop: true });
      return;
    }
    default:
      unsupported(ctx, action, `SecurityManipulation op ${String(action.op)} unsupported`);
      return;
  }
}

/**
 * SecurityManipulation addTop / addBottom / addTopOrBottom: place card(s) onto the
 * targeted security stack. The compiled IR's `source` is loosely typed across compiler
 * generations, so every observed shape is resolved here:
 *   - undefined / "deck"        → deck top onto the security top (the ＜Recovery＞ shape,
 *                                  5-card cap — EX2-018 Q3304),
 *   - "this" / self-Target      → the resolving card itself (BT18-098 / P-181 / EX9-021),
 *   - "hand" / "handOrTrash"    → loose pick by the action-level `filter` (BT25-037 /
 *                                  BT19-036 / EX11-034),
 *   - Target with loose zones   → loose pick across the filter's stated zones (BT19-096),
 *   - field Target              → a battle-area permanent placed as security (EX11-016 /
 *                                  BT23-102), via its top-card instance like placeAsSecurity,
 *   - "revealed"                → the card revealed by a prior revealTop never left the
 *                                  top of the stack; re-placing it face down is a flip-back.
 * Context-bound sources this cannot resolve ("rest", "digimonTopCard") stay loud gaps.
 */
async function runSecurityAdd(
  ctx: EffectContext,
  action: Extract<Action, { kind: "SecurityManipulation" }>,
  seat: Seat,
): Promise<void> {
  const source = (action as { source?: Target | string }).source;
  const actionFilter = (action as { filter?: Filter }).filter;
  const placedPermanentIds =
    typeof source === "object" && source.fromSelectionRef !== undefined
      ? candidatePermanents(ctx, source).map((permanent) => permanent.permanentId)
      : [];
  const toTop =
    action.op === "addTop"
      ? true
      : action.op === "addBottom"
        ? false
        : (await ctx.ask.chooseOption(
            placedPermanentIds.length === 0 ? ctx : { ...ctx, affectedPermanentIds: placedPermanentIds },
            ["Top of security", "Bottom of security"],
          )) === 0;
  const opts = {
    toTop,
    faceUp: action.faceDown === true ? false : action.faceUp,
    detachPermanentTop: action.detachPermanentTop,
  };
  const baseCount = action.amount ?? 1;
  const count = action.scaling === undefined ? baseCount : baseCount * scaleFactor(ctx, action.scaling);
  const ownController = action.controller === "opponent" ? ("opponent" as const) : ("mine" as const);

  if (source === "revealed") {
    const revealedInstanceId = ctx.lastRevealedCards?.at(-1)?.instanceId;
    const restored = ctx.game.state.players[seat]?.security.find((card) => card.instanceId === revealedInstanceId);
    if (restored !== undefined) {
      const stack = ctx.game.state.players[seat]!.security;
      const currentIndex = stack.indexOf(restored);
      if (currentIndex >= 0) {
        stack.splice(currentIndex, 1);
        if (toTop) insertCard(ctx.game.state.players[seat]!, Zone.Security, restored, "top");
        else stack.push(restored);
      }
      restored.faceUp = true;
      if (ctx.fx.flipSecurityFaceDown !== undefined) ctx.fx.flipSecurityFaceDown(seat, restored.instanceId);
      else ctx.fx.flipTopSecurity(seat);
    }
    return;
  }
  if (source === "rest") {
    // Full-stack reveal effects (BT10-086) never remove the unchosen cards from security.
    // Returning "the rest" means hiding those same cards again before the following shuffle.
    for (const card of ctx.game.player(seat).security) card.faceUp = false;
    return;
  }
  // `fromDigivolutionTop: true` — take the top card of the SOURCE permanent's digivolution
  // stack (the card just under the top). BT20-055: "place the top card of this Digimon face-up
  // at the bottom of your security stack." Source is resolved via action.source filter (isSelfRef
  // → the watcher's own anchor permanent in the SubTrigger context).
  if ((action as { fromDigivolutionTop?: boolean }).fromDigivolutionTop === true) {
    const sourcePermanent =
      typeof source === "object" && source !== null
        ? ctx.game.permanentById((await resolvePermanentTargets(ctx, source as Target))[0] ?? "")
        : ctx.source.permanent();
    if (sourcePermanent === undefined) return;
    const topDigivolveCard = sourcePermanent.stack[sourcePermanent.stack.length - 1];
    if (topDigivolveCard === undefined) return; // empty digivolution stack; nothing to place
    await ctx.fx.addSecurity(seat, [topDigivolveCard.instanceId], opts);
    return;
  }
  if (
    source === "this" ||
    (typeof source === "object" && source !== null && (source.isSelf || source.filter?.isSelfRef))
  ) {
    await ctx.fx.addSecurity(seat, [ctx.source.instanceId], opts);
    return;
  }
  if (source === undefined || source === "deck") {
    if (action.maxSecurity !== undefined) {
      const room = action.maxSecurity - ctx.game.player(seat).security.length;
      if (room <= 0) return;
      await ctx.fx.recoverToSecurity(seat, Math.min(count, room));
      return;
    }
    if (!toTop) {
      unsupported(ctx, action, `SecurityManipulation ${action.op} from the deck to the bottom unsupported`);
      return;
    }
    await ctx.fx.recoverToSecurity(seat, count);
    return;
  }
  if (source === "hand" || source === "handOrTrash") {
    const zones: ZoneRef[] = source === "hand" ? ["hand"] : ["hand", "trash"];
    const target: Target = {
      filter: { controllerDefault: ownController, ...(actionFilter ?? {}) },
      count,
      upTo: action.optional === true,
    };
    const candidates = candidateLooseInstances(ctx, target, zones);
    // "Your opponent places 1 card from their hand as the bottom security card" (BT24-016,
    // BT21-024): the OWNER of the hand picks the card. The effect's controller cannot see
    // that hand, so a pick routed through ctx.ask would be a blind choice among card backs.
    const asker = ownController === "opponent" ? requireOpponentAsk(ctx) : ctx.ask;
    const chosen = await pickLoose(ctx, target, candidates, undefined, asker);
    revealSecurityPlacement(ctx, { ...action, faceUp: opts.faceUp }, target, candidates, chosen);
    if (chosen.length > 0) await ctx.fx.addSecurity(seat, chosen, opts);
    return;
  }
  if (typeof source === "object" && source !== null) {
    const filterZones = source.filter as { zone?: ZoneRef | ZoneRef[]; location?: ZoneRef[] };
    const zones = ([] as ZoneRef[])
      .concat(filterZones.zone ?? [])
      .concat(filterZones.location ?? [])
      .filter((z) => z === "hand" || z === "trash" || z === "deck" || z === "digivolutionCards");
    if (zones.length > 0) {
      const candidates = candidateLooseInstances(ctx, source, zones);
      const chosen = await pickLoose(ctx, source, candidates);
      revealSecurityPlacement(ctx, { ...action, faceUp: opts.faceUp }, source, candidates, chosen);
      if (chosen.length > 0) await ctx.fx.addSecurity(seat, chosen, opts);
      // A follow-up action may depend on the number of cards actually placed (BT18-102).
      // The source can be a digivolution stack, so derive the receipt from the destination
      // after the move rather than treating selection as proof that the primitive accepted it.
      const moved = chosen.filter((instanceId) =>
        ctx.game.player(seat).security.some((card) => card.instanceId === instanceId),
      );
      ctx.lastEffectActed = moved.length > 0;
      if (action.trackCount !== undefined) {
        ctx.namedCounts ??= new Map();
        ctx.namedCounts.set(action.trackCount, moved.length);
      }
      return;
    }
    const ids = topInstanceIds(ctx, await resolvePermanentTargets(ctx, source));
    if (ids.length > 0) {
      await ctx.fx.addSecurity(seat, ids, opts);
      // `ifThisEffectActed` is used by follow-up actions such as ST10-14's
      // "If you do, trash the top security card." A placement can be refused
      // by a replacement effect (for example Kongou), so derive acted state
      // from the moved instance's actual presence rather than assuming the
      // primitive accepted the move.
      ctx.lastEffectActed = ids.some((id) => ctx.game.player(seat).security.some((card) => card.instanceId === id));
    } else {
      ctx.lastEffectActed = false;
    }
    return;
  }
  unsupported(ctx, action, `SecurityManipulation ${action.op} source ${String(source)} unsupported`);
}

export async function runSecurityAction(ctx: EffectContext, action: Action, scope: ActionScope): Promise<boolean> {
  const { scale } = scope;
  switch (action.kind) {
    case "OpponentMayTrashSecurity": {
      const opponent = ctx.game.opponentOf(ctx.source.ownerSeat);
      const ask = requireOpponentAsk(ctx);
      const accepted = await ask.optional(ctx, "Trash the top card of your security stack?");
      ctx.lastOpponentDeclined = !accepted;
      if (accepted && ctx.game.player(opponent).security.length > 0) {
        await ctx.fx.trashFromSecurity(opponent, 1, { fromTop: true });
      }
      return false;
    }
    case "SecurityManipulation": {
      await runSecurityManipulation(ctx, action);
      return false;
    }
    case "RecoverByTrashingMostSecurity": {
      await runRecoverByTrashingMostSecurity(ctx, action);
      return false;
    }
    case "Recover": {
      await runRecover(ctx, action);
      return false;
    }
    case "trashSecurityTop": {
      // "Trash the top N card(s) of <controller>'s security stack" as a standalone action
      // (not a cost). Used inside SubTrigger.actions to trash the opponent's top security
      // as part of a triggered effect body (CAP-E15, BT21-052 Examon X Antibody).
      const mine = ctx.source.ownerSeat;
      const opp = ctx.game.opponentOf(mine);
      const seat = action.controller === "opponent" ? opp : mine;
      const count = action.count ?? 1;
      if (ctx.game.player(seat).security.length > 0) {
        await ctx.fx.trashFromSecurity(seat, count, { fromTop: true });
      }
      return false;
    }
    case "ModifySecurityDP": {
      const delta = scale === undefined ? action.amount : action.amount * scale;
      const seat = action.controller === "opponent" ? ctx.game.opponentOf(ctx.source.ownerSeat) : ctx.source.ownerSeat;
      // Security effects can create either a turn-scoped delta (for example,
      // ST1-14's [Security] effect) or a window lasting through the opponent's
      // next turn (its [Main] effect). Preserve the IR duration in the ledger;
      // omitting it incorrectly defaulted every triggered delta to one turn.
      // The security ledger frames relative durations from the affected seat;
      // printed "your"/"their" refers to the resolving effect's controller.
      let duration = toDuration(action.duration);
      if (seat !== ctx.source.ownerSeat) {
        if (duration === EffectDuration.UntilOwnerTurnEnd) duration = EffectDuration.UntilOpponentTurnEnd;
        else if (duration === EffectDuration.UntilOpponentTurnEnd) duration = EffectDuration.UntilOwnerTurnEnd;
      }
      ctx.fx.modifySecurityDp(seat, delta, { duration });
      return false;
    }
    case "SecurityAttackInvert": {
      // EX6-031 [Your Turn]: "Change ＜Security Attack -＞ to ＜Security Attack +＞ on all of your
      // Digimon" (KB Q3751/Q3752, per-instance sign flip). A persistent per-permanent inversion on
      // the resolved target(s); the security-check strike consumer (GameEngine.runSecurityCheck.
      // strikeFor) negates each existing SA grant's amount while active. Re-derived each continuous
      // pass (CR-01).
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      for (const id of ids) ctx.fx.securityAttackInvert?.(id, duration);
      return false;
    }
    case "DisableSecurityEffect": {
      if ((action as { scope?: string }).scope === "seat") {
        ctx.fx.disableSecurityEffectsForSeat(ctx.source.ownerSeat, action.sourceKind, toDuration(action.duration));
        return false;
      }
      // `card.PermanentOfThisCard()`. Resolve the target (normally the source itself) and
      // record the security-effect disable; the security-check loop consults it per flip.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      for (const id of ids) ctx.fx.disableSecurityEffect(id, action.sourceKind, duration);
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
