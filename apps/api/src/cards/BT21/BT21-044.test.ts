import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import {
  setupEngine,
  settle,
  type BoardSpec,
  type EngineSetup,
  type SetupEngineOptions,
} from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT21-044.js";
import "../index.js";

describe("BT21-044 compiled implementation", () => {
  it("exposes complete effect coverage with no residual clauses", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual ?? []).toEqual([]);
    expect(compiled.effects).toBeDefined();
  });

  it("preserves the registered effect triggers and action boundaries", () => {
    expect(compiled.effects.every((effect) => typeof effect.trigger === "string")).toBe(true);
    for (const effect of compiled.effects) {
      expect(Array.isArray(effect.actions)).toBe(true);
      for (const action of effect.actions ?? []) expect(typeof action.kind).toBe("string");
    }
  });

  it("preserves the GeoGreymon alternate Digivolution requirement", () => {
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["GeoGreymon"], cost: 3, isAlternate: true }]);
  });

  it("grants one Marcus Damon the temporary Digimon, DP, restriction, and keyword effects", () => {
    const selectedMarcusTarget = { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" };
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      const effect = compiled.effects.find((entry) => entry.trigger === trigger);
      expect(effect?.actions).toEqual([
        {
          kind: "SelectBind",
          target: {
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["Marcus Damon"], match: "nameExact" }] },
            count: 1,
            bindAs: "bt21-044-marcus",
          },
        },
        {
          kind: "GrantStatic",
          target: selectedMarcusTarget,
          grant: "kinds",
          tokens: ["Digimon"],
          duration: "forTheTurn",
        },
        {
          kind: "SetBaseDP",
          target: selectedMarcusTarget,
          value: 3000,
          duration: "forTheTurn",
        },
        {
          kind: "Restrict",
          target: selectedMarcusTarget,
          restriction: "digivolve",
          duration: "forTheTurn",
        },
        {
          kind: "GainKeyword",
          target: selectedMarcusTarget,
          keyword: { keyword: "Rush", raw: "＜Rush＞" },
          duration: "forTheTurn",
          effectTextPart:
            "[On Play] [When Digivolving] For the turn, 1 of your [Marcus Damon]s is also treated as a 3000 DP Digimon, can't digivolve, and gains ＜Rush＞ and ＜Alliance＞.",
        },
        {
          kind: "GainKeyword",
          target: selectedMarcusTarget,
          keyword: { keyword: "Alliance", raw: "＜Alliance＞" },
          duration: "forTheTurn",
          effectTextPart:
            "[On Play] [When Digivolving] For the turn, 1 of your [Marcus Damon]s is also treated as a 3000 DP Digimon, can't digivolve, and gains ＜Rush＞ and ＜Alliance＞.",
        },
        {
          kind: "Attack",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          withoutSuspending: false,
          optional: true,
          effectTextPart: "Then, 1 of your Digimon may attack.",
        },
      ]);
    }
  });

  it("declares independent once-per-turn main and inherited deletion watchers", () => {
    const watchers = compiled.effects.filter((effect) => effect.trigger === "AllTurns");
    expect(watchers).toHaveLength(2);
    expect(watchers[0]).toMatchObject({ frequency: "OncePerTurn", sharedUseKey: "bt21-044-marcus-security" });
    expect(watchers[1]).toMatchObject({
      frequency: "OncePerTurn",
      isInherited: true,
    });
    expect(watchers[1]?.sharedUseKey).not.toBe(watchers[0]?.sharedUseKey);
    expect(watchers[0]?.actions).toEqual(watchers[1]?.actions);
  });

  it("enters through the public play intent with Marcus and attack hooks registered", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT21-044", as: "rizegreymon" }] } });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rizegreymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("rizegreymon").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("rizegreymon").instanceId)).toBe(
      true,
    );
  });

  it("publicly lets the selected Marcus Damon attack after On Play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-044", as: "rize" }],
          battleArea: [{ card: "BT13-095", as: "marcus" }],
        },
        1: { security: ["BT1-009", "BT1-001", "BT1-002"], deck: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-044"));
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.permanentId === s.perm("marcus").permanentId && permanent.isSuspended,
      ),
    );
    await settle(() => s.events.some((event) => event.kind === "alliancePrompt"));
    expect(s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm("rize").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());
    expect(observe(s.engine).isAttacking()).toBe(false);
    expect(s.perm("rize").isSuspended).toBe(true);
    expect(s.perm("marcus").currentDP).toBe(3000);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Alliance")).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("expires the public Marcus treatment at the end of its own turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-095", as: "marcus" }],
          hand: [{ card: "BT21-044", as: "rize" }, "BT1-009"],
          deck: ["BT1-001", "BT1-002", "BT1-003", "BT1-004"],
        },
        1: { hand: ["BT1-009"], security: ["BT1-001", "BT1-002"], deck: ["BT1-005", "BT1-006", "BT1-007"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("marcus"), "Alliance"));
    expect(s.perm("marcus").currentDP).toBe(3000);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Alliance")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("marcus"), "digivolve")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("marcus").topCard.cardId).toBe("BT13-095");
    expect(s.perm("marcus").currentDP).toBe(0);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Alliance")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("marcus"), "digivolve")).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    s.state.turnSeat = 0;
    s.state.memory = 3;
    const nextOwnTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("marcus").permanentId,
        target: { kind: "player" },
      }),
    ).toMatchObject({ ok: false });
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextOwnTurn;
  });

  it("treats Marcus Damon & Agumon as [Marcus Damon] through its name rule", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-021", as: "ruleMarcus" }],
          hand: [{ card: "BT21-044", as: "rize" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT21-044"));

    expect(s.perm("ruleMarcus").currentDP).toBe(3000);
    expect(observe(s.engine).hasKeyword(s.perm("ruleMarcus"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("ruleMarcus"), "Alliance")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("ruleMarcus"), "digivolve")).toBe(true);
  });

  it("observably turns exactly one Marcus into a 3000 DP Digimon with both keywords and no digivolution", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-044", as: "rize" },
            { card: "BT13-095", as: "chosenMarcus" },
            { card: "BT12-092", as: "otherMarcus" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosenMarcus").topCard.instanceId);
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));

    expect(s.perm("chosenMarcus").currentDP).toBe(3000);
    expect(observe(s.engine).hasKeyword(s.perm("chosenMarcus"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("chosenMarcus"), "Alliance")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("chosenMarcus"), "digivolve")).toBe(true);
    expect(s.perm("otherMarcus").currentDP).toBe(0);
    expect(observe(s.engine).hasKeyword(s.perm("otherMarcus"), "Rush")).toBe(false);
  });

  it("alternate-digivolves from GeoGreymon for 3 and resolves the optional attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-042", as: "geo" },
            { card: "BT13-095", as: "marcus" },
          ],
          hand: [{ card: "BT21-044", as: "rize" }],
        },
        1: { security: [{ card: "BT1-009", as: "security" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("geo").permanentId,
        instanceId: s.inst("rize").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("geo").topCard.cardId === "BT21-044" && s.state.players[1]!.security.length === 0);

    expect(s.state.memory).toBe(2);
    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("places Marcus from trash on top of security after a yellow Tamer is deleted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-044", as: "rize" },
            { card: "BT1-087", as: "yellowTamer" },
          ],
          trash: [{ card: "BT13-095", as: "marcus" }],
          security: [{ card: "BT1-009", as: "existingSecurity" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("yellowTamer").permanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === s.inst("marcus").instanceId));

    expect(s.state.players[0]!.security[0]!.instanceId).toBe(s.inst("marcus").instanceId);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("marcus").instanceId)).toBe(false);
  });

  it.each([false, true])(
    "recovers only once per turn for each printed deletion effect, inherited: %s",
    async (inherited) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              inherited ? { card: "BT13-018", as: "rize", under: ["BT21-044"] } : { card: "BT21-044", as: "rize" },
              { card: "BT1-087", as: "yellowTamer" },
              { card: "BT13-095", as: "redTamer" },
            ],
            trash: [
              { card: "BT13-095", as: "marcus1" },
              { card: "BT12-092", as: "marcus2" },
            ],
            security: [{ card: "BT1-001", as: "existingSecurity" }],
          },
          1: {
            battleArea: [{ card: "BT15-055", as: "blackSource" }],
            hand: [
              { card: "BT15-097", as: "slicer1" },
              { card: "BT15-097", as: "slicer2" },
              { card: "BT15-055", as: "machine1" },
              { card: "BT15-055", as: "machine2" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const yellowTamerId = s.perm("yellowTamer").permanentId;
      const redTamerId = s.perm("redTamer").permanentId;
      const firstMarcusId = s.inst("marcus1").instanceId;
      const secondMarcusId = s.inst("marcus2").instanceId;
      s.state.turnSeat = 1;
      s.state.memory = 10;
      await s.ready();

      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("slicer1").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.security[0]?.instanceId === firstMarcusId);
      expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === yellowTamerId)).toBe(false);
      expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === redTamerId)).toBe(true);
      expect(s.state.players[0]!.security[0]?.instanceId).toBe(firstMarcusId);
      expect(s.state.players[0]!.security[0]?.faceUp).toBe(false);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === firstMarcusId)).toBe(false);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("machine1").instanceId)).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("slicer1").instanceId)).toBe(true);
      expect(s.state.memory).toBe(5);

      const optionalCountAfterFirst = s.decisions.filter(({ req }) => req.kind === "optional").length;
      expect(optionalCountAfterFirst).toBe(1);
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("slicer2").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.battleArea.some((p) => p.permanentId === redTamerId) === false);

      expect(s.state.players[0]!.security).toHaveLength(2);
      expect(s.state.players[0]!.security[0]?.instanceId).toBe(firstMarcusId);
      expect(s.state.players[0]!.security.some((card) => card.instanceId === secondMarcusId)).toBe(false);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === secondMarcusId)).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("machine2").instanceId)).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("slicer2").instanceId)).toBe(true);
      expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(optionalCountAfterFirst);
      expect(s.state.memory).toBe(0);
    },
  );

  it("does not trigger the security recovery for a non-red, non-yellow Tamer deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-044", as: "rize" },
            { card: "BT8-087", as: "blueTamer" },
          ],
          trash: [{ card: "BT13-095", as: "marcus" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("blueTamer").permanentId], "byEffect")).toBe(1);

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("marcus").instanceId)).toBe(true);
  });
});

