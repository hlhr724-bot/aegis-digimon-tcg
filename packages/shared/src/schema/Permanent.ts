import type { AttackRedirection } from "#shared/schema/AttackRedirection";
import { Schema, ArraySchema, type } from "@colyseus/schema";
import { CardInstance } from "./CardInstance.js";
import type { Seat } from "./enums.js";

/**
 * A field position: a top card plus its digivolution stack and any linked cards.
 * Mirrors documented behavior.
 */
export class Permanent extends Schema {
  attackRedirectTargets: Record<string, AttackRedirection> = {};
  @type("string") permanentId!: string;
  @type("uint8") controllerSeat!: Seat;
  @type(CardInstance) topCard!: CardInstance; // the active Digimon/Tamer
  @type([CardInstance]) stack = new ArraySchema<CardInstance>(); // digivolution cards (bottom..below top)
  @type([CardInstance]) linked = new ArraySchema<CardInstance>(); // linked cards (Link mechanic)
  @type("int32") baseDP = 0; // from topCard's CardDefinition
  @type("int32") currentDP = 0; // baseDP + active modifiers
  @type("boolean") isSuspended = false;
  @type("boolean") inBreeding = false; // true while in the breeding/raising area
  // The turnCount at which this permanent entered the field. Drives the
  // ＜Delay＞ option-activation gate "you can't activate this effect the turn this card enters
  // play" (CanDeclareOptionDelayEffect: EnterFieldTurnCount != current TurnCount).
  @type("uint32") enterFieldTurnCount = 0;
  // Set true when this permanent was JUST burst-digivolved (Comprehensive Rules §8-3-2-1),
  // consumed as PENDING PROCESSING (§18-1) at the engine's real OnEndTurn firing point later
  // that same turn: the card then stacked immediately under the top is trashed. Cleared
  // unconditionally once that firing point evaluates it, so it never survives past the turn it
  // was set on. A plain flag rather than an `enterFieldTurnCount`-style turnCount marker: unlike
  // enter-field (which tests may check turns after the fact), this is always consumed at the
  // very next OnEndTurn, and `turnCount` is commonly left at its 0 default in scenario setup —
  // a value indistinguishable from "never happened" had it been reused as the sentinel here.
  @type("boolean") burstDigivolvePendingTrash = false;
  // True iff this permanent was placed onto the field BY AN EFFECT rather than through a
  // normal play (Comprehensive Rules §17-1-3-2-2 exempts an effect-placed Option card from
  // the rule-check sweep that otherwise trashes any Option sitting in the battle area). Set
  // by the one path that places an Option as a battle-area permanent (`placeOptionAsPermanent`,
  // engine/effects/primitives.ts) and left false everywhere else (the default for every
  // other permanent-creation path, none of which currently need to distinguish "by an
  // effect" from "by a normal play"). Considered and rejected reusing `enterFieldTurnCount`
  // as an implicit marker: it records WHEN a permanent entered, not WHY, and is legitimately
  // 0 for a permanent placed on turn 0 by either route, so it cannot carry this distinction.
  @type("boolean") placedByEffect = false;
  // True while the current top card entered this permanent by an effect. Used by cards whose
  // later effects condition on having been played/digivolved by an effect (BT25-080).
  @type("boolean") enteredByEffect = false;
  // Set when an effect peels a Digimon stack down to an invalid no-DP remnant. The position was
  // a Digimon immediately before the move, so a promoted non-Digimon/non-DigiEgg or ordinary
  // no-DP Digi-Egg is trashed at the next rule check; a DP-bearing Digi-Egg remains legal. An
  // ordinarily played Tamer must remain legal and therefore cannot be inferred from its current
  // top kind alone.
  @type("boolean") invalidNoDpStackTop = false;
  // JSON array of {instanceId,effectKey,description} — populated server-side for the
  // turn player's battle-area permanents during Main phase; empty string otherwise.
  @type("string") activatableEffectsJson = "";
  // Resolved active keyword names (printed on the top card plus continuous grants),
  // re-derived each continuous-recompute pass so the client can drive keyword-gated
  // affordances (e.g. a ＜Vortex＞ attack) and hints without embedding rules logic.
  @type(["string"]) keywords = new ArraySchema<string>();
  // Active keywords supplied by effects rather than printed intrinsically on the
  // top card. Rendered as transient board badges so gained abilities stay visible
  // without duplicating every keyword already legible on the card art.
  @type(["string"]) grantedKeywords = new ArraySchema<string>();
  // Active triggered effects granted to this permanent, resolved by the server.
  @type(["string"]) grantedEffectTexts = new ArraySchema<string>();
  // Server-resolved "original card information" overrides (Comprehensive Rules card
  // information change; KB Q2080-Q2084). An effect such as BT11-043 KingSukamon rewrites a
  // Digimon's ORIGINAL name, color and DP — it does not add a card to the field, so the
  // client still renders the physical card underneath and needs these two fields to say
  // what the position now counts as. Empty/absent while nothing overrode them.
  //
  // Projected for both seats: a transformation is public information, and the opponent
  // must be able to read that their Digimon is currently a white 3000 DP [Sukamon].
  // `baseDP` remains the physical card's printed baseline for modifier calculations, so the
  // active original-DP rewrite has its own public projection too.
  @type("string") originalNameOverride = "";
  @type(["string"]) originalColorsOverride = new ArraySchema<string>();
  @type("int32") originalDPOverride = 0;
  // Server-resolved aliases that apply only while this permanent is chosen as a
  // DigiXros material. Kept separate from normal names because the grant must not
  // affect any other name-based rule or UI affordance.
  @type(["string"]) digiXrosNames = new ArraySchema<string>();
  // Server-resolved summoning sickness (Comprehensive Rules §16-1): this permanent entered
  // the field on the current turn and has no ＜Rush＞, so an ordinary attack declaration is
  // refused. Projected for BOTH seats and every phase — unlike `attackablePermanentIds`,
  // which is only populated for the turn player while a declaration is actually possible —
  // because the client draws the summoning-sickness ring from it and must never rebuild the
  // rule from `enterFieldTurnCount` and a turn counter.
  @type("boolean") summoningSick = false;
  // Server-resolved blanket combat restrictions imposed by effects ("this Digimon can't
  // attack" / "can't block"), read from the same continuous-effect ledger entries the
  // legality seam consults (`hasRestriction(id, "attack" | "block")`). Deliberately NOT
  // the same question as `summoningSick`: that is a rule about entering the field, this
  // is an imposed restriction, and the client animates only the latter (a freeze pulse
  // when one lands). Blanket only — target-scoped restrictions ("can't attack players",
  // "can't attack Digimon") stay inside `attackablePermanentIds` / `canAttackPlayer`,
  // which already resolve them; surfacing them here too would double-count.
  @type("boolean") cannotAttack = false;
  @type("boolean") cannotBlock = false;
  @type("boolean") cannotSuspend = false;
  // Server-resolved blanket restriction used by the client and server-side bots when
  // deciding whether this permanent can be a digivolution base.
  @type("boolean") cannotDigivolve = false;
  // The two non-combat blanket restrictions the client shows as standing debuff badges,
  // projected from the same ledger entries the rules read: the unsuspend step skips a
  // permanent with `cannotUnsuspend` (GameEngine's unsuspend phase), and a [When
  // Digivolving] effect is refused for one with `cannotActivateWhenDigivolving`
  // (BT19-038, KB Q5541-Q5545). Published for both seats and every phase, like
  // `cannotAttack`/`cannotBlock`, because they are facts about the permanent rather than
  // about an action being declared right now.
  @type("boolean") cannotUnsuspend = false;
  @type("boolean") cannotActivateWhenDigivolving = false;
  @type("boolean") immuneToOpponentDigimonEffects = false;
  @type("boolean") immuneToOpponentOptionEffects = false;
  @type("boolean") immuneToOpponentTamerEffects = false;
  @type("boolean") protectedFromDpReduction = false;
  @type("boolean") protectedFromDeDigivolve = false;
  @type("boolean") protectedFromEffectDeletion = false;
  @type("boolean") protectedFromBattleDeletion = false;
  @type("boolean") protectedFromEffectReturn = false;
  // A duration-scoped gained effect will force this Digimon to attack when its controller's
  // next Main phase starts. Projected from the authoritative SubTrigger subscription so the
  // client can keep the pending action visible before it fires.
  @type("boolean") attacksAtStartOfMainPhase = false;
  // The granted clauses behind `attacksAtStartOfMainPhase`, as JSON
  // `[{ clause, sourceCardId? }]`, so both players can read what forces the attack and from
  // which card. Empty while no granted clause forces one.
  @type("string") forcedAttackGrantsJson = "";
  // Number of security cards an attack by this Digimon checks: base 1 plus every resolved
  // ＜Security Attack ±N＞ grant, floored at 0 (Comprehensive Rules §16-4-4). Projected from
  // the same helper the security-check loop uses (`securityStrikeCount`) so the inspector can
  // never disagree with what an attack would actually do.
  @type("uint8") securityAttack = 1;
  // Signed Security Attack modifier before the check count is floored at zero.
  @type("int16") securityAttackModifier = 0;
  // Server-projected opponent permanents this Digimon may legally attack right now.
  // The client must not reconstruct combat rules from suspension or card text: grants
  // such as ST12-08 and target-scoped restrictions are already resolved here.
  @type(["string"]) attackablePermanentIds = new ArraySchema<string>();
  // Player/security targeting is projected separately because restrictions can forbid
  // attacking players while still allowing attacks on Digimon.
  @type("boolean") canAttackPlayer = false;
  // The same two projections for a ＜Vortex＞ declaration, which is validated under
  // different rules and so cannot be derived from the plain ones: §16-33-1 makes
  // ＜Vortex＞ a same-turn-attack grant in its own right (a Digimon that entered this
  // turn may Vortex-attack but not attack normally), while §16-33 restricts the target
  // to opponent Digimon unless a grant relaxes it. Empty/false whenever the permanent
  // has no ＜Vortex＞.
  @type(["string"]) vortexAttackablePermanentIds = new ArraySchema<string>();
  @type("boolean") canVortexAttackPlayer = false;
  @type("boolean") protectedFromStackTrash = false;
  @type("boolean") protectedFromStackReturn = false;
  @type("string") heldDpEffectsJson = "";
  @type("string") manualMarker = "";
  @type(["string"]) manualStatuses = new ArraySchema<string>();
}
