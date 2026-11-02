import type { CardColor, CardInstance, Permanent, Seat, ZoneRef } from "@aegis/shared";

/**
 * Putting cards onto the board and moving them once there: play, digivolve,
 * de-digivolve, stack placement, relocation, hatching and linking.
 */
export interface BoardPrimitives {
  playFromHand(
    instanceIds: string[],
    opts?: { payCost?: boolean; suspended?: boolean; costDelta?: number },
  ): Promise<Permanent[]>;
  playFromSecurity(instanceId: string, opts?: { payCost?: boolean }): Promise<Permanent | undefined>;
  /**
   * Read-only affordability query for an effect-driven paid play. Resolves the same
   * continuous play-cost modifiers and explicit reduction as `playInstances`, without
   * moving the card or paying memory. Optional so narrow interpreter test ports may omit it.
   */
  canAffordEffectPlay?(
    instanceId: string,
    opts?: { costDelta?: number; useAsOption?: boolean; controllerSeat?: Seat },
  ): Promise<boolean>;
  /** Current play cost of a live permanent after active play-cost modifiers. */
  effectivePlayCost?(permanent: Permanent): number;
  /**
   * Current cost of a loose card when used by its controller, after the same
   * continuous hand-use reductions as an ordinary Option use.
   */
  effectiveLooseUseCost?(instanceId: string, controllerSeat: Seat): number | undefined;
  /**
   * Cost of a loose card while it sits in hand: printed cost minus only the reductions that
   * apply continuously in hand, not "when you would use this card" ones (KB Q1501).
   */
  inHandCost?(instanceId: string, controllerSeat: Seat): number | undefined;
  /**
   * Play specific loose card instances as new battle-area permanents, locating each
   * one wherever it currently sits (hand, trash, deck, security, breeding, or as a
   * digivolution/linked card under another permanent). Generalizes `playFromHand` to
   * the "play 1 [X] from your hand/trash/security/deck/under your Tamers without
   * paying the cost" family (the IR `PlayWithoutCost` filtered/from-zone forms). The
   * caller (interpreter) resolves WHICH instances by filter; this verb moves & plays
   * them. Returns the created permanents.
   */
  playInstances(
    instanceIds: string[],
    opts?: {
      payCost?: boolean;
      suspended?: boolean;
      breeding?: boolean;
      costDelta?: number;
      /** Per-play reduction when a batch contains cards with different alternate play costs. */
      costDeltaByPlay?: Record<string, number>;
      /** Set the paid play's base cost to this value before continuous modifiers. */
      costOverride?: number;
      suppressOnPlayEffects?: boolean;
      /** Card whose resolving effect initiated this play. */
      effectSourceCardId?: string;
      /** Server-selected DigiXros materials to place before firing this effect-played card's On Play. */
      digiXrosMaterialInstanceIds?: string[];
      /** Per-play DigiXros materials when several effect plays resolve as one batch. */
      digiXrosMaterialInstanceIdsByPlay?: Record<string, string[]>;
      /** Assembly materials selected from trash for this effect-driven play. */
      assemblyMaterialInstanceIds?: string[];
      /** Per-play Assembly materials when several effect plays resolve as one batch. */
      assemblyMaterialInstanceIdsByPlay?: Record<string, string[]>;
      /** Resolved host permanent for stack-origin instances, when the source is a stack zone. */
      hostPermanentIds?: Record<string, string>;
      /** The zone the rules play the cards from when it differs from where they now sit. */
      playedFromZone?: ZoneRef;
    },
  ): Promise<Permanent[]>;
  /**
   * Place a loose card instance onto `targetPermanentId` as a digivolution (the
   * effect-driven analogue of the digivolve action: the prior top slides under the
   * new top). `payCost` pays the matching printed digivolve cost when set (and the
   * placement is skipped if unaffordable); the default — and the common effect form
   * "digivolve into [X] ... without paying the cost" — is free. Recomputes DP from
   * the new top and carries the base's suspended state. Returns the permanent, or
   * undefined when the target or source instance was not found. It fires the resulting
   * card's [When Digivolving] window after its bonus draw. A reveal-based evolution may
   * supply `beforeWhenDigivolving` when the printed effect requires a revealed remainder
   * to be returned before that window opens (BT1-078 KB Q932).
   */
  digivolveFromInstance(
    targetPermanentId: string,
    sourceInstanceId: string,
    opts?: {
      payCost?: boolean;
      byEffect?: boolean;
      draw?: boolean;
      costDelta?: number;
      /**
       * A reduction counted only after would-digivolve cost replacements resolve, so a
       * "for each suspended Digimon" scaling sees Digimon those replacements suspended (Q4276).
       */
      deferredCostReduction?: () => number;
      costOverride?: number;
      /** Choose a matching alternate digivolution requirement when printed and alternate paths both match. */
      useAlternateCost?: boolean;
      /** Ignore only the level portion of the printed digivolution requirement. */
      ignoreLevel?: boolean;
      /** Temporarily evaluate the base as the printed virtual level/colors (e.g. a Tamer). */
      virtualBase?: { level: number; colors: CardColor[] };
      ignoreRequirements?: boolean;
      beforeWhenDigivolving?: () => Promise<void>;
      processRulesBeforeWhenDigivolving?: boolean;
      suppressWhenDigivolving?: boolean;
    },
  ): Promise<Permanent | undefined>;
  /**
   * Whether a "can't digivolve" rule stops `digivolveFromInstance` from digivolving
   * `targetPermanentId` into `evolvingCardId`. With `virtualBase`, a Tamer is checked as the
   * Digimon it digivolves as (KB Q1157).
   */
  isEffectDigivolveBlocked?(
    targetPermanentId: string,
    evolvingCardId: string,
    virtualBase?: { level: number; colors: CardColor[] },
  ): boolean;
  /**
   * DNA-digivolve: consume `materialPermanentIds` (two or more battle-area permanents)
   * and play `resultInstanceId` (a loose card) as a single new permanent that carries
   * all the materials' digivolution cards (and the materials' top cards) under it.
   * `payCost` pays the printed digivolve cost when set. Returns the created permanent,
   * or undefined when fewer than 2 materials resolve or the result instance is missing.
   */
  dnaDigivolveInto(
    materialPermanentIds: string[],
    resultInstanceId: string,
    opts?: {
      payCost?: boolean;
      extraMaterialInstanceIds?: string[];
      extraMaterialsOnBottom?: boolean;
      publicEntry?: boolean;
    },
  ): Promise<Permanent | undefined>;
  /**
   * App Fusion: play the fusion-target card `resultInstanceId` (a loose card in trash/hand)
   * ON TOP of the battle-area Digimon `sourcePermanentId`, the prior top sliding under it as
   * a digivolution card (the same placement as `digivolveFromInstance`, NOT DnaDigivolve — no
   * permanent is consumed off the field). Legality and the paid cost are owned by the TARGET
   * card plus its linked cards must collectively cover >= 2 distinct required names (the top
   * card being one of them). Returns the fused permanent, or undefined when the source/result
   * is missing, the fusion is illegal, or the app-fusion cost is unaffordable.
   */
  appFuseInto(
    sourcePermanentId: string,
    resultInstanceId: string,
    requestedLinkedInstanceId?: string,
    costOverride?: number,
    opts?: { publicEntry?: boolean },
  ): Promise<Permanent | undefined>;
  /**
   * De-Digivolve `n`: for a target permanent, up to `n` times move the current top
   * card to the BOTTOM of its owner's deck and promote the card directly beneath it
   * to be the new top (the Digimon reverts to a lower stage). Stops early when the
   * digivolution stack is empty (a Digimon with no sources is unaffected). Recomputes
   * DP from the new top each step. Returns the instances moved to deck.
   */
  deDigivolve(
    permanentId: string,
    n: number,
    opts?: { byEffectSeat?: Seat; byEffectCardId?: string; stopAtLevel?: number },
  ): CardInstance[] | Promise<CardInstance[]>;
  /**
   * Place loose card instances under `targetPermanentId` as digivolution cards
   * (beneath its current top — i.e. at the bottom of the stack by default, or just
   * below the top when `belowTop`). Used by "place [X] under ..." / "place as the
   * bottom digivolution card". Returns the instances placed.
   */
  placeUnder(
    targetPermanentId: string,
    instanceIds: string[],
    opts?: { belowTop?: boolean; faceUp?: boolean },
  ): Promise<CardInstance[]>;
  placePlayMaterialsUnder(targetPermanentId: string, instanceIds: string[]): Promise<CardInstance[]>;
  /** Atomically place ordered loose cards and whole permanent materials at stack bottom.
   * The first material group is nearest the bottom; each source keeps its attached cards.
   * Existing host sources remain above the added materials.
   */
  placeMixedMaterialsUnder?(targetPermanentId: string, orderedInstanceIds: string[]): Promise<CardInstance[]>;
  /** Place the controller's deck top face-down under a battle-area permanent. */
  placeUnderFromDeck(targetPermanentId: string, seat: Seat): Promise<CardInstance | undefined>;
  /**
   * "Place this Digimon's top card as its bottom digivolution card" (BT22-043/044): rotate the
   * permanent's own top card to the bottom of its digivolution stack, promoting the topmost
   * digivolution card to the new top. Returns false when there is no digivolution card to
   * promote (the cost is then unpayable).
   */
  placeOwnTopAtStackBottom(permanentId: string): Promise<boolean>;
  /**
   * Relocate a battle-area permanent (top + stack + linked) under another permanent
   * as digivolution cards. The source permanent ceases to exist. `shedOwnCards` is §7-2-2-7
   * (only the top card moves; the rest is trashed), which holds both for DigiXros material
   * placement and for card effects that place a permanent under another card (KB EX2-028,
   * EX2-007, BT11-088). Effect and cost placements get it by default through
   * `relocateByEffect`; this raw primitive applies it only when the caller sets it.
   */
  relocatePermanent(
    destPermanentId: string,
    sourcePermanentId: string,
    opts?: { belowTop?: boolean; shedOwnCards?: boolean; faceUp?: boolean },
  ): boolean;
  /**
   * Effect/cost form of `relocatePermanent`: after the move, opens the canonical
   * `onAddDigivolutionCards` window for the destination and awaits its reactions.
   * DigiXros uses the synchronous primitive above because material placement is a rules
   * procedure, not an effect placing a digivolution card.
   */
  relocatePermanentByEffect?(
    destPermanentId: string,
    sourcePermanentId: string,
    opts?: { belowTop?: boolean; shedOwnCards?: boolean; faceUp?: boolean },
  ): Promise<boolean>;
  /** Simultaneous bottom placement of a revealed Digi-Egg and battle-area tops (BT13-007).
   * Order is nearest the bottom first. Protected sources stay in play; other cards still move.
   */
  placeEggAndPermanentsUnder?(
    destPermanentId: string,
    orderedCards: { instanceId: string; permanentId?: string }[],
  ): Promise<void>;
  /**
   * Atomic multi-source form of `relocatePermanentByEffect`. Every source is preflighted
   * before the first permanent leaves play; an invalid source therefore pays nothing and
   * returns an empty list. The returned ids are exactly the source permanents moved.
   */
  relocatePermanentsByEffect?(
    destPermanentId: string,
    sourcePermanentIds: string[],
    opts?: { belowTop?: boolean; shedOwnCards?: boolean; faceUp?: boolean },
  ): Promise<string[]>;
  /**
   * Move a whole permanent (top + digivolution stack + linked cards) across the
   * breeding/battle boundary as a card EFFECT, preserving identity, stack, linked cards
   * and suspended state — digivolution cards are NOT trashed and ＜Overflow＞ is NOT
   * processed (the MovePermanent IR action; Comprehensive Rules §4-16; KB P-143
   * Q4250/Q4251/Q4256/Q4257, P-130 Q4242). NOT the breeding-phase player verb: no
   * Phase.Breeding gate and no once-per-turn breeding limit. Returns false (no-op) when
   * the source is not where `direction` expects or the breeding slot is already occupied.
   */
  movePermanentZone(permanentId: string, direction: "toBreeding" | "toBattle"): Promise<boolean>;
  /**
   * Hatch a Digi-Egg as a card EFFECT: flip the top card of `seat`'s Digi-Egg deck and
   * place it into the EMPTY breeding slot as a fresh permanent (Comprehensive Rules
   * §4-17-1; BT8-091 [On Play]). Returns the new breeding permanent, or undefined when the
   * Digi-Egg deck is empty or the breeding slot is already occupied (breeding is
   * single-occupancy). NOT the breeding-phase player verb (no Phase.Breeding gate).
   */
  hatch(seat: Seat): Promise<Permanent | undefined>;
  /**
   * Place the TOP card of `seat`'s Digi-Egg deck under `targetPermanentId` as a digivolution
   * card (BT13-007 / EX6-006 "place the top card of your Digi-Egg deck as this Digimon's
   * bottom digivolution card"). By default the card goes to the BOTTOM of the stack;
   * `belowTop` inserts it directly beneath the current top. Returns the placed card, or
   * undefined when the Digi-Egg deck is empty or the host permanent is missing. This is the
   * Digi-Egg-DECK source `placeUnder` (loose-card only) cannot serve.
   */
  placeUnderFromEggDeck(
    targetPermanentId: string,
    seat: Seat,
    opts?: { belowTop?: boolean },
  ): Promise<CardInstance | undefined>;
  /**
   * Place the TOP card of `seat`'s Digi-Egg deck as `targetPermanentId`'s TOP digivolution card
   * (BT22-007 "place [Mother Eater]s as this Digimon's TOP digivolution cards"). The TOP variant
   * of `placeUnderFromEggDeck`: the card goes to the topmost digivolution position and is REVEALED
   * (face-up — KB Q4856). Returns the placed card, or undefined when the Digi-Egg deck is empty or
   * the host permanent is missing.
   */
  placeAsTopFromEggDeck(targetPermanentId: string, seat: Seat): Promise<CardInstance | undefined>;
  /**
   * Link loose card instances to `targetPermanentId` (the Link mechanic — the cards
   * join the permanent's `linked` list). Returns the instances linked.
   */
  link(targetPermanentId: string, instanceIds: string[]): Promise<CardInstance[]>;
}
