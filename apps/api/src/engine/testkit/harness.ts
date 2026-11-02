import { expect } from "vitest";
import {
  buildInstance,
  buildPermanent,
  layBoard,
  createBoardIds,
  type BoardSpec,
  type PermanentSpec,
  type CardSpec,
  type AliasTable,
} from "../scenario/board.js";

import {
  GameState,
  PlayerState,
  CardInstance,
  Permanent,
  Phase,
  Zone,
  effectiveExactNames,
  getCardDefinition,
  type Seat,
  type ServerEvent,
  type DecisionRequest,
} from "@aegis/shared";
import { GameEngine, type GameEngineHooks } from "../GameEngine.js";
import { peekCheckedCard } from "../security/checkedCard.js";
import { makeRng, seatSeed } from "#api/engine/setup";
import { fillZone, insertCard, placePermanent, setTopCard, type CardZone } from "../state/access.js";
import { internalsOf } from "./internals.js";

export {
  makeInstance,
  makeDigimon,
  makeSecurityCard,
  type BoardSpec,
  type SeatSpec,
  type PermanentSpec,
  type CardSpec,
} from "../scenario/board.js";

/**
 * Shared test harness for engine behavioral suites (A3 mechanic tests, KB conformance
 * chapter tests, and any future suite driving the real `GameEngine`). Extracted verbatim
 * from `mechanic.test.ts` (board-builder + engine-setup helpers) and
 * `security/securityCheck.test.ts` (subsystem-level security-state builders) — see the
 * pilot migration of `mechanic.test.ts` for the behavior-preservation proof: all of its
 * pre-existing tests pass unchanged against these exports.
 */

export interface EngineSetup {
  engine: GameEngine;
  state: GameState;
  events: ServerEvent[];
  decisions: { seat: Seat; req: DecisionRequest }[];
  /** The permanent an alias names, resolved fresh — survives digivolve and DNA merge. */
  perm(alias: string): Permanent;
  /** The card instance an alias names, resolved fresh across zones. */
  inst(alias: string): CardInstance;
  /** Add a card to a loose zone mid-test, through the Mutation Seam. */
  give(seat: Seat, zone: CardZone, card: CardSpec): CardInstance;
  /** Put a permanent on the battle area mid-test. */
  putOnBoard(seat: Seat, spec: PermanentSpec | string): Permanent;
  /**
   * Install continuous effects after arranging the board, turn, and phase. `setupEngine`
   * does not recompute them; await this before the first intent when the scenario needs
   * a hand-laid board's auras, replacements, or event watchers.
   */
  ready(): Promise<void>;
}

