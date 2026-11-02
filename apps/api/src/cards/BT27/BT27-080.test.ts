import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("ScourgeChiropmon removal and inherited revival", () => {
  it.each([true, false])(
    "deletes a level 4 and grants keywords only after paying a face-down Tamer card: %s",
    async (pay) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", faceUp: false }] }],
            hand: [{ card: "BT27-080", as: "card" }],
          },
          1: { battleArea: ["ST6-08", "BT1-060"] },
        },
        { autoSelectCards: true, autoAcceptOptional: pay, autoDeclineOptional: !pay },
      );
      await s.ready();
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.battleArea.length === 1 && !s.state.pendingDecision);
      expect(s.state.players[1]!.battleArea[0]!.topCard.cardId).toBe("BT1-060");
      const played = s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT27-080")!;
      expect([...played.keywords].includes("Rush")).toBe(pay);
      expect([...played.keywords].includes("Piercing")).toBe(pay);
      expect(s.perm("tamer").stack).toHaveLength(pay ? 0 : 1);
      expect(s.state.memory).toBe(3);
    },
  );

  it.each(["BT27-073", "BT27-077", "BT26-070", "BT26-095"])(
    "revives a qualifying Glowing Dawn card %s when inherited",
    async (card) => {
      const s = setupEngine(
        { 0: { battleArea: [{ card: "BT1-083", as: "host", under: ["BT27-080"] }], trash: [card, "BT1-009"] } },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
      expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain(card);
      expect(s.state.players[0]!.trash.some((c) => c.cardId === "BT1-009")).toBe(true);
    },
  );
  it.each(["BT27-073", "BT26-061"])(
    "places NightChiropmon at the bottom and pays a reduced level-skipping evolution from %s",
    async (base) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: base, as: "base", under: ["BT1-009"] },
              { card: "BT26-095", as: "makoto" },
            ],
            hand: [{ card: "BT27-080", as: "card" }],
            trash: ["BT26-070"],
            deck: ["BT1-009", "BT1-009", "BT1-009"],
          },
        },
        { autoSelectCards: true, autoDeclineOptional: true },
      );
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      s.state.memory = 10;
      const effects: { effectKey: string }[] = JSON.parse(s.inst("card").activatableEffectsJson || "[]");
      expect(effects).toHaveLength(1);
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("card").instanceId,
          effectKey: effects[0]!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "BT27-080" && !s.state.pendingDecision);
      expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT26-070", "BT1-009", base]);
      expect(s.state.memory).toBe(base === "BT27-073" ? 8 : 7);
      expect([...s.perm("base").keywords]).toContain("Retaliation");
      expect(s.state.players[0]!.trash).toHaveLength(0);
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
    },
  );

  it.each([
    {
      label: "no NightChiropmon in the trash",
      zones: { battleArea: ["BT27-073", "BT26-095"], hand: [{ card: "BT27-080", as: "card" }, "BT26-070"] },
    },
    {
      label: "its only Chiropmon in the breeding area",
      zones: {
        battleArea: ["BT26-095"],
        breeding: "BT27-073",
        hand: [{ card: "BT27-080", as: "card" }],
        trash: ["BT26-070"],
      },
    },
  ])("does not offer the hand evolution with $label", async ({ zones }) => {
    const s = setupEngine({ 0: { ...zones, deck: ["BT1-009", "BT1-009"] } }, { autoDeclineOptional: true });
    await s.ready();
    const effects: unknown[] = JSON.parse(s.inst("card").activatableEffectsJson || "[]");
    expect(effects).toHaveLength(0);
  });

  it("does not offer the hand evolution without Makoto", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT27-073"],
          hand: [{ card: "BT27-080", as: "card" }],
          trash: ["BT26-070"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const effects: unknown[] = JSON.parse(s.inst("card").activatableEffectsJson || "[]");
    expect(effects).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });
  it("pays the printed cost of 3 on an ordinary purple evolution and rejects a yellow-only base", async () => {
    for (const base of ["ST6-08", "BT1-058"]) {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-080", as: "card" }], deck: ["BT1-009"] },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      await s.ready();
      s.state.memory = 10;
      const result = s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      });
      expect(result.ok).toBe(base === "ST6-08");
      if (result.ok) {
        await settle(() => s.perm("base").topCard.cardId === "BT27-080");
      }
      expect(s.state.memory).toBe(base === "ST6-08" ? 7 : 10);
      expect(s.perm("base").topCard.cardId).toBe(base === "ST6-08" ? "BT27-080" : base);
    }
  });

  it("cannot skip levels while ignoring evolution requirements is prohibited", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-073", as: "base" }, "BT26-095"],
          hand: [{ card: "BT27-080", as: "card" }],
          trash: ["BT26-070"],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: ["BT8-059"] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const effects: { effectKey: string }[] = JSON.parse(s.inst("card").activatableEffectsJson || "[]");
    if (effects[0]) {
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("card").instanceId,
        effectKey: effects[0].effectKey,
      });
      await settle();
    }
    expect(s.perm("base").topCard.cardId).toBe("BT27-073");
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toContain("BT27-080");
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });
  it("uses Rush immediately and Piercing after winning a battle, then loses both at turn end", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", faceUp: false }] }],
          hand: [{ card: "BT27-080", as: "card" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-060", as: "defender", suspended: true }],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-080") && !s.state.pendingDecision,
    );
    const attacker = s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT27-080")!;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    expect([...attacker.keywords]).not.toContain("Rush");
    expect([...attacker.keywords]).not.toContain("Piercing");
  });

  it.each([true, false])(
    "does not grant keywords without a payable bottom face-down card: face up %s",
    async (faceUp) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT1-085", under: faceUp ? [{ card: "BT1-009", faceUp: true }] : [] }],
            hand: [{ card: "BT27-080", as: "card" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-080") && !s.state.pendingDecision,
      );
      const attacker = s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT27-080")!;
      expect([...attacker.keywords]).not.toContain("Rush");
      expect([...attacker.keywords]).not.toContain("Piercing");
    },
  );

  it("cannot revive an over-cost Glowing Dawn or an unrelated low-cost card", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT1-083", as: "host", under: ["BT27-080"] }], trash: ["BT27-080", "BT1-009"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });
  it("highlights deletion separately from the Then payment and keyword grant", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-085", under: [{ card: "BT1-009", faceUp: false }] }],
          hand: [{ card: "BT27-080", as: "card" }],
        },
        1: { battleArea: ["ST6-08", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-080") && !s.state.pendingDecision,
    );
    const deletion = "[On Play] [When Digivolving] Delete 1 of your opponent’s level 4 or lower Digimon.";
    const gain =
      "Then, by trashing the bottom face-down card from under any of your Tamers, this Digimon gains ＜Rush＞ and ＜Piercing＞ for the turn.";
    const options = s.decisions.filter((d) => d.req.sourceCardId === "BT27-080").map((d) => d.req.options);
    expect([...new Set(options.map((option) => option?.effectTextEmphasis))]).toEqual([deletion, gain]);
    for (const emphasis of [deletion, gain]) {
      expect(options).toContainEqual(
        expect.objectContaining({ timing: "OnPlay", effectText: `${deletion} ${gain}`, effectTextEmphasis: emphasis }),
      );
    }
  });
});
