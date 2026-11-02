// ＜Link＞ and ＜Mind Link＞.

import type { EffectContext } from "../../EffectContext.js";
import {
  canLinkToTargetPermanent,
  digimonEligibleForMindLink,
  linkCategoryAllowsHost,
  linkEligible,
  type LinkHost,
} from "../../mindLink.js";
import { staticTraitsOf } from "../../../cards/cardData.js";
import { relocateByEffect } from "../costs.js";
import { unsupported } from "../errors.js";
import { permanentMatchesFilter } from "../matching/permanent.js";
import { candidateLooseInstances, pickLoose } from "../targeting/loose.js";
import { candidatePermanents } from "../targeting/permanents.js";
import { isTamer } from "@aegis/shared";
import type { Action, CardDefinition, Filter, Permanent } from "@aegis/shared";

function linkHostOf(ctx: EffectContext, permanent: Permanent): LinkHost | undefined {
  if (permanent.topCard === undefined) return undefined;
  const definition = ctx.game.definitionOf(permanent.topCard);
  return {
    definition,
    names: ctx.game.effectiveNames?.(permanent) ?? [definition.nameEn.toLowerCase()],
    traits: ctx.game.effectiveTraits?.(permanent.permanentId) ?? staticTraitsOf(definition),
  };
}

function linkTargetIncludesSelf(action: Extract<Action, { kind: "Link" }>): boolean {
  return [action.target.filter, ...(action.target.orFilters ?? []), ...(action.target.filter.orFilters ?? [])].some(
    (filter) => filter.isSelfRef === true,
  );
}

/** Whether a declared Link action currently has both legal material and a legal recipient. */
export function canAttemptLink(ctx: EffectContext, action: Extract<Action, { kind: "Link" }>): boolean {
  const looseMaterial = candidateLooseInstances(ctx, action.target, action.from ?? ["hand", "digivolutionCards"])
    .map((candidate) => ctx.game.definitionOf({ cardId: candidate.cardId } as never))
    .filter(linkEligible);
  const selfDefinition = ctx.game.definitionOf({ cardId: ctx.source.cardId } as never);
  const selfMaterial = linkTargetIncludesSelf(action) && linkEligible(selfDefinition) ? [selfDefinition] : [];
  const materials = [...looseMaterial, ...selfMaterial];
  if (materials.length === 0) return false;
  const admitsSomeMaterial = (permanent: Permanent): boolean => {
    const host = linkHostOf(ctx, permanent);
    return host !== undefined && materials.some((material) => linkCategoryAllowsHost(host, material));
  };

  if (action.recipient === undefined) {
    const source = ctx.source.permanent();
    return source !== undefined && admitsSomeMaterial(source);
  }
  const recipientFilter: Filter = { controller: "mine", kind: ["Digimon"], ...action.recipient.filter };
  const matches = (permanent: Permanent, filter: Filter): boolean =>
    permanentMatchesFilter(ctx, permanent, filter, ctx.source);
  const canReceive = (permanent: Permanent): boolean =>
    canLinkToTargetPermanent(
      permanent,
      recipientFilter,
      matches,
      ctx.game.definitionOf,
      action.allowBreedingRecipient === true,
    ) && admitsSomeMaterial(permanent);
  if (action.recipient.sourceRef === "triggerSubject") {
    const id = ctx.trigger.subjectPermanentId;
    const permanent = id === undefined ? undefined : ctx.game.permanentById(id);
    return permanent !== undefined && matches(permanent, recipientFilter) && canReceive(permanent);
  }
  return candidatePermanents(ctx, { ...action.recipient, filter: recipientFilter }).some(canReceive);
}

/** Whether a declared Mind Link currently has a legal source Tamer and recipient Digimon. */
export function canAttemptMindLink(ctx: EffectContext, action: Extract<Action, { kind: "MindLink" }>): boolean {
  const tamer = ctx.source.permanent();
  if (tamer === undefined || !isTamer(ctx.source.definition)) return false;
  const filter: Filter = {
    controller: "mine",
    kind: ["Digimon"],
    excludeToken: true,
    ...action.target.filter,
  };
  const matches = (permanent: Permanent, candidateFilter: Filter): boolean =>
    permanentMatchesFilter(ctx, permanent, candidateFilter, ctx.source);
  return candidatePermanents(ctx, { ...action.target, filter }).some((permanent) =>
    digimonEligibleForMindLink(permanent, filter, matches, ctx.game.definitionOf),
  );
}

