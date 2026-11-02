import type { GameState, Permanent } from "@aegis/shared";
import type { DecisionManager } from "../decisions/index.js";
import { definitionOf, isOption } from "../cards/cardData.js";
import type { ContinuousEffectLedger } from "../effects/continuous.js";
import type { Primitives } from "../effects/EffectContext.js";
import type { ModifierLedger } from "../effects/primitives.js";
import type { GameStateAccess } from "../state/access.js";
import type { WinCheck } from "../security/index.js";
import {
  battleAreaPermanents,
  breedingPermanents,
  fieldPermanents,
  isDigimonOrDigiEgg,
  linkHostOf,
  linkRequirementSatisfied,
} from "./boardQueries.js";

/**
 * What the rule-check sweeps need from the engine that owns them. Deliberately the
 * narrow list rather than the engine itself: every sweep reads the board, the
 * continuous tier and the modifier ledger, and performs its removals through the same
 * `byRule` primitives an effect would use.
 */
export interface RuleCheckDeps {
  readonly state: GameState;
  readonly access: GameStateAccess;
  readonly continuous: ContinuousEffectLedger;
  readonly modifiers: ModifierLedger;
  readonly decisions: DecisionManager;
  readonly win: WinCheck;
  /** Built after the engine's own construction, so read at call time. */
  readonly primitives: () => Primitives;
  /** Cards linked since the last rule-check boundary, shielded from the excess-link sweep. */
  readonly justLinked: ReadonlySet<string>;
  readonly linkMaxOf: (permanent: Permanent) => number;
  /** The engine's §17-1-2-1 re-entrancy latch, read live. */
  readonly isRuleProcessing: () => boolean;
}

/**
 * The state-based-action sweeps of Comprehensive Rules §17-1-3 and their predicates. The
 * fixpoint that drives them, and the pooling of what they delete into one trigger window,
 * stay with the engine — this holds the checks themselves.
 */
export class RuleChecks {
  constructor(private readonly deps: RuleCheckDeps) {}

  /**
   * Whether any state-based action is pending: re-evaluated every
   * pass so the fixpoint terminates when the board is quiet. Returns false during a pass
   * (the `ruleProcessing` re-entrancy latch) so an [On Deletion] effect that re-enters
   * resolution does not recurse into a second concurrent sweep.
   */
  doRuleProcess(): boolean {
    if (this.deps.isRuleProcessing()) return false;
    if (this.deps.state.gameOver) return false;
    return (
      this.anyPlayerLost() ||
      this.anyInvalidNoDpStackTop() ||
      this.anyZeroDpDigimon() ||
      this.anyBreedingNonDigimon() ||
      this.anyFaceDownTopCard() ||
      this.anyExcessLinkCards() ||
      this.anyInvalidLinkedCards() ||
      this.anyOptionInBattleArea()
    );
  }

  /** #1: resolve pending `lost` flags into a game-over. True iff ended. */
  runEndGameProcess(): boolean {
    return this.deps.win.resolveLossFlags();
  }

  /** Any player marked lost but not yet resolved into a game-over. */
  anyPlayerLost(): boolean {
    return this.deps.state.players.some((p) => p?.lost === true) && !this.deps.state.gameOver;
  }

  /** A Digimon stack peeled by an effect until its new top is an invalid no-DP remnant (BT26-060 Q7082). */
  anyInvalidNoDpStackTop(): boolean {
    return battleAreaPermanents(this.deps.state).some((permanent) => permanent.invalidNoDpStackTop);
  }

  /** Trash invalid no-DP remnants before the ordinary DP and kind rule checks. */
  async trashInvalidNoDpStackTops(): Promise<void> {
    const ids = battleAreaPermanents(this.deps.state)
      .filter((permanent) => permanent.invalidNoDpStackTop)
      .map((permanent) => permanent.permanentId);
    if (ids.length > 0) await this.deps.primitives().trashPermanentByRule(ids);
  }

  /**
   * A "can't be deleted" prohibition takes precedence over the deletion (CR §15-1-3), and
   * `deletePermanent` drops those permanents from a byRule deletion set. The rule-check
   * predicates must agree, or a protected Digimon keeps the fixpoint from converging and the
   * match is wrongly declared a draw (BT18-086 Lucemon: Larva). A rule deletion has no
   * controlling effect, so opponent-scoped prohibitions do not apply — the same scope
   * `deletePermanent` uses for byRule.
   */
  protectedFromRuleDeletion(permanentId: string): boolean {
    return this.deps.continuous.hasRestriction(permanentId, "beDeleted", undefined, {
      byOpponentEffect: false,
      byEffect: false,
    });
  }

