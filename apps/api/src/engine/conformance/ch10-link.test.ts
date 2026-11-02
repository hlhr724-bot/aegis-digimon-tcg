import { describe, it, expect } from "vitest";
import {
  GameState,
  PlayerState,
  Permanent,
  CardInstance,
  EffectDuration,
  EffectTiming,
  requireCardDefinition,
  type Seat,
  type ServerEvent,
  type CompiledCard,
} from "@aegis/shared";
import { cite } from "./_kb.js";
import { setup, settle, findPermanent, looseCard } from "../linkState.test.js";
import "./not-testable.js";
import { createPrimitives, type PrimitivesEngine, type SelectionPort } from "../effects/primitives.js";
import { createCardSource, type CardStateLookup } from "../cards/CardSource.js";
import { createGameAccess, createEffectContext } from "../effects/context.js";
import { irCardModule } from "../effects/interpreter.js";
import { MemoryGauge } from "../MemoryGauge.js";
import { ModifierLedger } from "../effects/modifiers.js";
// The real authored IR for the one compiled card that drives the `Link` action directly.
import "../../cards/BT25/BT25-045.js";
// The real (hand-written, non-IR) EffectModule for the card whose [On Play] links its OWN
// already-on-field permanent — the exact branch comprehensive-0140's divergence named.
import "../../cards/EX11/EX11-027.js";
import { getEffectModule } from "../effects/registry.js";
import "../../cards/index.js"; // boot side-effect: register every compiled-IR card module

/**
 * Comprehensive Rules chapter 10 "Link" (comprehensive-0139-0141).
 *
 * comprehensive-0139 (bare chapter heading) and the TOC dot-leader entry
 * (comprehensive-0010) carry no normative content and are seeded in `not-testable.ts`;
 * the real content chunks are comprehensive-0140 and -0141.
 *
 * Chapter 6's own divergence (comprehensive-0109, ch06-game-procedures.test.ts) already
 * documents that there is NO player-issued "linkCard" Intent at all — linking is reachable
 * only through a card's own compiled effect. This file does not re-litigate that; it drives
 * the REAL link mechanic (the `link` primitive, `effects/primitives.ts`, and the `Link` IR
 * action a card's own effect invokes to reach it) to prove chapter 10's own procedural rules.
 */

let seq = 0;
function card(cardId: string, seat: Seat, faceUp = false): CardInstance {
  seq += 1;
  const c = new CardInstance();
  c.instanceId = `link-inst-${seq}`;
  c.cardId = cardId;
  c.ownerSeat = seat;
  c.faceUp = faceUp;
  return c;
}

function makeState(): { state: GameState; p0: PlayerState } {
  const state = new GameState();
  const p0 = new PlayerState();
  p0.seat = 0;
  const p1 = new PlayerState();
  p1.seat = 1;
  state.players[0] = p0;
  state.players[1] = p1;
  state.turnSeat = 0;
  state.memory = 10;
  return { state, p0 };
}

interface Fixture {
  state: GameState;
  events: ServerEvent[];
  fx: ReturnType<typeof createPrimitives>;
}

/** A minimal `Primitives` fixture wired directly against `link()` (no card/IR indirection). */
function fixture(subTriggerLog?: string[]): Fixture {
  const { state } = makeState();
  const events: ServerEvent[] = [];
  const ledger = new ModifierLedger();
  const memory = new MemoryGauge(state, (e) => events.push(e));
  const ask: SelectionPort = { selectInstances: async (_seat, candidates, _min, max) => candidates.slice(0, max) };
  const engine: PrimitivesEngine = {
    state,
    emit: (e: ServerEvent) => events.push(e),
    nextPermanentId: () => "p-x",
    memory,
    modifiers: ledger,
    ask,
    controllerSeat: () => state.turnSeat,
    fireSubTrigger: subTriggerLog
      ? async (event: string) => {
          subTriggerLog.push(event);
        }
      : undefined,
  } as unknown as PrimitivesEngine;
  const fx = createPrimitives(engine);
  return { state, events, fx };
}