/**
 * "Link N [X] from your hand or this Digimon's digivolution cards to this Digimon".
 * The cards to link are loose cards matching the target filter; they join the SOURCE
 * permanent's linked list.
 */
export async function runLink(ctx: EffectContext, action: Extract<Action, { kind: "Link" }>): Promise<void> {
  // A downstream "by linking ..., then ..." clause must distinguish a link made by this
  // resolving action from cards that were already linked to the source.
  ctx.lastEffectActed = false;
  // Server-authoritative <Link> eligibility (KB Q4881): only cards carrying the Link
  // mechanic may be linked. A client link intent against a no-<Link> target is rejected
  // here by excluding it from the selectable set — never trusted.
  const candidates = candidateLooseInstances(ctx, action.target, action.from ?? ["hand", "digivolutionCards"]);
  const targetsSelf = linkTargetIncludesSelf(action);
  // A resolving Option is deliberately in no zone (§9-1-4), and a Security effect can still
  // refer to "this card" before security processing moves it. Preserve that physical identity
  // for self-link effects instead of requiring the source to appear in a normal source zone.
  if (
    targetsSelf &&
    ctx.source.permanent() === undefined &&
    !candidates.some((candidate) => candidate.instanceId === ctx.source.instanceId)
  ) {
    candidates.push({
      instanceId: ctx.source.instanceId,
      cardId: ctx.source.cardId,
      ownerSeat: ctx.source.ownerSeat,
    });
  }
  if (
    targetsSelf &&
    ctx.source.permanent() !== undefined &&
    !candidates.some((candidate) => candidate.instanceId === ctx.source.instanceId)
  ) {
    candidates.push({
      instanceId: ctx.source.instanceId,
      cardId: ctx.source.cardId,
      ownerSeat: ctx.source.ownerSeat,
    });
  }
  const eligibleCandidates = candidates.filter((cand) =>
    linkEligible(ctx.game.definitionOf({ cardId: cand.cardId } as never)),
  );
  if (eligibleCandidates.length === 0) return;
  const candidateDefinition = (candidate: { cardId: string }): CardDefinition =>
    ctx.game.definitionOf({ cardId: candidate.cardId } as never);
  const candidatesHostedBy = (permanent: Permanent) => {
    const host = linkHostOf(ctx, permanent);
    if (host === undefined) return [];
    return eligibleCandidates.filter((candidate) => linkCategoryAllowsHost(host, candidateDefinition(candidate)));
  };
  // The recipient is a chosen friendly Digimon ("link ... to 1 of your Digimon") or, by
  // default, the source permanent ("to this Digimon").
  let recipientId = ctx.source.permanent()?.permanentId;
  let recipients: Permanent[];
  if (action.recipient !== undefined) {
    const recipientFilter: Filter = { controller: "mine", kind: ["Digimon"], ...action.recipient.filter };
    // Dynamic recipient eligibility: only a
    // non-token, non-breeding Digimon that satisfies the link card's structured target condition
    // may RECEIVE the link. Filter the candidate recipients through the predicate so an
    // ineligible recipient is never offered (server-authoritative — V4/V5).
    const matches = (p: Permanent, f: Filter): boolean => permanentMatchesFilter(ctx, p, f, ctx.source);
    const triggerRecipientId =
      action.recipient.sourceRef === "triggerSubject" ? ctx.trigger.subjectPermanentId : undefined;
    const triggerRecipient = triggerRecipientId === undefined ? undefined : ctx.game.permanentById(triggerRecipientId);
    const recipientPool =
      action.recipient.sourceRef === "triggerSubject"
        ? triggerRecipient === undefined
          ? []
          : [triggerRecipient]
        : candidatePermanents(ctx, { ...action.recipient, filter: recipientFilter });
    recipients = recipientPool.filter(
      (p) =>
        matches(p, recipientFilter) &&
        candidatesHostedBy(p).length > 0 &&
        canLinkToTargetPermanent(
          p,
          recipientFilter,
          matches,
          ctx.game.definitionOf,
          action.allowBreedingRecipient === true,
        ),
    );
    if (recipients.length === 0) return;
  } else {
    if (recipientId === undefined) {
      unsupported(ctx, action, "Link needs a recipient permanent (source not on the battle area)");
      return;
    }
    const source = ctx.game.permanentById(recipientId);
    if (source === undefined) {
      unsupported(ctx, action, "Link recipient permanent not on the battle area");
      return;
    }
    recipients = [source];
  }
  const hostingRecipients = recipients;
  const hostedCandidates = eligibleCandidates.filter((candidate) =>
    hostingRecipients.some((permanent) => candidatesHostedBy(permanent).includes(candidate)),
  );
  if (hostedCandidates.length === 0) return;
  // The link limit is NOT a declaration-time gate. §4-8-5: "1 card can have a maximum of 1
  // link card. When linking to a Digimon that has already reached the link limit, the same
  // number of the existing link cards are trashed at the same time as the newly linked cards" —
  // the link is ALLOWED and the pre-existing excess is trashed alongside it, not refused.
  // §17-1-3-2-5 (Rule Checks) confirms the cleanup happens as a state-based sweep AFTER the
  // fact ("Link cards for a Digimon that has exceeded the link limit — only the cards that
  // exceed link limit are trashed"), which is exactly what GameEngine's `trashExcessLinkCards`
  // rule-check pass already does on every fixpoint pass. So `runLink` must land the full
  // requested count here and let that sweep trim any excess, the same way the player-facing
  // `linkCard` verb (actions/link.ts) never gates on headroom either — both paths must agree.
  const chosen = await pickLoose(ctx, action.target, hostedCandidates);
  if (chosen.length === 0) return;
  if (action.differentNames === true) {
    const names = chosen.map((instanceId) => {
      const candidate = hostedCandidates.find((entry) => entry.instanceId === instanceId);
      return candidate === undefined ? undefined : ctx.game.definitionOf({ cardId: candidate.cardId } as never).nameEn;
    });
    if (names.some((name) => name === undefined) || new Set(names).size !== names.length) return;
  }
  if (action.recipient !== undefined) {
    const admitsChosen = hostingRecipients.filter((permanent) => {
      const hosted = candidatesHostedBy(permanent).map((candidate) => candidate.instanceId);
      return chosen.every((instanceId) => hosted.includes(instanceId));
    });
    if (admitsChosen.length === 0) return;
    const recipientTarget = action.recipient.count === "all" ? admitsChosen.length : (action.recipient.count ?? 1);
    if (admitsChosen.length <= recipientTarget && !action.recipient.upTo) {
      recipientId = admitsChosen[0]?.permanentId;
    } else {
      const chosenRecipient = await ctx.ask.chooseTargets(ctx, {
        candidates: admitsChosen.map((p) => p.permanentId),
        min: action.recipient.upTo ? 0 : 1,
        max: 1,
      });
      if (chosenRecipient.length === 0) return;
      recipientId = chosenRecipient[0];
    }
  }
  if (recipientId === undefined) return;
  // Real link-cost calculation (the seam Phase 8's BT25-004/045 link-cost REDUCTION builds on).
  // Each link card carries a printed link cost ("Cost N" in linkRequirement); `costDelta` is a
  // signed adjustment ("with the cost reduced by N" => negative). Pay the floored cost per card
  // via the shared memory plumbing — the engine now HAS a link cost to reduce.
  for (const instanceId of chosen) {
    const cand = hostedCandidates.find((c) => c.instanceId === instanceId);
    if (cand === undefined) continue;
    const def = ctx.game.definitionOf({ cardId: cand.cardId } as never);
    // The link cost combines the declaring action's own `costDelta` (BT25-045's baked self-link
    // reduction) with the RECIPIENT's continuous link-cost-reduction grant (BT25-004's cross-actor
    // rule implementation): when a [Social]/[Tool]/[Game] card would link to a granted
    // recipient, ANY actor's declaration is reduced. Per KB BT25-089 Q6423 the recipient grant does
    // not stack on one declaration (the store returns its largest single matching grant); both the
    // self delta and the recipient reduction are signed-summed and floored at 0 by linkCostOf.
    const cardTraits = [...(def.types ?? []), ...(def.forms ?? []), ...(def.attributes ?? [])];
    const grantResolver = ctx.game.linkCostReductionGrant;
    const grant = grantResolver?.(recipientId, cardTraits);
    // When the live engine exposes the declaration-time grant resolver, its `undefined`
    // result is authoritative: it can mean a matching once-per-turn grant was already
    // consumed. Falling back to the legacy amount-only reader in that case would silently
    // re-apply the reduction on later Link declarations. Lightweight contexts that only
    // implement the legacy reader still retain that compatibility path.
    let recipientReduction =
      grant !== undefined
        ? grant.amount
        : grantResolver === undefined
          ? (ctx.game.linkCostReduction?.(recipientId, cardTraits) ?? 0)
          : 0;
    if (grant?.oncePerTurnKey !== undefined && ctx.fx.linkCostReductionUsed?.(grant.oncePerTurnKey)) {
      recipientReduction = 0;
    } else if (recipientReduction > 0 && grant?.optional === true) {
      const accepted = await ctx.ask.optional(ctx, `Reduce this Link cost by ${recipientReduction}?`);
      if (!accepted) recipientReduction = 0;
    }
    if (recipientReduction > 0 && grant?.oncePerTurnKey !== undefined) {
      ctx.fx.markLinkCostReductionUsed?.(grant.oncePerTurnKey);
    }
    const cost = action.payCost === false ? 0 : linkCostOf(def, (action.costDelta ?? 0) - recipientReduction);
    if (cost > 0) ctx.fx.gainMemory(-cost);
  }
  await ctx.fx.link(recipientId, chosen);
  if (action.bindRecipientAs !== undefined) {
    ctx.boundPlayed ??= new Map();
    ctx.boundPlayed.set(action.bindRecipientAs, new Set([recipientId]));
  }
  ctx.lastEffectActed = true;
}

