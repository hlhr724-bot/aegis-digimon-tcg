import type { DecisionManagerState } from "#api/engine/decisions/DecisionManagerState";
import { decodeTriggerResolutionPlan } from "@aegis/shared/protocol/decodeTriggerResolutionPlan";
import {
  type DecisionRequest,
  type DecisionResponse,
  type GameState,
  type Seat,
  PendingDecision,
  effectiveExactNames,
  getCardDefinition,
} from "@aegis/shared";
import { decisionCardIdentities } from "./visibleIdentities.js";

/**
 * Pending player-decision queue: the coroutine replacement (ARCHITECTURE.md
 * section 5; subsystem: intent-protocol-and-room).
 *
 * Server-authoritative port of the source "ask the player, then block until they
 * answer" pattern. In the documented rules an effect coroutine raises a prompt and then
 * `yield return new WaitUntil(() => player.HasPlayerSelection())`; an incoming
 * network transport RPC (`OptionalSkill.SetUseOptional`, `MultipleSkills.SetTargetSkill`)
 * calls `player.QueuePlayerSelection(...)`, and the coroutine resumes by dequeuing
 * it (documented behavior 134-145; documented behavior 425-436).
 *
 * Here there is no UI to block on, so:
 *   - `request(...)` allocates a decisionId, mirrors it into `state.pendingDecision`
 *     (so the wire contract's "only respondDecision is accepted while a decision is
 *     open" gate works), sends the DecisionRequest to the deciding seat, and returns
 *     a Promise that the awaiting effect code holds.
 *   - `respond(...)` is called by the engine when a `respondDecision` intent arrives;
 *     it validates the seat + decisionId, clears `pendingDecision`, and resolves the
 *     promise — the effect resumes exactly where it paused.
 *   - a per-decision timer auto-resolves a stalled decision with a safe default
 *     (decline / empty selection) so one client cannot freeze the match
 *     (API-CONTRACT.md section 7).
 *
 * Only one decision is open at a time (the documented rules resolves effects strictly one-by-one;
 * `MultipleSkills` never has two outstanding `WaitUntil`s). `request` therefore
 * rejects if called while another decision is pending — a programming error in the
 * resolver, surfaced loudly rather than silently dropped.
 */

/** A single in-flight decision awaiting its seat's response. */
interface OpenDecision {
  decisionId: string;
  seat: Seat;
  kind: DecisionRequest["kind"];
  /** `min`/`candidateInstanceIds` offered, if any — see {@link satisfiesMin}. */
  min: number | undefined;
  candidateInstanceIds: readonly string[] | undefined;
  /** The pick of an accepted "you may": empty backs out, so a non-empty answer must name an offered card. */
  allowedTargetCombinations: readonly (readonly string[])[] | undefined;
  backsOutOnlyWhenEmpty: boolean;
  distinctCardIds: boolean;
  distinctNames: boolean;
  cardIdByInstance: ReadonlyMap<string, string>;
  /** Trigger identities offered by an `orderTriggers` decision. */
  triggerKeys: readonly string[] | undefined;
  /** Whether the `orderTriggers` decision takes a full resolution plan instead of one key. */
  acceptsResolutionPlan: boolean;
  acceptsIndexedResolutionPlan: boolean;
  /** The `chooseOption` entry that declines an optional effect — the safe default when present. */
  declineIndex: number | undefined;
  resolve: (response: DecisionResponse) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Capabilities the manager needs from the room transport (injected by GameEngine). */
export interface DecisionTransport {
  /** Deliver a DecisionRequest to the deciding seat (room unicasts it). */
  requestDecision(seat: Seat, req: DecisionRequest): void;
}

/** Options bounding decision lifetime. */
export interface DecisionManagerOptions {
  /** Live engine projection, captured before both synchronized payload and transport delivery. */
  pendingEffectCandidates?: (spec: DecisionSpec) => readonly string[];
  /**
   * Auto-resolve a stalled decision after this many ms with a safe default
   * (API-CONTRACT.md section 7). 0 / undefined disables the timer (tests resolve
   * synchronously). Defaults to {@link DEFAULT_DECISION_TIMEOUT_MS} in a server.
   */
  timeoutMs?: number;
}

/** Default turn timer for an open decision (server). */
export const DEFAULT_DECISION_TIMEOUT_MS = 60_000;

/** What the engine passes to open a decision. */
export interface DecisionSpec {
  seat: Seat;
  kind: DecisionRequest["kind"];
  promptText: string;
  options?: DecisionRequest["options"];
  sourceCardId?: string;
  sourceInstanceId?: string;
  sourcePermanentId?: string;
}

export class DecisionManager {
  private open: OpenDecision | undefined;
  private seq = 0;