export interface SetupEngineOptions {
  /** Use the same semantic identities as room fixtures. Set by setupScenario. */
  fixtureIds?: boolean;
  autoAcceptOptional?: boolean;
  /**
   * Answer every "use this effect?" prompt with no — the declined branch. Also answers a
   * zero-floor card selection with nothing, because a clause gated only by a hand-payable
   * cost raises that selection INSTEAD of a separate prompt, and picking nothing is how it
   * is refused. An optional modal's combined `chooseOption` (one carrying `declineIndex`) is
   * answered with its decline entry, ahead of `autoChooseOption`. Mutually exclusive in practice with `autoAcceptOptional` (a test wants one
   * behavior or the other per run); setting both answers whichever the engine asks first and
   * leaves the rest to the first flag that matches, so pass exactly one.
   */
  autoDeclineOptional?: boolean;
  autoSelectCards?: boolean;
  autoChooseOption?: boolean;
  /**
   * Answer an `orderTriggers` decision (simultaneous same-timing effects that need a resolve
   * order) by keeping the engine's own offered order. Enabled by default because every
   * mandatory trigger requires confirmation in production; pass `false` only when a test
   * explicitly asserts the pending `orderTriggers` decision itself.
   */
  autoOrderTriggers?: boolean;
  /**
   * Bias `autoOrderTriggers`' answer: the first offered trigger whose KEY or whose source CARD ID
   * contains one of these substrings is put first instead of the engine's own first key. The card
   * id is the only handle a test has on a SubTrigger watcher, whose key is an opaque subscription
   * id. Lets a test name the branch
   * it wants (a specific card's would-leave replacement, say) without turning off the
   * auto-responder and hand-answering every prompt in the flow. No match leaves the offered
   * order alone, so adding this never changes an unrelated prompt.
   */
  preferTriggerKeys?: string[];
  /** Keep an `orderCards` request in offered order by default; pass false to inspect/reorder it manually. */
  autoOrderCards?: boolean;
  /**
   * Bias `autoSelectCards`'s pick toward these instance ids: when a capped `selectCards`/
   * `chooseTargets` decision's candidates include one, it sorts first, so a count:1 (or
   * otherwise capped) selection lands on a specific board permanent/card instead of an
   * arbitrary candidate. A live array — populate it with `s.perm(alias).topCard.instanceId` /
   * `s.inst(alias).instanceId` after `setupEngine` returns (aliases resolve immediately) and
   * before the intent that triggers the decision. Falls back to candidate order untouched.
   */
  preferInstanceIds?: string[];
  /**
   * Refuse the one offer whose prompt contains any of these substrings: an `optional` prompt
   * is answered no, and a zero-floor (`min: 0`) card selection is answered with nothing,
   * before `autoAcceptOptional`/`autoSelectCards` get to accept. A blanket auto-accept takes
   * every offer in the flow, including ones a test isn't about — CR §4-19 ＜Arts Digivolve＞,
   * say, which replaces a used DUAL card's pending trash and so moves the card a trash
   * assertion is watching. Naming the prompt refuses that one offer and leaves every other
   * decision in the flow answered as before.
   */
  declinePrompts?: string[];
  /**
   * Answer every DigiXros material picker (a `selectCards` carrying `digiXrosCardId`) with no
   * cards. Every effect play now offers DigiXros (§7-2-2-13), so a blanket `autoSelectCards`
   * would otherwise place any legal hand or field card under the played Digimon.
   */
  declineDigiXros?: boolean;
  /**
   * Answer a `chooseOption` decision with this option index instead of `autoChooseOption`'s
   * default of 0 — for a card whose intended (or asserted) branch isn't the first-listed one.
   */
  preferOptionIndex?: number;
  /**
   * Observe every ServerEvent as it is emitted, synchronously, before the engine continues.
   * The `events` array only lets a test look at state AFTER the flow it was watching has
   * finished, which cannot see a value that exists only during a battle (an ＜Alliance＞ DP
   * bonus, say). This hook is the read seam for those: it runs inside the engine's own call
   * stack, so the board it reads is the board at that instant. Observation only — an
   * implementation that mutates state or throws corrupts the flow it is watching.
   */
  onEvent?(event: ServerEvent): void;
}

/**
 * Seat both players on empty staged decks and lay the board by hand. `autoAcceptOptional`
 * answers "use this effect?" prompts with yes (`autoDeclineOptional` answers no);
 * `autoSelectCards` answers a card-selection prompt by taking the maximum allowed from the
 * candidate set; `autoChooseOption` picks option index 0 for a `chooseOption` prompt;
 * `autoOrderTriggers` keeps the engine's offered order for a simultaneous-trigger prompt —
 * all on a microtask so a chain of prompts resolves without a manual respondDecision per step.
 */
/** The seat whose zones hold `instanceId`, or `undefined` when no zone does. */
function instanceOwnerSeat(state: GameState, instanceId: string): Seat | undefined {
  for (const [index, player] of state.players.entries()) {
    const zones = [player.hand, player.deck, player.trash, player.security, player.eggDeck];
    if (zones.some((zone) => zone.some((card) => card.instanceId === instanceId))) return index as Seat;
    const onField = player.battleArea.some(
      (permanent) =>
        permanent.topCard?.instanceId === instanceId ||
        permanent.stack.some((card) => card.instanceId === instanceId) ||
        permanent.linked.some((card) => card.instanceId === instanceId),
    );
    if (onField) return index as Seat;
  }
  return undefined;
}

