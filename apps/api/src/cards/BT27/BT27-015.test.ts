import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { playByAssembly } from "#api/engine/testkit/assembly";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

describe("Ouryumon (BT27) deletion, security trash, Chronicle play and inherited Ouryuken unsuspend", () => {
  it("has Piercing, Reboot and Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT27-015", as: "ouryumon" }] } });
    await s.ready();
    for (const keyword of ["Piercing", "Reboot", "Blocker"]) {
      expect(observe(s.engine).hasKeyword(s.perm("ouryumon"), keyword)).toBe(true);
    }
  });

  it("deletes only a Digimon with DP up to your highest Digimon and keeps security outside an attack", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT27-015", as: "ouryumon" }] },
        1: {
          battleArea: [
            { card: "BT8-017", as: "huge" },
            { card: "BT10-064", as: "eligible" },
          ],
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ouryumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.players[1]!.trash.some(({ cardId }) => cardId === "BT10-064") && !s.state.pendingDecision,
    );
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT8-017"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("uses another of your Digimon's DP as the deletion limit", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT8-017", as: "ally" }],
          hand: [{ card: "BT27-015", as: "ouryumon" }],
        },
        1: { battleArea: [{ card: "BT8-030", as: "matching" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ouryumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && !s.state.pendingDecision);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT8-030"]);
  });

  it("trashes the opponent's top security card when digivolving during an attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-013", as: "attacker", under: ["BT27-008", "BT27-009"] }],
          hand: [{ card: "BT27-015", as: "ouryumon" }],
        },
        1: { security: ["BT1-009", "BT1-010", "ST1-03"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("attacker").topCard.cardId === "BT27-015" &&
        s.events.some(({ kind }) => kind === "attackEnded") &&
        !s.state.pendingDecision,
    );
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash).toHaveLength(2);
  });

  it("plays a [Chronicle] Tamer from hand for free once when security is removed", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-015", as: "ouryumon" }],
          hand: [
            { card: "BT20-087", as: "tamer" },
            { card: "BT1-085", as: "otherTamer" },
          ],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ouryumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT27-015", "BT20-087"]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-085"]);
    expect(s.state.memory).toBe(2);
  });

  it("does not offer a [Chronicle] Digimon card when security is removed", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-015", as: "ouryumon" }],
          hand: [
            { card: "BT20-087", as: "tamer" },
            { card: "BT20-048", as: "digimon" },
          ],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ouryumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);
    const offered = s.decisions.filter(({ req }) => req.kind === "selectCards");
    expect(offered.map(({ req }) => req.options?.candidateInstanceIds)).toEqual([[s.inst("tamer").instanceId]]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT20-048"]);
  });

  it("uses a [Chronicle] Option from hand for free when that branch is chosen", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-015", as: "ouryumon" }],
          hand: [{ card: "BT20-095", as: "option" }],
          deck: ["BT1-009", "BT1-009", "BT20-048"],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ouryumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseOption");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseOption", optionIndex: 1 },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT20-095") && !s.state.pendingDecision,
    );
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT20-048");
    expect(s.state.memory).toBe(2);
  });

  it("plays by Assembly with Lv.5, Lv.4 and Lv.3 [Chronicle] cards for 7", async () => {
    const { s, result } = await playByAssembly("BT27-015", ["BT27-013", "BT27-009", "BT27-008"], 10);
    expect(result).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT27-015"));
    expect(s.state.memory).toBe(3);
  });

  it("rejects Assembly with a non-[Chronicle] Lv.4 card", async () => {
    const { s, result } = await playByAssembly("BT27-015", ["BT27-013", "BT1-019", "BT27-008"], 10);
    expect(result).toMatchObject({ ok: false });
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it.each([
    ["BT27-103", true],
    ["BT20-056", false],
  ])("inherited effect unsuspends %s after security is removed: %s", async (host, unsuspends) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: host, as: "host", under: ["BT27-015"] }] },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);
    expect(s.perm("host").isSuspended).toBe(!unsuspends);
  });
});