  constructor(
    private readonly state: GameState,
    private readonly transport: DecisionTransport,
    private readonly options: DecisionManagerOptions = {},
  ) {}

  getRuntimeState(): DecisionManagerState {
    this.assertSnapshotBoundary();
    return { sequence: this.seq };
  }

  restoreRuntimeState(state: unknown): void {
    this.assertSnapshotBoundary();
    if (
      state === null ||
      typeof state !== "object" ||
      !("sequence" in state) ||
      typeof state.sequence !== "number" ||
      !Number.isSafeInteger(state.sequence) ||
      state.sequence < 0
    ) {
      throw new Error("Invalid decision sequence state");
    }
    this.seq = state.sequence;
  }

  private assertSnapshotBoundary(): void {
    if (this.open !== undefined || this.state.pendingDecision !== undefined) {
      throw new Error("Cannot snapshot or restore an open decision request");
    }
  }

  /** Is a decision currently awaiting a response? Mirrors `state.pendingDecision !== undefined`. */
  get hasPending(): boolean {
    return this.open !== undefined;
  }

  /** The seat that must answer the open decision, if any. */
  get pendingSeat(): Seat | undefined {
    return this.open?.seat;
  }

  /**
   * Raise a decision to `spec.seat` and await its response. Resolves when the
   * matching `respondDecision` arrives (via {@link respond}) or, after the timeout,
   * with a safe default for the decision kind.
   */
  request(spec: DecisionSpec): Promise<DecisionResponse> {
    if (this.open !== undefined) {
      const err = new Error(
        `DecisionManager.request called while decision "${this.open.decisionId}" is still open. ` +
          "Effects must resolve one decision at a time (see historical migration ledger).",
      );
      console.error("[DecisionManager] nested request trace:", err.stack);
      throw err;
    }

    this.seq += 1;
    const decisionId = `dec-${this.seq}`;

    let options = withCardIdentities(this.state, spec.seat, spec.options);
    if (options?.pendingEffectInstanceIds !== undefined) {
      options = { ...options };
      delete options.pendingEffectInstanceIds;
    }
    const pendingEffects = this.options.pendingEffectCandidates?.(spec) ?? [];
    if (pendingEffects.length > 0 && (options?.candidateInstanceIds?.length ?? 0) > 0) {
      const offered = new Set(options?.candidateInstanceIds ?? []);
      const visible = new Set(options?.visibleInstanceIds ?? options?.candidateInstanceIds ?? []);
      const readable = new Set(
        options?.visibleCards?.filter((card) => card.cardId.trim().length > 0).map((card) => card.instanceId) ?? [],
      );
      const trash = new Set(
        Array.from(this.state.players).flatMap((player) => player.trash.map((card) => card.instanceId)),
      );
      const pendingEffectInstanceIds = [...new Set(pendingEffects)].filter(
        (id) => offered.has(id) && visible.has(id) && readable.has(id) && trash.has(id),
      );
      if (pendingEffectInstanceIds.length) {
        options = { ...options, pendingEffectInstanceIds };
      }
    }
    const req: DecisionRequest = {
      decisionId,
      seat: spec.seat,
      kind: spec.kind,
      promptText: spec.promptText,
      ...(options !== undefined ? { options } : {}),
      ...(spec.sourceCardId !== undefined ? { sourceCardId: spec.sourceCardId } : {}),
      ...(spec.sourceInstanceId !== undefined ? { sourceInstanceId: spec.sourceInstanceId } : {}),
      ...(spec.sourcePermanentId !== undefined ? { sourcePermanentId: spec.sourcePermanentId } : {}),
    };

    // Mirror into synchronized state so the intent-validation gate ("only
    // respondDecision while a decision is open") and the client UI both see it.
    const pending = new PendingDecision();
    pending.decisionId = decisionId;
    pending.seat = spec.seat;
    pending.kind = spec.kind;
    pending.promptText = spec.promptText;
    pending.payloadJson = options !== undefined ? JSON.stringify(options) : "";
    this.state.pendingDecision = pending;

    return new Promise<DecisionResponse>((resolve) => {
      const timeoutMs = this.options.timeoutMs ?? 0;
      const timer =
        timeoutMs > 0
          ? setTimeout(
              () => this.resolveOpen(decisionId, safeDefault(spec.kind, spec.options?.declineIndex)),
              timeoutMs,
            )
          : undefined;

      this.open = {
        decisionId,
        seat: spec.seat,
        kind: spec.kind,
        min: spec.options?.min,
        candidateInstanceIds: spec.options?.candidateInstanceIds,
        allowedTargetCombinations: spec.options?.allowedTargetCombinations,
        backsOutOnlyWhenEmpty:
          spec.options?.purpose === "acceptedOptional" ||
          spec.options?.declinesCost === true ||
          spec.options?.canCancelActivation === true,
        distinctCardIds: spec.options?.distinctCardIds === true,
        distinctNames: spec.options?.distinctNames === true,
        cardIdByInstance: new Map([
          // The deciding player's hand is already visible to them, so enrichment may omit
          // it from visibleCards. Validation still needs its authoritative identities.
          ...(this.state.players[spec.seat]?.hand ?? []).map((card): [string, string] => [
            card.instanceId,
            card.cardId,
          ]),
          ...(options?.visibleCards ?? []).map((card): [string, string] => [card.instanceId, card.cardId]),
        ]),
        triggerKeys: spec.options?.triggerKeys,
        acceptsResolutionPlan: spec.options?.acceptsResolutionPlan === true,
        acceptsIndexedResolutionPlan: spec.options?.acceptsIndexedResolutionPlan === true,
        declineIndex: spec.options?.declineIndex,
        resolve,
        timer,
      };
      this.transport.requestDecision(spec.seat, req);
    });
  }

