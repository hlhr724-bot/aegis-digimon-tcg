import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Alphamon: Ouryuken", () => {
  it("DNA digivolves from the exact named pair, deletes, and recovers two", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT13-075", as: "alpha" },
            { card: "BT8-069", as: "ouryu" },
          ],
          hand: [{ card: "BT27-103", as: "result" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("alpha").permanentId, s.perm("ouryu").permanentId],
        instanceId: s.inst("result").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 2);
    expect(s.state.players[0]!.battleArea[0]!.stack.map((c) => c.cardId)).toEqual(["BT8-069", "BT13-075"]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(0);
    expect(s.decisions.map(({ req }) => req)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "chooseTargets",
          options: expect.objectContaining({
            effectText: expect.stringContaining("Then, if DNA digivolving, ＜Recovery +2＞."),
            effectTextEmphasis: "You may delete 1 of your opponent's Digimon.",
          }),
        }),
      ]),
    );
  });
  it("uses its Option side and DNA digivolves into that exact resolving card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-045", as: "invalid" },
            { card: "BT13-075", as: "alpha" },
            { card: "BT8-069", as: "ouryu" },
          ],
          hand: [
            { card: "BT27-103", as: "result" },
            { card: "BT27-103", as: "unused" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-029" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("result").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.resolvingOption === undefined && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("result").instanceId)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("unused").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("invalid").permanentId)).toBe(true);
    expect(s.state.memory).toBe(4);
    expect(s.decisions.map(({ req }) => req)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "chooseTargets",
          options: expect.objectContaining({
            effectText: expect.stringContaining("[Main] Delete 1 of your opponent's Digimon."),
            effectTextEmphasis: "Delete 1 of your opponent's Digimon.",
          }),
        }),
        expect.objectContaining({
          kind: "chooseTargets",
          options: expect.objectContaining({
            effectText: expect.stringContaining("Then, 2 of your Digimon may DNA digivolve into this card."),
            effectTextEmphasis: "Then, 2 of your Digimon may DNA digivolve into this card.",
          }),
        }),
      ]),
    );
  });
  it("partitions only the printed named materials when it leaves outside an attack", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-103", as: "source", under: ["BT13-075", "BT8-069"] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId).sort()).toEqual(["BT13-075", "BT8-069"].sort());
  });
});

describe("Alphamon: Ouryuken boundaries", () => {
  it("rejects a DNA pair without Ouryumon and preserves both materials", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT13-075", as: "alpha" },
          { card: "BT13-077", as: "wrong" },
        ],
        hand: [{ card: "BT27-103", as: "result" }],
      },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("alpha").permanentId, s.perm("wrong").permanentId],
        instanceId: s.inst("result").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.memory).toBe(10);
  });
  it("recovers after DNA even when its optional deletion is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT13-075", as: "alpha" },
            { card: "BT8-069", as: "ouryu" },
          ],
          hand: [{ card: "BT27-103", as: "result" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("alpha").permanentId, s.perm("ouryu").permanentId],
        instanceId: s.inst("result").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 2);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
  it.each(["BT13-077", "ST1-11", "ST3-11"])(
    "does not recover when normally evolving from level six %s",
    async (baseCard) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: baseCard, as: "base" }],
            hand: [{ card: "BT27-103", as: "result" }],
            deck: ["BT1-009", "BT1-009", "BT1-009"],
          },
          1: { battleArea: [{ card: "BT1-009" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      s.state.memory = 6;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("result").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.battleArea.length === 0);
      expect(s.state.players[0]!.security).toHaveLength(0);
      expect(s.perm("base").stack.map((c) => c.cardId)).toEqual([baseCard]);
      expect(s.state.memory).toBe(0);
    },
  );
  it("survives opponent security deletion during its attack and performs the additional check", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-103", as: "source" }] }, 1: { security: ["ST1-16", "BT1-009"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT27-103"]);
    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });
  it("does not partition when one of the exact named sources is missing", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-103", as: "source", under: ["BT13-075", "BT13-077"] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });
});