function isBoardSpec(value: BoardSpec | SetupEngineOptions | undefined): value is BoardSpec {
  return value !== undefined && ("0" in value || "1" in value);
}

/**
 * Seat both players, lay the board from a Board Spec, and hand back the Test Seam.
 *
 * Arrange with the Board Spec, act through Intents, observe through the returned
 * affordances. Reaching past this into `GameEngine` fails `testkitSeam.guard.test.ts`.
 *
 * `autoAcceptOptional` answers "use this effect?" prompts with yes; `autoSelectCards`
 * answers a card-selection prompt by taking the maximum allowed from the candidate set;
 * `autoChooseOption` picks option index 0. `autoOrderTriggers` defaults to true and confirms
 * the first offered trigger; pass false to inspect that decision manually. All responders run
 * on a microtask so a chain of prompts resolves without a manual respondDecision per step.
 */
export function setupEngine(board?: BoardSpec, opts?: SetupEngineOptions): EngineSetup;
export function setupEngine(opts?: SetupEngineOptions): EngineSetup;
export function setupEngine(boardOrOpts?: BoardSpec | SetupEngineOptions, maybeOpts?: SetupEngineOptions): EngineSetup {
  const board = isBoardSpec(boardOrOpts) ? boardOrOpts : undefined;
  const opts = isBoardSpec(boardOrOpts) ? maybeOpts : (boardOrOpts as SetupEngineOptions | undefined);
  const state = new GameState();
  const events: ServerEvent[] = [];
  const decisions: EngineSetup["decisions"] = [];
  let engineRef: GameEngine | undefined;
  const hooks: GameEngineHooks = {
    seed: 1,
    requestDecision: (seat, req) => {
      decisions.push({ seat, req });
      const promptRefused =
        (opts?.declinePrompts ?? []).some((prompt) => (req.promptText ?? "").includes(prompt)) ||
        (opts?.declineDigiXros === true && req.kind === "selectCards" && req.options?.digiXrosCardId !== undefined);
      // An optional modal asks "which option, or don't use?" as one `chooseOption`; its
      // decline entry answers it exactly as "no" answers an `optional` prompt.
      const declineIndex = req.kind === "chooseOption" ? req.options?.declineIndex : undefined;
      const declined =
        (promptRefused &&
          (req.kind === "optional" ||
            declineIndex !== undefined ||
            // An accepted "you may" pick already answered its question; its zero floor is no prompt.
            ((req.kind === "selectCards" || req.kind === "chooseTargets") &&
              (req.options?.min ?? 0) === 0 &&
              req.options?.purpose !== "acceptedOptional"))) ||
        (opts?.autoDeclineOptional === true &&
          (declineIndex !== undefined || req.options?.purpose === "optionalTarget"));
      if (declined) {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response:
              req.kind === "optional"
                ? { kind: "optional", accept: false }
                : declineIndex !== undefined
                  ? { kind: "chooseOption", optionIndex: declineIndex }
                  : req.kind === "selectCards"
                    ? { kind: "selectCards", instanceIds: [] }
                    : { kind: "chooseTargets", instanceIds: [] },
          }),
        );
      }
      if (!declined && opts?.autoAcceptOptional && req.kind === "optional") {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "optional", accept: true },
          }),
        );
      }
      if (!declined && opts?.autoDeclineOptional && req.kind === "optional") {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "optional", accept: false },
          }),
        );
      }
      // A clause gated only by a cost the controller pays from their own hand has no separate
      // "use this effect?" prompt: choosing no card IS the refusal (see `costIsAskedAsSelection`).
      // So a test that declines answers whichever of the two the engine actually raises. Only a
      // selection drawn entirely from the responder's OWN hand, for a source card the responder
      // also owns, is that cost. Any other zero-floor selection — a target question ("choose up
      // to 1 Digimon"), or an opponent-directed one ("your opponent may trash 1 card") — is not,
      // and swallowing it here would reject the test's own response or answer for the opponent.
      const sourceIsOwnedByResponder =
        req.sourceInstanceId === undefined ||
        // A card mid-play sits in no zone, so an unlocatable source is not evidence of the
        // opponent's ownership — only a source found in the OTHER seat's zones is.
        (instanceOwnerSeat(state, req.sourceInstanceId) ?? seat) === seat;
      const isHandCostSelection =
        req.kind === "selectCards" &&
        (req.options?.min ?? 1) === 0 &&
        // An accepted "you may" pick (a paid evolution's destination) is no cost to refuse.
        req.options?.purpose !== "acceptedOptional" &&
        (req.options?.candidateInstanceIds?.length ?? 0) > 0 &&
        sourceIsOwnedByResponder &&
        req.options!.candidateInstanceIds!.every((instanceId) =>
          state.players[seat]?.hand.some((card) => card.instanceId === instanceId),
        );
      if (opts?.autoDeclineOptional && isHandCostSelection) {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "selectCards", instanceIds: [] },
          }),
        );
      }
      if (opts?.autoOrderTriggers !== false && req.kind === "orderTriggers") {
        const triggerKeys = req.options?.triggerKeys ?? [];
        const triggerCardIds = req.options?.triggerCardIds ?? [];
        const wantedKeys = opts?.preferTriggerKeys ?? [];
        const preferredIndex = triggerKeys.findIndex(
          (key, index) =>
            wantedKeys.some((wanted) => key.includes(wanted)) ||
            wantedKeys.some((wanted) => (triggerCardIds[index] ?? "").includes(wanted)),
        );
        const preferred = preferredIndex === -1 ? undefined : triggerKeys[preferredIndex];
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "orderTriggers", order: preferred === undefined ? triggerKeys.slice(0, 1) : [preferred] },
          }),
        );
      }
      if (opts?.autoOrderCards !== false && req.kind === "orderCards") {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "orderCards", order: req.options?.candidateInstanceIds ?? [] },
          }),
        );
      }
      if (!declined && opts?.autoSelectCards && (req.kind === "selectCards" || req.kind === "chooseTargets")) {
        const candidates = req.options?.candidateInstanceIds ?? [];
        // Bias toward `preferInstanceIds`: when a capped selection's candidates include one,
        // pick it first so the effect lands on the asserted/intended target, not an arbitrary
        // candidate. Falls back to candidate order.
        const prefer = opts?.preferInstanceIds ?? [];
        const ordered = [...candidates].sort((a, b) => {
          const preferred = (id: string): boolean => {
            if (prefer.includes(id)) return true;
            // `selectCards` candidates are exact loose-card identities. Expanding one
            // through its host would make every sibling in that stack equally preferred.
            // `chooseTargets` may instead expose a permanent id for a preferred top card.
            if (req.kind === "selectCards") return false;
            const permanent = findPermanentForDecisionId(state, id);
            return permanent?.topCard !== undefined && prefer.includes(permanent.topCard.instanceId);
          };
          const pa = preferred(a) ? 0 : 1;
          const pb = preferred(b) ? 0 : 1;
          if (pa !== pb) return pa - pb;
          // Suspending an already suspended Digimon is legal (Q1782) but a no-op, so a
          // stand-in player only picks one when it prefers it or nothing else is left.
          const alreadySuspended = (id: string): number =>
            req.options?.targetFate === "suspend" && findPermanentForDecisionId(state, id)?.isSuspended ? 1 : 0;
          return alreadySuspended(a) - alreadySuspended(b);
        });
        // A malformed/NaN `max` (e.g. a compiled action with an unset materials.count) must not
        // collapse the selection to empty: Array.prototype.slice treats a NaN end as 0.
        const rawMax = req.options?.max;
        const cap = typeof rawMax === "number" && Number.isFinite(rawMax) ? rawMax : ordered.length;
        const visibleCardIds = new Map((req.options?.visibleCards ?? []).map((card) => [card.instanceId, card.cardId]));
        // The deciding seat's own hand is already visible to it, so the request may omit it from
        // `visibleCards`. The server resolves the same identities when it validates a
        // `distinctNames` selection, so the name lookup has to see them too; `visibleCardIds`
        // stays as offered, because every other rule here reads only what the prompt revealed.
        const nameCardIds = new Map([
          ...(state.players[seat]?.hand ?? []).map((card): [string, string] => [card.instanceId, card.cardId]),
          ...visibleCardIds,
        ]);
        const ids: string[] = [];
        const selectedCardIds = new Set<string>();
        const selectedNames = new Set<string>();
        let selectedDP = 0;
        for (const instanceId of ordered) {
          if (ids.length >= cap) break;
          const cardId = visibleCardIds.get(instanceId);
          if (req.options?.distinctCardIds === true && (cardId === undefined || selectedCardIds.has(cardId))) continue;
          const nameCardId = nameCardIds.get(instanceId);
          const nameDefinition = nameCardId === undefined ? undefined : getCardDefinition(nameCardId);
          const names =
            req.options?.distinctNames === true && nameDefinition !== undefined
              ? effectiveExactNames(nameDefinition).map((name) => name.toLowerCase())
              : [];
          if (req.options?.distinctNames === true) {
            if (nameDefinition === undefined || names.some((name) => selectedNames.has(name))) continue;
          }
          if (req.kind === "chooseTargets" && req.options?.maxTotalDP !== undefined) {
            const permanent = findPermanentForDecisionId(state, instanceId);
            if (permanent === undefined || selectedDP + permanent.currentDP > req.options.maxTotalDP) continue;
            selectedDP += permanent.currentDP;
          }
          ids.push(instanceId);
          if (cardId !== undefined) selectedCardIds.add(cardId);
          for (const name of names) selectedNames.add(name);
        }
        const response =
          req.kind === "selectCards"
            ? { kind: "selectCards" as const, instanceIds: ids }
            : { kind: "chooseTargets" as const, instanceIds: ids };
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response,
          }),
        );
      }
      if (
        !declined &&
        (opts?.autoChooseOption || opts?.preferOptionIndex !== undefined) &&
        req.kind === "chooseOption"
      ) {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "chooseOption", optionIndex: opts?.preferOptionIndex ?? 0 },
          }),
        );
      }
      if (
        req.kind === "chooseOption" &&
        req.options?.choices?.length !== undefined &&
        req.options.choices.length > 1 &&
        req.options.choices.every((choice) => /^\d+ cards?$/.test(choice))
      ) {
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "chooseOption", optionIndex: 0 },
          }),
        );
      }
    },
    emit: (e) => {
      events.push(e);
      opts?.onEvent?.(e);
    },
  };
  const engine = new GameEngine(state, hooks);
  // Arranged boards skip runSetup, which normally installs these match streams.
  const random = [makeRng(seatSeed(hooks.seed, 0)), makeRng(seatSeed(hooks.seed, 1))];
  engine.rngForSeat = (seat) => random[seat]!;
  engineRef = engine;
  engine.seatPlayer(0, "sa", { displayName: "A", deck: { mainDeck: [], eggDeck: [] } });
  engine.seatPlayer(1, "sb", { displayName: "B", deck: { mainDeck: [], eggDeck: [] } });
  state.phase = Phase.Main;
  state.turnSeat = 0;

  const aliases: AliasTable = new Map();
  if (board !== undefined)
    layBoard(state, board, aliases, opts?.fixtureIds ? { ...createBoardIds("scenario-"), named: true } : undefined);
  // A seeded link card carries printed `linkDp` that only reaches `currentDP` through
  // `ModifierLedger.recomputeDP` (CR 4-2-4), which nothing runs for a hand-laid board — so a
  // Board Spec with links used to start on a DP baseline no real board ever has. This is the
  // narrow DP refresh, not the continuous recompute the comment below deliberately withholds.
  for (const seat of [0, 1] as const) {
    for (const permanent of state.players[seat]?.battleArea ?? []) {
      if (!opts?.fixtureIds && permanent.linked.length > 0)
        internalsOf(engine).modifiers.recomputeDP(state, permanent.permanentId);
    }
  }
  // Deliberately NOT recomputed here. A hand-laid board has no continuous effects installed
  // until something recomputes, which is why a hand card's colour waiver and a `[Your Turn]`
  // watcher look absent to a test's first intent — three failures were misdiagnosed as engine
  // bugs before that was understood. But recomputing at setup is worse: it installs state at a
  // moment the test has not finished arranging (turn, phase, extra permanents), and that state
  // then persists until the next recompute, which silently breaks negative controls such as
  // `continuousColor.test.ts`'s "on the opponent's turn the grant is absent". Measured: 27
  // tests regress. A test that needs an arranged board to behave like a played one awaits
  // `ready()` once its arrangement is complete.

  const lookup = (alias: string) => {
    const entry = aliases.get(alias);
    expect(entry, `alias "${alias}" is not declared in the Board Spec`).toBeDefined();
    return entry as { kind: "permanent" | "instance"; id: string; instanceId?: string };
  };

  const setup: EngineSetup = {
    engine,
    state,
    events,
    decisions,
    perm(alias) {
      const entry = lookup(alias);
      const found =
        entry.kind === "permanent"
          ? findPermanentById(state, entry.id)
          : findPermanentContainingInstance(state, entry.id);
      expect(found, `permanent for "${alias}" (${entry.id}) is no longer on the board`).toBeDefined();
      return found as Permanent;
    },
    inst(alias) {
      const entry = lookup(alias);
      const id = entry.kind === "instance" ? entry.id : entry.instanceId!;
      const found = findInstanceById(state, id);
      expect(found, `card "${alias}" (${id}) is no longer in the match`).toBeDefined();
      return found as CardInstance;
    },
    give(seat, zone, card) {
      const player = state.players[seat] as PlayerState;
      const instance = buildInstance(card, seat, zone === Zone.Hand || zone === Zone.Trash, aliases);
      insertCard(player, zone, instance);
      return instance;
    },
    async ready() {
      await engine.recomputeContinuousEffects();
    },
    putOnBoard(seat, spec) {
      const player = state.players[seat] as PlayerState;
      const permanent = buildPermanent(spec, seat, aliases);
      placePermanent(player, permanent);
      return permanent;
    },
  };
  return setup;
}