  /**
   * Apply a respondDecision intent. Returns true when it matched the open decision
   * (correct seat, correct decisionId, response kind consistent with the request)
   * and was accepted; false otherwise so the engine can reject the intent without
   * touching state. Mirrors the source guard in the RPC handlers that ignores a
   * selection for the wrong player (documented behavior).
   */
  respond(seat: Seat, decisionId: string, response: DecisionResponse): boolean {
    const open = this.open;
    if (open === undefined) return false;
    if (open.seat !== seat) return false;
    if (open.decisionId !== decisionId) return false;
    if (!hasValidResponseShape(response)) {
      return false;
    }
    if (!responseMatchesKind(open.kind, response)) return false;
    const normalized =
      response.kind === "orderTriggers"
        ? decodeTriggerResolutionPlan({
            response,
            triggerKeys: open.triggerKeys ?? [],
            supportsIndexes: open.acceptsResolutionPlan && open.acceptsIndexedResolutionPlan,
          })
        : response;
    if (normalized === undefined) {
      return false;
    }
    if (!satisfiesMin(open, normalized)) return false;
    if (!namesAnOfferedCardUnlessEmpty(open, normalized)) return false;
    if (!satisfiesAllowedTargetCombinations(open, normalized)) return false;
    if (!satisfiesDistinctCardIds(open, normalized)) return false;
    if (!satisfiesDistinctNames(open, normalized)) return false;
    if (!choosesOfferedTriggers(open, normalized)) return false;
    if (!ordersEveryCard(open, normalized)) return false;

    this.resolveOpen(decisionId, normalized);
    return true;
  }

  /**
   * Abandon any open decision (match ended / seat left). Resolves the awaiting
   * promise with a safe default so the paused resolver unwinds instead of leaking.
   */
  cancel(): void {
    if (this.open !== undefined) {
      this.resolveOpen(this.open.decisionId, safeDefault(this.open.kind, this.open.declineIndex));
    }
  }

