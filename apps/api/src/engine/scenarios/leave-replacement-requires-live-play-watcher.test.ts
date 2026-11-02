import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("leave replacement requires a live play watcher", () => {
  it.each([true, false])(
    "settles security deletion before play watchers when Erlangmon is deleted=%s",
    async (deletesErlangmon) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "EX12-034", as: "erlangmon", under: [{ card: "EX12-056", as: "recruited" }] },
              { card: "BT1-044", as: "other" },
            ],
            deck: ["BT1-010", "BT1-011"],
          },
          1: {
            battleArea: [{ card: "BT26-064", as: "opponent" }],
            security: ["BT24-096"],
            deck: ["BT1-010", "BT1-011"],
          },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          preferInstanceIds: preferred,
          declinePrompts: ["Gain ＜Alliance＞"],
        },
      );
      preferred.push(s.perm(deletesErlangmon ? "erlangmon" : "other").permanentId, s.inst("recruited").instanceId);
      const attackerPermanentId = s.perm("erlangmon").permanentId;
      s.state.memory = 5;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "attack", attackerPermanentId, target: { kind: "player" } })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded" && event.attackerPermanentId === attackerPermanentId) &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX12-034")).toBe(deletesErlangmon);
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-056")).toBe(true);
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT26-064")).toBe(
        deletesErlangmon,
      );
      expect(s.state.players[1]!.deck.some((card) => card.cardId === "BT26-064")).toBe(!deletesErlangmon);
      expect(
        s.events.filter(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "EX12-034" && event.timing === "whenPlayed",
        ),
      ).toHaveLength(deletesErlangmon ? 0 : 1);
      const securityResolved = s.events.findIndex(
        (event) => event.kind === "effectResolved" && event.sourceCardId === "BT24-096" && event.timing === "Security",
      );
      const recruitedActivated = s.events.findIndex(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX12-056" && event.timing === "OnPlay",
      );
      expect(securityResolved).toBeGreaterThanOrEqual(0);
      expect(recruitedActivated).toBeGreaterThan(securityResolved);
    },
  );

  it.each([true, false])("retires Erlangmon's play watcher when Erlangmon is deleted=%s", async (deletesErlangmon) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-034", as: "erlangmon" },
            { card: "BT1-009", as: "other" },
          ],
          hand: [{ card: "EX12-039", as: "recruited" }],
        },
        1: { hand: [{ card: "BT26-016", as: "chronomon" }], deck: ["BT1-010", "BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    preferred.push(s.perm(deletesErlangmon ? "erlangmon" : "other").permanentId);
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("chronomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-039") &&
        s.state.pendingDecision === undefined,
    );
    await settle();
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-034")).toBe(
      !deletesErlangmon,
    );
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT26-016")).toBe(
      deletesErlangmon,
    );
    expect(s.state.players[1]!.deck.some((card) => card.cardId === "BT26-016")).toBe(!deletesErlangmon);
  });
});
