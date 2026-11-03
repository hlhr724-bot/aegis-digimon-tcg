import { describe, expect, it } from "vitest";
import { cite } from "./_kb.js";
import { setupEngine, settle } from "../testkit/harness.js";
import "../../cards/index.js";

describe("bounded Fragment parameters", () => {
  it("trashes exactly three selected physical sources and prevents deletion", async () => {
    cite(
      "comprehensive-0256",
      "Fragment chooses and trashes its specified number of digivolution cards to prevent deletion",
      "48b84d846d104961a4d2085c77d1413551065920a67c305ba9c80223bd4408ae",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX8-051",
              as: "host",
              under: [
                { card: "EX8-050", as: "one" },
                { card: "EX8-049", as: "two" },
                { card: "EX8-048", as: "three" },
              ],
            },
          ],
        },
        1: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 20000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.perm("host").isSuspended = true;
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").stack.length === 0);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(s.perm("host").permanentId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("one").instanceId, s.inst("two").instanceId, s.inst("three").instanceId]),
    );
  });

  it("does not partially pay Fragment when fewer than three sources exist", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX8-051",
              as: "host",
              under: [
                { card: "EX8-050", as: "one" },
                { card: "EX8-049", as: "two" },
              ],
            },
          ],
        },
        1: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 20000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.perm("host").isSuspended = true;
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("host").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("one").instanceId, s.inst("two").instanceId, s.inst("host").instanceId]),
    );
  });

  it("allows public refusal with three eligible sources and then deletes the host normally", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX8-051",
              as: "host",
              under: [
                { card: "EX8-050", as: "one" },
                { card: "EX8-049", as: "two" },
                { card: "EX8-048", as: "three" },
              ],
            },
          ],
        },
        1: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 20000 }] },
      },
      { autoSelectCards: false },
    );
    s.perm("host").isSuspended = true;
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);
    const refusal = s.state.pendingDecision!;
    expect(refusal.kind).toBe("selectCards");
    expect(refusal.promptText).toContain("＜Fragment (3)＞");
    expect(JSON.parse(refusal.payloadJson ?? "{}")).toMatchObject({ min: 0, max: 3 });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: refusal.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("host").instanceId,
        s.inst("one").instanceId,
        s.inst("two").instanceId,
        s.inst("three").instanceId,
      ]),
    );
  });

  it("uses EX12-060 Fragment 2 through a public battle and preserves its host", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 20000 }] },
        1: {
          battleArea: [
            {
              card: "EX12-060",
              as: "host",
              dp: 15000,
              suspended: true,
              under: [
                { card: "EX12-055", as: "one" },
                { card: "EX12-054", as: "two" },
              ],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").stack.length === 0);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(s.perm("host").permanentId);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("one").instanceId, s.inst("two").instanceId]),
    );
  });
});
