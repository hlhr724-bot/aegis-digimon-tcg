import { EffectTiming } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/BT27/BT27-072";
import "#api/cards/BT27/BT27-010";
import "#api/cards/BT6/BT6-064";

describe("PrinceMamemon X Antibody copied deletion and name aura", () => {
  it("borrows a Mamemon source's printed deletion on attack without deleting itself", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-072", as: "host", under: ["BT6-064", "BT27-010"] }] },
        1: { battleArea: [{ card: "BT1-019", as: "target", suspended: true }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.perm("host").stack.map((c) => c.cardId)).toEqual(["BT6-064", "BT27-010"]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    assertNoLoudGap(s);
  });

  it.each([false, true])("does not borrow from non-Mamemon or face-down cards: %s", async (faceDown) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-072", as: "host", under: [{ card: faceDown ? "BT6-064" : "BT27-010", faceUp: !faceDown }] },
          ],
        },
        1: { battleArea: ["BT1-019"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    assertNoLoudGap(s);
  });

  it("digivolves by the printed black level 5 route and borrows from the resulting stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-064", as: "base" }],
          hand: [{ card: "BT27-072", as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-019"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }).ok,
    ).toBe(true);
    await settle(() => s.state.players[1]!.trash.length === 1 && !s.state.pendingDecision);
    expect(s.state.memory).toBe(2);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT6-064"]);
    assertNoLoudGap(s);
  });

  it.each(["BT6-064", "BT6-063", "BT1-019"])(
    "grants the three keywords only to own Mamemon names: %s",
    async (card) => {
      const s = setupEngine({
        0: {
          battleArea: [
            { card: "BT27-072", as: "host" },
            { card, as: "ally" },
          ],
        },
        1: { battleArea: [{ card: "BT6-063", as: "opponent" }] },
      });
      await s.ready();
      for (const keyword of ["Alliance", "Reboot", "Blocker"]) {
        expect(observe(s.engine).hasKeyword(s.perm("host"), keyword)).toBe(true);
        expect(observe(s.engine).hasKeyword(s.perm("ally"), keyword)).toBe(card !== "BT1-019");
        expect(observe(s.engine).hasKeyword(s.perm("opponent"), keyword)).toBe(false);
      }
      await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
      for (const keyword of ["Alliance", "Reboot", "Blocker"]) {
        expect(observe(s.engine).hasKeyword(s.perm("ally"), keyword)).toBe(false);
      }
      assertNoLoudGap(s);
    },
  );

  it.each([true, false])(
    "uses the alternate evolution from a level 6 Mamemon and excludes X Antibody: %s",
    async (valid) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: valid ? "BT13-074" : "BT27-072", as: "base", under: ["BT6-064"] }],
            hand: [{ card: "BT27-072", as: "evolution" }],
            deck: ["BT1-009"],
          },
          1: { battleArea: ["BT1-019", "BT1-019"] },
        },
        { autoSelectCards: true, autoAcceptOptional: true, autoChooseOption: true },
      );
      s.state.memory = 5;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("evolution").instanceId,
          useAlternateCost: true,
        }).ok,
      ).toBe(valid);
      if (valid) {
        await settle(() => s.state.players[1]!.trash.length === 1 && !s.state.pendingDecision);
        await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("base"));
      }
      expect(s.state.memory).toBe(valid ? 4 : 5);
      expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(valid ? ["BT6-064", "BT13-074"] : ["BT6-064"]);
      expect(s.state.players[1]!.trash).toHaveLength(valid ? 1 : 0);
      assertNoLoudGap(s);
    },
  );
});
