import { describe, it, expect } from "vitest";
import type { PlayerState } from "@aegis/shared";
import { cite, markNotTestable } from "./_kb.js";
import "./not-testable.js";
import { securityStrikeCount } from "../GameEngine.js";
import { canBlock } from "../combat/legality.js";
import { GameStateAccess } from "../state/access.js";
import { setupEngine as setup, makeInstance as instance, makeDigimon as digimon, settle } from "../testkit/harness.js";
import "../../cards/index.js";

/**
 * Comprehensive Rules chapter 16 "Keyword Effects" (comprehensive-0016, 0221-0227),
 * part A: the intro/§16-4 <Security A.> group plus <Blocker>, <Recovery>, <Piercing>,
 * <Draw>, <Jamming>. See ch04-basic-terminology.test.ts / README.md for the citation
 * contract this suite follows.
 *
 * Real cards used (chosen because their compiled effect actually implements the
 * keyword's rule text, not just a label — see combat/keywords.test.ts's printed-text
 * matcher, which only proves the LABEL, not the behavior):
 *   - AD1-005 (Angemon): printed <Security A. +1>, a bare static grant.
 *   - AD1-005 also printed <Blocker>.
 *   - BT1-060: [On Play] places 1 card from the deck as security — the real-card
 *     shape of <Recovery>'s "place cards face down on top of the security stack".
 *   - AD1-004 (WarGreymon-line): printed <Piercing>, [On Play] deletes an opponent
 *     Digimon (used to drive a battle win + consume-seam security check).
 *   - BT1-029: unconditional [On Play] <Draw 1>.
 *   - BT1-069 (Ogremon): printed <Jamming>.
 */

const NON_KEYWORD_CARD = "AD1-001";

// comprehensive-0016 (TOC dot-leader)
markNotTestable(
  "comprehensive-0016",
  "A table-of-contents line ('16. Keyword Effects....33') carrying only a page " +
    "number, no normative content — the same class as ch04's comprehensive-0004.",
);
describe("§16-1..16-4-3 <Security A.> (comprehensive-0221)", () => {
  it("16-4-3: 2 stacked <Security A. +1> grants check 2 cards total, NOT a combined <Security A. +2>", () => {
    cite(
      "comprehensive-0221",
      "16-4-1 <Security A.> modifies the number of security checks; 16-4-3 multiple " +
        "instances sum their individual values rather than becoming one combined grant",
      "ce4a501c4bae8c76fd80daea7c48c5c0ccfeef0e16da38bd2bd36e7bd17e5455",
    );
    // securityStrikeCount is the exact GameEngine.runSecurityCheck.strikeFor consumer
    // (base 1 + each active <Security A. ±N> grant), so this is the real computation,
    // not a re-derivation.
    expect(securityStrikeCount([{ amount: 1 }, { amount: 1 }], false)).toBe(3); // base 1 + 1 + 1
    expect(securityStrikeCount([], false)).toBe(1); // no grant: the base single check
  });

  it("a printed <Security A. +1> attacker (AD1-005) registers a real +1 grant that strikeFor turns into 2 checks", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const attacker = digimon(0, 12000, "AD1-005"); // printed <Security A. +1>
    p0.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects(); // pick up AD1-005's printed <Security A. +1>

    // Read the REAL grant GameEngine.runSecurityCheck.strikeFor consumes (continuous.grantedKeywords),
    // then feed it through the exact same securityStrikeCount formula proven above.
    const grants = (
      s.engine as unknown as {
        continuous: { grantedKeywords(id: string): { keyword: string; amount?: number }[] };
      }
    ).continuous
      .grantedKeywords(attacker.permanentId)
      .filter((g) => g.keyword === "SecurityAttack");
    expect(grants.length).toBeGreaterThan(0);
    expect(securityStrikeCount(grants, false)).toBe(2); // base 1 + the printed +1
  });
});

describe("§16-4-4 <Security A.> floor (comprehensive-0222)", () => {
  it("16-4-4: a heavily negative modifier floors the check count at 0, never negative", () => {
    cite(
      "comprehensive-0222",
      "16-4-4 even if the modified number of security checks is negative, the actual number is 0",
      "471c3ca2923b2e688ac6e53edb3789646e7d01b6cb0be7e736fd3a3d2b82d60e",
    );
    // 1 (base) + 5 ＜Security A. -1＞ grants = 1 - 5 = -4, floored to 0.
    expect(
      securityStrikeCount([{ amount: -1 }, { amount: -1 }, { amount: -1 }, { amount: -1 }, { amount: -1 }], false),
    ).toBe(0);
  });
});

describe("§16-5 <Blocker> (comprehensive-0223)", () => {
  it("16-5-1: a printed-<Blocker> Digimon (AD1-005) may block; a plain Digimon may not", () => {
    cite(
      "comprehensive-0223",
      "16-5-1 <Blocker> is the rule that allows a Digimon with the effect to block",
      "f21e9a4a1278163e9b07ebe6f0776b3b15a6d1f9884771e498431baeb23e5a7d",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 5000, NON_KEYWORD_CARD);
    p0.battleArea.push(attacker);
    const blocker = digimon(1, 5000, "AD1-005"); // printed <Blocker>
    const nonBlocker = digimon(1, 5000, NON_KEYWORD_CARD);
    p1.battleArea.push(blocker, nonBlocker);

    const access = new GameStateAccess(s.state);
    const reader = (s.engine as unknown as { continuous: Parameters<typeof canBlock>[3] }).continuous;
    expect(canBlock(access, attacker, blocker, reader)).toBeNull();
    expect(canBlock(access, attacker, nonBlocker, reader)).toBe("illegal-target");
  });
});

