import {
  CardKind,
  Permanent,
  EffectDuration,
  requireCardDefinition,
  CardInstance,
  type CardColor,
  type Seat,
  type Keyword,
} from "@aegis/shared";
import { effectiveColors, effectiveNames } from "../continuous.js";
import type { Primitives } from "../EffectContext.js";
import { orderDnaMaterials } from "#api/engine/effects/verbs/orderDnaMaterials";
import { dnaDigivolveCostFor } from "../verbs/digivolveCost.js";
import { peekLooseInstance } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";
import { emitEffectTargetsSelected } from "./emitEffectTargetsSelected.js";

/**
 * The static-continuous grants: keywords, names, colors, kinds and custom
 * effects handed to a permanent or player for a duration.
 */

export function createGrantsVerbs(pc: PrimitivesContext) {
  const { access, continuous, continuousOpt, durationForTarget, effectSeatStack, effectSourceKindsStack, state } = pc;

  const grantDynamicNames = (permanentId: string, names: () => string[], duration: EffectDuration): void => {
    continuous.addNameTraitGrant(permanentId, "name", [], durationForTarget(permanentId, duration), {
      ...continuousOpt(),
      dynamicTokens: names,
    });
  };

  const setOriginalCardInfo: Primitives["setOriginalCardInfo"] = (permanentId, info, duration): void => {
    continuous.addOriginalCardInfoOverride(permanentId, info, durationForTarget(permanentId, duration), {
      ...continuousOpt(),
      ...(effectSeatStack.at(-1) === undefined ? {} : { sourceSeat: effectSeatStack.at(-1) }),
      ...(effectSourceKindsStack.at(-1) === undefined ? {} : { sourceKinds: effectSourceKindsStack.at(-1) }),
    });
  };

  const grantKeyword: Primitives["grantKeyword"] = (permanentId, keyword, duration, amount, opts): void => {
    // A duration-scoped keyword is a one-shot grant even if its async target selection
    // happens to overlap a continuous recompute. `continuousMode` is engine-global, so
    // blindly inheriting it here can misclassify the tail of a triggered effect and make
    // the next recompute erase the grant (Bifrost followed by another Option). Genuine
    // continuous auras pass opts.continuous explicitly; only permanent intrinsic/static
    // grants need the legacy mode inference.
    const provenance = {
      sourceCardId: opts?.sourceCardId,
      sourceInstanceId: opts?.sourceInstanceId,
      sourceEffectText: opts?.sourceEffectText,
      sourceSeat: opts?.sourceSeat,
      sourceKinds: opts?.sourceKinds,
    };
    const continuousOpts =
      opts?.continuous === true
        ? { continuous: true, active: opts.active, specifiers: opts.specifiers, ...provenance }
        : duration === EffectDuration.Permanent
          ? { ...continuousOpt(), active: opts?.active, specifiers: opts?.specifiers, ...provenance }
          : opts?.active
            ? { active: opts.active, specifiers: opts.specifiers, ...provenance }
            : opts?.specifiers
              ? { specifiers: opts.specifiers, ...provenance }
              : opts?.sourceCardId !== undefined || opts?.sourceSeat !== undefined
                ? provenance
                : undefined;
    const isContinuousGrant =
      opts?.continuous === true || (duration === EffectDuration.Permanent && continuousOpt() !== undefined);
    if (!isContinuousGrant) {
      emitEffectTargetsSelected({ pc, permanentIds: [permanentId] });
    }
    continuous.addKeywordGrant(permanentId, keyword, durationForTarget(permanentId, duration), amount, continuousOpts);
  };

  const grantDnaLevel: Primitives["grantDnaLevel"] = (permanentId, level, opts): void => {
    continuous.addDnaLevelOverride(permanentId, level, {
      intoNames: opts?.intoNames,
      continuous: opts?.continuous === true || continuousOpt()?.continuous === true,
    });
  };

  const canDnaDigivolve: NonNullable<Primitives["canDnaDigivolve"]> = (
    materialPermanentIds,
    resultInstanceId,
    extraMaterialInstanceIds = [],
  ): boolean => {
    const result = peekLooseInstance(state, resultInstanceId);
    if (result === undefined) return false;
    const into = requireCardDefinition(result.cardId);
    const materials = materialPermanentIds
      .map((id) => access.permanentById(id))
      .filter((permanent): permanent is Permanent => permanent?.topCard !== undefined);
    const extraMaterials = extraMaterialInstanceIds
      .map((id) => peekLooseInstance(state, id))
      .filter((card): card is CardInstance => card !== undefined);
    if (
      materials.length !== materialPermanentIds.length ||
      extraMaterials.length !== extraMaterialInstanceIds.length ||
      materials.length + extraMaterials.length < 2
    )
      return false;
    // Q5256: effect-driven DNA digivolution must honor the same digivolution lock as the player path.
    if (materials.some((material) => continuous.hasRestriction(material.permanentId, "digivolve"))) return false;
    if (
      into.level === 7 &&
      materials.some((material) => continuous.hasRestriction(material.permanentId, "digivolveToLevel7"))
    ) {
      return false;
    }
    const definitions = [
      ...materials.map((material) => {
        const printed = requireCardDefinition(material.topCard!.cardId);
        const effectiveLevel = continuous.dnaLevelFor(material.permanentId, into);
        const names = effectiveNames(continuous, material, printed.nameEn ?? printed.cardId);
        return {
          ...printed,
          colors: effectiveColors(continuous, material.permanentId, printed.colors) as typeof printed.colors,
          ...(effectiveLevel === undefined ? {} : { level: effectiveLevel }),
          nameEn: names.join(" | "),
        };
      }),
      ...extraMaterials.map((card) => requireCardDefinition(card.cardId)),
    ];
    return dnaDigivolveCostFor(into, definitions) !== undefined;
  };

  const grantedKeywords = (permanentId: string): { keyword: string; amount?: number }[] =>
    continuous.grantedKeywords(permanentId);

  const grantPlayerKeyword: Primitives["grantPlayerKeyword"] = (seat, keyword, duration, amount, opts): void => {
    continuous.addPlayerKeywordGrant(seat, keyword, duration, amount, opts);
  };

  const revokeKeyword = (permanentId: string, keyword: string): void => {
    continuous.removeKeywordGrant(permanentId, keyword);
  };

  const grantLinkMax: Primitives["grantLinkMax"] = (permanentId, delta, duration, opts): void => {
    continuous.addLinkMaxGrant(
      permanentId,
      delta,
      durationForTarget(permanentId, duration),
      opts?.continuous === true ? { continuous: true } : continuousOpt(),
    );
  };

  const grantLinkCostReduction = (
    permanentId: string,
    amount: number,
    traits: string[],
    duration: EffectDuration,
    opts?: {
      sourceCardId?: string;
      sourceInstanceId?: string;
      controllerSeat?: Seat;
      optional?: boolean;
      oncePerTurnKey?: string;
    },
  ): void => {
    continuous.addLinkCostReductionGrant(permanentId, amount, traits, durationForTarget(permanentId, duration), {
      ...continuousOpt(),
      ...opts,
    });
  };

  const cannotIgnoreDigivolution = (seat: Seat, duration: EffectDuration): void => {
    continuous.addCannotIgnoreDigivolution(seat, duration, continuousOpt());
  };

  const isDigivolutionRequirementIgnoreBlocked = (seat: Seat): boolean => continuous.cannotIgnoreDigivolution(seat);

  const addColorGrant = (permanentId: string, color: CardColor, duration: EffectDuration): void => {
    continuous.addColorGrant(permanentId, color, durationForTarget(permanentId, duration), continuousOpt());
  };

  const grantKind: NonNullable<Primitives["grantKind"]> = (
    permanentId: string,
    kinds: CardKind[],
    duration: EffectDuration,
  ): void => {
    continuous.addKindGrant(permanentId, kinds, durationForTarget(permanentId, duration), continuousOpt());
  };

  const waiveColorRequirement = (
    instanceId: string,
    duration: EffectDuration,
    opts?: { alsoColor?: CardColor },
  ): void => {
    continuous.addColorWaiver(instanceId, duration, { ...continuousOpt(), alsoColor: opts?.alsoColor });
  };

  const conferStackEffects = (
    targetPermanentId: string,
    stackInstanceId: string,
    _duration: EffectDuration,
    opts?: {
      trigger?: string;
      excludeInherited?: boolean;
      excludeKeywords?: Keyword[];
      inheritedOnly?: boolean;
      granterInstanceId?: string;
    },
  ): void => {
    continuous.conferStackEffects(targetPermanentId, stackInstanceId, {
      ...continuousOpt(),
      trigger: opts?.trigger,
      excludeInherited: opts?.excludeInherited,
      excludeKeywords: opts?.excludeKeywords,
      inheritedOnly: opts?.inheritedOnly,
      granterInstanceId: opts?.granterInstanceId,
    });
  };
  const stackEffectConferrals: NonNullable<Primitives["stackEffectConferrals"]> = () =>
    continuous.listStackEffectConferrals();

  // Recorded as a CONTINUOUS fact regardless of which clause installs it: BT16-015 prints the
  // projection under `[Your Turn]` and the compiler emits a `[When Digivolving]` twin of the
  // same sentence, and Q2615 requires both to lapse the moment the condition stops holding.
  const projectOnDeletionAtEndOfAttack = (permanentId: string, duration: EffectDuration): void => {
    continuous.projectOnDeletionAtEndOfAttack(permanentId, durationForTarget(permanentId, duration));
  };

  // A named custom effect grant keeps the provenance of the effect that installs it. A resolved
  // duration grant survives continuous recompute and field leave for deletion timing, while a
  // GrantAura continuous pass marks its derived grant for replacement on the next pass. Duration
  // and activation-liveness gates determine when each grant stops applying.
  const grantCustomEffect: NonNullable<Primitives["grantCustomEffect"]> = (
    instanceId,
    ownerSeat,
    token,
    duration,
    opts,
  ): void => {
    continuous.addCustomEffectGrant(instanceId, ownerSeat, token, duration, { ...continuousOpt(), ...opts });
  };

  const grantPlayerCustomEffect: NonNullable<Primitives["grantPlayerCustomEffect"]> = (
    seat,
    ownerSeat,
    token,
    duration,
    matches,
  ): void => {
    continuous.addPlayerCustomEffectGrant(seat, ownerSeat, token, duration, matches);
  };

  // Generic custom-grant store: the interpreter's catch-all for GrantStatic actions whose
  // `grant` shape has no dedicated primitive (object-shaped grants like BT11-062's
  // `cannotLeavePlay` or BT16-055's `Protection`, and unrecognized string grants like
  // `quotedEffect`/`attackImmunity`), plus BT7-055's hand-authored unsuspend-cost. Recorded
  // per permanentId so a call is honest, inspectable authored state instead of the prior
  // silent no-op (the method was declared on Primitives but never assigned here, so every
  // `ctx.fx.grantCustom?.()` call was swallowed by the optional-call idiom). NO CONSUMER
  // reads this store back yet: the grant kinds it captures remain behaviorally inert until a
  // subsystem is built per grant kind, matching how `continuous.ts`'s own restriction store
  // documents unread entries as "documented TODOs where not yet wired" rather than crashes.
  const customGrants = pc.customGrants;
  const grantCustom: NonNullable<Primitives["grantCustom"]> = (permanentId, grant, duration) => {
    const existing = customGrants.get(permanentId);
    if (existing) existing.push({ grant, duration });
    else customGrants.set(permanentId, [{ grant, duration }]);
  };

  return {
    grantDynamicNames,
    setOriginalCardInfo,
    grantKeyword,
    grantDnaLevel,
    canDnaDigivolve,
    orderDnaMaterials: (materialPermanentIds: string[], resultInstanceId: string) =>
      orderDnaMaterials({ pc, materialPermanentIds, resultInstanceId }),
    grantedKeywords,
    grantPlayerKeyword,
    revokeKeyword,
    grantLinkMax,
    grantLinkCostReduction,
    cannotIgnoreDigivolution,
    isDigivolutionRequirementIgnoreBlocked,
    addColorGrant,
    grantKind,
    waiveColorRequirement,
    conferStackEffects,
    stackEffectConferrals,
    projectOnDeletionAtEndOfAttack,
    grantCustomEffect,
    grantPlayerCustomEffect,
    grantCustom,
  };
}
