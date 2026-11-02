import { describe, expect, it } from "vitest";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";
import "../../cards/BT18/BT18-086.js";
import "../../cards/BT20/BT20-096.js";
import "../../cards/BT20/index.js";

describe("security reveal watcher priority", () => {
  it("does not retroactively fire a watcher installed while Security is pending, but fires on the next check", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT20-046", as: "attacker" }] },
        1: {
          security: [
            { card: "BT18-086", faceUp: true },
            { card: "BT1-015", faceUp: true },
          ],
          trash: ["BT18-034"],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: false },
    );
    const attackerId = s.perm("attacker").permanentId;
    let fired = 0;
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.length > 0);
    const pending = s.decisions[0]!;
    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "whenCheckedFaceUpSecurity",
      sourcePermanentId: attackerId,
      once: false,
      description: "test reveal watcher installed during Security",
      run: async () => {
        fired += 1;
      },
    });
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: pending.req.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "securityChecked" }));
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(fired).toBe(0);
    await advance(s.engine).verb.unsuspend([attackerId]);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => fired === 1);
    expect(fired).toBe(1);
  });

  it("drops a preexisting reveal watcher when the Security effect removes its anchor", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT20-017", as: "anchor" }] },
        1: { security: [{ card: "BT20-096", faceUp: true }, { card: "BT1-015" }] },
      },
      { autoSelectCards: true },
    );
    const anchorId = s.perm("anchor").permanentId;
    let fired = 0;
    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "whenCheckedFaceUpSecurity",
      sourcePermanentId: anchorId,
      once: false,
      description: "test reveal watcher anchored to Security-deleted attacker",
      run: async () => {
        fired += 1;
      },
    });
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: anchorId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0 && s.state.players[1]!.security.length === 1);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(fired).toBe(0);
  });

  it("never fires the face-up-security-added watcher for a checked face-down card", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT20-046", as: "attacker" }] },
        1: { security: ["BT18-086"], trash: [{ card: "BT18-034", as: "lucemon" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: false },
    );
    const watcherId = s.perm("attacker").permanentId;
    let fired = 0;
    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "whenFaceUpCardsAddedToOpponentSecurity",
      sourcePermanentId: watcherId,
      once: false,
      description: "test face-up security add watcher during Security",
      run: async () => {
        fired += 1;
      },
    });

    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: watcherId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.length > 0);
    const pending = s.decisions[0]!;
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "securityRevealed", revealedCardId: "BT18-086" }));
    expect(fired).toBe(0);
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: pending.req.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    expect(fired).toBe(0);
  });
});