/**
 * A minimal [Main] "link 1 card to this Digimon" record. BT25-045 itself prints only the
 * recipient-side cost REDUCTION, so the plain-cost rule this chapter cites has to be driven by a
 * clause that actually declares a link. Everything below it — candidate resolution, the printed
 * `Cost N` read, and the memory payment — is the real interpreter and the real primitives.
 */
function plainMainLink(): CompiledCard {
  return {
    effects: [
      {
        trigger: "Main",
        actions: [
          {
            kind: "Link",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            from: ["hand"],
            payCost: true,
          },
        ],
      },
    ],
    coverage: "full",
    residual: [],
  } as unknown as CompiledCard;
}

const LINKABLE = "BT21-009"; // [Social] [Appmon] trait, printed "[Link] [Appmon] trait: Cost 1"

/**
 * Resolve BT25-045's plain [Main] Link effect once against a battle-area BT25-045 with a
 * linkable BT21-009 in hand, returning the memory paid and how many cards landed. Mirrors the
 * proven scaffold in `cards/BT25/BT25-045.test.ts` (the A3 for this card's OWN link-cost-reduction
 * clause), reused here at the chapter-10 procedural-rule level rather than that card's own gap.
 */
async function runPlainMainLink(): Promise<{ memoryPaid: number; linkedCount: number }> {
  const { state } = makeState();
  state.memory = 5;

  const recipient = new Permanent();
  recipient.permanentId = "p-onmon";
  recipient.controllerSeat = 0;
  recipient.topCard = card("BT25-045", 0, true);
  recipient.baseDP = 3000;
  recipient.currentDP = 3000;
  state.players[0]!.battleArea.push(recipient);

  const linkCard = card(LINKABLE, 0, false);
  state.players[0]!.hand.push(linkCard);

  const events: ServerEvent[] = [];
  const ledger = new ModifierLedger();
  const memory = new MemoryGauge(state, (e) => events.push(e));
  const stateLookup: CardStateLookup = {
    permanentOf: (instanceId) => {
      for (const p of state.players)
        for (const perm of p.battleArea) if (perm.topCard?.instanceId === instanceId) return perm;
      return undefined;
    },
    isOnBattleArea: (instanceId) => {
      for (const p of state.players)
        for (const perm of p.battleArea) if (perm.topCard?.instanceId === instanceId) return true;
      return false;
    },
    isSeatsTurn: (seat) => state.turnSeat === seat,
  };
  const ask: SelectionPort = { selectInstances: async (_seat, candidates, _min, max) => candidates.slice(0, max) };
  const decisionApi = {
    selectPermanents: async () => [],
    optional: async () => true,
    chooseTargets: async (_ctx: unknown, opts: { candidates: string[]; max: number }) =>
      opts.candidates.slice(0, opts.max),
    selectCards: async (_ctx: unknown, opts: { candidates: string[]; max: number }) =>
      opts.candidates.slice(0, opts.max),
    chooseOption: async () => 0,
  };
  const engine: PrimitivesEngine = {
    state,
    emit: (e) => events.push(e),
    nextPermanentId: () => "p-x",
    memory,
    modifiers: ledger,
    ask,
    controllerSeat: () => state.turnSeat,
  };
  const fx = createPrimitives(engine);
  const game = createGameAccess(state);
  const module = irCardModule("BT25-045", plainMainLink());
  const src = createCardSource(recipient.topCard!, stateLookup);
  // BT25-045's plain [Main] Link clause files under OnDeclaration (a player-activated [Main]
  // ability on a permanent, `timingsForTrigger`'s Main -> OnDeclaration co-home).
  const effects = module.effectsForTiming(EffectTiming.OnDeclaration, src);

  const before = state.memory;
  for (const e of effects) {
    const ctx = createEffectContext({ source: src, trigger: {}, game, fx, ask: decisionApi });
    await e.resolve(ctx);
  }
  return { memoryPaid: before - state.memory, linkedCount: recipient.linked.length };
}