function findPermanentById(state: GameState, permanentId: string): Permanent | undefined {
  for (const player of state.players) {
    const onBoard = player.battleArea.find((p) => p.permanentId === permanentId);
    if (onBoard !== undefined) return onBoard;
    if (player.breeding?.permanentId === permanentId) return player.breeding;
  }
  return undefined;
}

function findInstanceById(state: GameState, instanceId: string): CardInstance | undefined {
  // A card being checked from security has no area while its check resolves (CR 13-1-6); it
  // is still in the match, so a test predicate polling `inst()` mid-check must find it.
  const checked = peekCheckedCard(state, instanceId);
  if (checked !== undefined) return checked.card;
  for (const player of state.players) {
    for (const zone of [player.hand, player.deck, player.eggDeck, player.trash, player.security, player.delayZone]) {
      const found = zone.find((card) => card.instanceId === instanceId);
      if (found !== undefined) return found;
    }
    for (const permanent of player.battleArea) {
      if (permanent.topCard?.instanceId === instanceId) return permanent.topCard;
      const inStack = permanent.stack.find((card) => card.instanceId === instanceId);
      if (inStack !== undefined) return inStack;
      const inLinked = permanent.linked.find((card) => card.instanceId === instanceId);
      if (inLinked !== undefined) return inLinked;
    }
    const breeding = player.breeding;
    if (breeding?.topCard?.instanceId === instanceId) return breeding.topCard;
    const breedingStack = breeding?.stack.find((card) => card.instanceId === instanceId);
    if (breedingStack !== undefined) return breedingStack;
    const breedingLinked = breeding?.linked.find((card) => card.instanceId === instanceId);
    if (breedingLinked !== undefined) return breedingLinked;
  }
  return undefined;
}

