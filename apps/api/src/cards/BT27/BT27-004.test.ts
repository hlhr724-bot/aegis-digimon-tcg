import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Kapurimon inherited Chessmon digivolution", () => {
  it.each([true, false])("offers reduced evolution when another Chessmon is played, accepted=%s", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-036", under: ["BT27-004"], as: "host" }],
          hand: [{ card: "BT27-036", as: "pawn" }, "BT27-039"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pawn").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
    expect(s.perm("host").topCard.cardId).toBe(accept ? "BT27-039" : "BT27-036");
    expect(s.state.memory).toBe(7);
    expect(s.perm("host").stack.map((c) => c.cardId)).toEqual(accept ? ["BT27-004", "BT27-036"] : ["BT27-004"]);
  });
  it("does not evolve when a non-Chessmon Digimon is played", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-036", under: ["BT27-004"], as: "host" }],
          hand: [{ card: "BT1-009", as: "rookie" }, "BT27-039"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rookie").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
    expect(s.perm("host").topCard.cardId).toBe("BT27-036");
  });
  it("uses its inherited evolution only once per turn across multiple Chessmon plays", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-036", under: ["BT27-004"], as: "host" }],
          hand: [{ card: "BT27-036", as: "first" }, { card: "BT27-036", as: "second" }, "BT27-039", "BT27-041"],
          deck: Array(4).fill("BT1-009"),
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, autoOrderCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    for (const alias of ["first", "second"]) {
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst(alias).instanceId })).toEqual({ ok: true });
      await settle(
        () =>
          s.events.filter((e) => e.kind === "effectResolved" && e.sourceCardId === "BT27-036").length >=
            (alias === "first" ? 1 : 2) && s.state.pendingDecision === undefined,
      );
    }
    expect(s.perm("host").topCard.cardId).toBe("BT27-039");
    expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT27-041")).toBe(true);
    expect(s.state.memory).toBe(4);
  });
  it("prompts with its inherited clause instead of the host's text", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-036", under: ["BT27-004"], as: "host" }],
          hand: [{ card: "BT27-036", as: "pawn" }, "BT27-039"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true, autoOrderCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pawn").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-004")
        .map(({ req }) => req.options?.effectText),
    ).toEqual([
      "[Your Turn] [Once Per Turn] When any of your other Digimon with [Chessmon] in their names are played, this Digimon may digivolve into a Digimon card with [Chessmon] in its name in the hand with the cost reduced by 2.",
    ]);
  });
});