describe("§16-6 <Recovery> (comprehensive-0224)", () => {
  it("16-6-1: places the specified number of cards from the deck face down on top of the security stack", async () => {
    cite(
      "comprehensive-0224",
      "16-6-1 <Recovery +N>: places N cards from the specified area face down atop the security stack",
      "5639a0a98e8ef565e6fb4895f6e03d2beef6ce819056dae2015103762b7f655d",
    );

    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    for (let i = 0; i < 5; i++) p0.deck.push(instance(NON_KEYWORD_CARD, 0, false));
    const securityBefore = p0.security.length;
    const deckBefore = p0.deck.length;
    const card = instance("BT1-060", 0, false);
    p0.hand.push(card);
    s.state.memory = 4; // BT1-060's printed play cost

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await settle(() => p0.security.length > securityBefore, 5000);

    expect(p0.security.length).toBe(securityBefore + 1);
    expect(p0.deck.length).toBe(deckBefore - 1);
    // Placed FACE DOWN (§16-6-1 "face down on top of the security stack").
    expect(p0.security[p0.security.length - 1]!.faceUp).toBe(false);
  });
});

describe("§16-7 <Piercing> (comprehensive-0225)", () => {
  it("16-7-1/16-7-3: a Piercing attacker that deletes the defender in battle performs a mandatory security check before end of attack", async () => {
    cite(
      "comprehensive-0225",
      "16-7-1 <Piercing>: on deleting the opponent's Digimon in battle, check security " +
        "immediately before the end of attack; 16-7-3 that check is mandatory",
      "fa4d9e821c8072084a94bfc3a3d5048ccedbd39ff4997e2e6d13f1768d806a96",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 20000, "AD1-004"); // printed <Piercing>
    p0.battleArea.push(attacker);
    const defender = digimon(1, 1000, NON_KEYWORD_CARD);
    defender.isSuspended = true;
    p1.battleArea.push(defender);
    p1.security.push(instance(NON_KEYWORD_CARD, 1, false), instance(NON_KEYWORD_CARD, 1, false));
    await s.engine.recomputeContinuousEffects(); // pick up AD1-004's printed <Piercing>

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: defender.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p1.security.length < 2);

    // The defender was deleted in battle AND a security check fired from Piercing (not
    // from a player-target attack, since this attack targeted the permanent).
    expect(p1.battleArea.some((p) => p.permanentId === defender.permanentId)).toBe(false);
    expect(p1.security.length).toBe(1);
  });

  it("NEGATIVE CONTROL: without Piercing, deleting the defender in a permanent-target battle triggers NO security check", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 20000, NON_KEYWORD_CARD); // no Piercing
    p0.battleArea.push(attacker);
    const defender = digimon(1, 1000, NON_KEYWORD_CARD);
    defender.isSuspended = true;
    p1.battleArea.push(defender);
    p1.security.push(instance(NON_KEYWORD_CARD, 1, false), instance(NON_KEYWORD_CARD, 1, false));

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: defender.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p1.battleArea.length === 0, 5000);

    expect(p1.security.length).toBe(2); // unchanged — no Piercing consume seam fired
  });
});

describe("§16-8 <Draw> (comprehensive-0226)", () => {
  it("16-8-1/16-8-3: <Draw 1> mandatorily draws 1 card from the player's own deck", async () => {
    cite(
      "comprehensive-0226",
      "16-8-1 <Draw N> draws N cards from the deck; 16-8-3 the draw is mandatory",
      "7238f2ebc83dc30cf9e807e28b9253d812a140ad65a807ae2bf4d22a70730e6a",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    p0.deck.push(instance(NON_KEYWORD_CARD, 0, false), instance(NON_KEYWORD_CARD, 0, false));
    const card = instance("BT1-029", 0, false);
    p0.hand.push(card);
    s.state.memory = 3; // BT1-029's printed play cost
    const deckBefore = p0.deck.length;
    const handBefore = p0.hand.length - 1; // minus the card about to leave the hand

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await settle(() => p0.hand.length !== handBefore, 5000);

    expect(p0.hand.length).toBe(handBefore + 1);
    expect(p0.deck.length).toBe(deckBefore - 1);
  });
});

describe("§16-9 <Jamming> (comprehensive-0227)", () => {
  it("16-9-1: a printed-<Jamming> attacker isn't deleted by losing a battle against a Security Digimon", async () => {
    cite(
      "comprehensive-0227",
      "16-9-1 <Jamming>: a Digimon with this effect isn't deleted from a battle against an opponent's Security Digimon",
      "7ab13077bd9882a27dcb47aa43ddc4d44e1d9a97c7774a75ff99de117fa559cf",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 1000, "BT1-069"); // printed <Jamming>, low DP
    p0.battleArea.push(attacker);
    p1.security.push(instance("AD1-001", 1, false)); // 5000 DP Security Digimon — attacker loses the DP check
    await s.engine.recomputeContinuousEffects(); // pick up BT1-069's printed <Jamming>

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => p1.security.length === 0, 5000);

    // The security Digimon flips, battles, and wins (1000 < 5000) — but Jamming spares
    // the attacker from deletion despite losing that battle.
    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(true);
  });

  it("NEGATIVE CONTROL: without Jamming, the identical losing battle against a Security Digimon deletes the attacker", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 1000, NON_KEYWORD_CARD); // no Jamming
    p0.battleArea.push(attacker);
    p1.security.push(instance("AD1-001", 1, false)); // 5000 DP Security Digimon

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    // Security is removed from the stack BEFORE the battle-and-delete step resolves, so wait on
    // the attacker's own removal (not just the security-length drop) to avoid racing the delete.
    await settle(() => p0.battleArea.some((p) => p.permanentId === attacker.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(false); // deleted
  });
});