function findPermanentContainingInstance(state: GameState, instanceId: string): Permanent | undefined {
  for (const player of state.players) {
    for (const permanent of [...player.battleArea, ...(player.breeding === undefined ? [] : [player.breeding])]) {
      if (
        permanent.topCard?.instanceId === instanceId ||
        permanent.stack.some((card) => card.instanceId === instanceId) ||
        permanent.linked.some((card) => card.instanceId === instanceId)
      ) {
        return permanent;
      }
    }
  }
  return undefined;
}

function findPermanentForDecisionId(state: GameState, id: string): Permanent | undefined {
  for (const player of state.players) {
    const permanent = [...player.battleArea, ...(player.breeding === undefined ? [] : [player.breeding])].find(
      ({ permanentId }) => permanentId === id,
    );
    if (permanent !== undefined) return permanent;
  }
  return findPermanentContainingInstance(state, id);
}

/**
 * Tick the microtask queue until a predicate holds (bounded). Omit the predicate (or pass
 * `() => false`) to just flush pending microtasks for `maxTicks` iterations.
 *
 * Only the drain-only form tolerates exhausting the bound; a real predicate that never holds
 * throws.
 *
 * The bound exists to stop a never-satisfied predicate hanging the suite, not to assert how
 * many ticks a flow costs — so it is set generously. It was raised from 200 when combat
 * suspension gained its `whenSuspended` fire (each fire trails a continuous recompute), which
 * pushed the attack flow past the old bound and failed several tests that were in fact correct.
 *
 * Do NOT floor or globally raise per-call `maxTicks`: under `autoSelectCards` a longer drain
 * auto-answers decisions it reaches, so a predicate-less settle's observed state genuinely
 * depends on its tick budget. When a legitimate change makes flows cost more ticks (the
 * per-family action dispatch added one promise hop per action), raise the budgets of the
 * specific tests that outgrew theirs.
 */
