import fixtureMetaletemonRedirectPlayer from "./metaletemon-redirect-player.fixture.js";
import { fixturePermanentId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settleAcrossTimers, settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

const METAL_ETEMON_ID = fixturePermanentId("own-metaletemon");
const ATTACKER_ID = fixturePermanentId("opponent-metaletemon-agumon");
const ATTACKED_ID = fixturePermanentId("own-attacked-digimon");

// Discord 1558441146781536346: MetalEtemon (EX5-054) switches an opponent's attack "to this
// Digimon or the player". Q3647: the player is MetalEtemon's controller, never the attacker's
// own player. The redirect prompt must offer the defender's security as "mine".
describe("MetalEtemon switches an attack to its own player", () => {
  it("offers the defender's own security and checks it instead of battling MetalEtemon", async () => {
    const s = setupEngine({ 0: {}, 1: {} }, { autoAcceptOptional: true });
    layScenarioFixture(s.state, fixtureMetaletemonRedirectPlayer, [BLUE_DECK, RED_DECK], true);
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === METAL_ETEMON_ID)?.isSuspended).toBe(true);

    const start = s.events.length;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: ATTACKER_ID,
        target: { kind: "permanent", permanentId: ATTACKED_ID },
      }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(
      () => s.state.pendingDecision?.kind === "selectCards" && s.state.pendingDecision.seat === 0,
    );
    const pendingId = s.state.pendingDecision!.decisionId;
    const redirect = s.decisions.find(({ req }) => req.decisionId === pendingId)!.req;
    expect(redirect.options?.candidateInstanceIds).toEqual([METAL_ETEMON_ID, "mine"]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pendingId,
        response: { kind: "selectCards", instanceIds: ["mine"] },
      }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

    const events = s.events.slice(start);
    expect(events.find((event) => event.kind === "attackDeclared" && event.redirected === true)).toMatchObject({
      seat: 1,
      target: { kind: "player" },
    });
    expect(events.find((event) => event.kind === "securityRevealed")).toMatchObject({
      seat: 0,
      revealedCardId: "BT11-041",
    });
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-009", "BT1-009"]);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === METAL_ETEMON_ID)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === ATTACKER_ID)).toBe(false);

    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  });
});