describe("Alphamon: Ouryuken interaction coverage", () => {
  it("shares the deletion limit between normal digivolution and attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-077", as: "base" }],
          hand: [{ card: "BT27-103", as: "result" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-009" }], security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("result").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.security).toHaveLength(0);
  });
  it("deletes using the Option even when its optional DNA and Arts digivolution are declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-075", as: "alpha" }, { card: "BT8-069", as: "ouryu" }, { card: "BT1-045" }],
          hand: [{ card: "BT27-103", as: "result" }],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("result").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("result").instanceId));
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(4);
  });
  it("uses Arts digivolution for free when the DNA pair is missing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-077", as: "base" }],
          hand: [{ card: "BT27-103", as: "result" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("result").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-103" && s.state.players[1]!.battleArea.length === 0);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("result").instanceId);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT13-077"]);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(4);
  });
  it("is immune while another player's Digimon attacks and loses immunity afterward", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-103", as: "source" }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((e) => e.kind === "blockWindowOpened"));
    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    await advance(s.engine).finishAttack();
    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });
});

it("preserves both real evolution stacks through DNA, inherits DP, and partitions the named level sixes", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT6-111", as: "alpha", under: ["BT7-056", "BT7-062", "BT7-064"] },
          { card: "BT8-069", as: "ouryu", under: ["BT8-061", "BT8-065"] },
        ],
        hand: [{ card: "BT27-103", as: "result" }],
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "dnaDigivolve",
      materialPermanentIds: [s.perm("alpha").permanentId, s.perm("ouryu").permanentId],
      instanceId: s.inst("result").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.security.length === 2);
  const result = s.state.players[0]!.battleArea[0]!;
  expect(result.stack.map((c) => c.cardId)).toEqual([
    "BT8-061",
    "BT8-065",
    "BT8-069",
    "BT7-056",
    "BT7-062",
    "BT7-064",
    "BT6-111",
  ]);
  expect(result.currentDP).toBe(17000);
  advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
  await advance(s.engine).verb.deletePermanent([result.permanentId], "byEffect");
  advance(s.engine).verb.leaveEffectResolution();
  expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId).sort()).toEqual(["BT6-111", "BT8-069"].sort());
  expect(s.state.players[0]!.battleArea.every((p) => p.stack.length === 0)).toBe(true);
  expect(s.state.players[0]!.trash.map((c) => c.cardId).sort()).toEqual(
    ["BT27-103", "BT7-056", "BT7-062", "BT7-064", "BT8-061", "BT8-065"].sort(),
  );
});

it("rejects a blue level six as a normal evolution base", async () => {
  const s = setupEngine({
    0: { battleArea: [{ card: "ST2-11", as: "base" }], hand: [{ card: "BT27-103", as: "result" }] },
  });
  await s.ready();
  s.state.memory = 10;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("result").instanceId,
    }).ok,
  ).toBe(false);
  expect(s.perm("base").topCard.cardId).toBe("ST2-11");
  expect(s.state.players[0]!.hand).toHaveLength(1);
  expect(s.state.memory).toBe(10);
});

it("requires black even when a yellow or red Digimon would satisfy its Digimon side", async () => {
  const s = setupEngine({
    0: { battleArea: [{ card: "ST1-11" }, { card: "ST3-11" }], hand: [{ card: "BT27-103", as: "result" }] },
    1: { battleArea: [{ card: "BT1-009" }] },
  });
  await s.ready();
  s.state.memory = 10;
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("result").instanceId, useAs: "option" }).ok,
  ).toBe(false);
  expect(s.state.players[1]!.battleArea).toHaveLength(1);
  expect(s.state.players[0]!.hand).toHaveLength(1);
  expect(s.state.memory).toBe(10);
});

