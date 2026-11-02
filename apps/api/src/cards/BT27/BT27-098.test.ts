import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { compiled } from "./BT27-098.js";
import "../index.js";

const faceDown = (alias: string) => ({ card: "BT1-010", as: alias, faceUp: false });

describe("BT27-098 Akihiro Kurata", () => {
  it("preserves the printed card and complete compiled coverage", () => {
    expect(getCardDefinition("BT27-098")).toMatchObject({
      nameEn: "Akihiro Kurata",
      colors: ["Purple"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["Kurata's Army"],
      rarity: "U",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["AllTurns", "EndOfAllTurns", "Security"]);
  });

  it("suspends to place the top 2 deck cards face down at the bottom when an opponent's Digimon is deleted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-010", as: "attacker", dp: 20_000 },
            { card: "BT27-098", as: "kurata", under: [faceDown("existing")] },
          ],
          deck: [
            { card: "BT1-009", as: "firstTop" },
            { card: "BT1-011", as: "secondTop" },
            { card: "BT1-012", as: "remaining" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "defender", dp: 1000, suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("kurata").stack.length === 3);

    expect(s.perm("kurata").isSuspended).toBe(true);
    expect(s.perm("kurata").stack.map((card) => card.instanceId)).toEqual([
      s.inst("secondTop").instanceId,
      s.inst("firstTop").instanceId,
      s.inst("existing").instanceId,
    ]);
    expect(s.perm("kurata").stack.every((card) => card.faceUp === false)).toBe(true);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("remaining").instanceId]);
    assertNoLoudGap(s);
  });

  it("pays no suspension and places nothing when the deletion reaction is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-010", as: "attacker", dp: 20_000 },
            { card: "BT27-098", as: "kurata" },
          ],
          deck: ["BT1-009", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "defender", dp: 1000, suspended: true }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("kurata").isSuspended).toBe(false);
    expect(s.perm("kurata").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("cannot react to a deletion while already suspended", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-010", as: "attacker", dp: 20_000 },
            { card: "BT27-098", as: "kurata", suspended: true },
          ],
          deck: ["BT1-009", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "defender", dp: 1000, suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("kurata").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("plays a Gizmon from hand, becomes its bottom digivolution card, and trashes its leftover cards (rule 4-7-8)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT27-098",
              as: "kurata",
              under: ["first", "second", "third", "fourth", "fifth", "kept"].map(faceDown),
            },
          ],
          hand: [
            { card: "BT1-009", as: "outsider" },
            { card: "BT27-076", as: "gizmon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, s.inst("kurata"));

    const gizmon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("gizmon").instanceId,
    );
    expect(gizmon?.stack.map((card) => card.instanceId)).toEqual([s.inst("kurata").instanceId]);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId).sort()).toEqual(
      ["first", "second", "third", "fourth", "fifth", "kept"].map((alias) => s.inst(alias).instanceId).sort(),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("outsider").instanceId]);
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === s.inst("kurata").instanceId),
    ).toBe(false);
  });

  it("pays across two Tamers and plays a Belphemon from the trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-098", as: "kurata", under: ["first", "second", "third"].map(faceDown) },
            { card: "BT27-095", as: "homer", under: ["fourth", "fifth"].map(faceDown) },
          ],
          trash: [{ card: "EX10-021", as: "belphemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, s.inst("kurata"));

    const belphemon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("belphemon").instanceId,
    );
    expect(belphemon?.stack.map((card) => card.instanceId)).toEqual([s.inst("kurata").instanceId]);
    expect(s.perm("homer").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(5);
  });

  it("does nothing with fewer than 5 face-down Tamer cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-098", as: "kurata", under: ["first", "second", "third", "fourth"].map(faceDown) }],
          hand: [{ card: "BT27-076", as: "gizmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, s.inst("kurata"));

    expect(s.perm("kurata").stack).toHaveLength(4);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("gizmon").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("ignores Digimon without Gizmon or Belphemon in their names", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT27-098",
              as: "kurata",
              under: ["first", "second", "third", "fourth", "fifth"].map(faceDown),
            },
          ],
          hand: [{ card: "BT1-009", as: "outsider" }],
          trash: [{ card: "BT1-011", as: "trashed" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, s.inst("kurata"));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.instanceId)).toEqual([
      s.inst("kurata").instanceId,
    ]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("outsider").instanceId]);
  });

  it("keeps the face-down cards when the end-of-turn effect is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT27-098",
              as: "kurata",
              under: ["first", "second", "third", "fourth", "fifth"].map(faceDown),
            },
          ],
          hand: [{ card: "BT27-076", as: "gizmon" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, s.inst("kurata"));

    expect(s.perm("kurata").stack).toHaveLength(5);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("gizmon").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("also resolves at the end of the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT27-098",
              as: "kurata",
              under: ["first", "second", "third", "fourth", "fifth"].map(faceDown),
            },
          ],
          hand: [{ card: "BT27-076", as: "gizmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.OnEndTurn, s.inst("kurata"));

    const gizmon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("gizmon").instanceId,
    );
    expect(gizmon?.stack.map((card) => card.instanceId)).toEqual([s.inst("kurata").instanceId]);
  });
});
