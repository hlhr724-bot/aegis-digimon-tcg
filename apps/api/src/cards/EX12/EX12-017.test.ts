import { describe, expect, it } from "vitest";
import { assemblyRequirementFor, digivolutionRequirementsFor, EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { getEffectModule } from "../../engine/effects/registry.js";
import "../index.js";

describe("EX12-017 WarGreymon", () => {
  it("de-digivolves two cards and then deletes the opponent's lowest DP Digimon on play", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-017", as: "source" }] },
        1: {
          battleArea: [
            { card: "EX12-018", as: "stacked", dp: 14000, under: ["EX12-010", "EX12-016"] },
            { card: "BT1-011", as: "lowest", dp: 1000 },
          ],
        },
      },
      { autoAcceptOptional: true },
    );

    const lowestId = s.perm("lowest").permanentId;
    const resolving = advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    await settle(() => s.decisions.some(({ req }) => req.kind === "chooseTargets"));
    const deDigivolveChoice = s.decisions.find(({ req }) => req.kind === "chooseTargets")!;
    expect(
      s.engine.applyIntent(deDigivolveChoice.seat, {
        type: "respondDecision",
        decisionId: deDigivolveChoice.req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("stacked").permanentId] },
      }),
    ).toEqual({ ok: true });
    await resolving;
    await settle(() => s.state.players[1]!.battleArea.every((permanent) => permanent.permanentId !== lowestId));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowestId)).toBe(false);
    expect(s.perm("stacked").topCard.cardId).toBe("EX12-010");
    expect(s.perm("stacked").stack).toHaveLength(0);
  });

  it("publicly plays from hand, De-Digivolves 2, and deletes only the lowest-DP opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX12-017", as: "source" }] },
        1: {
          battleArea: [
            { card: "EX12-018", as: "stacked", dp: 14000, under: ["EX12-010", "EX12-016"] },
            { card: "BT1-011", as: "lowest", dp: 1000 },
            { card: "BT1-009", as: "peer", dp: 3000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 12;
    const lowestId = s.perm("lowest").permanentId;
    const peerId = s.perm("peer").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("source").instanceId),
    );
    await settle(() => s.state.players[1]!.battleArea.every((permanent) => permanent.permanentId !== lowestId));

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(s.inst("source").instanceId);
    expect(s.perm("stacked").topCard.cardId).toBe("EX12-010");
    expect(s.perm("stacked").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId).sort()).toEqual(["BT1-011", "EX12-016", "EX12-018"]);
    expect(s.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === lowestId)).toBeUndefined();
    expect(s.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === peerId)).toBeDefined();
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("shares one Once Per Turn use across On Play, When Digivolving, and When Attacking", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-017", as: "source" }] },
        1: {
          battleArea: [
            { card: "EX12-018", as: "firstStack", dp: 14000, under: ["EX12-010", "EX12-016"] },
            { card: "EX12-018", as: "secondStack", dp: 14000, under: ["EX12-010", "EX12-016"] },
            { card: "BT1-009", as: "lowest", dp: 1000 },
          ],
          security: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    await settle(() => s.state.players[1]!.battleArea.every((permanent) => permanent.topCard?.cardId !== "BT1-009"));
    const untouchedTop = s.perm("secondStack").topCard.cardId;
    const untouchedSources = s.perm("secondStack").stack.map((card) => card.instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    expect(
      s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === s.perm("source").permanentId)
        ?.isSuspended,
    ).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(0);

    expect(s.perm("secondStack").topCard.cardId).toBe(untouchedTop);
    expect(s.perm("secondStack").stack.map((card) => card.instanceId)).toEqual(untouchedSources);
  });

  it("uses the same de-digivolve/delete sequence on When Digivolving and When Attacking", async () => {
    const module = getEffectModule("EX12-017")!;
    const source = { cardId: "EX12-017", ownerSeat: 0 } as never;
    expect(module.effectsForTiming(EffectTiming.WhenDigivolving, source)).toHaveLength(1);
    expect(module.effectsForTiming(EffectTiming.OnUseAttack, source)).toHaveLength(1);
    for (const timing of ["WhenDigivolving", "WhenAttacking"]) {
      expect(
        registeredCompiledCards.get("EX12-017")!.effects.find((effect) => effect.trigger === timing),
      ).toMatchObject({
        frequency: "OncePerTurn",
        sharedUseKey: "ir-shared-0",
        actions: [
          {
            kind: "DeDigivolve",
            amount: 2,
            target: { count: 1, filter: { controller: "opponent", kind: ["Digimon"] } },
          },
          {
            kind: "Delete",
            target: { count: 1, filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestDP" } },
          },
        ],
      });
    }
  });

  it("offers its Counter response and keeps Counter once-per-turn independent from the main timing group", () => {
    const compiled = registeredCompiledCards.get("EX12-017")!;
    const counter = compiled.effects.find((effect) => effect.trigger === "Counter")!;
    expect(counter.frequency).toBe("OncePerTurn");
    expect(counter.sharedUseKey).toBeUndefined();
    expect(counter.actions).toMatchObject([
      {
        kind: "DnaDigivolve",
        materials: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
        into: {
          kind: ["Digimon"],
          nameOrTrait: [
            { tokens: ["Omnimon"], match: "nameExact" },
            { tokens: ["ME", "VB"], match: "trait" },
          ],
        },
        payCost: true,
        optional: true,
      },
      {
        kind: "RedirectAttack",
        target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
        optional: true,
      },
    ]);
  });

  it("redirects an attack without DNA digivolving when no legal result exists (Q6746)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-023", as: "attacker", dp: 12000 }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "redirectTarget", dp: 3000 },
            { card: "EX12-017", as: "counterSource", dp: 12000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: [] },
    );
    const redirectTargetId = s.perm("redirectTarget").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counterWindowOpened not found");
    const eligible = opened.eligibleCounters.find(
      (candidate) => candidate.instanceId === s.perm("counterSource").topCard.instanceId,
    );
    expect(eligible).toBeDefined();

    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.filter((event) => event.kind === "attackDeclared").length >= 2);

    expect(s.events.filter((event) => event.kind === "attackDeclared").at(-1)).toMatchObject({
      target: { kind: "permanent", permanentId: redirectTargetId },
    });
  });

  it("does not DNA digivolve into Omnimon Alter-S because [Omnimon] names an exact card", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-023", as: "attacker", dp: 12000 }] },
        1: {
          battleArea: [
            { card: "ST2-10", as: "blueMaterial" },
            { card: "EX12-017", as: "counterSource" },
          ],
          hand: [{ card: "EX9-021", as: "alterS" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counterWindowOpened not found");
    const eligible = opened.eligibleCounters.find(
      (candidate) => candidate.instanceId === s.perm("counterSource").topCard.instanceId,
    );
    expect(eligible).toBeDefined();

    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.filter((event) => event.kind === "attackDeclared").length >= 2);

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-021")).toBe(false);
    expect(s.state.players[1]!.hand.map((card) => card.cardId)).toEqual(["EX9-021"]);
  });

  it("DNA digivolves an attacked Digimon away during Counter (Q6744) and spends the attack Counter cap (Q6745)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-023", as: "attacker", dp: 12000 }] },
        1: {
          battleArea: [
            { card: "EX12-018", as: "attackedMaterial", suspended: true },
            { card: "EX12-017", as: "partner" },
            { card: "EX12-017", as: "counterSource" },
          ],
          hand: [{ card: "EX12-037", as: "dnaResult" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const attackedId = s.perm("attackedMaterial").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: attackedId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counterWindowOpened not found");
    const eligible = opened.eligibleCounters.find(
      (candidate) => candidate.instanceId === s.perm("counterSource").topCard.instanceId,
    );
    expect(eligible).toBeDefined();

    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX12-037"));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === attackedId)).toBe(false);
    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }).ok,
    ).toBe(false);
  });

  it("preserves all four DNA color routes and plays through the three-card Assembly recipe", async () => {
    const compiled = registeredCompiledCards.get("EX12-017")!;
    expect(compiled.dnaDigivolveRequirement).toEqual([
      {
        cost: 0,
        materials: [
          { color: "Red", level: 5 },
          { color: "Black", level: 5 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Red", level: 5 },
          { color: "Purple", level: 5 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Yellow", level: 5 },
          { color: "Black", level: 5 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Yellow", level: 5 },
          { color: "Purple", level: 5 },
        ],
      },
    ]);
    expect(assemblyRequirementFor("EX12-017")).toEqual([
      {
        materials: [
          {
            count: 1,
            nameOrTrait: [
              { tokens: ["Agumon", "Greymon"], match: "name" },
              { tokens: ["ME", "VB"], match: "trait" },
            ],
            level: 5,
          },
          {
            count: 1,
            nameOrTrait: [
              { tokens: ["Agumon", "Greymon"], match: "name" },
              { tokens: ["ME", "VB"], match: "trait" },
            ],
            level: 4,
          },
          {
            count: 1,
            nameOrTrait: [
              { tokens: ["Agumon", "Greymon"], match: "name" },
              { tokens: ["ME", "VB"], match: "trait" },
            ],
            level: 3,
          },
        ],
        reduceCost: 6,
      },
    ]);

    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX12-017", as: "source" }],
          trash: [
            { card: "EX12-016", as: "level5" },
            { card: "EX12-010", as: "level4" },
            { card: "EX12-005", as: "level3" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("source").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("level5").instanceId, s.inst("level4").instanceId, s.inst("level3").instanceId],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => {
      const permanent = s.state.players[0]!.battleArea.find((candidate) => candidate.topCard?.cardId === "EX12-017");
      return permanent?.stack.length === 3 && s.state.players[0]!.trash.length === 0;
    });

    const played = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "EX12-017")!;
    expect(s.state.memory).toBe(0);
    expect(played.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX12-016", "EX12-010", "EX12-005"]),
    );
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it.each([
    ["level 5", "BT1-020", "EX12-010", "EX12-005"],
    ["level 4", "EX12-016", "BT1-019", "EX12-005"],
    ["level 3", "EX12-016", "EX12-010", "BT1-009"],
  ])("rejects Assembly when the %s material does not match the name/trait requirement (Q6743)", (_slot, l5, l4, l3) => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX12-017", as: "source" }],
        trash: [
          { card: l5, as: "level5" },
          { card: l4, as: "level4" },
          { card: l3, as: "level3" },
        ],
      },
    });
    s.state.memory = 6;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("source").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("level5").instanceId, s.inst("level4").instanceId, s.inst("level3").instanceId],
        },
      } as never),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("executes Decode before an effect-caused leave and does not Decode from battle", async () => {
    const byEffect = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-017", as: "host", under: [{ card: "BT10-024", as: "decodeTarget" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await byEffect.ready();
    const hostId = byEffect.perm("host").permanentId;
    const targetId = byEffect.inst("decodeTarget").instanceId;

    expect(await advance(byEffect.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    await settle(() =>
      byEffect.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === targetId),
    );
    expect(byEffect.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId)).toBe(false);

    const byBattle = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-017", as: "host", under: [{ card: "EX12-016", as: "decodeTarget" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await byBattle.ready();
    const battleTargetId = byBattle.inst("decodeTarget").instanceId;
    expect(await advance(byBattle.engine).verb.deletePermanent([byBattle.perm("host").permanentId], "byBattle")).toBe(
      1,
    );
    expect(
      byBattle.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === battleTargetId),
    ).toBe(false);
  });

  it("plays only from its own digivolution cards, never from a neighbor's stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-017", as: "host" },
            { card: "EX12-015", as: "neighbor", under: [{ card: "EX12-013", as: "foreign" }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const foreignId = s.inst("foreign").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    await settle();

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === foreignId)).toBe(false);
    expect(s.perm("neighbor").stack.some((card) => card.instanceId === foreignId)).toBe(true);
  });

  it("does not Decode a level-6 VB source because the level ceiling applies to both OR branches (Q6742)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-017", as: "host", under: [{ card: "EX12-019", as: "tooHigh" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const targetId = s.inst("tooHigh").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === targetId)).toBe(false);
  });

  it("checks two security cards with Security Attack +1", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX12-017", as: "attacker" }] },
      1: { security: ["BT1-090", "BT1-090"] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.filter((event) => event.kind === "securityChecked").length === 2);

    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("keeps executable Decode, Security Attack +1, evolution routes, and the shared Once Per Turn group", () => {
    const compiled = registeredCompiledCards.get("EX12-017")!;
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, names: ["Greymon"], cost: 3, isAlternate: true },
      { traits: ["ME", "VB"], cost: 3, isAlternate: true, level: 5 },
    ]);
    expect(compiled.effects.filter((effect) => effect.trigger === "Static")).toHaveLength(2);
    expect(
      compiled.effects.find(
        (effect) =>
          effect.trigger === "Static" && effect.keywords?.some((keyword) => keyword.keyword === "SecurityAttack"),
      ),
    ).toMatchObject({
      keywords: [{ keyword: "SecurityAttack", amount: 1 }],
    });
    expect(
      compiled.effects.find(
        (effect) => effect.trigger === "Static" && effect.keywords?.some((keyword) => keyword.keyword === "Decode"),
      ),
    ).toMatchObject({
      keywords: [
        { keyword: "Decode", raw: "＜Decode (Lv.5 or lower w/[Agumon]/[Greymon] in name or w/[ME]/[VB] trait)＞" },
      ],
    });
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")).toMatchObject({
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          actions: [{ kind: "PlayWithoutCost", playedByDecode: true }],
        },
      ],
    });
    expect(compiled.effects.filter((effect) => effect.frequency === "OncePerTurn")).toHaveLength(4);
  });

  it("uses both normal colors and both cost-3 evolution alternatives", async () => {
    expect(digivolutionRequirementsFor("EX12-017")).toEqual([
      { level: 5, names: ["Greymon"], cost: 3, isAlternate: true },
      { level: 5, traits: ["ME", "VB"], cost: 3, isAlternate: true },
    ]);
    for (const [baseCardId, useAlternateCost, startingMemory] of [
      ["BT1-020", false, 4],
      ["BT10-064", false, 4],
      ["BT10-024", true, 3],
      ["EX12-044", true, 3],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: baseCardId, as: "base" }],
          hand: [{ card: "EX12-017", as: "warGreymon" }],
        },
      });
      s.state.memory = startingMemory;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("warGreymon").instanceId,
          useAlternateCost,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "EX12-017");
      expect(s.state.memory).toBe(0);
    }
  });

  it("rejects an off-color level-5 card without Greymon name, ME, or VB", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-038", as: "base" }],
        hand: [{ card: "EX12-017", as: "warGreymon" }],
      },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("warGreymon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});