  anyZeroDpDigimon(): boolean {
    return battleAreaPermanents(this.deps.state).some(
      (p) =>
        p.topCard?.faceUp === true &&
        this.deps.access.isBattleAreaDigimon(p, this.deps.continuous) &&
        this.deps.modifiers.rawDp(this.deps.state, p.permanentId) <= 0 &&
        !this.protectedFromRuleDeletion(p.permanentId),
    );
  }

  async deleteZeroDpDigimon(): Promise<void> {
    const ids = battleAreaPermanents(this.deps.state)
      .filter(
        (p) =>
          p.topCard?.faceUp === true &&
          this.deps.access.isBattleAreaDigimon(p, this.deps.continuous) &&
          this.deps.modifiers.rawDp(this.deps.state, p.permanentId) <= 0,
      )
      .map((p) => p.permanentId);
    if (ids.length > 0) await this.deps.primitives().deletePermanent(ids, "byRule");
  }

  /** §17-1-3-2-3 predicate — a breeding-slot card that is neither a Digimon nor a Digi-Egg. */
  anyBreedingNonDigimon(): boolean {
    return breedingPermanents(this.deps.state).some((p) => !isDigimonOrDigiEgg(p));
  }

  /** §17-1-3-2-3 process — trash every non-Digimon/non-DigiEgg breeding permanent. */
  async trashBreedingNonDigimon(): Promise<void> {
    const ids = breedingPermanents(this.deps.state)
      .filter((p) => !isDigimonOrDigiEgg(p))
      .map((p) => p.permanentId);
    if (ids.length > 0) await this.deps.primitives().deletePermanent(ids, "byRule");
  }

  /**
   * §17-1-3-2-4 predicate — a permanent whose TOP card is face-down. Per CR §4-6-9/§4-6-10 a
   * face-down card UNDER another (a digivolution or link card) is legitimate hidden
   * information and is NOT targeted here — only a face-down card sitting directly on the
   * field (the top card itself, which represents no valid game state) is illegal.
   */
  anyFaceDownTopCard(): boolean {
    return fieldPermanents(this.deps.state).some((p) => p.topCard?.faceUp === false);
  }

  /** §17-1-3-2-4 process — trash every permanent whose top card is face-down. */
  async trashFaceDownTopCards(): Promise<void> {
    const ids = fieldPermanents(this.deps.state)
      .filter((p) => p.topCard?.faceUp === false)
      .map((p) => p.permanentId);
    if (ids.length > 0) await this.deps.primitives().trashPermanentByRule(ids);
  }

  /**
   * §17-1-3-2-5 predicate — a battle-area Digimon whose linked-card count exceeds its
   * effective link limit (`linkMaxOf`: base 1 plus active `<Link +N>` grants).
   */
  anyExcessLinkCards(): boolean {
    return battleAreaPermanents(this.deps.state).some((p) => p.linked.length > this.deps.linkMaxOf(p));
  }

  /**
   * §17-1-3-2-5 process — trash only the EXCESS linked cards (beyond `linkMaxOf`) per
   * Digimon, not the whole permanent. The rule fixes the COUNT and the controller picks
   * WHICH (Q6370, BT25-075: "The link cards to trash are chosen by the player"), so each
   * over-linked Digimon's controller is prompted once.
   */
  async trashExcessLinkCards(): Promise<void> {
    const toTrash: string[] = [];
    for (const permanent of battleAreaPermanents(this.deps.state)) {
      const excess = permanent.linked.length - this.deps.linkMaxOf(permanent);
      if (excess > 0) toTrash.push(...(await this.chooseExcessLinkCards(permanent, excess)));
    }
    if (toTrash.length > 0) await this.deps.primitives().trash(toTrash, { byRule: true });
  }

