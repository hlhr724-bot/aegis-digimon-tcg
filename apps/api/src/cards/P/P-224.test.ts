import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "./P-224.js";
import "../index.js";

describe("P-224 Kotone Amano", () => {
  it("places an Xros Heart or Twilight Digimon under this Tamer before the conditional draw", () => {
    const card = runtimeCompiledCard("P-224")!;
    for (const trigger of ["StartOfYourMainPhase", "OnPlay"] as const) {
      expect(card.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "CostGatedBlock",
            optional: true,
            abortOnDecline: true,
            actions: [
              {
                kind: "Draw",
                amount: 1,
                condition: { kind: "handAtMost", value: 7 },
              },
            ],
            cost: {
              kind: "place",
              target: {
                count: 1,
                from: ["hand", "trash"],
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Xros Heart", "Twilight"], match: "trait" }],
                },
              },
            },
          },
        ],
      });
    }
  });

  it("suspends itself to play a level 5 or higher Xros Heart Digimon from under any Tamer at cost -1", () => {
    expect(runtimeCompiledCard("P-224")!.effects.find((effect) => effect.trigger === "Main")).toMatchObject({
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["underTamer"],
          payCost: true,
          reduceCostBy: 1,
          cost: {
            kind: "suspend",
            target: { count: 1, isSelf: true, filter: { isSelfRef: true } },
          },
          target: {
            count: 1,
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              zone: "underTamer",
              levelComparison: { op: "gte", value: 5 },
              nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }],
            },
          },
        },
      ],
    });
  });

  it("plays itself without paying the cost in security", () => {
    expect(runtimeCompiledCard("P-224")!.effects.find((effect) => effect.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          payCost: false,
          target: { count: 1, isSelf: true, filter: { isSelfRef: true } },
        },
      ],
    });
  });
});
import { EffectDuration, EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";

describe("P-224 engine behavior", () => {
  it.each([false, true])(
    "offers Taiki materials after an earlier play (decline DigiXros=%s)",
    async (declineDigiXros) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "AD1-006", as: "earlierPlay" }],
            battleArea: [
              {
                card: "P-224",
                as: "kotone",
                under: [{ card: "BT19-014", as: "ex6" }],
              },
              {
                card: "BT10-087",
                as: "taiki",
                under: [{ card: "BT21-021", as: "omni" }],
              },
            ],
          },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          preferInstanceIds: preferred,
          declineDigiXros,
        },
      );
      preferred.push(s.inst("ex6").instanceId, s.perm("taiki").permanentId);
      s.state.memory = 30;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: s.inst("earlierPlay").instanceId,
        }),
      ).toEqual({
        ok: true,
      });
      await settle();
      s.state.memory = 10;
      const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("kotone").instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle();
      const played = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("ex6").instanceId);
      expect(played).toBeDefined();
      expect(played!.stack.map((c) => c.instanceId)).toEqual(declineDigiXros ? [] : [s.inst("omni").instanceId]);
      expect(s.perm("taiki").isSuspended).toBe(!declineDigiXros);
      expect(s.perm("taiki").stack.map((c) => c.instanceId)).toEqual(
        declineDigiXros ? [s.inst("omni").instanceId] : [],
      );
      expect(s.state.memory).toBe(declineDigiXros ? 0 : 2);
      expect(s.decisions.filter(({ req }) => req.options?.digiXrosCardId === "BT19-014")).toHaveLength(1);
    },
  );

  it.each([0, 1] as const)("plays Shoutmon EX6 from its own stack with one memory for seat %s", async (seat) => {
    const s = setupEngine(
      { [seat]: { battleArea: [{ card: "P-224", as: "kotone", under: [{ card: "BT19-014", as: "ex6" }] }] } },
      { autoAcceptOptional: true, autoSelectCards: true, declineDigiXros: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 1;
    await s.ready();
    const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
    expect(
      s.engine.applyIntent(seat, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[seat]!.battleArea.some((p) => p.topCard.instanceId === s.inst("ex6").instanceId)).toBe(true);
    expect(s.state.memory).toBe(-9);
  });

  it("plays itself from Security through its Security effect", async () => {
    const s = setupEngine({
      0: { security: [{ card: "P-224", as: "kotone" }] },
    });
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("kotone"));
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("kotone").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("kotone").instanceId)).toBe(true);
  });

  it("uses its Main effect to suspend itself and play a level-5 Xros Heart Digimon from under a Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-224", as: "kotone" },
            {
              card: "BT10-087",
              under: [{ card: "BT10-012", as: "shoutmon" }],
              as: "taiki",
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    const effectKey = (
      observe(s.engine).activatableEffects(s.perm("kotone")) as Array<{
        effectKey: string;
      }>
    )[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effectKey.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("kotone").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("shoutmon").instanceId)).toBe(
      true,
    );
  });
});