describe("BT21-044 RizeGreymon — KB Q&A rulings", () => {
  it("lets a [Marcus Damon] treated as a Digimon attack and use the inherited effects under it (Q4545)", async () => {
    const s = setupDecliningAlliance(
      {
        0: {
          battleArea: [
            { card: RIZEGREYMON, as: "rize" },
            { card: MARCUS_WITHOUT_SUSPEND_TRIGGER, as: "marcus", under: [PANJYAMON_INHERITS_MEMORY] },
          ],
        },
        1: { security: [...OPPONENT_SECURITY] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(attackPlayer(s, "marcus").ok).toBe(false);
    expect(observe(s.engine).canUseInheritedEffect(s.perm("marcus"), PANJYAMON_INHERITS_MEMORY)).toBe(false);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
    expect(s.perm("marcus").currentDP).toBe(3000);
    expect(observe(s.engine).canUseInheritedEffect(s.perm("marcus"), PANJYAMON_INHERITS_MEMORY)).toBe(true);

    expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());

    expect(s.perm("marcus").isSuspended).toBe(true);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("keeps a [Marcus Damon] treated as a Digimon a Tamer, so its deletion triggers the red/yellow Tamer watcher (Q4546)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: RIZEGREYMON, as: "rize", suspended: true },
            { card: MARCUS_DAMON, as: "marcus", suspended: true },
            { card: YELLOW_AGUMON, as: "yellowDigimon" },
          ],
          trash: [{ card: MARCUS_WITHOUT_SUSPEND_TRIGGER, as: "trashedMarcus" }],
          security: [FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
    expect(s.perm("marcus").currentDP).toBe(3000);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("yellowDigimon").permanentId], "byEffect")).toBe(1);
    await settle();
    expect(s.state.players[0]!.security).toHaveLength(1);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("marcus").permanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.security.length === 2);

    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(MARCUS_CARD_IDS).toContain(s.state.players[0]!.security[0]!.cardId);
  });

  it("treats an effect activated by a [Marcus Damon] treated as a Digimon as both a Tamer and a Digimon effect (Q4547)", async () => {
    async function memoryGainedUnderZenimon(attacker: "rize" | "marcus"): Promise<number> {
      const s = setupDecliningAlliance(
        {
          0: {
            battleArea: [
              { card: RIZEGREYMON, as: "rize", under: [PANJYAMON_INHERITS_MEMORY] },
              { card: MARCUS_WITHOUT_SUSPEND_TRIGGER, as: "marcus", under: [PANJYAMON_INHERITS_MEMORY] },
            ],
          },
          1: { battleArea: [{ card: ZENIMON_TAMER_ONLY_MEMORY, as: "zenimon" }], security: [...OPPONENT_SECURITY] },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 3;
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
      expect(attackPlayer(s, attacker)).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());
      return s.state.memory - 3;
    }

    async function kabuterimonDPAfterMarcusAttacks(kabuterimonSuspended: boolean): Promise<number> {
      const s = setupDecliningAlliance(
        {
          0: {
            battleArea: [
              { card: RIZEGREYMON, as: "rize" },
              { card: MARCUS_DAMON, as: "marcus" },
            ],
          },
          1: {
            battleArea: [
              { card: KABUTERIMON_IMMUNE_WHILE_SUSPENDED, as: "kabuterimon", suspended: kabuterimonSuspended },
            ],
            security: [...OPPONENT_SECURITY],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
      expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());
      return s.perm("kabuterimon").currentDP;
    }

    expect(await memoryGainedUnderZenimon("rize")).toBe(0);
    expect(await memoryGainedUnderZenimon("marcus")).toBe(1);
    expect(await kabuterimonDPAfterMarcusAttacks(false)).toBe(2000);
    expect(await kabuterimonDPAfterMarcusAttacks(true)).toBe(5000);
  });

  it("deletes a [Marcus Damon] treated as a Digimon at the rule check once its DP becomes 0 (Q4548)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupDecliningAlliance(
      {
        0: {
          hand: [{ card: RIZEGREYMON, as: "rize" }],
          battleArea: [
            { card: MARCUS_DAMON, as: "marcus" },
            { card: YELLOW_TAMER, as: "otherTamer" },
          ],
        },
        1: { security: [BIFROST_MINUS_3000, ...OPPONENT_SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    const marcusInstanceId = s.perm("marcus").topCard.instanceId;
    preferInstanceIds.push(marcusInstanceId);
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === BIFROST_MINUS_3000));
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.perm("rize").currentDP).toBe(7000);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === marcusInstanceId)).toBe(
      false,
    );
    // The deleted Marcus is a red/yellow Tamer, so RizeGreymon's watcher may move it from trash to the top of security.
    const marcusDestinations = [...s.state.players[0]!.trash, ...s.state.players[0]!.security].map(
      (card) => card.instanceId,
    );
    expect(marcusDestinations).toContain(marcusInstanceId);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
      s.perm("otherTamer").permanentId,
    );
  });

  it('lets the selected [Marcus Damon] be the Digimon that attacks with the effect after "Then" (Q4549)', async () => {
    const preferInstanceIds: string[] = [];
    const s = setupDecliningAlliance(
      {
        0: {
          hand: [{ card: RIZEGREYMON, as: "rize" }],
          battleArea: [{ card: MARCUS_DAMON, as: "marcus" }],
        },
        1: { security: [...OPPONENT_SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();
    expect(attackPlayer(s, "marcus").ok).toBe(false);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());

    const attackers = s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []));
    expect(attackers).toEqual([s.perm("marcus").permanentId]);
    expect(s.perm("marcus").isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it('lets the player decline the attack after "Then" while Marcus stays a 3000 DP Digimon with <Rush> (Q4550)', async () => {
    const s = setupDecliningAlliance(
      {
        0: {
          hand: [{ card: RIZEGREYMON, as: "rize" }],
          battleArea: [{ card: MARCUS_DAMON, as: "marcus" }],
        },
        1: { security: [...OPPONENT_SECURITY] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    await settle();

    const optionalPrompts = s.decisions
      .filter(({ req }) => req.kind === "optional")
      .map(({ req }) => req.options?.effectTextPart);
    expect(optionalPrompts).toContain("Then, 1 of your Digimon may attack.");
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.perm("marcus").isSuspended).toBe(false);
    expect(s.perm("marcus").currentDP).toBe(3000);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("triggers the [All Turns] security effect when a [Marcus Damon] treated as a Digimon is deleted in battle (Q4551)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupDecliningAlliance(
      {
        0: {
          battleArea: [
            { card: RIZEGREYMON, as: "rize" },
            { card: MARCUS_WITHOUT_SUSPEND_TRIGGER, as: "marcus" },
          ],
          trash: [{ card: MARCUS_DAMON, as: "trashedMarcus" }],
        },
        1: { security: [{ card: STRONG_SECURITY_DIGIMON, as: "strongSecurity" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    const marcusInstanceId = s.perm("marcus").topCard.instanceId;
    const marcusPermanentId = s.perm("marcus").permanentId;
    preferInstanceIds.push(marcusInstanceId);
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
    await settle(
      () => !s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === marcusInstanceId),
    );
    await settle(() => s.state.players[0]!.security.length === 1);

    const attackers = s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []));
    expect(attackers).toEqual([marcusPermanentId]);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).not.toContain(
      marcusInstanceId,
    );
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(MARCUS_CARD_IDS).toContain(s.state.players[0]!.security[0]!.cardId);
  });

  it("lets a newer treated-as-Digimon effect overwrite the DP while earlier <Alliance> and <Rush> stay (Q6019)", async () => {
    const snapshotsAtTurnEnd: Array<{ dp: number; rush: boolean; alliance: boolean; digivolveLocked: boolean }> = [];
    let setup: EngineSetup | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: MARCUS_AGUMON, as: "marcus" }],
          hand: [{ card: RIZEGREYMON, as: "rize" }, FILLER],
          deck: fillerDeck(),
        },
        1: { security: [...OPPONENT_SECURITY], hand: [FILLER], deck: fillerDeck() },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declinePrompts: [OPTIONAL_ATTACK_PROMPT],
        onEvent: (event) => {
          if (
            setup === undefined ||
            event.kind !== "effectResolved" ||
            event.sourceCardId !== MARCUS_AGUMON ||
            event.timing !== "OnEndTurn"
          )
            return;
          const marcus = setup.perm("marcus");
          snapshotsAtTurnEnd.push({
            dp: marcus.currentDP,
            rush: observe(setup.engine).hasKeyword(marcus, "Rush"),
            alliance: observe(setup.engine).hasKeyword(marcus, "Alliance"),
            digivolveLocked: observe(setup.engine).isRestricted(marcus, "digivolve"),
          });
        },
      },
    );
    setup = s;
    await s.ready();

    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("marcus").currentDP === 3000);
    await settle();
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Alliance")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(true);

    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    expect(snapshotsAtTurnEnd).toEqual([{ dp: 6000, rush: true, alliance: true, digivolveLocked: true }]);

    const reversed = setupEngine(
      {
        0: {
          battleArea: [
            { card: RIZEGREYMON, as: "rize" },
            { card: MARCUS_AGUMON, as: "marcus" },
          ],
        },
        1: { security: [...OPPONENT_SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: [OPTIONAL_ATTACK_PROMPT] },
    );
    await reversed.ready();
    await advance(reversed.engine).fire(EffectTiming.OnEndTurn, reversed.perm("marcus"));
    expect(reversed.perm("marcus").currentDP).toBe(6000);
    expect(observe(reversed.engine).hasKeyword(reversed.perm("marcus"), "Alliance")).toBe(false);

    await advance(reversed.engine).fire(EffectTiming.OnPlay, reversed.perm("rize"));
    expect(reversed.perm("marcus").currentDP).toBe(3000);
    expect(observe(reversed.engine).hasKeyword(reversed.perm("marcus"), "Rush")).toBe(true);
    expect(observe(reversed.engine).hasKeyword(reversed.perm("marcus"), "Alliance")).toBe(true);
    expect(reversed.events.some((event) => event.kind === "attackDeclared")).toBe(false);
  });

  it("gains memory from an effect on a [Marcus Damon] treated as a Digimon despite a Tamer-effects-only memory lock (Q6020)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupDecliningAlliance(
      {
        0: {
          battleArea: [
            { card: RIZEGREYMON, as: "rize" },
            { card: MARCUS_WITHOUT_SUSPEND_TRIGGER, as: "marcus", under: [METALGARURUMON_INHERITS_MEMORY] },
            { card: PLAIN_DIGIMON, as: "plainDigimon", under: [METALGARURUMON_INHERITS_MEMORY] },
          ],
        },
        1: { battleArea: [{ card: ZENIMON_TAMER_ONLY_MEMORY, as: "zenimon" }], security: [...OPPONENT_SECURITY] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
    s.state.memory = 3;
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
    expect(s.perm("marcus").currentDP).toBe(3000);

    expect(attackPlayer(s, "plainDigimon")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(3);

    expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(4);
  });

  it("does not affect an opponent's Digimon immune to Digimon effects with the effect of a [Marcus Damon] treated as a Digimon (Q6021)", async () => {
    async function kabuterimonDPAfterMarcusSuspends(kabuterimonSuspended: boolean): Promise<number> {
      const s = setupDecliningAlliance(
        {
          0: {
            battleArea: [
              { card: RIZEGREYMON, as: "rize" },
              { card: MARCUS_DAMON, as: "marcus" },
            ],
          },
          1: {
            battleArea: [
              { card: KABUTERIMON_IMMUNE_WHILE_SUSPENDED, as: "kabuterimon", suspended: kabuterimonSuspended },
            ],
            security: [...OPPONENT_SECURITY],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("rize"));
      expect(s.perm("marcus").currentDP).toBe(3000);
      expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());
      return s.perm("kabuterimon").currentDP;
    }

    async function suspendedKabuterimonDPAfterPlainTamerMarcusSuspends(): Promise<number> {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: MARCUS_DAMON, as: "marcus" }] },
          1: { battleArea: [{ card: KABUTERIMON_IMMUNE_WHILE_SUSPENDED, as: "kabuterimon", suspended: true }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("marcus"));
      await settle(() => s.perm("marcus").isSuspended);
      await settle();
      return s.perm("kabuterimon").currentDP;
    }

    expect(await suspendedKabuterimonDPAfterPlainTamerMarcusSuspends()).toBe(2000);
    expect(await kabuterimonDPAfterMarcusSuspends(false)).toBe(2000);
    expect(await kabuterimonDPAfterMarcusSuspends(true)).toBe(5000);
  });

  it("lets [Marcus Damon & Agumon]'s [End of Your Turn] attack after RizeGreymon's attack resolved in a turn that passed memory (Q6109)", async () => {
    const preferInstanceIds: string[] = [];
    const memoryAtEachAttack: number[] = [];
    let setup: EngineSetup | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcusAgumon" },
            { card: MARCUS_DAMON, as: "marcus" },
          ],
          hand: [{ card: RIZEGREYMON, as: "rize" }, FILLER],
          deck: fillerDeck(),
        },
        1: { security: [...OPPONENT_SECURITY, ...OPPONENT_SECURITY], hand: [FILLER], deck: fillerDeck() },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds,
        onEvent: (event) => {
          if (setup === undefined) return;
          if (event.kind === "attackDeclared") {
            memoryAtEachAttack.push(setup.state.memory);
            preferInstanceIds.splice(0, preferInstanceIds.length, setup.perm("marcusAgumon").topCard.instanceId);
          }
          if (event.kind === "alliancePrompt") {
            queueMicrotask(() => setup?.engine.applyIntent(0, { type: "respondAlliance" }));
          }
        },
      },
    );
    setup = s;
    preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
    await s.ready();

    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await ownTurn;

    const attackers = s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []));
    expect(attackers).toEqual([s.perm("marcus").permanentId, s.perm("marcusAgumon").permanentId]);
    expect(memoryAtEachAttack.every((memory) => memory < 0)).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(4);
  });
});