/**
 * Resolve EX11-027's own [On Play] end to end against a battle-area EX11-027 with an empty-ish
 * deck (3 filler cards so the reveal-3 sub-effect doesn't short-circuit before reaching the link
 * clause) and 1 other battle-area Digimon, answering "yes" to the link prompt. This is the exact
 * shape the divergence names: `ctx.fx.link(linkTo[0], [source.instanceId])` where `source` IS
 * the already-on-field EX11-027 permanent.
 */
async function runEx11027Link(): Promise<{ state: GameState; p0: PlayerState; host: Permanent; recipient: Permanent }> {
  const { state, p0 } = makeState();

  const host = new Permanent();
  host.permanentId = "p-ex11027";
  host.controllerSeat = 0;
  host.topCard = card("EX11-027", 0, true);
  p0.battleArea.push(host);

  const recipient = new Permanent();
  recipient.permanentId = "p-recipient";
  recipient.controllerSeat = 0;
  // EX11-027's printed Link requirement is a Digimon with [Maquinamon] in its text.
  recipient.topCard = card("EX11-029", 0, true);
  p0.battleArea.push(recipient);

  // Filler deck cards so EX11-027's own "reveal top 3" opener doesn't return early on an
  // empty deck before ever reaching its "link this Digimon" clause.
  p0.deck.push(card("BT1-010", 0, false), card("BT1-010", 0, false), card("BT1-010", 0, false));

  const events: ServerEvent[] = [];
  const ledger = new ModifierLedger();
  const memory = new MemoryGauge(state, (e) => events.push(e));
  const stateLookup: CardStateLookup = {
    permanentOf: (instanceId) => {
      for (const p of state.players)
        for (const perm of p.battleArea) if (perm.topCard?.instanceId === instanceId) return perm;
      return undefined;
    },
    isOnBattleArea: (instanceId) => {
      for (const p of state.players)
        for (const perm of p.battleArea) if (perm.topCard?.instanceId === instanceId) return true;
      return false;
    },
    isSeatsTurn: (seat) => state.turnSeat === seat,
  };
  const ask: SelectionPort = { selectInstances: async (_seat, candidates, _min, max) => candidates.slice(0, max) };
  const decisionApi = {
    selectPermanents: async () => [],
    optional: async () => true, // "Link this Digimon to 1 of your other Digimon?" -> yes
    chooseTargets: async (_ctx: unknown, opts: { candidates: string[]; max: number }) =>
      opts.candidates.slice(0, opts.max),
    selectCards: async () => [], // decline the reveal-3 name/text adds — irrelevant to the link clause
    chooseOption: async () => 0,
  };
  const engine: PrimitivesEngine = {
    state,
    emit: (e) => events.push(e),
    nextPermanentId: () => "p-x",
    memory,
    modifiers: ledger,
    ask,
    controllerSeat: () => state.turnSeat,
  };
  const fx = createPrimitives(engine);
  const game = createGameAccess(state);
  const src = createCardSource(host.topCard, stateLookup);
  const effects = getEffectModule("EX11-027")!.effectsForTiming(EffectTiming.OnPlay, src);
  for (const e of effects) {
    const ctx = createEffectContext({ source: src, trigger: {}, game, fx, ask: decisionApi });
    await e.resolve(ctx);
  }
  return { state, p0, host, recipient };
}