/**
 * Tick the microtask queue until `predicate` holds, or `maxTicks` elapse. The predicate is read
 * for truthiness, so an optional-chained probe that can yield `undefined` is a legal predicate.
 *
 * A predicate that never holds throws instead of returning quietly: a silent timeout turns a
 * test into a passing assertion about nothing. The drain-only form — no predicate, or the
 * literal `() => false` that reads as "just run the queue" — is the one exception, and
 * {@link drainMicrotasks} states that intent without the sentinel.
 */
export async function settle(predicate: () => boolean | undefined = neverHolds, maxTicks = 500): Promise<void> {
  const held = await tickUntil(predicate, maxTicks);
  if (held) return;
  if (isDrainSentinel(predicate)) return;
  throw new Error(
    `settle: predicate never held within ${maxTicks} ticks (${maxTicks * 10} microtask polls). ` +
      `Predicate: ${String(predicate).replace(/\s+/g, " ").slice(0, 300)}. ` +
      "If the flow legitimately needs more ticks, raise this call's maxTicks; if the milestone " +
      "lies past a timer boundary use settleAcrossTimers; if you only meant to run the queue " +
      "use drainMicrotasks.",
  );
}

/** Run the microtask queue for `maxTicks` iterations without asserting any milestone. */
export async function drainMicrotasks(maxTicks = 500): Promise<void> {
  await tickUntil(neverHolds, maxTicks);
}