  /**
   * Which of `permanent`'s link cards its controller gives up to bring the count back to the
   * limit (Q6370, BT25-075: "The link cards to trash are chosen by the player"). A choice
   * that is not a choice — every candidate has to go — resolves without a prompt. An answer
   * that does not name exactly `excess` of the candidates cannot be honored without leaving
   * the rule violated, so it falls back to the oldest link cards.
   *
   * §4-9-5 removes the just-linked cards from the choice: linking onto a Digimon already at
   * its limit trashes "the same number of the EXISTING link cards", so the card that caused
   * the overflow is never the one offered up. The other route to an over-limit permanent —
   * the limit itself shrinking (Q6370's ＜Link +1＞ wearing off) — links nothing, so every
   * card stays a candidate there and the player picks freely. The exclusion is dropped if it
   * would leave too few candidates to satisfy the rule.
   */
  async chooseExcessLinkCards(permanent: Permanent, excess: number): Promise<string[]> {
    const linkedIds = permanent.linked.map((card) => card.instanceId);
    const existing = linkedIds.filter((id) => !this.deps.justLinked.has(id));
    const candidates = existing.length >= excess ? existing : linkedIds;
    if (excess >= candidates.length) return candidates;
    const response = await this.deps.decisions.request({
      seat: permanent.controllerSeat,
      kind: "selectCards",
      promptText: `Choose ${excess} link card${excess === 1 ? "" : "s"} to trash.`,
      options: { candidateInstanceIds: candidates, min: excess, max: excess },
    });
    const chosen =
      response.kind === "selectCards" ? [...new Set(response.instanceIds)].filter((id) => candidates.includes(id)) : [];
    return chosen.length === excess ? chosen : candidates.slice(candidates.length - excess);
  }

  /** §17-1-3-2-6/§17-1-3-2-7 predicate — some battle-area Digimon holds a link card its own printed requirement no longer matches. */
  anyInvalidLinkedCards(): boolean {
    return this.invalidLinkedCardIds().length > 0;
  }

  /** §17-1-3-2-6/§17-1-3-2-7 process — trash every linked card whose own requirement its host no longer satisfies. */
  async trashInvalidLinkedCards(): Promise<void> {
    const toTrash = this.invalidLinkedCardIds();
    if (toTrash.length > 0) await this.deps.primitives().trash(toTrash, { byRule: true });
  }

  private invalidLinkedCardIds(): string[] {
    return battleAreaPermanents(this.deps.state).flatMap((permanent) => {
      const host = linkHostOf(this.deps.continuous, permanent);
      if (host === undefined) return [];
      return permanent.linked.filter((card) => !linkRequirementSatisfied(host, card)).map((card) => card.instanceId);
    });
  }

  /**
   * §17-1-3-2-2 predicate — a PURE Option-kind battle-area permanent (no Digimon/DigiEgg
   * kind of its own) NOT placed there by an effect. `placedByEffect` (packages/shared/
   * src/schema/Permanent.ts) is the marker; a normal Option play never reaches
   * `placePermanent` (it resolves as a one-shot use, not a field placement), so a pure
   * Option permanent existing at all is either effect-placed (exempt) or an illegal state
   * this sweep exists to clean up. Excludes DUAL Digimon/Option cards (e.g. BT25-104
   * "ShineGreymon: Burst Mode", `kinds: ["Digimon","Option"]`): those are legitimately on
   * the battle area as a DIGIMON via a normal digivolution, not "an Option card in the
   * battle area" — the printed Option side is a second, separately-activated use mode on
   * the same card, not a distinct permanent placement §17-1-3-2-2 is aimed at.
   */
  anyOptionInBattleArea(): boolean {
    return battleAreaPermanents(this.deps.state).some(
      (p) =>
        p.topCard !== undefined && isOption(definitionOf(p.topCard)) && !isDigimonOrDigiEgg(p) && !p.placedByEffect,
    );
  }

  /** §17-1-3-2-2 process — trash every non-effect-placed pure-Option permanent; this is not a deletion (Q1921). */
  async trashOptionsInBattleArea(): Promise<void> {
    const ids = battleAreaPermanents(this.deps.state)
      .filter(
        (p) =>
          p.topCard !== undefined && isOption(definitionOf(p.topCard)) && !isDigimonOrDigiEgg(p) && !p.placedByEffect,
      )
      .map((p) => p.permanentId);
    if (ids.length > 0) await this.deps.primitives().trashPermanentByRule(ids);
  }
}
