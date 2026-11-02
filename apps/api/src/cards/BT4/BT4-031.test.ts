import { describe, expect, it } from "vitest";
import type { PlayerState } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../EX2/EX2-007.js";
import "./BT4-031.js";

describe("BT4-031 MarineChimairamon", () => {
  it("returns another own Digimon as cost and an opposing Digimon without sources", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT4-031", as: "source" }],
          battleArea: [{ card: "BT4-026", as: "cost", under: ["BT4-024"] }],
        },
        1: { battleArea: [{ card: "BT4-025", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const mine = s.state.players[0] as PlayerState;
    const opponent = s.state.players[1] as PlayerState;
    const costId = s.perm("cost").permanentId;
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !mine.battleArea.some((p) => p.permanentId === costId) && opponent.battleArea.length === 0);
    expect(mine.hand.some((card) => card.cardId === "BT4-026")).toBe(true);
    expect(mine.trash.some((card) => card.cardId === "BT4-024")).toBe(true);
  });

  it("may pay its own return cost even when the opposing Digimon has digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT4-031", as: "source" }],
          battleArea: [{ card: "BT4-026", as: "cost" }],
        },
        1: { battleArea: [{ card: "BT4-025", as: "target", under: ["BT4-024"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    const costId = s.perm("cost").permanentId;
    const targetId = s.perm("target").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT4-031"), 5000);

    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === costId)).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT4-026")).toBe(true);
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === targetId)).toBe(true);
  });

  it("may decline returning the cost and opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT4-031", as: "source" }],
          battleArea: [{ card: "BT4-026", as: "cost", under: ["BT4-024"] }],
        },
        1: { battleArea: [{ card: "BT4-025", as: "target" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    s.state.memory = 7;
    const costId = s.perm("cost").permanentId;
    const targetId = s.perm("target").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === costId)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === targetId)).toBe(true);
  });
});

describe("BT4-031 MarineChimairamon — KB Q&A rulings", () => {
  async function playReturningOwn(ownCard: string) {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT4-031", as: "source" }],
          eggDeck: ["BT1-001"],
          battleArea: [{ card: ownCard, as: "own" }],
        },
        1: { battleArea: [{ card: "BT4-025", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    const ownInstanceId = s.perm("own").topCard!.instanceId;
    const ownPermanentId = s.perm("own").permanentId;
    const targetInstanceId = s.perm("target").topCard!.instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.hand.some((card) => card.instanceId === targetInstanceId), 5000);
    const addedToHand = s.events.flatMap((event) =>
      event.kind === "cardsMoved" && event.to === "hand" ? event.instanceIds : [],
    );
    return { s, ownInstanceId, ownPermanentId, targetInstanceId, addedToHand };
  }

  it("can return your own [Mother D-Reaper], which goes to the bottom of the Digi-Egg deck instead of the hand (Q1198)", async () => {
    const { s, ownInstanceId, ownPermanentId, targetInstanceId, addedToHand } = await playReturningOwn("EX2-007");
    const mine = s.state.players[0]!;

    expect(mine.battleArea.some((p) => p.permanentId === ownPermanentId)).toBe(false);
    expect(mine.eggDeck.map((card) => card.instanceId).at(-1)).toBe(ownInstanceId);
    expect(mine.hand.some((card) => card.instanceId === ownInstanceId)).toBe(false);
    expect(addedToHand).not.toContain(ownInstanceId);
    expect(addedToHand).toContain(targetInstanceId);
  });

  it("can return your own token, which leaves the game instead of entering the hand (Q1199)", async () => {
    const { s, ownInstanceId, ownPermanentId, targetInstanceId, addedToHand } =
      await playReturningOwn("TOKEN-Diaboromon");
    const mine = s.state.players[0]!;
    const everyZone = [mine.hand, mine.deck, mine.trash, mine.eggDeck, mine.security].flat();

    expect(mine.battleArea.some((p) => p.permanentId === ownPermanentId)).toBe(false);
    expect(everyZone.some((card) => card.instanceId === ownInstanceId)).toBe(false);
    expect(addedToHand).not.toContain(ownInstanceId);
    expect(addedToHand).toContain(targetInstanceId);
  });
});
