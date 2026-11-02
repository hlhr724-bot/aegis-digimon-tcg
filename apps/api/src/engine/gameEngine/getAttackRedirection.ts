import type { AttackRedirection } from "@aegis/shared/schema/AttackRedirection";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { GameEngine } from "#api/engine/GameEngine";
import { buildSubTriggerSourceContext } from "#api/engine/gameEngine/subTriggers";

type Params = {
  engine: GameEngine;
  attacker: Permanent;
  targetPermanentId?: string;
};

export function getAttackRedirection({ engine, attacker, targetPermanentId }: Params): AttackRedirection {
  const targets = new Set<string>();
  const budgets = new Set<string | number>();
  let repeatable = false;
  for (const sub of engine.subTriggers.subscriptionsFor("whenOpponentAttacks")) {
    if (sub.attackRedirectTargetIds === undefined) {
      continue;
    }
    if (sub.oncePerTurnKey !== undefined && engine.tracker.count(sub.oncePerTurnKey, "subtrigger") > 0) {
      continue;
    }
    const ctx = buildSubTriggerSourceContext(engine, sub, {
      attackerPermanentId: attacker.permanentId,
      targetPermanentId,
      defenderPermanentId: targetPermanentId,
      subjectPermanentId: attacker.permanentId,
      attackerDPAtDeclaration: attacker.currentDP,
      turnSeat: engine.state.turnSeat,
    });
    if (
      ctx === undefined ||
      ctx.source.ownerSeat === attacker.controllerSeat ||
      sub.matches?.(ctx) === false ||
      sub.canFire?.(ctx) === false ||
      sub.hasLegalOutcome?.(ctx) === false
    ) {
      continue;
    }
    const ids = sub.attackRedirectTargetIds(ctx);
    if (ids.length === 0) {
      continue;
    }
    if (sub.attackRedirectRequiresSelfSuspend) {
      budgets.add(`suspend/${ctx.source.permanent()?.permanentId}`);
    } else if (sub.oncePerTurnKey !== undefined || sub.once) {
      budgets.add(sub.oncePerTurnKey ?? sub.id);
    } else {
      repeatable = true;
    }
    for (const id of ids) {
      targets.add(id);
    }
  }
  return { targetIds: [...targets], capacity: repeatable ? Number.POSITIVE_INFINITY : budgets.size };
}
