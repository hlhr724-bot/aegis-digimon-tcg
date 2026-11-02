import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT13-109.js";

async function resolveMain(s: ReturnType<typeof setupEngine>, optionId: string): Promise<void> {
  s.state.memory = 10;
  await s.ready();
  const result = s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst(optionId).instanceId });
  if (!result.ok) throw new Error(`Could not use BT13-109: ${result.reason}`);
  await settle();
}

describe("BT13-109 BT13-109", () => {
  it("has complete compiled coverage and no residual gaps", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.length).toBeGreaterThan(0);
    expect(compiled.effects[0]?.actions[1]).toMatchObject({
      kind: "Digivolve",
      into: { nameOrTrait: [{ tokens: ["Belphemon: Sleep Mode"], match: "nameExact" }] },
    });
  });

  it("bounds the security deletion by the level of the trashed hand card", () => {
    expect(compiled.effects[1]?.actions[0]).toMatchObject({
      kind: "Delete",
      cost: {
        kind: "trash",
        bindResultAs: "trashedHandDigimon",
        target: { filter: { zone: "hand", kind: ["Digimon"] } },
      },
      target: {
        filter: {
          controller: "opponent",
          kind: ["Digimon"],
          relativeTo: { attr: "level", op: "lte", selectionRef: "trashedHandDigimon" },
        },
      },
    });
  });

  it("loads the compiled implementation into a live permanent", async () => {
    const s = setupEngine({ 0: { security: [{ card: "BT13-109", as: "card" }] } });
    await s.ready();
    expect(s.inst("card").cardId).toBe("BT13-109");
  });

  it("deletes an opponent Digimon at or below the trashed hand Digimon's level", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT13-109", as: "gift" }],
          hand: [{ card: "BT13-077", as: "payment" }],
        },
        1: { battleArea: [{ card: "ST1-10", as: "level-six" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const giftId = s.inst("gift").instanceId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("level-six").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === giftId));
    expect(s.state.players[0]!.security).toHaveLength(0);

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("payment").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("pays its trash condition but deletes nothing when no opponent Digimon is within its level bound", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT13-109", as: "gift" }],
          hand: [{ card: "BT13-077", as: "payment" }],
        },
        1: { battleArea: [{ card: "BT13-092", as: "level-seven" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const giftId = s.inst("gift").instanceId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("level-seven").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === giftId));
    expect(s.state.players[0]!.security).toHaveLength(0);

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("payment").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("digivolves a legal level 5 purple Digimon into Sleep Mode from trash for free", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-084", as: "base" }],
          hand: [{ card: "BT13-109", as: "option" }],
          trash: [{ card: "BT13-088", as: "sleep" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await resolveMain(s, "option");

    expect(s.perm("base").topCard?.cardId).toBe("BT13-088");
    expect(s.perm("base").stack.some((card) => card.cardId === "BT13-084")).toBe(true);
    expect(s.state.memory).toBe(4);
  });

  it("resolves the Main effect through a real option play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-084", as: "base" }],
          hand: [{ card: "BT13-109", as: "option" }],
          trash: [{ card: "BT13-088", as: "sleep" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("base").topCard?.cardId === "BT13-088");
    expect(s.perm("base").topCard?.cardId).toBe("BT13-088");
  });

  it("rejects a level 4 base because the effect does not ignore requirements", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-083", as: "base" }],
          hand: [{ card: "BT13-109", as: "option" }],
          trash: [{ card: "BT13-088", as: "sleep" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await resolveMain(s, "option");

    expect(s.perm("base").topCard?.cardId).toBe("BT13-083");
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT13-088")).toBe(true);
  });
});

describe("BT13-109 Gift of Darkness — KB Q&A rulings", () => {
  it("only digivolves a Digimon that meets [Belphemon: Sleep Mode]'s digivolution requirements (Q2363)", async () => {
    const unqualified = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT4-080", as: "purpleLevelFour" },
            { card: "BT1-020", as: "redLevelFive" },
          ],
          hand: [{ card: "BT13-109", as: "option" }],
          trash: [{ card: "BT13-088", as: "sleepMode" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await resolveMain(unqualified, "option");
    expect(unqualified.perm("purpleLevelFour").topCard.cardId).toBe("BT4-080");
    expect(unqualified.perm("redLevelFive").topCard.cardId).toBe("BT1-020");
    expect(
      unqualified.state.players[0]!.trash.some((card) => card.instanceId === unqualified.inst("sleepMode").instanceId),
    ).toBe(true);

    const qualified = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT4-080", as: "purpleLevelFour" },
            { card: "BT1-020", as: "redLevelFive" },
            { card: "BT2-075", as: "purpleLevelFive" },
          ],
          hand: [{ card: "BT13-109", as: "option" }],
          trash: [{ card: "BT13-088", as: "sleepMode" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await resolveMain(qualified, "option");
    expect(qualified.perm("purpleLevelFive").topCard.cardId).toBe("BT13-088");
    expect(qualified.perm("purpleLevelFour").topCard.cardId).toBe("BT4-080");
    expect(qualified.perm("redLevelFive").topCard.cardId).toBe("BT1-020");
  });
});
