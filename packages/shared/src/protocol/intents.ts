import type { ManualIntent } from "#shared/manual/ManualCommand";
/**
 * Client -> server intents: a single discriminated union. The client sends
 * `room.send(intent.type, payloadWithoutType)`; the room reassembles
 * `{ type, ...payload }`. Every intent is validated server-side; illegal ones
 * produce an `actionRejected` event and no state change (API-CONTRACT section 4).
 */
export type Intent =
  | ManualIntent
  // --- Setup ---
  | { type: "ready" } // signal ready in lobby
  | { type: "mulligan"; keep: boolean } // answer opening-hand mulligan

  // --- Main-phase verbs ---
  | {
      type: "playCard";
      instanceId: string;
      /** Choose the Digimon or Option side of a DUAL card. */
      useAs?: "digimon" | "option";
      targetSlot?: number;
      digiXros?: DigiXrosPlan;
      assembly?: AssemblyPlan;
    } // play Digimon/Tamer/Option from hand; digiXros/assembly declare the alternate material-based plays
  // Public App Fusion declaration (CR 8-4-1): host permanent, result hand card and the
  // selected linked material. Kept alongside the digivolve intent's App Fusion fields, which
  // remain the effect-driven route.
  | { type: "appFusion"; permanentId: string; instanceId: string; linkedInstanceId: string }
  | {
      type: "digivolve";
      permanentId: string;
      instanceId: string;
      useAlternateCost?: boolean;
      /** Declare App Fusion using this linked partner instead of a normal evolution requirement. */
      appFusionLinkedInstanceId?: string;
      /** Explicit index in digivolutionRequirementsFor(cardId); server revalidates every gate. */
      alternateRequirementIndex?: number;
      /** Explicitly use the card's Blast Digivolve waiver; omitted for a normal evolution. */
      useBlastDigivolve?: boolean;
      /** Declare App Fusion using this linked card on the chosen battle-area Digimon. */
      appFusionLinkInstanceId?: string;
    } // stack hand card onto a permanent; boolean remains the first-match compatibility path
  | { type: "hatchEgg" } // breeding: move top egg to raising area
  | { type: "moveFromBreeding"; permanentId: string } // move raised Digimon to battle area
  | { type: "activateEffect"; sourceInstanceId: string; effectKey: string } // activate a [Main]/activated effect
  | { type: "linkCard"; instanceId: string; targetPermanentId: string } // link a hand card (§6-5-1-4/§10-1) to one of your battle-area Digimon
  | {
      type: "dnaDigivolve";
      materialPermanentIds: string[];
      instanceId: string;
      /** Explicitly use the card's Blast DNA Digivolve waiver; omitted for normal DNA. */
      useBlastDigivolve?: boolean;
    } // DNA digivolve (§8-2): consume 2+ battle-area materials + a hand card into a new Digimon
  | { type: "endPhase" } // advance Main -> End (or skip Breeding action)

  // --- Combat verbs ---
  // `vortex: true` marks a ＜Vortex＞ keyword attack declaration (Comprehensive Rules §16-33):
  // the end-of-turn keyword attack, which targets opponent Digimon ONLY unless a
  // VortexCanAttackPlayers grant relaxes it (EX11-062). Omitted/false = a normal attack
  // declaration (unconditional player target), so existing combat is unchanged.
  | { type: "attack"; attackerPermanentId: string; target: AttackTarget; vortex?: boolean }
  | { type: "declareBlock"; blockerPermanentId: string } // during an open block window
  | { type: "declineBlock" } // pass the block window
  // §11-3 Counter Timing: during an open counter window, activate a [Counter] effect
  // (both fields present), or omit both to pass. §11-3-2 caps activation at 1 per attack.
  | { type: "respondCounter"; sourceInstanceId?: string; effectKey?: string }
  | { type: "respondAlliance"; allyPermanentId?: string } // choose ally (or pass) for ＜Alliance＞
  | { type: "respondEvade"; permanentId: string; accept: boolean } // accept/reject ＜Evade＞
  | { type: "respondBarrier"; permanentId: string; accept: boolean } // accept/reject ＜Barrier＞

  // --- Decision responses (engine raised a PendingDecision) ---
  | { type: "respondDecision"; decisionId: string; response: DecisionResponse }

  // --- Always available ---
  | { type: "surrender" };

export type IntentType = Intent["type"];

/**
 * card that has a `digiXrosRequirement`, the player MAY place specified named material cards under
 * it; each placed card reduces the play cost by the requirement's per-card value. Materials come
 * from the player's hand and battle area by default; the trash and cards under the player's Tamers
 * become legal source zones only while an expander effect (BT19-079 / BT19-087 / EX4-062) is active
 * — the player suspends those Tamers (`expanderPermanentIds`) as the activation cost. The server
 * validates the whole declaration atomically and is the sole authority on legality.
 */