const RIZEGREYMON = "BT21-044";
const MARCUS_DAMON = "BT13-095";
const MARCUS_WITHOUT_SUSPEND_TRIGGER = "BT12-092";
const MARCUS_CARD_IDS = [MARCUS_DAMON, MARCUS_WITHOUT_SUSPEND_TRIGGER];
const YELLOW_TAMER = "BT1-087";
const YELLOW_AGUMON = "BT12-034";
const PANJYAMON_INHERITS_MEMORY = "BT6-025";
const ZENIMON_TAMER_ONLY_MEMORY = "BT18-059";
const KABUTERIMON_IMMUNE_WHILE_SUSPENDED = "BT15-047";
const BIFROST_MINUS_3000 = "BT3-101";
const FILLER = "BT1-009";
const WEAK_SECURITY_DIGIMON = "BT1-010";
const OPPONENT_SECURITY = [WEAK_SECURITY_DIGIMON, WEAK_SECURITY_DIGIMON, WEAK_SECURITY_DIGIMON];
const STRONG_SECURITY_DIGIMON = "BT1-013";
const PLAIN_DIGIMON = "BT1-013";
const MARCUS_AGUMON = "AD1-021";
const METALGARURUMON_INHERITS_MEMORY = "BT5-031";
const OPTIONAL_ATTACK_PROMPT = "Attack with a Digimon";
const fillerDeck = () => Array.from({ length: 8 }, () => FILLER);

function setupDecliningAlliance(board: BoardSpec, options: SetupEngineOptions): EngineSetup {
  let setup: EngineSetup | undefined;
  const s = setupEngine(board, {
    ...options,
    onEvent: (event) => {
      if (event.kind === "alliancePrompt") {
        queueMicrotask(() => setup?.engine.applyIntent(0, { type: "respondAlliance" }));
      }
    },
  });
  setup = s;
  return s;
}

function attackPlayer(s: EngineSetup, alias: string) {
  return s.engine.applyIntent(0, {
    type: "attack",
    attackerPermanentId: s.perm(alias).permanentId,
    target: { kind: "player" },
  });
}
