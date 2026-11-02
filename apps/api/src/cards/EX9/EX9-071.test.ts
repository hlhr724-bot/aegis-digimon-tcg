import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX9-071.js";
import "../index.js";

describe("EX9-071", () => {
  it.each([
    { name: "own off-color DM Digimon", card: "EX9-007", zone: "battle", allowed: true },
    { name: "own off-color DM Tamer", card: "EX9-069", zone: "battle", allowed: true },
    { name: "own off-color breeding DM", card: "EX9-007", zone: "breeding", allowed: true },
    { name: "own non-DM Red Digimon", card: "BT1-009", zone: "battle", allowed: false },
    { name: "opponent DM Digimon", card: "EX9-007", zone: "opponent", allowed: false },
    { name: "face-up security DM card", card: "EX9-007", zone: "security", allowed: false },
  ])("Q4834 color requirement: $name", async ({ card, zone, allowed }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: zone === "battle" ? [card] : [],
          ...(zone === "breeding" ? { breeding: { card } } : {}),
          security: zone === "security" ? [{ card, faceUp: true }] : [],
          hand: [{ card: "EX9-071", as: "protein" }],
          deck: ["BT1-048"],
        },
        1: { battleArea: zone === "opponent" ? [card] : [] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("protein").instanceId }).ok).toBe(allowed);
    await settle();
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.memory).toBe(allowed ? 3 : 5);
    expect(s.state.players[0]!.hand.map((entry) => entry.cardId)).toEqual([allowed ? "BT1-048" : "EX9-071"]);
    const played = s.state.players[0]!.battleArea.find((entry) => entry.topCard.cardId === "EX9-071");
    expect(played?.placedByEffect).toBe(allowed ? true : undefined);
    expect(played === undefined ? [] : observe(s.engine).activatableEffects(played)).toEqual([]);
    expect(s.state.players[0]!.deck.map((entry) => entry.cardId)).toEqual(allowed ? [] : ["BT1-048"]);
  });
  it("explicitly declines the Delay payload without trashing sources or unsuspending", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX9-071", as: "protein" },
          {
            card: "EX9-007",
            as: "target",
            suspended: true,
            under: [
              { card: "BT1-009", as: "bottomOne", faceUp: false },
              { card: "BT1-048", as: "bottomTwo", faceUp: false },
            ],
          },
        ],
      },
    });
    s.perm("protein").placedByEffect = true;
    await s.ready();
    const effect = JSON.parse(s.perm("protein").activatableEffectsJson || "[]").find(
      (entry: { description?: string }) => /Delay/i.test(entry.description ?? ""),
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("protein").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.perm("target").stack.map((card) => card.instanceId)).toEqual([
      s.inst("bottomOne").instanceId,
      s.inst("bottomTwo").instanceId,
    ]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["EX9-071"]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });
  it.each(["non-DM", "opponent", "split hosts", "face-up bottom"])(
    "offers Delay without paying the unmeetable bullet cost: %s",
    async (scenario) => {
      const host = {
        card: scenario === "non-DM" ? "BT1-009" : "EX9-007",
        as: "host",
        suspended: true,
        under: [
          { card: "BT1-048", as: "one", faceUp: scenario === "face-up bottom" },
          ...(scenario === "split hosts" ? [] : [{ card: "BT1-046", as: "two", faceUp: false }]),
        ],
      };
      const s = setupEngine({
        0: {
          battleArea: [
            { card: "EX9-071", as: "protein" },
            ...(scenario === "opponent" ? [] : [host]),
            ...(scenario === "split hosts"
              ? [
                  {
                    card: "EX9-007",
                    as: "other",
                    suspended: true,
                    under: [{ card: "BT1-046", as: "two", faceUp: false }],
                  },
                ]
              : []),
          ],
        },
        1: { battleArea: scenario === "opponent" ? [host] : [] },
      });
      s.perm("protein").placedByEffect = true;
      await s.ready();
      // CR 15-7-5 / Q5710: trashing the ＜Delay＞ card stays legal; the bullet's own
      // "by trashing" condition is what cannot be met (Q4833).
      expect(observe(s.engine).activatableEffects(s.perm("protein"))).toHaveLength(1);
      expect(s.perm("host").isSuspended).toBe(true);
      expect(s.perm("host").stack).toHaveLength(scenario === "split hosts" ? 1 : 2);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      expect(s.state.players[1]!.trash).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it("waives color requirements with a DM card and draws before entering the battle area", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "Static")).toMatchObject({
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "anyOf",
            conditions: [
              {
                kind: "youHave",
                filter: { zone: "battleArea", kind: ["Digimon", "Tamer"], nameOrTrait: [{ tokens: ["DM"] }] },
              },
              {
                kind: "youHave",
                filter: { zone: "breeding", kind: ["Digimon"], nameOrTrait: [{ tokens: ["DM"] }] },
              },
            ],
          },
        },
      ],
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "Main")?.actions).toEqual([
      { effectTextPart: "[Main] ＜Draw 1＞.", kind: "Draw", controller: "mine", amount: 1 },
      { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
    ]);
  });
  it("has Delay to unsuspend a selected DM Digimon by trashing its bottom two face-down cards", () =>
    expect(
      compiled.effects?.find(
        (entry) => entry.trigger === "Main" && entry.keywords?.some((keyword) => keyword.keyword === "Delay"),
      ),
    ).toMatchObject({
      keywords: [{ keyword: "Delay" }],
      actions: [
        {
          kind: "Unsuspend",
          target: { count: 1, fromSelectionRef: "paidHost" },
          cost: {
            kind: "trash",
            bindHostAs: "paidHost",
            target: {
              filter: {
                controller: "mine",
                zone: "digivolutionCards",
                faceDown: true,
                withinBottomN: 2,
                sameHost: true,
                hostFilter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["DM"] }] },
              },
              count: 2,
            },
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    }));
  it("gains memory and enters the battle area from security", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [{ kind: "GainMemory", amount: 1 }, { kind: "PlaceInBattleAreaSelf" }],
    }));

  it("unsuspends a DM Digimon only after trashing both bottom two face-down cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-071", as: "protein" },
            {
              card: "EX9-007",
              as: "target",
              suspended: true,
              under: [
                { card: "BT1-009", as: "bottomOne", faceUp: false },
                { card: "BT1-048", as: "bottomTwo", faceUp: false },
                { card: "BT1-046", as: "upper", faceUp: false },
              ],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.perm("protein").placedByEffect = true;
    expect(s.perm("target").stack).toHaveLength(3);
    expect(s.perm("target").stack.every((card) => card.faceUp !== true)).toBe(true);
    await s.ready();

    const effect = JSON.parse(s.perm("protein").activatableEffectsJson || "[]").find(
      (entry: { effectKey: string; description?: string }) => /Delay/i.test(entry.description ?? ""),
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("protein").topCard.instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });

    await settle();
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["EX9-071", "BT1-009", "BT1-048"]);
    expect(s.perm("target").isSuspended).toBe(false);
    expect(s.perm("target").stack.map((card) => card.instanceId)).toEqual([s.inst("upper").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("bottomOne").instanceId, s.inst("bottomTwo").instanceId]),
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX9-071")).toBe(false);
  });

  it("pays Delay but not the two-card bullet cost when only one eligible face-down card exists", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-071", as: "protein" },
            {
              card: "EX9-007",
              as: "target",
              suspended: true,
              under: [{ card: "EX9-007", as: "onlyCard", faceUp: false }],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.perm("protein").placedByEffect = true;
    await s.ready();

    const effect = JSON.parse(s.perm("protein").activatableEffectsJson || "[]").find(
      (entry: { effectKey: string }) => entry.effectKey === "EX9-071/ir-27-0",
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("protein").topCard.instanceId,
        effectKey: "EX9-071/ir-27-0",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.length > 0 && s.state.pendingDecision === undefined);

    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.perm("target").stack).toHaveLength(1);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["EX9-071"]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX9-071")).toBe(false);
  });
  it("draws one and enters the battle area when played from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-007", as: "dm" }],
          hand: [{ card: "EX9-071", as: "protein" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("protein").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-071"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-071")).toBe(true);
  });
  it("gains one memory and enters the battle area from security", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "EX9-071", as: "protein" }, "BT1-048"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX9-071"]);
    expect(s.perm("protein").placedByEffect).toBe(true);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-048"]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