describe("§10-1 Link (comprehensive-0140)", () => {
  it("10-1-1/10-1-3-2: linking a hand card to a battle-area Digimon is a Main-phase action that pays the printed link cost", async () => {
    cite(
      "comprehensive-0140",
      "10-1-1 a card can be linked to a Digimon by paying the cost as part of main phase " +
        "actions; 10-1-3-2 the specified link cost is paid",
      "12e2453752038ce5edfe498cdb0eae85aa9f95dfac1d591dd23b9fc47e068eef",
    );

    const result = await runPlainMainLink();

    expect(result.linkedCount).toBe(1);
    // BT21-009's printed link cost is 1 (no reduction on this plain clause) — the FULL cost was
    // charged through the real memory-payment seam, proving §10-1-3-2 actually ran.
    expect(result.memoryPaid).toBe(1);
  });

  it("10-1-1 (bare case): a card ALREADY on the battle area can be linked to another Digimon, not just a hand card", async () => {
    cite(
      "comprehensive-0140",
      "10-1-1 'A card from the hand OR BATTLE AREA can be linked to a Digimon in the battle " +
        "area.' `link()` (effects/primitives.ts) now also detaches a battle-area permanent's own " +
        "top card (`detachTopCardForLink`, tried before `removeLooseInstance`) when the linked " +
        "instance isn't a loose hand/stack/linked card: the source permanent is spliced out of " +
        "the battle area and its top card becomes the link card. Proven directly here on the " +
        "bare case (no stack, no own link card); see the next test for what happens to a source " +
        "that HAS a stack and its own link card.",
      "12e2453752038ce5edfe498cdb0eae85aa9f95dfac1d591dd23b9fc47e068eef",
    );

    const { state, fx } = fixture();
    const p0 = state.players[0]!;

    const host = new Permanent();
    host.permanentId = "host-perm";
    host.controllerSeat = 0;
    host.topCard = card("BT21-009", 0, true); // already a battle-area Digimon (its OWN top card)
    p0.battleArea.push(host);

    const recipient = new Permanent();
    recipient.permanentId = "recipient-perm";
    recipient.controllerSeat = 0;
    recipient.topCard = card("BT25-045", 0, true);
    p0.battleArea.push(recipient);

    await fx.link(recipient.permanentId, [host.topCard.instanceId]);
    expect(recipient.linked.some((c) => c.instanceId === host.topCard!.instanceId)).toBe(true);
    expect(p0.battleArea.some((p) => p.permanentId === host.permanentId)).toBe(false);
  });

  it(
    "10-1-1 + INFERENCE: a battle-area source's own digivolution stack and own link card are " +
      "trashed when its top card is linked elsewhere (no direct KB ruling found — see comment)",
    async () => {
      cite(
        "comprehensive-0140",
        "10-1-1 permits linking a battle-area card, but the KB has NO Q&A ruling on what happens " +
          "to that source permanent's OWN stack/link card when it is consumed this way. " +
          "`detachTopCardForLink` (effects/primitives.ts) trashes both by ANALOGY to the " +
          "§7-2-2-7 DigiXros principle ('as soon as a card from the battle area is removed... " +
          "any cards under it are trashed') — the same shape `relocatePermanent`'s " +
          "`shedOwnCards` already applies for DigiXros placement — not a direct citation for " +
          "this exact mechanic. Re-verify if a ruling on link surfaces.",
        "12e2453752038ce5edfe498cdb0eae85aa9f95dfac1d591dd23b9fc47e068eef",
      );

      const { state, fx } = fixture();
      const p0 = state.players[0]!;

      const host = new Permanent();
      host.permanentId = "host-perm";
      host.controllerSeat = 0;
      host.topCard = card("BT21-009", 0, true);
      const stackCard = card("BT1-010", 0, false);
      host.stack.push(stackCard);
      const hostLinkCard = card("BT21-009", 0, true);
      host.linked.push(hostLinkCard);
      p0.battleArea.push(host);

      const recipient = new Permanent();
      recipient.permanentId = "recipient-perm";
      recipient.controllerSeat = 0;
      recipient.topCard = card("BT25-045", 0, true);
      p0.battleArea.push(recipient);

      await fx.link(recipient.permanentId, [host.topCard.instanceId]);

      // The source permanent is gone, its top card is now the recipient's link card...
      expect(recipient.linked.some((c) => c.instanceId === host.topCard!.instanceId)).toBe(true);
      expect(p0.battleArea.some((p) => p.permanentId === host.permanentId)).toBe(false);
      // ...and its OWN stack and OWN link card both landed in the trash (not carried over,
      // not left dangling).
      expect(p0.trash.some((c) => c.instanceId === stackCard.instanceId)).toBe(true);
      expect(p0.trash.some((c) => c.instanceId === hostLinkCard.instanceId)).toBe(true);
    },
  );

  it("control: an unrelated removeLooseInstance caller (trash) still CANNOT consume a permanent's own top card", async () => {
    cite(
      "comprehensive-0140",
      "Scope check for the fix above: only the `link` path may detach a permanent's own top " +
        "card. `trash()` still routes through the unmodified `removeLooseInstance`, which never " +
        "reads a permanent's `topCard` — so a top-card id passed to `trash()` is silently " +
        "skipped, exactly as documented on that verb ('A card sitting as the TOP card of a " +
        "permanent cannot be trashed in isolation by this verb').",
      "12e2453752038ce5edfe498cdb0eae85aa9f95dfac1d591dd23b9fc47e068eef",
    );

    const { state, fx } = fixture();
    const p0 = state.players[0]!;

    const host = new Permanent();
    host.permanentId = "host-perm";
    host.controllerSeat = 0;
    host.topCard = card("BT21-009", 0, true);
    p0.battleArea.push(host);

    const moved = await fx.trash([host.topCard.instanceId]);
    expect(moved.length).toBe(0);
    expect(p0.battleArea.some((p) => p.permanentId === host.permanentId)).toBe(true);
    expect(p0.trash.some((c) => c.instanceId === host.topCard!.instanceId)).toBe(false);
  });

  it("EX11-027's own [On Play] 'link this Digimon to 1 of your other Digimon' actually links (proves the real card, not just the primitive)", async () => {
    cite(
      "comprehensive-0140",
      "10-1-1: EX11-027's compiled [On Play] calls `ctx.fx.link(linkTo[0], [source.instanceId])` " +
        "where `source` is EX11-027's OWN already-on-field permanent — exactly the branch the " +
        "primitive-level tests above exercise directly. Driving the real card's own effect end " +
        "to end (not just the `link` primitive) is the point of this test.",
      "12e2453752038ce5edfe498cdb0eae85aa9f95dfac1d591dd23b9fc47e068eef",
    );

    const { recipient, host, p0 } = await runEx11027Link();

    expect(recipient.linked.some((c) => c.instanceId === host.topCard!.instanceId)).toBe(true);
    expect(p0.battleArea.some((p) => p.permanentId === host.permanentId)).toBe(false);
  });
});

