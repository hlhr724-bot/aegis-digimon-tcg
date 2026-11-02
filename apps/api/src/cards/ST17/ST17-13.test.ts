import { describe, it, expect } from "vitest";
import type { Primitives } from "../../engine/effects/EffectContext.js";
import { setupEngine, settle, type EngineSetup, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

function primitivesOf(s: EngineSetup): Primitives {
  return (s.engine as unknown as { primitives: Primitives }).primitives;
}

describe("ST17-13 Magnamon [When Digivolving] — trash digi-cards per color, bounce no-stack Digimon", () => {
  it("issue #4905: trashes seven top sources using Merciful Mode's gained colors at resolution", async () => {
    const sources = ["BT1-009", "BT1-029", "BT1-045", "BT1-067", "BT2-069", "AD1-009", "BT1-009", "BT1-029"];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT11-023", as: "veemon" }], hand: [{ card: "ST17-13", as: "magnamon" }] },
        1: { battleArea: [{ card: "EX13-077", as: "merciful", under: sources }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const target = s.perm("merciful");
    expect(new Set(observe(s.engine).effectiveColors(target)).size).toBe(7);
    const originalSources = target.stack.map((card) => card.instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("veemon").permanentId,
        instanceId: s.inst("magnamon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST17-13"));

    expect(target.stack.map((card) => card.instanceId)).toEqual(originalSources.slice(0, 1));
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(originalSources.slice(1).reverse());
    expect(new Set(observe(s.engine).effectiveColors(target))).toEqual(new Set(["White", "Red"]));
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each(["BT1-020", "BT8-084"])(
    "issue #4905: does not count source colors without an active color grant on %s",
    async (card) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT11-023", as: "veemon" }], hand: [{ card: "ST17-13", as: "magnamon" }] },
          1: { battleArea: [{ card, as: "target", under: ["BT1-029", "BT1-045", "BT1-067"] }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      const target = s.perm("target");
      expect(observe(s.engine).effectiveColors(target)).toHaveLength(1);
      const originalSources = target.stack.map((source) => source.instanceId);

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("veemon").permanentId,
          instanceId: s.inst("magnamon").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST17-13"));

      // Kimeramon gains its sources' colors only during its controller's turn.
      expect(target.stack.map((source) => source.instanceId)).toEqual(originalSources.slice(0, -1));
      expect(s.state.players[1]!.trash.map((source) => source.instanceId)).toEqual(originalSources.slice(-1));
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("uses the alternate Veemon route for 3 memory, draws, and preserves physical stack identity", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-023", as: "veemon" }],
          hand: [{ card: "ST17-13", as: "magnamon" }],
          deck: [{ card: "BT1-009", as: "drawn" }, "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("veemon").permanentId,
        instanceId: s.inst("magnamon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("veemon").topCard.instanceId === s.inst("magnamon").instanceId);

    expect(s.state.memory).toBe(0);
    expect(s.perm("veemon").topCard.cardId).toBe("ST17-13");
    expect(s.perm("veemon").stack.map((card) => card.instanceId)).toEqual([s.inst("veemon").instanceId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
  });

  it("keeps the printed blue Lv.3 route at its normal cost of 4", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT11-023", as: "veemon" }], hand: [{ card: "ST17-13", as: "magnamon" }] },
    });
    s.state.memory = 4;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("veemon").permanentId,
        instanceId: s.inst("magnamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("veemon").topCard.cardId === "ST17-13");
    expect(s.state.memory).toBe(0);
  });

  it("rejects a near-name ExVeemon base at the invalid level boundary instead of using cost 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-022", as: "exveemon" }],
          hand: [{ card: "ST17-13", as: "magnamon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("exveemon").permanentId,
        instanceId: s.inst("magnamon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(10);
    expect(s.perm("exveemon").topCard.cardId).toBe("BT12-022");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("magnamon").instanceId);
  });

  it("trashes digi-cards equal to opponent Digimon's color count, bounces a no-stack Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT11-023", dp: 3000, as: "veemon" }], hand: [{ card: "ST17-13", as: "magnamon" }] },
        1: {
          battleArea: [
            {
              card: "AD1-004",
              dp: 8000,
              as: "oppDigimon",
              under: ["BT1-009", "BT1-014", "BT1-020"],
            },
            { card: "AD1-001", dp: 4000, as: "bounceTarget" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const p1 = s.state.players[1]!;
    const veemon = s.perm("veemon");
    const oppDigimon = s.perm("oppDigimon");
    const bounceTarget = s.perm("bounceTarget");
    const magnamonId = s.inst("magnamon").instanceId;

    const initialStack = oppDigimon.stack.length;
    const initialOppBattleCount = p1.battleArea.length;

    await primitivesOf(s).digivolveFromInstance(veemon.permanentId, magnamonId, { payCost: false });

    await settle(() => oppDigimon.stack.length < initialStack && p1.battleArea.length < initialOppBattleCount, 800);

    expect(oppDigimon.stack.length).toBe(initialStack - 2);
    expect(p1.trash.filter((card) => ["BT1-014", "BT1-020"].includes(card.cardId))).toHaveLength(2);

    expect(p1.battleArea.some((p) => p.permanentId === bounceTarget.permanentId)).toBe(false);
    expect(p1.hand.some((c) => c.cardId === "AD1-001")).toBe(true);
  });

  it("trashes exactly one top digi-card from a one-color target", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT11-023", as: "veemon" }], hand: [{ card: "ST17-13", as: "magnamon" }] },
        1: {
          battleArea: [{ card: "BT1-020", as: "oneColor", under: ["BT1-009", "BT1-014"] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const target = s.perm("oneColor");
    const before = target.stack.length;

    await primitivesOf(s).digivolveFromInstance(s.perm("veemon").permanentId, s.inst("magnamon").instanceId, {
      payCost: false,
    });
    await settle(() => target.stack.length < before);

    expect(target.stack).toHaveLength(before - 1);
  });
});

describe("ST17-13 Magnamon [Security] — end of security battle digivolution", () => {
  it("does not offer end-of-battle evolution when de-digivolution exposes an attacking Digi-Egg", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-037", as: "attacker", under: ["BT26-007"] }] },
        1: {
          battleArea: [{ card: "BT12-021", as: "veemon" }],
          security: [{ card: "ST17-13", as: "checked" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: false },
    );
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets", 3000);
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [attackerPermanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackEnded"), 3000);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT26-037", "BT26-007"]);
    expect(s.events.find((event) => event.kind === "securityChecked")).toMatchObject({
      revealedCardId: "ST17-13",
      resolution: "effect",
    });
    expect(s.events.find((event) => event.kind === "securityChecked")).not.toHaveProperty("battle");
    expect(s.perm("veemon").topCard.cardId).toBe("BT12-021");
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("checked").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(
      s.decisions.filter((decision) => decision.req.kind === "optional" && decision.req.sourceCardId === "ST17-13"),
    ).toEqual([]);
  });

  it("allows a legal own Digimon to digivolve into the checked card without paying memory", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST8-09", as: "attacker", dp: 12000 }] },
        1: {
          battleArea: [{ card: "BT11-023", as: "veemon" }],
          security: [{ card: "ST17-13", as: "magnamon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.perm("veemon").topCard.cardId === "ST17-13", 3000);
    expect(s.perm("veemon").topCard.cardId).toBe("ST17-13");
    expect(s.state.players[1]!.trash.some((card) => card.cardId === "BT11-023")).toBe(false);
  });

  it("lets the security effect de-digivolve a chosen Digimon owned by the security player", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST8-09", as: "attacker" },
            { card: "BT1-037", as: "opponentTarget", under: ["BT11-023"], suspended: true },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-037", as: "ownTarget", under: ["BT11-023"] }],
          security: [{ card: "ST17-13", as: "checked" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: false },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets", 3000);
    expect(s.state.pendingDecision?.kind).toBe("chooseTargets");
    const targetOptions = s.decisions.at(-1)?.req.options?.candidateInstanceIds ?? [];
    expect(targetOptions).toEqual(
      expect.arrayContaining([s.perm("ownTarget").permanentId, s.perm("opponentTarget").permanentId]),
    );
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("ownTarget").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("ownTarget").stack.length === 0 &&
        s.state.players[1]!.security.length === 0 &&
        s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("checked").instanceId) &&
        s.state.pendingDecision === undefined,
      3000,
    );

    expect(s.perm("ownTarget").topCard.cardId).toBe("BT11-023");
    expect(s.perm("ownTarget").stack).toHaveLength(0);
  });

  it("does not substitute an unrelated matching Magnamon from trash", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST8-09", as: "attacker", dp: 12000 }] },
        1: {
          battleArea: [{ card: "BT11-023", as: "veemon" }],
          security: [{ card: "ST17-13", as: "checked" }],
          trash: [{ card: "ST17-13", as: "unrelated" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.perm("veemon").topCard.cardId === "ST17-13", 3000);
    expect(s.perm("veemon").topCard.instanceId).toBe(s.inst("checked").instanceId);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("unrelated").instanceId)).toBe(true);
  });

  it("de-digivolves the attacking Digimon before the security battle continues", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST8-09", as: "attacker", dp: 12000, under: ["BT1-038"] }] },
        1: { security: [{ card: "ST17-13", as: "magnamon" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });

    await settle(
      () => !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === attackerPermanentId),
      3000,
    );
    expect(() => s.perm("attacker")).toThrow('permanent for "attacker"');
  });

  it("completes the security attack after refusing evolution and keeps the checked instance in trash", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST8-09", as: "attacker", dp: 12000 }] },
        1: {
          battleArea: [{ card: "BT11-023", as: "veemon" }],
          security: [{ card: "ST17-13", as: "checked" }],
          trash: [{ card: "ST17-13", as: "unrelated" }],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.players[1]!.security.length === 0 && s.state.pendingDecision === undefined, 3000);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([
      s.inst("unrelated").instanceId,
      s.inst("checked").instanceId,
    ]);
    expect(s.perm("veemon").topCard.cardId).toBe("BT11-023");
    expect(s.perm("veemon").stack).toHaveLength(0);
    expect(s.events.some((event) => event.kind === "securityChecked")).toBe(true);
  });
});

describe("ST17-13 Magnamon — KB Q&A rulings", () => {
  async function attackIntoCheckedMagnamon(securityPlayerBoard: PermanentSpec[]) {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST8-09", as: "attacker", dp: 12000 }] },
        1: { battleArea: securityPlayerBoard, security: [{ card: "ST17-13", as: "checked" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.security.length === 0 &&
        s.state.pendingDecision === undefined &&
        !observe(s.engine).isAttacking(),
      3000,
    );
    return s;
  }

  it("does not ignore digivolution requirements when digivolving into the checked card after the battle (Q833)", async () => {
    const illegal = await attackIntoCheckedMagnamon([
      { card: "BT1-009", as: "redLevel3" },
      { card: "BT1-037", as: "blueLevel4" },
    ]);
    expect(illegal.perm("redLevel3").topCard.cardId).toBe("BT1-009");
    expect(illegal.perm("blueLevel4").topCard.cardId).toBe("BT1-037");
    expect(illegal.state.players[1]!.trash.map((card) => card.instanceId)).toContain(
      illegal.inst("checked").instanceId,
    );

    const legal = await attackIntoCheckedMagnamon([{ card: "BT11-023", as: "blueLevel3" }]);
    expect(legal.perm("blueLevel3").topCard.instanceId).toBe(legal.inst("checked").instanceId);
  });

  it("resolves De-Digivolve 1 on the attacker before the security battle compares DP (Q834)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST8-09", as: "attacker", under: ["BT1-038"] }] },
        1: { security: [{ card: "ST17-13", as: "checked" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;
    expect(s.perm("attacker").currentDP).toBe(11000);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"), 3000);

    const check = s.events.find((event) => event.kind === "securityChecked");
    expect(check).toMatchObject({
      revealedCardId: "ST17-13",
      battle: { attackerDP: 6000, securityCardDP: 7000, attackerDeleted: true },
    });
    await settle(() => !s.state.players[0]!.battleArea.some((perm) => perm.permanentId === attackerPermanentId), 3000);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(expect.arrayContaining(["ST8-09", "BT1-038"]));
  });
});
