import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared";
import { matchNameOrTrait } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./index.js";
import { compiled } from "./BT20-014.js";

describe("BT20-014 SaviorHuckmon", () => {
  it("deletes up to 5000 DP, pays no cost for the optional Jesmon evolution, and gates Alliance on Royal Knight", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      expect(compiled.effects.find((entry) => entry.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "Delete",
            target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 5000 } }, count: 1 },
          },
        ],
      });
    }
    expect(compiled.effects.find((entry) => entry.trigger === "EndOfYourTurn")).toMatchObject({
      actions: [
        {
          kind: "Digivolve",
          from: ["hand"],
          payCost: false,
          optional: true,
          abortOnDecline: true,
          cost: { kind: "suspend" },
          into: { nameOrTrait: [{ tokens: ["Jesmon"], match: "name" }] },
        },
      ],
    });
    expect(compiled.effects.find((entry) => entry.isInherited)).toMatchObject({
      actions: [
        {
          kind: "GainKeyword",
          keyword: { keyword: "Alliance" },
          condition: { kind: "selfHasTrait", filter: { nameOrTrait: [{ tokens: ["Royal Knight"], match: "trait" }] } },
        },
      ],
    });
  });

  it("treats the Jesmon destination as a name-containing reference, not an exact-name reference", () => {
    const reference = { tokens: ["Jesmon"], match: "name" as const };
    expect(matchNameOrTrait({ nameEn: "Jesmon" }, reference)).toBe(true);
    expect(matchNameOrTrait({ nameEn: "Jesmon GX" }, reference)).toBe(true);
    expect(matchNameOrTrait({ nameEn: "Jespmon" }, reference)).toBe(false);
  });

  it.each(["play", "digivolve"] as const)("deletes an opposing Digimon at 5000 DP or less on %s", async (route) => {
    const s = setupEngine(
      {
        0: {
          ...(route === "digivolve" ? { battleArea: [{ card: "BT20-013", as: "base" }] } : {}),
          hand: [{ card: "BT20-014", as: "savior" }],
        },
        1: {
          battleArea: [
            { card: "BT20-010", dp: 5000, as: "low" },
            { card: "BT20-012", dp: 6000, as: "high" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    const lowId = s.perm("low").permanentId;
    const highId = s.perm("high").permanentId;
    const result =
      route === "play"
        ? s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("savior").instanceId })
        : s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("savior").instanceId,
          });
    expect(result).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowId));
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowId)).toBe(false);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === highId)).toBe(true);
  });

  it("suspends another Digimon and free-evolves into Jesmon through the real End of Your Turn flow", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-018", as: "other" }],
          hand: [
            { card: "BT20-014", as: "savior" },
            { card: "BT20-017", as: "jesmon" },
          ],
        },
        1: { security: ["BT1-010", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("savior").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("savior").topCard.cardId === "BT20-014");
    expect(s.state.memory).toBe(0);

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.combatWindow?.kind === "alliance");
    expect(s.engine.applyIntent(0, { type: "respondAlliance" })).toEqual({ ok: true });
    await turn;

    expect(s.perm("other").isSuspended).toBe(true);
    expect(s.perm("savior").isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.perm("savior").topCard.cardId).toBe("BT20-017");
    expect(s.perm("savior").stack.map((card) => card.cardId)).toContain("BT20-014");
    expect(s.state.memory).toBe(-3);
  });

  it("grants inherited Alliance only to a Royal Knight host on its controller's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT20-017", as: "royalKnight", under: ["BT20-014"] },
          { card: "BT20-018", as: "chronicle", under: ["BT20-014"] },
        ],
        deck: ["BT1-009"],
      },
      1: { deck: ["BT1-009"] },
    });
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).hasKeyword(s.perm("royalKnight"), "Alliance")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("chronicle"), "Alliance")).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(s.perm("royalKnight"), "Alliance")).toBe(false);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
  it("keeps a 5001-DP opposing Digimon when SaviorHuckmon enters", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT20-014", as: "savior" }] },
        1: { battleArea: [{ card: "BT20-010", dp: 5001, as: "aboveBoundary" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("savior").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-014"));
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-010")).toBe(true);
  });

  it("refuses the public end-turn Jesmon evolution while another unsuspended Digimon can pay its cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT20-014", as: "savior" },
            { card: "BT20-010", as: "other" },
          ],
          hand: [{ card: "BT20-017", as: "jesmon" }],
        },
        1: { battleArea: [{ card: "BT20-011", as: "defender", dp: 10000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await ownTurn;
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("jesmon").instanceId)).toBe(true);
    expect(s.perm("savior").topCard.cardId).toBe("BT20-014");
    expect(s.perm("other").isSuspended).toBe(false);
  });

  it("applies inherited Alliance on a legal public stack and clears it after the real turn", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT20-013", as: "base" },
        hand: [
          { card: "BT20-014", as: "savior" },
          { card: "BT20-017", as: "jesmon" },
        ],
        deck: ["BT1-009", "BT1-010"],
      },
      1: { deck: ["BT1-009", "BT1-010"] },
    });
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("savior").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT20-014");
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT20-017");
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("base").permanentId })).toEqual({
      ok: true,
    });
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Alliance")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Alliance")).toBe(false);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
