import { EffectTiming, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT14-007.js";

describe("BT14-007", () => {
  it("may free-digivolve into a Greymon with Tai Kamiya at the start of main phase", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "StartOfYourMainPhase")).toMatchObject({
      actions: [
        {
          kind: "Digivolve",
          payCost: false,
          from: ["hand"],
          condition: { kind: "youHave" },
          into: { nameOrTrait: [{ tokens: ["Greymon"], match: "nameExact" }] },
        },
      ],
    }));
  it("inherits +2000 DP for Greymon or Omnimon", () =>
    expect(compiled.effects?.find((entry) => entry.isInherited)).toMatchObject({
      actions: [{ kind: "Aura", effect: { kind: "modifyDP", amount: 2000 }, while: { kind: "selfHasNameContaining" } }],
    }));

  it("free-digivolves into a Greymon when Tai Kamiya is present", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT14-007", as: "agumon" },
            { card: "BT1-085", as: "tai" },
          ],
          hand: [{ card: "BT1-015", as: "greymon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    const agumon = s.perm("agumon");
    await advance(s.engine).runTurn(0);
    await settle(() => agumon.topCard?.cardId === "BT1-015");
    expect(agumon.topCard?.cardId).toBe("BT1-015");
    expect(agumon.stack.some((card) => card.cardId === "BT14-007")).toBe(true);
  });

  it("uses the legal Koromon stack, free-digivolves with Tai, and grants inherited DP", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT14-001", as: "koromon" },
          battleArea: [{ card: "BT1-085", as: "tai" }],
          hand: [
            { card: "BT14-007", as: "agumon" },
            { card: "BT14-012", as: "greymon" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("koromon").permanentId,
        instanceId: s.inst("agumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("koromon").topCard.cardId === "BT14-007");

    s.state.phase = Phase.Breeding;
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("koromon").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => !s.perm("koromon").inBreeding);
    s.state.phase = Phase.Main;
    const memoryBefore = s.state.memory;
    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("koromon"));
    await settle(() => s.perm("koromon").topCard.cardId === "BT14-012");

    expect(s.perm("koromon").topCard.cardId).toBe("BT14-012");
    expect(s.perm("koromon").stack.map((card) => card.cardId)).toEqual(["BT14-001", "BT14-007"]);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.perm("koromon").currentDP).toBe(7000);
    assertNoLoudGap(s);
  });

  it("does not free-digivolve without Tai or into a Greymon that fails normal requirements", async () => {
    const withoutTai = setupEngine(
      { 0: { battleArea: [{ card: "BT14-007", as: "agumon" }], hand: [{ card: "BT14-012", as: "greymon" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(withoutTai.engine).runTurn(0);
    await settle();
    expect(withoutTai.perm("agumon").topCard.cardId).toBe("BT14-007");

    const invalid = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT14-007", as: "agumon" },
            { card: "BT1-085", as: "tai" },
          ],
          hand: [{ card: "BT14-014", as: "metalGreymon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(invalid.engine).runTurn(0);
    await settle();
    expect(invalid.perm("agumon").topCard.cardId).toBe("BT14-007");
    assertNoLoudGap(withoutTai);
    assertNoLoudGap(invalid);
  });
});

describe("BT14-007 Agumon — KB Q&A rulings", () => {
  it("only free-digivolves into a [Greymon] whose digivolution requirements it meets (Q2373)", async () => {
    const setup = (greymon: string) =>
      setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT14-007", as: "agumon" },
              { card: "BT1-085", as: "tai" },
            ],
            hand: [{ card: greymon, as: "greymon" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );

    const blackGreymon = setup("BT2-057");
    await advance(blackGreymon.engine).fire(EffectTiming.OnStartMainPhase, blackGreymon.perm("agumon"));
    await settle();
    expect(blackGreymon.perm("agumon").topCard.cardId).toBe("BT14-007");
    expect(blackGreymon.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT2-057"]);
    assertNoLoudGap(blackGreymon);

    const redGreymon = setup("BT1-015");
    const memoryBefore = redGreymon.state.memory;
    await advance(redGreymon.engine).fire(EffectTiming.OnStartMainPhase, redGreymon.perm("agumon"));
    await settle(() => redGreymon.perm("agumon").topCard.cardId === "BT1-015");
    expect(redGreymon.perm("agumon").topCard.cardId).toBe("BT1-015");
    expect(redGreymon.state.memory).toBe(memoryBefore);
  });
});
