import type { LeaveReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/LeaveReplacementInstallParams";
import type { NestedLeavePrevention } from "#api/engine/effects/interpreter/replacements/NestedLeavePrevention";
import { createLeaveReplacementInstall } from "#api/engine/effects/interpreter/replacements/createLeaveReplacementInstall";
import { isCannotLeavePlayGrant } from "#api/engine/effects/interpreter/replacements/isCannotLeavePlayGrant";
import { trackLeaveReplacementCallbacks } from "#api/engine/effects/interpreter/replacements/trackLeaveReplacementCallbacks";
import type { CostReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/CostReplacementInstallParams";
import { createCostReplacementInstall } from "#api/engine/effects/interpreter/replacements/createCostReplacementInstall";
import { trackCostReplacementCallbacks } from "#api/engine/effects/interpreter/replacements/trackCostReplacementCallbacks";
// Replacing or preventing an event before it happens.

import type { EffectContext, ReplacementEventName } from "../../EffectContext.js";
import { evaluateCondition } from "../conditions.js";
import { unsupported } from "../errors.js";
import { printedClause } from "../describe.js";
import { scaleFactor } from "../scaling.js";
import { definitionMatches } from "../matching/definition.js";
import { isDigiXrosPickerReplacement } from "#api/engine/effects/interpreter/actions/isDigiXrosPickerReplacement";
import type { Action, Condition, Cost, Filter } from "@aegis/shared";

const REPLACEMENT_EVENT_MAP: Record<string, ReplacementEventName | undefined> = {
  wouldLeavePlay: "wouldLeavePlay",
  wouldBeDeleted: "wouldBeDeleted",
  wouldBePlayed: "wouldBePlayed",
  wouldTrashDigivolutionCard: "wouldTrashDigivolutionCard",
  wouldDigivolve: "wouldDigivolve",
  // Hand-authored EX5 wording names the destination explicitly; the engine's
  // replacement seam is the same pre-digivolution window.
  wouldBeDigivolvedInto: "wouldDigivolve",
};

/**
 * Cards whose `wouldBePlayed reduceCost` clause is paid and scaled by the engine's verified
 * cross-permanent play reducer (`GameEngine.crossPermanentPlayReducerWatchers`): BT10-093 places
 * purple Digimon from under the player's Tamers and reduces the cost per card placed. The IR keeps
 * the printed flat `amount` for audit tooling; installing it here as well would add a free,
 * unscaled reduction on top of the paid one.
 */
const CROSS_PERMANENT_PLAY_REDUCER_CARDS = new Set(["BT10-093"]);

/**
 * Install a replacement effect. `reduceCost` records a cost delta the play/digivolve
 * cost step subtracts; `instead`/`prevent` run a payload when the engine consults the
 * replacement before the replaced event. A "raw" event is a loud gap.
 */
export async function runReplacement(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Replacement" }>,
): Promise<void> {
  const expiresOnTurnEndOf =
    action.duration === "forTheTurn" || action.duration === "untilYourTurnEnd"
      ? ctx.source.ownerSeat
      : action.duration === "untilOpponentTurnEnd" || action.duration === "untilOpponentNextTurnEnd"
        ? ctx.game.opponentOf(ctx.source.ownerSeat)
        : undefined;
  const oncePerTurnKey = action.oncePerTurnKey;
  const replacementBudget =
    oncePerTurnKey === undefined
      ? {}
      : {
          oncePerTurnKey: `${ctx.source.instanceId}/${ctx.conferralGranterInstanceId ?? "printed"}/${oncePerTurnKey}`,
        };
  // The prose compiler also emits a CROSS-CARD reduceCost as a nested Replacement — an outer
  // `wouldBePlayed` reaction scoped by `sourceFilter` ("an [Eater] Digimon", not "this card")
  // wrapping the inner `{mode:"reduceCost", amount}` Replacement, rather than setting mode/amount
  // on the outer action itself (BT22-079's [Breeding] resident reducer). Hoisted above the event
  // dispatch because the `wouldTrashDigivolutionCard` branch reads it for its description.
  const nestedCostModifiers = (
    action.actions as
      | {
          kind?: string;
          event?: string;
          mode?: string;
          costType?: string;
          amount?: number | null;
          dynamicFrom?: string;
          condition?: Condition;
          cost?: Cost;
          additionalCost?: Cost;
          additionalCosts?: Cost[];
          sourceFilter?: Filter;
          optional?: boolean;
          scaling?: Extract<Action, { kind: "Replacement" }>["scaling"];
          raw?: string;
        }[]
      | undefined
  )?.filter(
    (a) =>
      (a.kind === "Replacement" &&
        a.event === action.event &&
        (a.mode === "reduceCost" || a.mode === "increaseCost")) ||
      (a.kind === "CostModifier" && a.costType === "play" && a.mode === "reduce"),
  );
  const nestedCostModifier = nestedCostModifiers?.[0];
  const nestedCostMode =
    nestedCostModifier?.kind === "CostModifier"
      ? nestedCostModifier.mode === "reduce"
        ? "reduceCost"
        : undefined
      : nestedCostModifier?.mode;
  const event = REPLACEMENT_EVENT_MAP[action.event];
  if (event === undefined) {
    unsupported(ctx, action, `Replacement event "${action.event}" is not a known game event`);
    return;
  }
  if (action.condition !== undefined && !evaluateCondition(ctx, action.condition)) return;
  if (event === "wouldBePlayed" && CROSS_PERMANENT_PLAY_REDUCER_CARDS.has(ctx.source.cardId)) return;
  // These legacy PlaceUnder declarations are executed by the DigiXros picker, which
  // pays the suspension and enforces the material host. Installing a second listener
  // at pay time leaves a no-op replacement that suppresses that picker on later plays.
  if (isDigiXrosPickerReplacement({ cardId: ctx.source.cardId, action })) {
    return;
  }
  // A self-scoped replacement explicitly restricted to the battle area is inactive while
  // its source is in breeding. Other sourceFilter shapes describe the event subject and must
  // remain deferred to the replacement's appliesTo predicate.
  if (
    action.sourceFilter?.isSelfRef === true &&
    action.sourceFilter.zone === "battleArea" &&
    !ctx.source.isOnBattleArea()
  )
    return;
  const self = ctx.source.permanent();
  const activationIdentity =
    ctx.activeEffectKey === undefined
      ? undefined
      : `${ctx.activeEffectKey}/action-${ctx.activeActionPath ?? "unknown"}`;
  if (event === "wouldDigivolve" && action.mode === "gainMemoryOnDna" && self !== undefined) {
    ctx.fx.subscribeReplacement({
      ...replacementBudget,
      event,
      sourcePermanentId: self.permanentId,
      activationIdentity,
      ...(ctx.activeTiming !== undefined ? { activationTiming: ctx.activeTiming } : {}),
      mode: "gainMemoryOnDna",
      amount: action.amount ?? 0,
      description: action.raw ?? ctx.activeEffectText ?? "Gain memory on DNA digivolution",
      intoMatches: (definition) => action.into === undefined || definitionMatches(action.into, definition),
    });
    return;
  }
  if (event === "wouldTrashDigivolutionCard" && self !== undefined) {
    ctx.fx.subscribeReplacement({
      ...replacementBudget,
      event,
      sourcePermanentId: self.permanentId,
      sourceInstanceId: ctx.source.instanceId,
      activationIdentity,
      ...(ctx.activeTiming !== undefined ? { activationTiming: ctx.activeTiming } : {}),
      ...(ctx.activeEffectText !== undefined ? { activationEffectText: ctx.activeEffectText } : {}),
      mode: "redirect",
      description:
        printedClause(action.raw) ??
        printedClause(ctx.activeEffectText) ??
        printedClause(nestedCostModifier?.raw) ??
        "",
      appliesTo: (subCtx, originalHostId) => {
        const original = subCtx.game.permanentById(originalHostId);
        return (
          original !== undefined &&
          original.controllerSeat === ctx.source.ownerSeat &&
          originalHostId !== self.permanentId &&
          subCtx.game.state.turnSeat !== ctx.source.ownerSeat
        );
      },
      redirectTo: async (subCtx) => {
        // The printed clause rides the decision's `effectText` provenance; the question itself
        // stays plain language so no internal event name can reach the player.
        const clause = printedClause(action.raw) ?? printedClause(ctx.activeEffectText);
        const askCtx = clause === undefined ? subCtx : { ...subCtx, activeEffectText: clause };
        return (await askCtx.ask.optional(askCtx, "Trash a digivolution card from this Digimon instead?"))
          ? self.permanentId
          : undefined;
      },
    });
    return;
  }
  // The prose compiler often emits the prevention as a NESTED `{kind:"Prevent"}` inner action
  // (carrying the prevention's cost) rather than setting `mode:"prevent"` on the Replacement
  // itself — BT18-082 "by trashing the bottom card of your security stack, it doesn't leave".
  // Normalize that shape here so the reaction installs as a real prevent (consulted by the
  // engine's leave-prevention seam) instead of a mode-less dead store the consult skips.
  //
  // A THIRD encoding of the same prevention (BT11-062, BT11-064): a nested `GrantStatic`
  // carrying `grant: { cannotLeavePlay: true }` plus its OWN cost/optional/abortOnDecline,
  // rather than a `{kind:"Prevent"}` sibling. Recognized here alongside it — without this, the
  // outer Replacement defaults to "instead" mode (no cost gate, no protection) and the inner
  // GrantStatic falls through to the engine's fail-loud "no enforcement path" catch-all.
  const nestedPrevent = (action.actions as NestedLeavePrevention[] | undefined)?.find(
    (a) => a.kind === "Prevent" || (a.kind === "GrantStatic" && isCannotLeavePlayGrant(a.grant)),
  );
  // When the prose compiler emits a Replacement with a cost but no explicit
  // mode (e.g. BT18-082 "by trashing the bottom card of your security stack,
  // it doesn't leave"), interpret it as "prevent" — a cost with empty actions
  // can only mean prevention.
  const mode =
    action.mode ??
    (nestedPrevent !== undefined
      ? "prevent"
      : nestedCostModifier !== undefined
        ? nestedCostMode
        : action.cost
          ? "prevent"
          : "instead");
  let amount: number | undefined =
    (typeof action.amount === "number" ? action.amount : undefined) ??
    nestedCostModifiers?.reduce(
      (total, modifier) =>
        total +
        (typeof modifier.amount === "number" ? modifier.amount : 0) *
          (modifier.scaling ? scaleFactor(ctx, modifier.scaling) : 1),
      0,
    );
  const costScaling = action.scaling ?? action.reduceCostScaling;
  const scalesIntoColors = event === "wouldDigivolve" && costScaling?.unit === "colors";
  if (
    (mode === "reduceCost" || mode === "increaseCost") &&
    costScaling !== undefined &&
    amount !== undefined &&
    !scalesIntoColors
  ) {
    amount *= scaleFactor(ctx, costScaling);
  }
  // Mutually-exclusive amount alternatives (EX6-006 "reduce by 3 ... reduce by 4 instead") are
  // selected when the replacement activates. Installing a snapshot here would make a declined
  // optional activation leave a stale amount behind for a later play.
  const amountChoices = mode === "reduceCost" && action.amountChoices?.length ? action.amountChoices : undefined;
  const preventCost = action.cost ?? nestedPrevent?.cost;
  // Decode resolves in a fresh would-leave context. Carry the keyword itself,
  // rather than the effect (such as Execute) that caused the removal (CR 16-36-1).
  const decodeAction = (action.actions ?? []).find(
    (nested): nested is Extract<Action, { kind: "PlayWithoutCost" }> =>
      nested.kind === "PlayWithoutCost" && nested.playedByDecode === true,
  );
  const isDecode = decodeAction !== undefined;
  const decodeKeywords = isDecode
    ? ((ctx.activeEffectText ?? ctx.source.definition.effectText)?.match(/[<＜]Decode\b[^>＞]*[>＞]/gi) ?? [])
    : [];
  // Cards with multiple Decode abilities can specify distinct color pools.
  const colors = decodeAction?.target?.filter?.colors;
  const matchingKeywords = colors?.length
    ? decodeKeywords.filter((keyword) => colors.every((color) => keyword.includes(color)))
    : decodeKeywords;
  const decodeKeyword = (matchingKeywords.length ? matchingKeywords : decodeKeywords).join(" / ");
  const decodeText = isDecode
    ? `${decodeKeyword || "＜Decode＞"} When this Digimon would leave the battle area other than by battle, you may play 1 Digimon card specified by this keyword from this Digimon's digivolution cards without paying the cost.`
    : undefined;
  const leaveParams = (leaveMode: LeaveReplacementInstallParams["mode"]): LeaveReplacementInstallParams => ({
    ctx,
    action,
    event,
    mode: leaveMode,
    replacementBudget,
    self,
    activationIdentity,
    decodeText,
    nestedPrevent,
    preventCost,
    nestedCostModifierRaw: nestedCostModifier?.raw,
  });
  const installLeaveReplacement = (leaveMode: LeaveReplacementInstallParams["mode"]): void => {
    const params = leaveParams(leaveMode);
    const install = createLeaveReplacementInstall(params);
    trackLeaveReplacementCallbacks({ params, install });
    ctx.fx.subscribeReplacement(install);
  };
  // A "prevent" leave/delete reaction: install a protects-predicate (which permanents it
  // guards) + a preventCheck (prompt + pay the cost; true => the removal is prevented). The
  // engine's leave-prevention consult runs these when a permanent would be deleted/leave.
  if (mode === "prevent") {
    installLeaveReplacement("prevent");
    return;
  }
  // The mode/amount hoist above lifts a nested reduceCost Replacement's own gate too — dropping
  // it would install the cost reduction UNCONDITIONALLY. This is the one reduceCost path the
  // engine actually consumes for digivolve costs (GameEngine's wouldDigivolve costReductionFor),
  // so a dropped condition here silently discounts every digivolve, condition or not
  // (P-117/BT13-049/BT13-050/EX2-026/BT14-044's "you have a [green] Tamer" gate).
  if (
    mode === "reduceCost" &&
    nestedCostModifier?.condition !== undefined &&
    !evaluateCondition(ctx, nestedCostModifier.condition)
  ) {
    return;
  }
  const intoFilter = action.into;
  const replacementSourceFilter = action.sourceFilter ?? nestedCostModifier?.sourceFilter;
  if (mode === "reduceCost" || mode === "increaseCost") {
    // Nested cost-reduction IR keeps the payment cost on the inner Replacement. Preserve it
    // when hoisting that inner reducer; otherwise the reducer is installed as a free reduction
    // and the printed payment (for example, suspending ST20-12) is silently lost.
    const interactiveCost = action.cost ?? nestedCostModifier?.cost;
    const interactiveAdditionalCosts = [
      ...((action.additionalCosts ?? nestedCostModifier?.additionalCosts ?? []) as Cost[]),
      ...((action.additionalCost ?? nestedCostModifier?.additionalCost) !== undefined
        ? [(action.additionalCost ?? nestedCostModifier?.additionalCost) as Cost]
        : []),
    ];
    const interactiveCosts = [
      ...(interactiveCost !== undefined ? [interactiveCost] : []),
      ...interactiveAdditionalCosts,
    ];
    const interactiveOptional =
      action.optional === true || nestedCostModifiers?.some((modifier) => modifier.optional) === true;
    const ownerSeat = ctx.source.ownerSeat;
    const residentTiming =
      ctx.residentCostRegistration === true || ctx.continuousPass === true ? ctx.activeTiming : undefined;
    const params: CostReplacementInstallParams = {
      ctx,
      action,
      event,
      replacementBudget,
      self,
      activationIdentity,
      expiresOnTurnEndOf,
      mode,
      amount,
      amountChoices,
      scalesIntoColors,
      nestedCostModifier,
      intoFilter,
      replacementSourceFilter,
      interactiveCost,
      interactiveAdditionalCosts,
      interactiveCosts,
      interactiveOptional,
      ownerSeat,
      residentTiming,
    };
    const install = createCostReplacementInstall(params);
    trackCostReplacementCallbacks({ params, install });
    ctx.fx.subscribeReplacement(install);
    return;
  }
  // mode === "instead": a substitute side effect the leave-prevention consult runs alongside
  // (not instead of, despite the name — see ReplacementInstallInstead's doc comment) the
  // event; it never itself blocks the removal.
  installLeaveReplacement("instead");
}

export async function runPrevent(ctx: EffectContext, action: Extract<Action, { kind: "Prevent" }>): Promise<void> {
  const event = action.mode === "delete" ? "wouldBeDeleted" : "wouldLeavePlay";
  await runReplacement(ctx, {
    ...action,
    kind: "Replacement",
    event,
    mode: "prevent",
    raw: action.raw ?? "legacy Prevent",
  });
}
