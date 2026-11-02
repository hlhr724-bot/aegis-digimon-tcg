import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { compiled } from "./BT22-031.js";

describe("BT22-031 GoldNumemon", () => {
  it("applies Security Attack -2 and gates the PlatinumNumemon option on same-level stack cards", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      const effect = compiled.effects.find((entry) => entry.trigger === trigger);
      expect(effect?.actions[0]).toMatchObject({
        kind: "GainKeyword",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        keyword: { keyword: "SecurityAttack", amount: -2 },
        duration: "untilOpponentTurnEnd",
      });
      expect(effect?.actions[1]).toMatchObject({
        kind: "Digivolve",
        into: { nameOrTrait: [{ tokens: ["PlatinumNumemon"], match: "nameExact" }] },
        from: ["hand"],
        costOverride: 4,
        ignoreRequirements: true,
        optional: true,
        condition: { kind: "stackHasSameLevelCards", count: 2 },
      });
    }
    const inherited = compiled.effects.find((entry) => entry.trigger === "YourTurn");
    expect(inherited).toMatchObject({
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          sourceFilter: { isSelfRef: true },
          into: { nameOrTrait: [{ tokens: ["CS"], match: "trait" }] },
          actions: [{ kind: "Replacement", mode: "reduceCost", amount: 1 }],
        },
      ],
    });
  });

  it("uses the alternate CS route and resolves the When Digivolving debuff", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-019", as: "csRookie" }],
          hand: [{ card: "BT22-031", as: "goldNumemon" }],
        },
        1: { battleArea: [{ card: "BT22-024", as: "opponent" }] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("csRookie").permanentId,
        instanceId: s.inst("goldNumemon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).keywordAmount(s.perm("opponent"), "SecurityAttack") === -2);

    expect(s.state.memory).toBe(0);
    expect(s.perm("csRookie").topCard?.cardId).toBe("BT22-031");
    expect(observe(s.engine).keywordAmount(s.perm("opponent"), "SecurityAttack")).toBe(-2);
  });

  it("implements Q4879 and pays exactly 4 to evolve into either PlatinumNumemon", async () => {
    for (const platinum of ["BT14-066", "BT22-065"]) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT22-031", under: ["BT22-031"], as: "goldNumemon" }],
            hand: [{ card: platinum, as: "platinum" }],
          },
          1: { battleArea: [{ card: "BT1-080", as: "opponent" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      s.state.memory = 4;

      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("goldNumemon"));
      await settle(() => s.perm("goldNumemon").topCard?.cardId === platinum);

      expect(s.state.memory).toBe(platinum === "BT22-065" ? 1 : 0);
      expect(s.perm("goldNumemon").topCard?.cardId).toBe(platinum);
      expect(observe(s.engine).keywordAmount(s.perm("opponent"), "SecurityAttack")).toBe(-2);
    }
  });

  it("still applies the debuff when the same-level condition fails or evolution is refused", async () => {
    for (const scenario of ["conditionFails", "refused"] as const) {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              {
                card: "BT22-031",
                under: scenario === "conditionFails" ? ["BT22-030"] : ["BT22-031"],
                as: "goldNumemon",
              },
            ],
            hand: [{ card: "BT22-065", as: "platinum" }],
          },
          1: { battleArea: [{ card: "BT22-024", as: "opponent" }] },
        },
        { autoAcceptOptional: scenario !== "refused", autoSelectCards: true },
      );
      await s.ready();
      s.state.memory = 4;

      const resolution = advance(s.engine).fire(EffectTiming.OnPlay, s.perm("goldNumemon"));
      if (scenario === "refused") {
        await settle(() => s.state.pendingDecision?.kind === "optional");
        expect(
          s.engine.applyIntent(0, {
            type: "respondDecision",
            decisionId: s.state.pendingDecision!.decisionId,
            response: { kind: "optional", accept: false },
          }),
        ).toEqual({ ok: true });
      }
      await resolution;

      expect(s.perm("goldNumemon").topCard?.cardId).toBe("BT22-031");
      expect(s.state.memory).toBe(4);
      expect(observe(s.engine).keywordAmount(s.perm("opponent"), "SecurityAttack")).toBe(-2);
    }
  });

  it("reduces CS evolution costs by 1 independently from realistic inherited stacks", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-037", under: ["BT22-031"], as: "firstHost" },
            { card: "BT22-037", under: ["BT22-031"], as: "secondHost" },
          ],
          hand: [
            { card: "BT22-065", as: "firstPlatinum" },
            { card: "BT22-065", as: "secondPlatinum" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 6;

    for (const [host, platinum] of [
      ["firstHost", "firstPlatinum"],
      ["secondHost", "secondPlatinum"],
    ] as const) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm(host).permanentId,
          instanceId: s.inst(platinum).instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm(host).topCard?.cardId === "BT22-065");
    }

    expect(s.state.memory).toBe(0);
  });
});