it("selects both DNA materials together, rejects forged pairs, and preserves printed stack order", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT8-069", as: "firstOuryu" },
          { card: "BT8-069", as: "secondOuryu", under: ["BT8-061"] },
          { card: "BT6-111", as: "firstAlpha" },
          { card: "BT13-075", as: "secondAlpha", under: ["BT7-062"] },
          { card: "BT1-045", as: "unrelated" },
        ],
        hand: [{ card: "BT27-103", as: "result" }],
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
      1: { battleArea: [{ card: "BT1-009" }] },
    },
    { autoAcceptOptional: true },
  );
  await s.ready();
  s.state.memory = 10;
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("result").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
  const request = s.decisions.at(-1)!.req;
  const firstAlpha = s.perm("firstAlpha").permanentId;
  const secondAlpha = s.perm("secondAlpha").permanentId;
  const firstOuryu = s.perm("firstOuryu").permanentId;
  const secondOuryu = s.perm("secondOuryu").permanentId;
  expect(request.options).toMatchObject({
    max: 2,
    effectTextEmphasis: "Then, 2 of your Digimon may DNA digivolve into this card.",
    allowedTargetCombinations: [
      [firstAlpha, firstOuryu],
      [secondAlpha, firstOuryu],
      [firstAlpha, secondOuryu],
      [secondAlpha, secondOuryu],
    ],
  });
  expect(request.options?.candidateInstanceIds).toHaveLength(4);
  expect(request.options?.candidateInstanceIds).not.toContain(s.perm("unrelated").permanentId);
  for (const instanceIds of [
    [firstAlpha],
    [firstAlpha, firstAlpha],
    [firstAlpha, secondAlpha],
    [firstOuryu, secondOuryu],
    [firstAlpha, s.perm("unrelated").permanentId],
    [firstAlpha, firstOuryu, secondOuryu],
  ]) {
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "chooseTargets", instanceIds },
      }).ok,
    ).toBe(false);
    expect(s.state.pendingDecision?.decisionId).toBe(request.decisionId);
    expect(s.state.players[0]!.battleArea).toHaveLength(5);
  }
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "chooseTargets", instanceIds: [secondOuryu, secondAlpha] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.security.length === 2 && s.state.pendingDecision === undefined);
  const result = s.state.players[0]!.battleArea.find(
    (permanent) => permanent.topCard.instanceId === s.inst("result").instanceId,
  )!;
  expect(result.stack.map((card) => card.cardId)).toEqual(["BT8-061", "BT8-069", "BT7-062", "BT13-075"]);
  expect(s.state.players[0]!.battleArea).toHaveLength(4);
  expect(s.state.memory).toBe(4);
  expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets")).toHaveLength(1);
});

it("performs two piercing checks after winning battle when deletion is declined", async () => {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: "BT27-103", as: "attacker" }] },
      1: {
        battleArea: [{ card: "BT1-009", as: "defender", suspended: true }],
        security: ["BT1-009", "BT1-009", "BT1-009"],
      },
    },
    { autoDeclineOptional: true, autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).finishAttack();
  await settle(() => s.state.players[1]!.security.length === 1);
  expect(s.state.players[1]!.battleArea).toHaveLength(0);
  expect(s.state.players[0]!.battleArea).toHaveLength(1);
  expect(s.state.players[0]!.security).toHaveLength(0);
});

it("blocks an opposing attack and protects security", async () => {
  const s = setupEngine({
    0: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
    1: { battleArea: [{ card: "BT27-103", as: "blocker" }], security: ["BT1-009"] },
  });
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
  expect(s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 0);
  expect(s.perm("blocker").isSuspended).toBe(true);
  expect(s.state.players[1]!.security).toHaveLength(1);
});

it("cannot be played directly as a Digimon", async () => {
  const s = setupEngine({ 0: { hand: [{ card: "BT27-103", as: "card" }] } });
  await s.ready();
  s.state.memory = 10;
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
  ).toBe(false);
  expect(s.state.players[0]!.hand).toHaveLength(1);
  expect(s.state.players[0]!.battleArea).toHaveLength(0);
  expect(s.state.memory).toBe(10);
});

it("trashes both named sources when Partition is declined", async () => {
  const s = setupEngine(
    { 0: { battleArea: [{ card: "BT27-103", as: "source", under: ["BT13-075", "BT8-069"] }] } },
    { autoSelectCards: true, declinePrompts: ["Partition"] },
  );
  await s.ready();
  advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
  await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect");
  advance(s.engine).verb.leaveEffectResolution();
  expect(s.state.players[0]!.battleArea).toHaveLength(0);
  expect(s.state.players[0]!.trash.map((card) => card.cardId).sort()).toEqual(
    ["BT27-103", "BT13-075", "BT8-069"].sort(),
  );
});