  private resolveOpen(decisionId: string, response: DecisionResponse): void {
    const open = this.open;
    if (open === undefined || open.decisionId !== decisionId) return;
    if (open.timer !== undefined) clearTimeout(open.timer);
    this.open = undefined;
    this.state.pendingDecision = undefined;
    open.resolve(response);
  }
}

function hasValidResponseShape(response: DecisionResponse): boolean {
  if (typeof response !== "object" || response === null) {
    return false;
  }
  switch (response.kind) {
    case "chooseTargets":
    case "selectCards":
      return Array.isArray(response.instanceIds) && response.instanceIds.every((id) => typeof id === "string");
    case "orderCards":
      return Array.isArray(response.order) && response.order.every((id) => typeof id === "string");
    case "optional":
      return typeof response.accept === "boolean";
    case "chooseOption":
      return Number.isSafeInteger(response.optionIndex) && response.optionIndex >= 0;
    case "orderTriggers":
      return true;
    default:
      return false;
  }
}

function satisfiesAllowedTargetCombinations(open: OpenDecision, response: DecisionResponse): boolean {
  if (open.allowedTargetCombinations === undefined || response.kind !== "chooseTargets") {
    return true;
  }
  const selected = response.instanceIds;
  if (selected.length === 0 && (open.min === 0 || open.backsOutOnlyWhenEmpty)) {
    return true;
  }
  if (new Set(selected).size !== selected.length) {
    return false;
  }
  return open.allowedTargetCombinations.some(
    (combination) => combination.length === selected.length && combination.every((id) => selected.includes(id)),
  );
}

function satisfiesDistinctNames(open: OpenDecision, response: DecisionResponse): boolean {
  if (!open.distinctNames || response.kind !== "selectCards") return true;
  const seen = new Set<string>();
  for (const instanceId of response.instanceIds) {
    if (!open.candidateInstanceIds?.includes(instanceId)) return false;
    const cardId = open.cardIdByInstance.get(instanceId);
    const definition = cardId === undefined ? undefined : getCardDefinition(cardId);
    if (definition === undefined) return false;
    const names = effectiveExactNames(definition).map((name) => name.toLowerCase());
    if (names.some((name) => seen.has(name))) return false;
    for (const name of names) seen.add(name);
  }
  return true;
}

/** Reject forged selections containing two instances of the same printed card number. */
function satisfiesDistinctCardIds(open: OpenDecision, response: DecisionResponse): boolean {
  if (!open.distinctCardIds || response.kind !== "selectCards") return true;
  const allowed = new Set(open.candidateInstanceIds ?? []);
  const seen = new Set<string>();
  for (const instanceId of new Set(response.instanceIds)) {
    if (!allowed.has(instanceId)) continue;
    const cardId = open.cardIdByInstance.get(instanceId);
    if (cardId === undefined || seen.has(cardId)) return false;
    seen.add(cardId);
  }
  return true;
}

function ordersEveryCard(open: OpenDecision, response: DecisionResponse): boolean {
  if (response.kind !== "orderCards") return true;
  const candidates = open.candidateInstanceIds ?? [];
  return (
    response.order.length === candidates.length &&
    new Set(response.order).size === candidates.length &&
    response.order.every((id) => candidates.includes(id))
  );
}

/**
 * `orderTriggers` names the next effect to resolve. A plain prompt takes exactly one offered
 * key. A prompt that accepts a resolution plan also takes the planned order for the other
 * offered keys (no repeats) and yes/no presets for offered keys. Timeout and cancellation
 * defaults bypass `respond` and may still resolve with an empty order, which lets the
 * resolver apply its deterministic mandatory/optional fallback.
 */
function choosesOfferedTriggers(open: OpenDecision, response: DecisionResponse): boolean {
  if (response.kind !== "orderTriggers") return true;
  const offered = open.triggerKeys ?? [];
  const isOffered = (key: string): boolean => offered.includes(key);
  if (!open.acceptsResolutionPlan) {
    return response.order.length === 1 && isOffered(response.order[0]!) && response.optionalAnswers === undefined;
  }
  if (response.order.length === 0 || !response.order.every(isOffered)) return false;
  if (new Set(response.order).size !== response.order.length) return false;
  const answers: unknown = response.optionalAnswers ?? {};
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) return false;
  return Object.entries(answers).every(([key, accept]) => isOffered(key) && typeof accept === "boolean");
}

/**
 * A response is only accepted for a decision whose kind it answers. `mulligan`
 * requests are answered by their own dedicated intent (not respondDecision), so
 * they never match here. `optional` is answered by an `optional` response; the
 * selection kinds (`chooseTargets`/`selectCards`/`orderTriggers`/`chooseOption`)
 * by their like-named responses.
 */
function responseMatchesKind(kind: DecisionRequest["kind"], response: DecisionResponse): boolean {
  switch (kind) {
    case "optional":
      return response.kind === "optional";
    case "chooseTargets":
      return response.kind === "chooseTargets";
    case "selectCards":
      return response.kind === "selectCards";
    case "orderCards":
      return response.kind === "orderCards";
    case "orderTriggers":
      return response.kind === "orderTriggers";
    case "chooseOption":
      return response.kind === "chooseOption";
    case "mulligan":
      // Answered by a dedicated intent, not respondDecision.
      return false;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return false;
    }
  }
}

