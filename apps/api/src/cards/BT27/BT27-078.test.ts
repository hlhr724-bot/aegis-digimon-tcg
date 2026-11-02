import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Peckmon Keenan recruitment and inherited discard", () => {
  it.each([EffectTiming.OnPlay, EffectTiming.WhenDigivolving])(
    "recruits only Keenan with at most one Tamer at %s",
    async (timing) => {
      for (const count of [0, 1, 2]) {
        const s = setupEngine(
          {
            0: {
              battleArea: [
                { card: "BT27-078", as: "peckmon" },
                ...Array.from({ length: count }, () => ({ card: "BT1-085" })),
              ],
              hand: [{ card: "BT26-094", as: "keenan" }, "BT1-085"],
            },
          },
          { autoSelectCards: true, autoAcceptOptional: true },
        );
        await s.ready();
        await advance(s.engine).fire(timing, s.perm("peckmon"));
        expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("keenan").instanceId)).toBe(
          count <= 1,
        );
        expect(s.state.memory).toBe(0);
        expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT1-085")).toBe(true);
      }
    },
  );

  it("allows declining the free Keenan", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-078", as: "peckmon" }], hand: ["BT26-094"] } },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("peckmon"));
    expect(s.state.players[0]!.hand).toHaveLength(1);
  });

  it("lets the opponent choose their inherited deletion discard", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-081", as: "crowmon", under: ["BT27-078"] }] },
        1: { hand: ["BT1-009", "BT1-011"] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("crowmon").permanentId]);
    expect(s.state.players[1]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.trash).toHaveLength(1);
    expect(
      s.decisions.filter((d) => d.req.sourceCardId === "BT27-078" && d.req.kind === "selectCards").map((d) => d.seat),
    ).toEqual([1]);
  });
});