function neverHolds(): boolean {
  return false;
}

function isDrainSentinel(predicate: () => boolean | undefined): boolean {
  return predicate === neverHolds || String(predicate).replace(/\s+/g, "") === "()=>false";
}

async function tickUntil(predicate: () => boolean | undefined, maxTicks: number): Promise<boolean> {
  // Awaiting the same fulfilled promise still yields one microtask per tick, without
  // allocating another promise for every step of the drain.
  const tick = Promise.resolve();
  for (let i = 0; i < maxTicks * 10; i++) {
    await tick;
    if (predicate()) {
      // A production action may publish its observable milestone before the final action in
      // the same effect continuation (P-130 suspends before its trailing GainMemory). Give
      // that continuation one turn through the microtask queue before callers inspect state.
      await new Promise<void>((resolve) => setImmediate(resolve));
      for (let flush = 0; flush < 20; flush += 1) await tick;
      return true;
    }
  }
  return false;
}

/**
 * Like {@link settle}, but also lets TIMER callbacks run between polls.
 *
 * `settle` only drains the microtask queue. A turn loop parks on `setTimeout` between its
 * phases, so a milestone reached on the other side of a phase boundary — an end-of-turn
 * decision, say — is invisible to `settle` however long it spins. Returns as soon as the
 * predicate holds, so a test that also wants `settle`'s trailing flush should follow with one.
 */
