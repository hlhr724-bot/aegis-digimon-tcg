import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

describe("EX11-011 Dinomon", () => {
  it("encodes every printed clause without a spurious inherited effect", () => {
    const compiled = runtimeCompiledCard("EX11-011")!;

    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, names: ["Tyrannomon"], cost: 4, isAlternate: true },
      { traits: ["Dinosaur"], cost: 4, isAlternate: true, level: 5 },
    ]);
    expect(compiled.effects.find((effect) => effect.trigger === "Static")?.keywords).toEqual([
      { keyword: "SecurityAttack", amount: 1, raw: "＜Security Attack +1＞" },
      { keyword: "Fortitude", raw: "＜Fortitude＞" },
    ]);
    expect(compiled.effects.some((effect) => effect.isInherited)).toBe(false);
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)?.actions).toMatchObject([
        { kind: "Suspend", target: { filter: { controllerDefault: "any" }, count: 1 }, optional: true },
        {
          kind: "SelectBind",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], superlative: "highestPlayCost" },
            bindAs: "sparedMine",
          },
        },
        {
          kind: "SelectBind",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], superlative: "highestPlayCost" },
            bindAs: "sparedOpponent",
          },
        },
        {
          kind: "Delete",
          target: {
            filter: { kind: ["Digimon"], excludeSelectionRef: ["sparedMine", "sparedOpponent"] },
            count: "all",
          },
        },
      ]);
    }
    expect(compiled.effects.find((effect) => effect.trigger === "OpponentsTurn")?.actions).toEqual([
      expect.objectContaining({
        kind: "Aura",
        effect: { kind: "restriction", restriction: "attackOnlySuspendedDigimon" },
        while: { kind: "selfIsSuspended", raw: "this Digimon is suspended" },
      }),
    ]);
  });

  it("requires a highest-cost survivor instead of allowing both players to skip it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX7-035", as: "base" },
            { card: "EX11-011", as: "otherDinomon" },
          ],
          hand: [{ card: "EX11-011", as: "dinomon" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "EX11-010", as: "opponent" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("dinomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.decisions.some(({ req }) => req.kind === "chooseTargets" && req.options?.purpose !== "optionalTarget"),
    );

    const choice = s.decisions.find(
      ({ req }) => req.kind === "chooseTargets" && req.options?.purpose !== "optionalTarget",
    )!;
    expect(choice.req.options?.min).toBe(1);
    expect(choice.req.options?.effectTextPart).toContain("choose 1 of each player");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("base").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1);

    expect(s.state.players[0]!.battleArea[0]!.permanentId).toBe(s.perm("base").permanentId);
    expect(s.state.players[1]!.battleArea[0]!.permanentId).toBe(s.perm("opponent").permanentId);
    assertNoLoudGap(s);
  });

  it("deletes every non-chosen Digimon even when the optional suspension is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX11-008", as: "mineLow" }],
          hand: [{ card: "EX11-011", as: "dinomon" }],
        },
        1: {
          battleArea: [
            { card: "EX11-008", as: "oppLow", dp: 1000 },
            { card: "EX11-010", as: "oppHigh", dp: 7000 },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 13;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dinomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "EX11-008"));

    expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX11-008")).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.cardId === "EX11-008")).toBe(true);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX11-011"]);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX11-010"]);
    expect(s.state.players[0]!.battleArea[0]!.isSuspended).toBe(false);
    assertNoLoudGap(s);
  });

  it("chooses exactly one among tied highest-play-cost opponent Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX11-011", as: "dinomon" }] },
        1: {
          battleArea: [
            { card: "EX11-010", as: "tiedA" },
            { card: "EX11-010", as: "tiedB" },
            { card: "EX11-008", as: "low" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("tiedB").permanentId);
    s.state.memory = 13;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dinomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea[0]!.permanentId).toBe(s.perm("tiedB").permanentId);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX11-010", "EX11-008"]),
    );
    assertNoLoudGap(s);
  });

  it("repeats the per-player highest-cost deletion through public When Digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX7-035", as: "base" }],
          hand: [{ card: "EX11-011", as: "dinomon" }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "EX11-008", as: "oppLow", dp: 1000 },
            { card: "EX11-010", as: "oppHigh", dp: 7000 },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("dinomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX11-011");

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX11-010"]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("EX11-008");
    assertNoLoudGap(s);
  });

  it("deletes a no-play-cost Digimon because Q5796 allows no opponent exemption", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX11-011", as: "dinomon" }] },
        1: { battleArea: [{ card: "TOKEN-Familiar-Token", as: "familiar" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 13;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dinomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it.each([
    ["a Tyrannomon name without the Dinosaur trait", "BT1-024"],
    ["a Dinosaur trait without Tyrannomon in name", "EX7-035"],
  ])("evolves for cost 4 from %s", async (_label, baseCard) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: baseCard, as: "base" }],
          hand: [{ card: "EX11-011", as: "dinomon" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("dinomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX11-011");

    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("rejects the alternate path from a level 5 with neither match", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-038", as: "monzaemon" }],
        hand: [{ card: "EX11-011", as: "dinomon" }],
      },
    });
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("monzaemon").permanentId,
        instanceId: s.inst("dinomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("publishes both keywords only on Dinomon itself and replays through Fortitude", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-011", as: "dinomon", under: ["BT1-020"] },
            { card: "BT1-009", as: "host", under: ["EX11-011"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("dinomon"), "SecurityAttack")).toBe(1);
    expect(observe(s.engine).hasKeyword(s.perm("dinomon"), "Fortitude")).toBe(true);
    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(0);
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Fortitude")).toBe(false);

    const dinomonInstanceId = s.perm("dinomon").topCard.instanceId;
    await advance(s.engine).verb.deletePermanent([s.perm("dinomon").permanentId], "byEffect");
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === dinomonInstanceId),
    );

    const replayed = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === dinomonInstanceId,
    );
    expect(replayed?.stack).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("restricts opposing attacks only on the opponent's turn and only while suspended", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX11-011", as: "dinomon", suspended: true }] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasRestriction(s.perm("attacker"), "attackOnlySuspendedDigimon")).toBe(false);

    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasRestriction(s.perm("attacker"), "attackOnlySuspendedDigimon")).toBe(true);

    s.perm("dinomon").isSuspended = false;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasRestriction(s.perm("attacker"), "attackOnlySuspendedDigimon")).toBe(false);
  });

  it("enforces the suspended-target restriction through the public opponent turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-011", as: "dinomon", suspended: true },
            { card: "BT1-009", as: "unsuspended" },
          ],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT8-018", as: "marsmon" }], deck: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("marsmon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("unsuspended").permanentId },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("marsmon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("dinomon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackDeclared"));
    s.engine.applyIntent(1, { type: "surrender" });
    await turn;
    assertNoLoudGap(s);
  });

  it("makes can't override Marsmon's permission at attack declaration (Q5797)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX11-011", as: "dinomon", suspended: true },
          { card: "BT1-009", as: "unsuspended" },
        ],
      },
      1: { battleArea: [{ card: "BT8-018", as: "marsmon" }] },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();

    expect(observe(s.engine).canAttackUnsuspended(s.perm("marsmon"))).toBe(true);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("marsmon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("marsmon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("unsuspended").permanentId },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("marsmon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("dinomon").permanentId },
      }),
    ).toEqual({ ok: true });
  });

  it("allows Raid to switch from the declared suspended target to an unsuspended Digimon (Q5798)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-011", as: "dinomon", suspended: true },
            { card: "BT1-009", as: "raidTarget", dp: 1000 },
          ],
        },
        1: { battleArea: [{ card: "EX12-012", as: "apemon", dp: 4000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("apemon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("dinomon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("raidTarget").instanceId));

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("dinomon").permanentId),
    ).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("raidTarget").instanceId);
    assertNoLoudGap(s);
  });

  it("doesn't restrict an opponent Digimon unaffected by Dinomon's effect (Q5799)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX11-011", as: "dinomon", suspended: true }] },
      1: { battleArea: [{ card: "AD1-008", as: "immune", under: ["BT12-089"] }] },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();

    expect(observe(s.engine).isRestricted(s.perm("immune"), "beAffected")).toBe(true);
    expect(observe(s.engine).hasRestriction(s.perm("immune"), "attackOnlySuspendedDigimon")).toBe(false);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("immune").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
  });
});
