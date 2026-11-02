import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { getCardArts } from "@aegis/shared/cards/arts";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

const SURTR = "BT27-099";

describe("Surtr Brander", () => {
  it("is a yellow option", () => {
    expect(getCardDefinition(SURTR)?.colors).toEqual(["Yellow"]);
  });

  it("offers the Japanese art under the canonical card", () => {
    expect(getCardArts(SURTR).map((art) => art.artId)).toEqual(["BT27-099", "BT27-099-J"]);
  });

  it("gives -6000 DP, adds the top security card to hand, and becomes the top security card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-050" }],
          hand: [{ card: SURTR, as: "option" }],
          security: [
            { card: "BT1-009", as: "top" },
            { card: "BT1-009", as: "bottom" },
          ],
        },
        1: { battleArea: [{ card: "BT10-075", dp: 12000, as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    const topId = s.inst("top").instanceId;
    const bottomId = s.inst("bottom").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security[0]?.cardId === SURTR);

    expect(s.state.memory).toBe(7);
    expect(s.perm("target").currentDP).toBe(6000);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([topId]);
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual([SURTR, "BT1-009"]);
    expect(s.state.players[0]!.security[1]!.instanceId).toBe(bottomId);
    expect(s.state.players[0]!.security[0]!.faceUp).toBeFalsy();
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("still becomes the top security card with no security card to add and no opposing Digimon", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT1-050" }], hand: [{ card: SURTR, as: "option" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.length === 1);

    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual([SURTR]);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("Security places the opponent's lowest-DP Digimon as their top security card", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: SURTR, as: "option" }] },
        1: {
          battleArea: [
            { card: "BT10-075", dp: 12000, as: "strong" },
            { card: "BT1-084", under: ["BT1-009"], dp: 4000, as: "weak" },
          ],
          security: [{ card: "BT1-009", as: "previousTop" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const weakTop = s.perm("weak").topCard.instanceId;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("strong").permanentId,
    ]);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      weakTop,
      s.inst("previousTop").instanceId,
    ]);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("activates its Security effect when an effect trashes it from the security stack", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: SURTR, as: "option" }] },
        1: {
          battleArea: [
            { card: "BT10-075", dp: 12000, as: "strong" },
            { card: "BT1-084", dp: 4000, as: "weak" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const weakTop = s.perm("weak").topCard.instanceId;

    await advance(s.engine).verb.trash([s.inst("option").instanceId]);
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([weakTop]);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("strong").permanentId,
    ]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual([SURTR]);
  });

  it("does not activate its Security effect when an effect trashes it from the hand", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: SURTR, as: "option" }] },
        1: { battleArea: [{ card: "BT1-084", dp: 4000, as: "weak" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.trash([s.inst("option").instanceId]);
    await settle(() => s.state.players[0]!.trash.length === 1);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(0);
  });
});