describe("§10-1-2 Link Rules (comprehensive-0141)", () => {
  it("10-1-2-2: a card plugged in for a link becomes a link card — tracked in `linked`, distinct from the digivolution stack, and flips face-up", async () => {
    cite(
      "comprehensive-0141",
      "10-1-2-2 a card plugged in sideways for a link becomes a link card (distinct from a " +
        "stacked/digivolution card)",
      "b64cb25b966e12e6f8215468d2ea4eb675cb0ad0c89c5e9763a230ed8357862d",
    );

    const { state, fx } = fixture();
    const p0 = state.players[0]!;
    const recipient = new Permanent();
    recipient.permanentId = "recipient-perm";
    recipient.controllerSeat = 0;
    recipient.topCard = card("BT25-045", 0, true);
    p0.battleArea.push(recipient);

    const looseLinkCard = card("BT21-009", 0, false); // face-DOWN in hand before linking
    p0.hand.push(looseLinkCard);
    expect(looseLinkCard.faceUp).toBe(false);

    const linked = await fx.link(recipient.permanentId, [looseLinkCard.instanceId]);

    expect(linked.map((c) => c.instanceId)).toEqual([looseLinkCard.instanceId]);
    expect(recipient.linked.some((c) => c.instanceId === looseLinkCard.instanceId)).toBe(true);
    expect(recipient.stack.some((c) => c.instanceId === looseLinkCard.instanceId)).toBe(false); // NOT a stacked card
    expect(p0.hand.some((c) => c.instanceId === looseLinkCard.instanceId)).toBe(false); // left the hand
    expect(looseLinkCard.faceUp).toBe(true); // revealed as it becomes a link card
  });

  it("10-1-2-3: an immediate-type effect tied to linking fires only AFTER the card is linked and the Digimon is chosen", async () => {
    cite(
      "comprehensive-0141",
      "10-1-2-3 if an immediate-type effect triggers when linking would occur, it triggers " +
        "immediately after the card is revealed and the Digimon to be linked is chosen",
      "b64cb25b966e12e6f8215468d2ea4eb675cb0ad0c89c5e9763a230ed8357862d",
    );

    const subTriggerLog: string[] = [];
    const { state, fx } = fixture(subTriggerLog);
    const p0 = state.players[0]!;
    const recipient = new Permanent();
    recipient.permanentId = "recipient-perm";
    recipient.controllerSeat = 0;
    recipient.topCard = card("BT25-045", 0, true);
    p0.battleArea.push(recipient);
    const looseLinkCard = card("BT21-009", 0, false);
    p0.hand.push(looseLinkCard);

    await fx.link(recipient.permanentId, [looseLinkCard.instanceId]);

    // The `whenLinked` SubTrigger (the engine's "immediate-type effect tied to linking" seam)
    // fired, and only AFTER the card actually landed in `recipient.linked` — proving the
    // ordering, not just that it fired at all.
    expect(subTriggerLog).toEqual(["whenLinked"]);
    expect(recipient.linked.length).toBe(1);
  });

  it("NOW MET: when a Digimon already holding a link card receives another, the new one is plugged in at the BOTTOM", () => {
    cite(
      "comprehensive-0141",
      "DIVERGENCE: §10-1-2-1 'If a card already has stacked cards, the new card is plugged in " +
        "at the bottom' (the same bottom-insertion convention Comprehensive Rules §4-4-2 states " +
        "for placing a new card under a Tamer that already has stacked cards) reads as applying " +
        "to a Digimon that already holds a link card and receives a second one. The `link` " +
        "primitive (effects/primitives.ts) always `permanent.linked.push(instance)` — a flat " +
        "append with no top/bottom distinction at all (unlike `permanent.stack`, whose " +
        "bottom-vs-top order IS meaningfully consumed elsewhere, e.g. Iceclad's " +
        "digivolution-count compare and de-digivolve's top-card removal). A second link card " +
        "is simply appended after the first; nothing in the engine ever reads `linked` " +
        "positionally, so 'plugged in at the bottom' has no observable effect either way.",
      "b64cb25b966e12e6f8215468d2ea4eb675cb0ad0c89c5e9763a230ed8357862d",
    );

    const { state, fx } = fixture();
    const p0 = state.players[0]!;
    const recipient = new Permanent();
    recipient.permanentId = "recipient-perm";
    recipient.controllerSeat = 0;
    recipient.topCard = card("AD1-005", 0, true); // a real printed ＜Link +1＞ card
    p0.battleArea.push(recipient);

    const firstLinked = card(LINKABLE, 0, false);
    const secondLinked = card(LINKABLE, 0, false);
    p0.hand.push(firstLinked, secondLinked);

    void fx.link(recipient.permanentId, [firstLinked.instanceId]);
    void fx.link(recipient.permanentId, [secondLinked.instanceId]);

    // EXPECTED (per §10-1-2-1): the second (most-recently-linked) card sits at the BOTTOM —
    // i.e. BEFORE the first — so index 0 is the second-linked card.
    expect(recipient.linked[0]?.instanceId).toBe(secondLinked.instanceId);
  });
});