/**
 * Enforce the request's `min` lower bound on a `chooseTargets`/`selectCards`
 * response. `clampSelection` (decisionApi.ts) already re-derives the allowlist
 * and `max` server-side; `min` never reached that enforcement point, so a
 * client could answer a mandatory selection (e.g. "trash 2 of your cards")
 * with `[]` and the engine would treat it as a legitimate empty choice.
 *
 * The Comprehensive Rules resolve the general case (§15-10-2-1: "X number of
 * cards or as many cards up to X as possible must be chosen") and the
 * fundamental-principles fallback (§1-3-2: "the player performs as many of
 * the required actions as possible") — a mandatory selection is capped by how
 * many candidates actually exist, not refusable by choice. So the bound
 * enforced here is `min(open.min, candidateCount)`: a genuine shortage (fewer
 * candidates than `min`) is satisfied by picking all of them, while a client
 * that could have met `min` but didn't is rejected — the response is refused
 * (decision stays open) rather than silently accepted or auto-completed on
 * the player's behalf, matching how every other malformed-response case in
 * `respond` is handled (the existing per-decision timer is the stall backstop,
 * API-CONTRACT.md section 7).
 */
/**
 * An accepted "you may" pick takes an empty answer as a back-out. Without this check, an answer
 * naming only cards that were not offered would be sanitized into that same back-out instead
 * of being rejected so the seat can answer again.
 */
function namesAnOfferedCardUnlessEmpty(open: OpenDecision, response: DecisionResponse): boolean {
  if (!open.backsOutOnlyWhenEmpty) return true;
  if (response.kind !== "chooseTargets" && response.kind !== "selectCards") return true;
  if (response.instanceIds.length === 0) return true;
  const offered = new Set(open.candidateInstanceIds ?? []);
  return response.instanceIds.some((instanceId) => offered.has(instanceId));
}

function satisfiesMin(open: OpenDecision, response: DecisionResponse): boolean {
  if (open.min === undefined) return true;
  const ids = response.kind === "chooseTargets" || response.kind === "selectCards" ? response.instanceIds : undefined;
  if (ids === undefined) return true;

  if (ids.length === 0 && open.backsOutOnlyWhenEmpty) return true;
  const candidates = open.candidateInstanceIds ?? [];
  const requiredMin = Math.min(open.min, candidates.length);
  if (requiredMin <= 0) return true;

  const allowed = new Set(candidates);
  const validCount = new Set(ids.filter((id) => allowed.has(id))).size;
  return validCount >= requiredMin;
}

/**
 * The decision's options with every card the deciding seat cannot otherwise name added to
 * `visibleCards`. A card module that supplied its own entry keeps it — this only fills the
 * gaps, so the identities the client draws from stay the ones the engine published. See
 * {@link decisionCardIdentities} for which cards qualify and why the rest must not.
 */
function withCardIdentities(state: GameState, seat: Seat, options: DecisionSpec["options"]): DecisionSpec["options"] {
  if (options === undefined) return options;
  // An explicit visibility list can conceal otherwise known or previously face-up
  // candidates (Mirage BM). Do not enrich those blind selection handles.
  const offered = [
    ...(options.visibleInstanceIds ?? options.candidateInstanceIds ?? []),
    ...(options.visibleCards ?? []).map((card) => card.instanceId),
  ];
  if (offered.length === 0) return options;
  const identities = decisionCardIdentities(state, seat, offered);
  const identitiesById = new Map(identities.map((card) => [card.instanceId, card]));
  const existing = (options.visibleCards ?? []).map((card) => {
    const known = identitiesById.get(card.instanceId);
    return !card.artId && known?.cardId === card.cardId && known.artId ? { ...card, artId: known.artId } : card;
  });
  const alreadyNamed = new Set(existing.map((card) => card.instanceId));
  const filled = identities.filter((card) => !alreadyNamed.has(card.instanceId));
  return { ...options, visibleCards: [...existing, ...filled] };
}

/**
 * The safe default applied when a decision times out (or is cancelled). Declines
 * optional effects and selects nothing — the least-impactful choice, matching the
 * "decline optional / skip" rule (API-CONTRACT.md section 7). A `chooseOption` that carries a
 * decline entry is an optional prompt too, so it declines rather than taking the first option.
 */
function safeDefault(kind: DecisionRequest["kind"], declineIndex: number | undefined): DecisionResponse {
  switch (kind) {
    case "optional":
      return { kind: "optional", accept: false };
    case "chooseTargets":
      return { kind: "chooseTargets", instanceIds: [] };
    case "selectCards":
      return { kind: "selectCards", instanceIds: [] };
    case "orderCards":
      return { kind: "orderCards", order: [] };
    case "orderTriggers":
      return { kind: "orderTriggers", order: [] };
    case "chooseOption":
      return { kind: "chooseOption", optionIndex: declineIndex ?? 0 };
    case "mulligan":
      // Not driven through this manager; default to a benign optional decline so the
      // promise (if ever created for this) still settles.
      return { kind: "optional", accept: false };
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return { kind: "optional", accept: false };
    }
  }
}