describe("P-224 Kotone Amano — KB Q&A rulings", () => {
  it.each([
    [9, false],
    [8, true],
  ] as const)(
    "activates its [Start of Your Main Phase] placement with %i cards in hand (Q6119)",
    async (handSize, draws) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "P-224", as: "kotone" }],
            hand: [{ card: "BT19-014", as: "xrosHeart" }, ...Array.from({ length: handSize - 1 }, () => "BT1-009")],
            deck: [{ card: "BT1-010", as: "deckTop" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      expect(s.state.players[0]!.hand).toHaveLength(handSize);

      await advance(s.engine).fire(EffectTiming.StartOfYourMainPhase, s.perm("kotone"));
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.perm("kotone").stack.map((card) => card.instanceId)).toEqual([s.inst("xrosHeart").instanceId]);
      expect(s.state.players[0]!.hand).toHaveLength(draws ? handSize : handSize - 1);
      expect(s.state.players[0]!.deck).toHaveLength(draws ? 0 : 1);
    },
  );
});

describe("P-224 Kotone Amano — DigiXros by effect with a battle-area material", () => {
  async function playShoutmonDxWithFieldZeigGreymon() {
    const interruptSnapshots: { isDigiXros: boolean; dxInPlay: boolean; memory: number }[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-224", as: "kotone", under: [{ card: "BT11-018", as: "shoutmonDx" }] },
            { card: "AD1-013", as: "zeig", under: [{ card: "BT10-024", as: "zeigSource" }] },
            { card: "BT11-015", as: "omni" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const zeigPermanentId = s.perm("zeig").permanentId;
    const consultLeavePrevention = s.engine.consultLeavePrevention.bind(s.engine);
    s.engine.consultLeavePrevention = (permanentIds, cause, resolvingSeat, opts) => {
      if (permanentIds.includes(zeigPermanentId))
        interruptSnapshots.push({
          isDigiXros: opts?.isDigiXros === true,
          dxInPlay: s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT11-018"),
          memory: s.state.memory,
        });
      return consultLeavePrevention(permanentIds, cause, resolvingSeat, opts);
    };
    const effectKey = (observe(s.engine).activatableEffects(s.perm("kotone")) as Array<{ effectKey: string }>)[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effectKey.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT11-018") &&
        s.state.pendingDecision === undefined,
    );
    return { s, interruptSnapshots };
  }

  it("bug 1555206206417674281 follow-up: ZeigGreymon's 'other than by DigiXros' leave effect does not trigger", async () => {
    const { s } = await playShoutmonDxWithFieldZeigGreymon();
    const player = s.state.players[0]!;
    const shoutmonDx = player.battleArea.find(({ topCard }) => topCard?.cardId === "BT11-018")!;
    expect(shoutmonDx.stack.map(({ cardId }) => cardId).sort()).toEqual(["AD1-013", "BT11-015"]);
    expect(player.battleArea.some(({ topCard }) => topCard?.cardId === "BT10-024")).toBe(false);
    expect(player.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("zeigSource").instanceId);
    expect(s.state.memory).toBe(4);
  });

  it("bug 1555206206417674281 follow-up: the material's would-leave interrupt runs before Shoutmon DX is paid for and played", async () => {
    const { interruptSnapshots } = await playShoutmonDxWithFieldZeigGreymon();
    expect(interruptSnapshots).toEqual([{ isDigiXros: true, dxInPlay: false, memory: 10 }]);
  });
});

describe("Discord 1556119607822254110 — Taiki uses materials under any Tamer", () => {
  it("plays EX6 through Kotone using materials split between Taiki and Kotone", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-224", as: "kotone", under: [{ card: "BT21-021", as: "omni" }] },
            {
              card: "BT10-087",
              as: "taiki",
              under: [
                { card: "BT19-014", as: "ex6" },
                { card: "AD1-013", as: "zeig" },
              ],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("ex6").instanceId);
    s.state.memory = 10;
    await s.ready();
    const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    const played = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("ex6").instanceId);
    expect(played).toBeDefined();
    expect(played!.stack.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining([s.inst("omni").instanceId, s.inst("zeig").instanceId]),
    );
    expect(played!.stack).toHaveLength(2);
    expect(s.perm("taiki").isSuspended).toBe(true);
    expect(s.perm("kotone").isSuspended).toBe(true);
    expect(s.perm("taiki").stack).toHaveLength(0);
    expect(s.perm("kotone").stack).toHaveLength(0);
    expect(s.state.memory).toBe(4);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("Discord bug 1556113288599834624 — Kotone's own stored Digimon", () => {
  it.each(["AD1-006", "BT21-021", "BT19-051"])(
    "plays %s from under the Kotone paying the suspension cost",
    async (cardId) => {
      const s = setupEngine(
        { 0: { battleArea: [{ card: "P-224", as: "kotone", under: [{ card: cardId, as: "stored" }] }] } },
        { autoAcceptOptional: true, autoSelectCards: true, declineDigiXros: true, declinePrompts: ["On Play"] },
      );
      s.state.memory = 20;
      await s.ready();
      const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("kotone").instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("stored").instanceId)).toBe(
        true,
      );
      expect(s.perm("kotone").isSuspended).toBe(true);
      expect(s.perm("kotone").stack).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
});

describe("Discord bug 1556113288599834624 — paid DigiXros affordability", () => {
  it.each([false, true])("offers X7 with a legal hand material (stored under another Tamer=%s)", async (otherTamer) => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT11-015", as: "omni" }],
          battleArea: [
            { card: "P-224", as: "kotone", under: otherTamer ? [] : [{ card: "AD1-006", as: "x7" }] },
            ...(otherTamer
              ? [{ card: "BT10-087", as: "taiki", suspended: true, under: [{ card: "AD1-006", as: "x7" }] }]
              : []),
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    const played = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("x7").instanceId);
    expect(played).toBeDefined();
    expect(played!.stack.map((card) => card.instanceId)).toEqual([s.inst("omni").instanceId]);
    expect(s.state.memory).toBe(-10);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("Discord bug 1556113288599834624 — unavailable DigiXros materials", () => {
  it.each(["none", "trash", "underTamer", "breeding", "opponent", "duplicate", "costReductionBlocked", "declined"])(
    "does not play X7 when material availability is %s",
    async (location) => {
      const material = { card: location === "underTamer" ? "BT10-049" : "BT11-015", as: "omni" };
      const s = setupEngine(
        {
          0: {
            hand:
              location === "duplicate"
                ? [material, "BT11-015"]
                : location === "costReductionBlocked" || location === "declined"
                  ? [material]
                  : [],
            trash: location === "trash" ? [material] : [],
            breeding: location === "breeding" ? material : undefined,
            battleArea: [
              { card: "P-224", as: "kotone", under: [{ card: "AD1-006", as: "x7" }] },
              ...(location === "underTamer" ? [{ card: "BT10-087", suspended: true, under: [material] }] : []),
            ],
          },
          1: {
            battleArea: location === "opponent" ? [material] : location === "costReductionBlocked" ? ["BT8-071"] : [],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, declineDigiXros: location === "declined" },
      );
      // At -1, X7 needs TWO different recipe slots to reach the remaining nine-memory gauge.
      s.state.memory = location === "duplicate" ? -1 : 0;
      await s.ready();
      const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("kotone").instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("x7").instanceId)).toBe(false);
      expect(s.perm("kotone").stack.map((c) => c.instanceId)).toEqual([s.inst("x7").instanceId]);
      expect(s.state.memory).toBe(location === "duplicate" ? -1 : 0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("uses Taiki's available expansion to DigiXros with a card under the suspended Kotone", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "P-224",
              as: "kotone",
              under: [
                { card: "AD1-006", as: "x7" },
                { card: "BT11-015", as: "omni" },
              ],
            },
            { card: "BT10-087", as: "taiki" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    const played = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("x7").instanceId);
    expect(played).toBeDefined();
    expect(played!.stack.map((c) => c.instanceId)).toEqual([s.inst("omni").instanceId]);
    expect(s.perm("kotone").isSuspended).toBe(true);
    expect(s.perm("taiki").isSuspended).toBe(true);
    expect(s.state.memory).toBe(-10);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

it.each([true, false])("Kotone only uses Taiki's DigiXros expansion when Taiki can suspend: %s", async (locked) => {
  const preferred: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "P-224", as: "kotone", under: [{ card: "BT19-014", as: "played" }] },
          { card: "BT10-087", as: "taiki", under: [{ card: "BT21-021", as: "material" }] },
        ],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
  );
  await s.ready();
  s.state.memory = 10;
  preferred.push(s.inst("played").instanceId, s.perm("taiki").permanentId);
  if (locked) {
    await advance(s.engine).verb.restrict(s.perm("taiki").permanentId, "suspend", EffectDuration.Permanent);
  }
  const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.inst("kotone").instanceId,
      effectKey: effect.effectKey,
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "P-224") &&
      !s.state.pendingDecision,
  );
  const played = s.state.players[0]!.battleArea.find(
    ({ topCard }) => topCard.instanceId === s.inst("played").instanceId,
  )!;
  expect(played).toBeDefined();
  expect(played.stack.map(({ instanceId }) => instanceId)).toEqual(locked ? [] : [s.inst("material").instanceId]);
  expect(s.perm("taiki").isSuspended).toBe(!locked);
  expect(s.perm("taiki").stack.map(({ instanceId }) => instanceId)).toEqual(
    locked ? [s.inst("material").instanceId] : [],
  );
  expect(s.state.memory).toBe(locked ? 0 : 2);
});

it("does not consume Taiki materials when suspension becomes blocked after selection", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "P-224", as: "kotone", under: [{ card: "BT19-014", as: "played" }] },
          { card: "BT10-087", as: "taiki", under: [{ card: "BT21-021", as: "material" }] },
        ],
      },
    },
    { autoAcceptOptional: true },
  );
  await s.ready();
  s.state.memory = 10;
  const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.inst("kotone").instanceId,
      effectKey: effect.effectKey,
    }),
  ).toEqual({ ok: true });
  for (const alias of ["played", "taiki"]) {
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst(alias).instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle();
  }
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  const pending = s.state.pendingDecision!;
  await advance(s.engine).verb.restrict(s.perm("taiki").permanentId, "suspend", EffectDuration.Permanent);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: pending.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("material").instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(
    () => s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "P-224") && !s.state.pendingDecision,
  );
  const played = s.state.players[0]!.battleArea.find(
    ({ topCard }) => topCard.instanceId === s.inst("played").instanceId,
  )!;
  expect(played.stack).toHaveLength(0);
  expect(s.perm("taiki").isSuspended).toBe(false);
  expect(s.perm("taiki").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("material").instanceId]);
  expect(s.state.memory).toBe(0);
});