export interface DigiXrosPlan {
  /** Instance ids of the material cards to place under the played card (hand / battle-area top / trash / under-Tamer). */
  materialInstanceIds: string[];
  /** Permanent ids of the player's expander Tamers to suspend to unlock the trash / under-Tamer source zones. */
  expanderPermanentIds?: string[];
  /** Selected host when an expander restricts under-Tamer materials to one Tamer. */
  underTamerHostPermanentId?: string;
}

/**
 * card that has an `assemblyRequirement` (§7-3), the player MAY place the EXACT named/traited
 * card count from their TRASH under it, reducing the play cost by the requirement's fixed amount.
 * Unlike DigiXros, materials come from the trash only — never hand/battle-area/under-Tamer — and
 * the reduction is a flat amount, not per-material scaling. The server validates the whole
 * declaration atomically and is the sole authority on legality.
 */
export interface AssemblyPlan {
  /** Trash instance ids to place under the played card, in stacking-declaration order (§7-3-2-6:
   *  the requirement's left-to-right slot order for distinct slots, or the player's own choice
   *  for a single repeated slot). */
  materialInstanceIds: string[];
}

export type AttackTarget =
  | { kind: "player" } // attack the opponent (security)
  | { kind: "permanent"; permanentId: string }; // attack a suspended Digimon

/**
 * Answer to an `orderTriggers` decision. `order[0]` resolves next. When the request sets
 * `acceptsResolutionPlan`, the rest of `order` is the controller's planned order for the
 * other offered entries, and `optionalAnswers` presets the yes/no questions each entry's
 * effect asks (true = use, false = skip); entries without a preset are still asked.
 */
export interface OrderTriggersResponse {
  kind: "orderTriggers";
  order: string[];
  optionalAnswers?: Record<string, boolean>;
  orderIndexes?: number[];
  optionalAnswersByIndex?: (boolean | null)[];
}

export type DecisionResponse =
  | { kind: "optional"; accept: boolean } // use this optional effect?
  | { kind: "chooseTargets"; instanceIds: string[] } // pick targets (count enforced server-side)
  | { kind: "selectCards"; instanceIds: string[] } // pick from a revealed set / search
  | { kind: "orderCards"; order: string[] } // arrange a complete offered card set in destination order
  | OrderTriggersResponse
  | { kind: "chooseOption"; optionIndex: number }; // pick one of several modal choices

/**
 * Result of validating + applying an intent. Mutation happens only when `ok` is
 * true; otherwise `reason` is a stable, client-surfaceable code.
 */
export type IntentResult = { ok: true } | { ok: false; reason: RejectReason };

/**
 * Stable rejection codes sent in `actionRejected` events
 * (API-CONTRACT "Intent validation contract").
 *
 * Generic / shared
 */
export type RejectReason =
  | "not-your-turn"
  | "wrong-phase"
  | "decision-pending"
  | "illegal-target"
  | "insufficient-memory"
  | "card-not-in-zone"
  | "no-such-card"
  | "not-implemented"
  | "unknown-intent"

  // Play (playCard / DigiXros)
  | "not-playable-kind" // DigiEgg or unplayable card kind
  | "no-empty-slot" // malformed/invalid placement target
  | "play-prohibited" // RestrictPlay effect blocks this play
  | "color-requirement-unmet" // printed color requirement unmet and not waived
  | "not-digixros" // card has no DigiXros requirement
  | "no-materials" // DigiXros declaration placed zero materials
  | "invalid-material" // material in wrong zone or fails recipe slot
  | "invalid-expander" // chosen expander Tamer is not legal for this play
  | "not-assembly" // card has no Assembly requirement

  // Digivolve
  | "invalid-evolution" // no matching EvoCost / alternate / base-granted path
  | "no-such-permanent" // permanentId not found in the seat's areas
  | "not-controller" // seat does not control the target permanent
  | "not-a-digimon" // evolving card is not a Digimon

  // Breeding
  | "breeding-occupied" // hatchEgg: a card already occupies the breeding area
  | "egg-deck-empty" // hatchEgg: no Digi-Egg to hatch
  | "breeding-empty" // moveFromBreeding: nothing in the breeding area
  | "not-movable" // moveFromBreeding: card is not a Digimon with DP
  | "move-prohibited" // RestrictPlay effect blocks the breeding move

  // Link (linkCard)
  | "not-linkable" // card has no printed <Link> requirement
  | "link-requirement-unmet"; // target Digimon doesn't meet the link card's category requirement

/** Narrowing helper used by intent handlers. */
export function isIntentOfType<T extends IntentType>(intent: Intent, type: T): intent is Extract<Intent, { type: T }> {
  return intent.type === type;
}
