import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX5-043.js";
import "../index.js";

const LEOPARDMON_X = "EX5-043";

describe("EX5-043 Leopardmon (X Antibody)", () => {
  it("matches the catalog and encodes shared OPT play/reduction and bounce scaling", () => {
    expect(getCardDefinition(LEOPARDMON_X)).toMatchObject({
      cardId: LEOPARDMON_X,
      nameEn: "Leopardmon (X Antibody)",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 13,
      dp: 12000,
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Holy Warrior", "Royal Knight", "X Antibody"],
      evoCosts: [{ color: "Green", level: 5, memoryCost: 4 }],
      effectText:
        "[Digivolve] Lv.6 w/[Leopardmon]\u00a0in name w/o [X Antibody]\u00a0trait: Cost 1 \n\n[When Digivolving] [Main] [Once Per Turn] You may play 1 green Digimon card from your hand with the play cost reduced by 4. If a card with [Leopardmon]\u00a0in its name or [X Antibody] is in this Digimon's digivolution cards, further reduce it by 3.[Your Turn] [Once Per Turn] When one of your Digimon is played, you may return 1 of your opponent’s 5000 DP or lower Digimon to the hand. For each of your other Digimon, add 3000 to the maximum DP this effect can choose.",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });

    const playEffects = compiled.effects?.filter(
      (effect) => effect.trigger === "Main" || effect.trigger === "WhenDigivolving",
    );
    expect(playEffects).toHaveLength(2);
    for (const effect of playEffects ?? []) {
      expect(effect).toMatchObject({ frequency: "OncePerTurn", sharedUseKey: "ir-shared-0" });
      expect(effect.actions).toEqual([
        {
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", kind: ["Digimon"], colors: ["Green"] }, count: 1 },
          from: ["hand"],
          payCost: true,
          optional: true,
          reduceCostBy: 4,
          reduceCostByIf: {
            amount: 3,
            condition: {
              kind: "selfDigivolutionStackHasTrait",
              filter: {
                nameOrTrait: [
                  { tokens: ["Leopardmon"], match: "name" },
                  { tokens: ["X Antibody"], match: "nameExact" },
                ],
              },
              raw: "a card with [Leopardmon] in its name or [X Antibody] is in this Digimon's digivolution cards",
            },
          },
        },
      ]);
    }

    const watcher = compiled.effects?.find((effect) => effect.trigger === "YourTurn");
    expect(watcher).toMatchObject({ frequency: "OncePerTurn" });
    expect(watcher?.actions).toEqual([
      {
        kind: "SubTrigger",
        event: "whenPlayed",
        sourceFilter: { controller: "mine", kind: ["Digimon"] },
        actions: [
          {
            kind: "Return",
            target: {
              filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 5000 } },
              count: 1,
            },
            to: "hand",
            optional: true,
            dpCeilingScaling: {
              amount: 3000,
              per: 1,
              filter: { controller: "mine", kind: ["Digimon"], excludeSelf: true },
              unit: "cards",
            },
          },
        ],
      },
    ]);
  });

  it("publicly uses Main to play a green Digimon with the base cost reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LEOPARDMON_X, as: "source" }],
          hand: [{ card: "EX5-049", as: "candidate" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const main = observe(s.engine)
      .activatableEffects(s.perm("source"))
      .find((entry) => /play/i.test(entry.description ?? ""));
    if (main?.instanceId === undefined) throw new Error("EX5-043 Main effect is unavailable");
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: main.instanceId,
        effectKey: main.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("candidate").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("candidate").instanceId),
    ).toBe(true);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("candidate").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("answers Q3621-Q3622: one stack match adds at most one further reduction of three", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LEOPARDMON_X, as: "source", under: ["BT13-056", "BT22-052"] }],
          hand: [{ card: "EX5-049", as: "candidate" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    const main = observe(s.engine)
      .activatableEffects(s.perm("source"))
      .find((entry) => /play/i.test(entry.description ?? ""));
    if (main?.instanceId === undefined) throw new Error("EX5-043 Main effect is unavailable");
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: main.instanceId,
        effectKey: main.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("candidate").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("candidate").instanceId),
    ).toBe(true);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("keeps Main available after declining the shared When Digivolving play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX5-039", as: "base" }],
          hand: [
            { card: LEOPARDMON_X, as: "source" },
            { card: "EX5-049", as: "candidate" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === LEOPARDMON_X && s.state.pendingDecision === undefined);
    await settle();
    expect(
      observe(s.engine)
        .activatableEffects(s.perm("base"))
        .some((entry) => /play/i.test(entry.description ?? "")),
    ).toBe(true);
  });

  it("publicly plays through When Digivolving and shares its Once Per Turn use with Main", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX5-039", as: "base" }],
          hand: [
            { card: LEOPARDMON_X, as: "source" },
            { card: "EX5-049", as: "first" },
            { card: "EX5-049", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("first").instanceId),
    );

    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("first").instanceId)).toBe(
      true,
    );
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("second").instanceId);
    expect(
      observe(s.engine)
        .activatableEffects(s.perm("base"))
        .some((entry) => /play/i.test(entry.description ?? "")),
    ).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("returns an ineligible non-green candidate to hand", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: LEOPARDMON_X, as: "source" }],
        hand: [{ card: "BT1-035", as: "ineligible" }],
      },
    });
    s.state.memory = 10;
    await s.ready();
    const main = observe(s.engine)
      .activatableEffects(s.perm("source"))
      .find((entry) => /play/i.test(entry.description ?? ""));
    if (main?.instanceId === undefined) throw new Error("EX5-043 Main effect is unavailable");
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: main.instanceId,
        effectKey: main.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("ineligible").instanceId);
    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("ineligible").instanceId),
    ).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("returns one eligible opposing Digimon with the live +3000-per-other-own-Digimon ceiling", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: LEOPARDMON_X, as: "source" },
            { card: "BT1-009", as: "other" },
          ],
          hand: [{ card: "BT1-064", as: "played" }],
        },
        1: {
          battleArea: [
            { card: "BT1-021", as: "highTarget", dp: 9000 },
            { card: "BT1-021", as: "tooHigh", dp: 12000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("highTarget").instanceId));

    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("highTarget").instanceId);
    expect(
      s.state.players[1]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("tooHigh").instanceId),
    ).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not bounce an opposing Digimon above the base ceiling when no other Digimon are present", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: LEOPARDMON_X, as: "source" }], hand: [{ card: "BT1-064", as: "played" }] },
        1: { battleArea: [{ card: "BT1-021", as: "target", dp: 9000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle();

    expect(
      s.state.players[1]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("target").instanceId),
    ).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("digivolves for cost 1 from a level 6 [Leopardmon] without the [X Antibody] trait", () => {
    expect(matchingAlternateDigivolutionRequirement(LEOPARDMON_X, "BT22-052")?.cost).toBe(1);
    expect(matchingAlternateDigivolutionRequirement(LEOPARDMON_X, "BT13-058")?.cost).toBe(1);
    expect(matchingAlternateDigivolutionRequirement(LEOPARDMON_X, LEOPARDMON_X)).toBeUndefined();
    expect(matchingAlternateDigivolutionRequirement(LEOPARDMON_X, "BT3-030")?.cost).toBe(1);
  });
});