export async function settleAcrossTimers(predicate: () => boolean | undefined, maxRounds = 200): Promise<void> {
  for (let round = 0; round < maxRounds; round += 1) {
    await tickUntil(predicate, 5);
    if (predicate() === true) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

export function findPermanent(s: EngineSetup, seat: Seat, cardId: string): Permanent {
  const permanent = (s.state.players[seat] as PlayerState).battleArea.find((p) => p.topCard?.cardId === cardId);
  expect(permanent, `permanent ${cardId} on seat ${seat}`).toBeDefined();
  return permanent as Permanent;
}

/**
 * The loud-gap detector. A play/digivolve continuation that throws UnsupportedEffectError
 * is caught at GameEngine.ts's intent-apply catch and re-emitted as an `actionRejected`
 * event carrying the error message. Any such event means a mechanic hit an unwired
 * interpreter branch.
 */
export function assertNoLoudGap(s: EngineSetup): void {
  const gap = s.events.find((e) => e.kind === "actionRejected" && "reason" in e && /Unsupported effect/.test(e.reason));
  expect(gap && "reason" in gap ? gap.reason : undefined).toBeUndefined();
}

/**
 * GameState with a defender (`seat 1`) holding `securityCards.length` security cards and
 * an attacker permanent controlled by seat 0. implemented from `securityCheck.test.ts`'s
 * `makeState`, renamed for clarity now that it lives alongside the board-builder helpers
 * above (a `makeState` next to `makeInstance`/`makeDigimon` would read as if it built a
 * generic engine state, not the security-check-specific fixture it actually is).
 */
export function makeSecurityState(securityCards: CardInstance[], attackerPermanentId: string): GameState {
  const state = new GameState();
  for (const seat of [0, 1] as Seat[]) {
    const player = new PlayerState();
    player.seat = seat;
    state.players[seat] = player;
  }
  const defender = state.players[1];
  if (defender) fillZone(defender, Zone.Security, securityCards);

  const attacker = new Permanent();
  attacker.permanentId = attackerPermanentId;
  attacker.controllerSeat = 0;
  const top = new CardInstance();
  top.instanceId = "attacker-top";
  top.cardId = "BT15-002";
  top.ownerSeat = 0;
  setTopCard(attacker, top);
  const attackerController = state.players[0];
  if (attackerController) placePermanent(attackerController, attacker);
  return state;
}