/**
 * Printed link cost of a link card plus a signed `costDelta`, floored at 0. The base cost is
 * encoded in `CardDefinition.linkRequirement` as "Cost N" (e.g. "[Link] [Appmon] trait: Cost 1");
 * parseable "Cost N" is treated as cost 0.
 */
export function linkCostOf(def: CardDefinition, costDelta: number): number {
  const match = /Cost\s+(\d+)/i.exec(def.linkRequirement ?? "");
  const base = match ? Number(match[1]) : 0;
  return Math.max(0, base + costDelta);
}

/**
 * ＜Mind Link＞ — relocate this Tamer permanent under a chosen Digimon as the bottom
 * digivolution card when that Digimon has no Tamer cards in its digivolution cards.
 */
export async function runMindLink(ctx: EffectContext, action: Extract<Action, { kind: "MindLink" }>): Promise<void> {
  const tamer = ctx.source.permanent();
  if (tamer === undefined) {
    unsupported(ctx, action, "MindLink needs the source to be a battle-area Tamer");
    return;
  }
  if (!isTamer(ctx.source.definition)) {
    unsupported(ctx, action, "MindLink source must be a Tamer");
    return;
  }
  const filter: Filter = {
    controller: "mine",
    kind: ["Digimon"],
    excludeToken: true,
    ...action.target.filter,
  };
  const matches = (p: Permanent, f: Filter) => permanentMatchesFilter(ctx, p, f, ctx.source);
  const candidates = candidatePermanents(ctx, { ...action.target, filter }).filter((p) =>
    digimonEligibleForMindLink(p, filter, matches, ctx.game.definitionOf),
  );
  if (candidates.length === 0) return;
  const want = action.target.count === "all" ? candidates.length : action.target.count;
  let chosenIds: string[];
  if (candidates.length <= want) {
    chosenIds = candidates.map((p) => p.permanentId);
  } else {
    chosenIds = await ctx.ask.chooseTargets(ctx, {
      candidates: candidates.map((p) => p.permanentId),
      min: action.optional ? 0 : 1,
      max: want,
    });
  }
  if (chosenIds.length === 0) return;
  for (const digimonId of chosenIds) {
    await relocateByEffect(ctx, digimonId, tamer.permanentId, { belowTop: false });
  }
}