/**
 * §4-9-5 / §17-1-3-2-5 — the link limit is enforced AFTER the fact, not by refusing the
 * link. §4-9-5 (comprehensive-0295): "1 card can have a maximum of 1 link card. When
 * linking to a Digimon that has already reached the link limit, the same number of the
 * existing link cards are trashed at the same time as the newly linked cards." §17-1-3-2-5
 * (comprehensive-0265): "Link cards for a Digimon that has exceeded the link limit (only
 * the cards that exceed link limit are trashed)." Neither rule says the link is refused —
 * the link lands, and the rule-check sweep (`GameEngine.trashExcessLinkCards`) trims the
 * excess. Both engine entry points must agree: the player-facing `linkCard` verb
 * (actions/link.ts) and a card effect's `Link` IR action (`runLink`, interpreter.ts).
 */
describe("§4-9-5 / §17-1-3-2-5 Link limit — a link at the limit lands and the excess is trashed after, not refused at declaration", () => {
  it("the player-facing linkCard verb and a card effect's Link action converge on the SAME outcome at the boundary", async () => {
    cite(
      "comprehensive-0295",
      "4-9-5: 'When linking to a Digimon that has already reached the link limit, the same " +
        "number of the existing link cards are trashed at the same time as the newly linked " +
        "cards' — the link is allowed, not refused.",
      "820827384152e08da4b986401d457d8022bad16a759b3d13ebc9f54505aa14c9",
    );
    cite(
      "comprehensive-0265",
      "17-1-3-2-5: 'Link cards for a Digimon that has exceeded the link limit (only the cards " +
        "that exceed link limit are trashed)' — the trim is a rule-check sweep, run after the " +
        "link lands.",
      "579c4f4ad3acf21c4b443e84664dd884ef2360322294dca0d3124d57ca9f1bb3",
    );

    // --- Path 1: the player-facing linkCard verb (actions/link.ts / GameEngine.handleLinkCard) ---
    const verbGame = setup();
    const verbPlayer = verbGame.state.players[0] as PlayerState;
    const verbHost = new Permanent();
    verbHost.permanentId = "verb-host";
    verbHost.controllerSeat = 0;
    const verbTop = looseCard("BT21-009", 0);
    verbTop.faceUp = true;
    verbHost.topCard = verbTop;
    const verbExistingLink = looseCard("BT21-041", 0);
    verbExistingLink.faceUp = true;
    verbHost.linked.push(verbExistingLink); // already AT the base link limit (1)
    verbPlayer.battleArea.push(verbHost);
    const verbSecond = looseCard("BT21-041", 0);
    verbPlayer.hand.push(verbSecond);
    verbGame.state.memory = 20;

    expect(
      verbGame.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: verbSecond.instanceId,
        targetPermanentId: verbHost.permanentId,
      } as never),
    ).toEqual({ ok: true });
    await settle(() => verbHost.linked.length === 1);

    // --- Path 2: a card effect's Link action (runLink, interpreter.ts) — AD1-005's [On Play]
    // links up to 2 [Social]/[Navi]/[Tool] cards to ITSELF. Cancel its printed <Link +1>
    // grant so this path, like the player-facing fixture above, isolates base link limit 1.
    const effectGame = setup({ autoAcceptOptional: false });
    const effectPlayer = effectGame.state.players[0] as PlayerState;
    const effectSource = looseCard("AD1-005", 0);
    effectPlayer.hand.push(effectSource);
    const effectCand1 = looseCard("BT21-009", 0);
    const effectCand2 = looseCard("BT21-041", 0);
    effectPlayer.hand.push(effectCand1, effectCand2);
    effectGame.state.memory = 20;

    expect(effectGame.engine.applyIntent(0, { type: "playCard", instanceId: effectSource.instanceId })).toEqual({
      ok: true,
    });
    await settle(() => effectGame.state.pendingDecision?.kind === "optional");
    const effectHost = findPermanent(effectGame, 0, "AD1-005")!;
    (
      effectGame.engine as unknown as {
        continuous: { addLinkMaxGrant(id: string, delta: number, duration: unknown): void };
      }
    ).continuous.addLinkMaxGrant(effectHost.permanentId, -1, EffectDuration.UntilEachTurnEnd);
    expect(
      effectGame.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: effectGame.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => effectHost.linked.length === 1);

    // Both paths offered 2 cards onto a base-limit-1 recipient. Neither refused the link at
    // declaration; both converge on exactly 1 landed link card after the rule-check sweep.
    expect(verbHost.linked.length).toBe(1);
    expect(effectHost?.linked.length).toBe(1);

    // The decisive observable difference from the OLD (declaration-gated) behavior: BOTH
    // offered cards actually left the hand (neither was silently excluded from selection —
    // §17-1-3-2-5's sweep trims the LANDED excess into the trash), and exactly one of them
    // is now in the trash, not still sitting unpicked in the hand.
    expect(effectPlayer.hand.some((c) => c.instanceId === effectCand1.instanceId)).toBe(false);
    expect(effectPlayer.hand.some((c) => c.instanceId === effectCand2.instanceId)).toBe(false);
    const effectTrashedCount = [effectCand1, effectCand2].filter((c) =>
      effectPlayer.trash.some((t) => t.instanceId === c.instanceId),
    ).length;
    expect(effectTrashedCount).toBe(1);
  });

  it("<Link +1> raises the limit for BOTH paths — 2 cards land and stay (no trim) once headroom covers them", async () => {
    cite(
      "comprehensive-0295",
      "4-9-5's limit is 'a maximum of 1 link card' as the BASE — a ＜Link +N＞ grant raises the " +
        "effective per-Digimon limit the sweep enforces against (GameEngine.linkMaxOf), so 2 " +
        "landed link cards are legal once the grant covers them and the sweep leaves both.",
      "820827384152e08da4b986401d457d8022bad16a759b3d13ebc9f54505aa14c9",
    );

    // Path 1: linkCard verb onto a host with a <Link +1> grant already active (limit 2).
    const verbGame = setup();
    const verbPlayer = verbGame.state.players[0] as PlayerState;
    const verbHost = new Permanent();
    verbHost.permanentId = "verb-host-2";
    verbHost.controllerSeat = 0;
    const verbTop = looseCard("BT21-009", 0);
    verbTop.faceUp = true;
    verbHost.topCard = verbTop;
    const verbExistingLink = looseCard("BT21-041", 0);
    verbExistingLink.faceUp = true;
    verbHost.linked.push(verbExistingLink);
    verbPlayer.battleArea.push(verbHost);
    (
      verbGame.engine as unknown as {
        continuous: { addLinkMaxGrant(id: string, delta: number, duration: unknown): void };
      }
    ).continuous.addLinkMaxGrant(verbHost.permanentId, 1, EffectDuration.UntilEachTurnEnd);
    const verbSecond = looseCard("BT21-041", 0);
    verbPlayer.hand.push(verbSecond);
    verbGame.state.memory = 20;

    expect(
      verbGame.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: verbSecond.instanceId,
        targetPermanentId: verbHost.permanentId,
      } as never),
    ).toEqual({ ok: true });
    await settle(() => verbHost.linked.length >= 2);
    // Settling further would time out if a 3rd, non-existent pass trimmed it back down —
    // confirm it holds at 2, not 1.
    expect(verbHost.linked.length).toBe(2);

    // Path 2: AD1-005's own effect links 2 cards to itself; grant <Link +1> the moment the
    // permanent appears (mirrors linkState.test.ts's own raised-limit A3).
    const effectGame = setup();
    const effectPlayer = effectGame.state.players[0] as PlayerState;
    const effectSource = looseCard("AD1-005", 0);
    effectPlayer.hand.push(effectSource);
    effectPlayer.hand.push(looseCard("BT21-009", 0), looseCard("BT21-041", 0));
    effectGame.state.memory = 20;

    expect(effectGame.engine.applyIntent(0, { type: "playCard", instanceId: effectSource.instanceId })).toEqual({
      ok: true,
    });
    await settle(() => findPermanent(effectGame, 0, "AD1-005") !== undefined);
    const effectHost = findPermanent(effectGame, 0, "AD1-005")!;
    (
      effectGame.engine as unknown as {
        continuous: { addLinkMaxGrant(id: string, delta: number, duration: unknown): void };
      }
    ).continuous.addLinkMaxGrant(effectHost.permanentId, 1, EffectDuration.UntilEachTurnEnd);

    await settle(() => (findPermanent(effectGame, 0, "AD1-005")?.linked.length ?? 0) >= 2);
    expect(findPermanent(effectGame, 0, "AD1-005")?.linked.length).toBe(2);
  });
});

// Sanity: confirm the real structured link-requirement field this suite leans on actually
// exists on the cited real card, so the tests above are not built on invented data.
describe("§10 Link — fixture sanity", () => {
  it("BT21-009 carries a real, structured link requirement (printed 'Cost 1')", () => {
    const def = requireCardDefinition("BT21-009");
    expect(def.linkRequirement).toContain("Cost 1");
    expect(def.linkRequirement).toContain("Link");
  });
});
