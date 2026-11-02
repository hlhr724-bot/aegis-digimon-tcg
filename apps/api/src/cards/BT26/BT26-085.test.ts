import { describe, expect, it } from "vitest";
import { compiled } from "./BT26-085.js";
import { EffectDuration, EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

describe("BT26-085 compiled behavior", () => {
  it.each([false, true])(
    "Execute deletes once after Giant Slayer evolves to Destroy Mode (Holy Mode=%s)",
    async (withHolyMode) => {
      const materials = ["BT26-001", "BT26-009", "BT26-011", "BT26-015", "BT26-016"];
      const s = setupEngine(
        {
          0: {
            hand: [
              { card: "BT26-085", as: "giantSlayer" },
              ...(withHolyMode ? [] : [{ card: "BT26-060", as: "destroyMode" }]),
            ],
            trash: [
              { card: "BT26-078", as: "cherubimon" },
              ...(withHolyMode ? [{ card: "BT26-060", as: "destroyMode" }] : []),
              ...(withHolyMode ? materials.map((card, i) => ({ card, as: `material${i}` })) : []),
            ],
            deck: ["BT1-009", "BT1-010", "BT1-011"],
            security: ["BT1-009", "BT1-010"],
          },
          1: { deck: ["BT1-009", "BT1-010"], security: ["BT1-009", "BT1-009", "BT1-009"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(0);
        s.state.memory = withHolyMode ? 2 : 7;
        expect(
          s.engine.applyIntent(0, {
            type: "playCard",
            instanceId: s.inst("giantSlayer").instanceId,
            ...(withHolyMode
              ? { assembly: { materialInstanceIds: materials.map((_, i) => s.inst(`material${i}`).instanceId) } }
              : {}),
          }),
        ).toEqual({ ok: true });
        await settle(() => s.events.some((e) => e.kind === "attackDeclared"));
        await advance(s.engine).finishAttack();
        await advance(s.engine).waitForMainPhase(1);
        expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT26-060");
        expect(s.state.players[0]!.security).toHaveLength(2);
        expect(
          s.events.filter((e) => e.kind === "effectTriggered" && e.effectKey.startsWith("granted/Execute deletion/")),
        ).toHaveLength(1);
        expect(
          s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT26-016"),
        ).toHaveLength(0);
      } finally {
        s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
        await loop;
      }
    },
  );

  it("proves Assembly's five different-level Chronomon-text-or-Shaman materials and keywords", () => {
    expect(getCardDefinition("BT26-085")).toMatchObject({
      nameEn: "Giant Slayer",
      colors: ["White"],
      kinds: ["Digimon"],
      playCost: 12,
      dp: 14000,
      attributes: ["NO DATA"],
      types: ["TS"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.assemblyRequirement).toEqual([
      {
        reduceCost: 5,
        materials: [
          {
            count: 5,
            differentLevels: true,
            nameOrTrait: [
              { tokens: ["Chronomon"], match: "text" },
              { tokens: ["Shaman"], match: "trait" },
            ],
          },
        ],
      },
    ]);
    expect(compiled.keywords).toEqual([
      { keyword: "Collision", raw: "＜Collision＞" },
      { keyword: "Reboot", raw: "＜Reboot＞" },
      { keyword: "Blocker", raw: "＜Blocker＞" },
    ]);
  });

  it("protects DP and the evolution stack, then replaces leaving with a free Destroy Mode digivolution", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "OnPlay")?.actions).toEqual([
      expect.objectContaining({
        kind: "Restrict",
        restriction: "dpImmune",
        duration: "untilOpponentTurnEnd",
        byOpponentEffectsOnly: true,
      }),
      expect.objectContaining({ kind: "StackTrashLock", duration: "untilOpponentTurnEnd" }),
    ]);
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")?.actions[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      mode: "prevent",
      sourceFilter: { isSelfRef: true },
      actions: [
        {
          kind: "Digivolve",
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          target: { isSelf: true },
          into: { nameOrTrait: [{ tokens: ["Chronomon: Destroy Mode"], match: "nameExact" }] },
        },
        { kind: "Prevent", condition: { kind: "ifThisEffectDigivolved" } },
      ],
    });
  });

  it("plays by Assembly with five matching cards at five different levels", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-085", as: "giantSlayer" }],
        trash: [
          { card: "BT26-001", as: "level2" },
          { card: "BT26-009", as: "level3" },
          { card: "BT26-011", as: "level4" },
          { card: "BT26-015", as: "level5" },
          { card: "BT26-016", as: "level6" },
        ],
      },
    });
    s.state.memory = 7;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("giantSlayer").instanceId,
        assembly: {
          materialInstanceIds: ["level2", "level3", "level4", "level5", "level6"].map(
            (alias) => s.inst(alias).instanceId,
          ),
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT26-085"));

    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT26-085");
    expect(new Set(played?.stack.map(({ cardId }) => cardId))).toEqual(
      new Set(["BT26-001", "BT26-009", "BT26-011", "BT26-015", "BT26-016"]),
    );
    expect(s.state.memory).toBe(0);
  });

  it("rejects Assembly when the five matching materials don't have different levels", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-085", as: "giantSlayer" }],
        trash: [
          { card: "BT26-009", as: "first" },
          { card: "BT26-009", as: "second" },
          { card: "BT26-009", as: "third" },
          { card: "BT26-009", as: "fourth" },
          { card: "BT26-009", as: "fifth" },
        ],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("giantSlayer").instanceId,
        assembly: {
          materialInstanceIds: ["first", "second", "third", "fourth", "fifth"].map((alias) => s.inst(alias).instanceId),
        },
      } as never),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("installs the opponent DP immunity restriction on play", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT26-085", as: "giantSlayer" }] } });
    void s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("giantSlayer").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-085"));

    expect(observe(s.engine).isRestricted(s.perm("giantSlayer"), "dpImmune")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
  });

  it("blocks opponent DP reduction and stack trash while allowing its controller's effects", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT26-085", as: "giantSlayer" }] } });
    void s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("giantSlayer").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-085"));
    const originalDp = s.perm("giantSlayer").currentDP;

    advance(s.engine).verb.enterEffectResolution(1);
    await advance(s.engine).verb.modifyDP(
      s.perm("giantSlayer").permanentId,
      -3000,
      EffectDuration.UntilOpponentTurnEnd,
    );
    advance(s.engine).verb.leaveEffectResolution();

    expect(s.perm("giantSlayer").currentDP).toBe(originalDp);

    advance(s.engine).verb.enterEffectResolution(0);
    await advance(s.engine).verb.modifyDP(
      s.perm("giantSlayer").permanentId,
      -3000,
      EffectDuration.UntilOpponentTurnEnd,
    );
    advance(s.engine).verb.leaveEffectResolution();

    expect(s.perm("giantSlayer").currentDP).toBe(originalDp - 3000);
    advance(s.engine).endMainPhaseIfOpen(0);
  });

  it("blocks an opponent's public stack-trash effect after an Assembly play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-017", as: "attacker", under: ["BT16-016"] }],
          security: ["BT1-009"],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: {
          hand: [{ card: "BT26-085", as: "giantSlayer" }],
          trash: [
            { card: "BT26-001", as: "level2" },
            { card: "BT26-009", as: "level3" },
            { card: "BT26-011", as: "level4" },
            { card: "BT26-015", as: "level5" },
            { card: "BT26-016", as: "level6" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 7;
    expect(
      s.engine.applyIntent(1, {
        type: "playCard",
        instanceId: s.inst("giantSlayer").instanceId,
        assembly: {
          materialInstanceIds: ["level2", "level3", "level4", "level5", "level6"].map(
            (alias) => s.inst(alias).instanceId,
          ),
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("giantSlayer").stack.length === 5);
    const protectedStack = s.perm("giantSlayer").stack.map(({ instanceId }) => instanceId);

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.perm("giantSlayer").stack.map(({ instanceId }) => instanceId)).toEqual(protectedStack);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).not.toEqual(
      expect.arrayContaining(protectedStack),
    );
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).not.toContain("BT26-001");
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("uses Collision to force a plain opposing Digimon to block", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT26-085", as: "giantSlayer" }] },
      1: {
        battleArea: [{ card: "BT1-009", as: "plainBlocker", dp: 3000 }],
        security: ["BT1-009"],
      },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("giantSlayer").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));

    expect(
      s.engine.applyIntent(1, {
        type: "declareBlock",
        blockerPermanentId: s.perm("plainBlocker").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("uses Blocker against an opponent attack and Reboot during the opponent's active phase", async () => {
    const blocking = setupEngine({
      0: {
        battleArea: [{ card: "BT26-085", as: "giantSlayer" }],
        security: ["BT1-010"],
        deck: ["BT1-011", "BT1-012"],
      },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }], deck: ["BT1-011", "BT1-012"] },
    });
    const blockingLoop = blocking.engine.startTurnLoop();
    await advance(blocking.engine).waitForMainPhase(0);
    advance(blocking.engine).endMainPhaseIfOpen(0);
    await advance(blocking.engine).waitForMainPhase(1);
    expect(observe(blocking.engine).hasKeyword(blocking.perm("giantSlayer"), "Blocker")).toBe(true);

    expect(
      blocking.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: blocking.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => blocking.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(
      blocking.engine.applyIntent(0, {
        type: "declareBlock",
        blockerPermanentId: blocking.perm("giantSlayer").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => blocking.events.some(({ kind }) => kind === "combatResolved"));
    expect(blocking.state.players[0]!.security).toHaveLength(1);
    expect(blocking.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await blockingLoop;

    const reboot = setupEngine({
      0: { battleArea: [{ card: "BT26-085", as: "giantSlayer", suspended: true }], deck: ["BT1-011", "BT1-012"] },
      1: { deck: ["BT1-011", "BT1-012"] },
    });
    const rebootLoop = reboot.engine.startTurnLoop();
    await advance(reboot.engine).waitForMainPhase(0);
    advance(reboot.engine).endMainPhaseIfOpen(0);
    await advance(reboot.engine).waitForMainPhase(1);
    expect(observe(reboot.engine).hasKeyword(reboot.perm("giantSlayer"), "Reboot")).toBe(true);
    advance(reboot.engine).endMainPhaseIfOpen(1);
    expect(reboot.perm("giantSlayer").isSuspended).toBe(false);
    expect(reboot.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await rebootLoop;
  });

  it("replaces leaving with a free Destroy Mode digivolution from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-085", as: "giantSlayer" }],
          hand: [{ card: "BT26-060", as: "destroyMode" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("giantSlayer").permanentId], "byEffect")).toBe(0);
    await settle(() => s.perm("giantSlayer").topCard.cardId === "BT26-060");

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("replaces leaving with Destroy Mode from trash and may decline the replacement", async () => {
    const fromTrash = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-085", as: "giantSlayer" }],
          trash: [{ card: "BT26-060", as: "destroyMode" }],
          deck: ["BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await fromTrash.ready();

    expect(
      await advance(fromTrash.engine).verb.deletePermanent([fromTrash.perm("giantSlayer").permanentId], "byEffect"),
    ).toBe(0);
    await settle(() => fromTrash.perm("giantSlayer").topCard.cardId === "BT26-060");
    expect(fromTrash.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT1-011");

    const declined = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-085", as: "giantSlayer" }],
          hand: [{ card: "BT26-060", as: "destroyMode" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await declined.ready();

    expect(
      await advance(declined.engine).verb.deletePermanent([declined.perm("giantSlayer").permanentId], "byEffect"),
    ).toBe(1);
    expect(declined.state.players[0]!.battleArea).toHaveLength(0);
    expect(declined.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT26-085");
    expect(declined.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT26-060");
  });

  it("leaves the battle area when no Destroy Mode is available to digivolve into", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-085", as: "giantSlayer" }],
          hand: [{ card: "BT26-016", as: "wrongChronomon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("giantSlayer").permanentId], "byEffect")).toBe(1);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT26-085");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT26-016");
  });
});

describe("BT26-085 Giant Slayer — KB Q&A rulings", () => {
  it.each([false, true])(
    "stops De-Digivolve and bottom digivolution-card trashing from trashing its stacked cards (locked=%s) (Q7129)",
    async (locked) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT26-085", as: "giantSlayer", under: ["BT26-009", "BT26-011", "BT26-015"] }] },
          1: {
            battleArea: ["BT1-030"],
            hand: [
              { card: "EX13-052", as: "deDigivolver" },
              { card: "BT3-100", as: "bottomTrasher" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      await s.ready();
      if (locked) await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("giantSlayer"));
      s.state.turnSeat = 1;
      s.state.memory = 10;
      const stackCardIds = () => [
        ...s.perm("giantSlayer").stack.map(({ cardId }) => cardId),
        s.perm("giantSlayer").topCard.cardId,
      ];

      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("deDigivolver").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
      await settle();
      expect(stackCardIds()).toEqual(
        locked ? ["BT26-009", "BT26-011", "BT26-015", "BT26-085"] : ["BT26-009", "BT26-011", "BT26-015"],
      );

      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("bottomTrasher").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.trash.some(({ cardId }) => cardId === "BT3-100"));
      await settle();
      expect(stackCardIds()).toEqual(locked ? ["BT26-009", "BT26-011", "BT26-015", "BT26-085"] : ["BT26-015"]);
    },
  );

  async function assembleGiantSlayer(materialCardIds: string[]) {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-085", as: "giantSlayer" }],
        trash: materialCardIds.map((card, index) => ({ card, as: `material${index}` })),
      },
    });
    s.state.memory = 7;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "playCard",
      instanceId: s.inst("giantSlayer").instanceId,
      assembly: { materialInstanceIds: materialCardIds.map((_, index) => s.inst(`material${index}`).instanceId) },
    } as never);
    return { s, result };
  }

  it("accepts cards whose [Chronomon] appears only in effects or inherited effects as Assembly materials (Q7130)", async () => {
    const { s, result } = await assembleGiantSlayer(["BT26-001", "BT26-009", "BT26-011", "BT26-015", "BT26-078"]);

    expect(result).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-085"));
    expect(new Set(s.perm("giantSlayer").stack.map(({ cardId }) => cardId))).toEqual(
      new Set(["BT26-001", "BT26-009", "BT26-011", "BT26-015", "BT26-078"]),
    );
  });

  it("rejects an Assembly material with no [Chronomon] anywhere in its text and no [Shaman] trait (Q7130)", async () => {
    const { s, result } = await assembleGiantSlayer(["BT26-001", "BT1-009", "BT26-011", "BT26-015", "BT26-078"]);

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(7);
  });
});
