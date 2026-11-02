// Fields shared by every action node.

import type { Condition } from "../predicates/conditions.js";
import type { Cost } from "../predicates/costs.js";
import type { Scaling } from "../predicates/scaling.js";

export interface ActionBase {
  /** Verbatim printed passage for decisions raised by this part of a compound effect. */
  effectTextPart?: string;
  costTextEmphasis?: string;
  optionalTextEmphasis?: string;
  /** This action is the payload of a Delay activation armed by a prior GainKeyword(Delay). */
  requiresDelayArmed?: true;
  /** Optional per-action gate (the clause-level "If ..."). */
  condition?: Condition;
  /** Optional cost paid to perform this action. */
  cost?: Cost;
  /**
   * Additional costs for the same action. Used for clauses such as
   * "By placing 1 [A] and 1 [B] ...".
   */
  additionalCost?: Cost;
  additionalCosts?: Cost[];
  /** Alternative costs where paying any one option satisfies the action. */
  costOptions?: Cost[];
  /** Scaling ("for each ...") applied to the action's amount/count. */
  scaling?: Scaling;
  /** True when the clause is prefixed "You may". */
  optional?: boolean;
  /**
   * "By [cost], you may [effect]": the activation cost is paid when the effect activates and only
   * the PAYLOAD is declinable, so the cost is spent whichever way the player answers (Q2813,
   * Q2853, Q2804). Without it, `optional` gates cost and payload together — the "You may [do X].
   * If you do, ..." shape, where declining spends nothing.
   *
   * Authored per card from the printed wording and its ruling; there is deliberately no
   * generator-wide default, because a genuinely optional "up to N" cost (BT17-041) must keep the
   * combined prompt. `false` opts out of the interpreter's fallback that infers this shape from a
   * "may" in `effectTextPart` (EX10-063 Q5173: declining must keep the cost unpaid).
   */
  payCostBeforeOptional?: boolean;
  /**
   * When true and this optional action is declined, abort all subsequent
   * actions in the same sequence ("By trashing X, do Y" — declining the
   * trash prevents Y from firing).
   */
  abortOnDecline?: boolean;
  /** Declining this optional action releases its enclosing once-per-turn activation. */
  preserveOncePerTurnOnDecline?: boolean;
  /**
   * The action's activation cost may be paid even when its following target currently has no
   * candidates. Used only where a card ruling explicitly permits that processing condition.
   */
  allowCostWithoutTarget?: boolean;
  /**
   * The printed sub-clause this action encodes. Never changes resolution; when the action
   * asks the player something, the prompt shows this sentence instead of an engine summary.
   */
  raw?: string;
}
