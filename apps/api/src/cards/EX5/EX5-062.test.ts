import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./EX5-062.js";

const ANUBIS = "EX5-062";
const BASE = "EX5-060";
const CANDIDATE = "BT10-080";
const OPP_LV5 = "BT1-058";
const OPP_LV6 = "BT2-018";

function activateMain(s: ReturnType<typeof setupEngine>, alias: string) {
  const entry = observe(s.engine)
    .activatableEffects(s.perm(alias))
    .find((effect) => /trash/i.test(effect.description ?? ""));
  if (entry === undefined || entry.instanceId === undefined || entry.effectKey === undefined) {
    throw new Error("EX5-062 Main effect is unavailable through the public affordance");
  }
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: entry.instanceId,
      effectKey: entry.effectKey,
    }),
  ).toEqual({ ok: true });
}

describe("EX5-062 Anubismon", () => {
  it("maps the printed reductions and one shared Once Per Turn identity in IR", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    const activationEffects = compiled.effects.filter(
      (effect) => effect.trigger === "Main" || effect.trigger === "WhenDigivolving",
    );
    expect(activationEffects).toHaveLength(2);
    expect(activationEffects.map((effect) => effect.sharedUseKey)).toEqual(["ir-shared-0", "ir-shared-0"]);
    for (const effect of activationEffects) {
      expect(effect.frequency).toBe("OncePerTurn");
      expect(effect.actions).toHaveLength(2);
      expect(effect.actions[0]).toMatchObject({
        kind: "Trash",
        target: { count: 3, upTo: true, filter: { controller: "mine", zone: "hand" } },
        trackCount: "anubismonTrashed",
      });
      expect(effect.actions[1]).toMatchObject({
        kind: "PlayWithoutCost",
        from: ["trash"],
        payCost: true,
        reduceCostBy: 3,
        reduceCostByScaling: { per: 1, unit: "namedCount", countSource: "anubismonTrashed" },
      });
    }
    const watcher = compiled.effects.find((effect) => effect.trigger === "YourTurn");
    expect(watcher?.frequency).toBeUndefined();
    expect(watcher?.actions?.[0]).toMatchObject({
      kind: "SubTrigger",
      sourceFilter: { controller: "mine", kind: ["Digimon"], byEffect: true },
      actions: [
        expect.objectContaining({
          kind: "Delete",
          target: {
            count: 1,
            filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 5 } },
          },
        }),
        expect.objectContaining({ kind: "Draw", amount: 1, condition: { kind: "ifThisEffectDidNotDelete" } }),
      ],
    });
  });

  it("uses the legal public evolution route and allows zero hand trash (Q3662)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BASE, as: "base" }],
          hand: [{ card: ANUBIS, as: "evolving" }],
          trash: [{ card: CANDIDATE, as: "candidate" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE));

    expect(s.perm("base").topCard?.cardId).toBe(ANUBIS);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual([BASE]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE)).toBe(true);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("further reduces the played card by every card trashed from hand (Q3661)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ANUBIS, as: "anubis" }],
          hand: ["BT1-009", "BT1-012"],
          trash: [{ card: CANDIDATE, as: "candidate" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();
    activateMain(s, "anubis");
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE));

    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-012"]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE)).toBe(true);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "EX5-062")
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual([
      "[When Digivolving] [Main] [Once Per Turn] You may trash up to 3 cards from your hand.",
      "Then, play 1 purple Digimon card from your trash with the play cost reduced by 3. " +
        "For each card trashed by this effect, further reduce it by 1.",
    ]);
  });

  it("can play the same purple card that was selected for hand trash (Q3663)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ANUBIS, as: "anubis" }],
          hand: [
            { card: CANDIDATE, as: "candidate" },
            { card: "BT1-009", as: "other" },
          ],
          trash: [],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("candidate").instanceId);
    s.state.memory = 2;
    await s.ready();
    activateMain(s, "anubis");
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE));

    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("candidate").instanceId,
      ),
    ).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("activates from its own effect play and deletes exactly one opposing level-5-or-lower Digimon (Q3665)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ANUBIS, as: "anubis" }],
          trash: [{ card: CANDIDATE, as: "candidate" }],
        },
        1: {
          battleArea: [
            { card: OPP_LV5, as: "lv5", dp: 5000 },
            { card: OPP_LV6, as: "lv6", dp: 12000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    const lv5Id = s.perm("lv5").permanentId;
    const lv5CardId = s.inst("lv5").instanceId;
    const lv6Id = s.perm("lv6").permanentId;
    activateMain(s, "anubis");
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lv5Id)).toBe(false);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === lv5CardId)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lv6Id)).toBe(true);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("draws instead when an effect play has no legal level-5-or-lower target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ANUBIS, as: "anubis" }],
          trash: [{ card: CANDIDATE, as: "candidate" }],
          deck: ["BT1-009", "BT1-012"],
        },
        1: { battleArea: [{ card: OPP_LV6, as: "lv6", dp: 12000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    activateMain(s, "anubis");
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "BT1-009"));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === OPP_LV6)).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT1-009");
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not activate the watcher for a manual play and permits declining the optional Main effect", async () => {
    const manual = setupEngine(
      {
        0: { battleArea: [{ card: ANUBIS, as: "anubis" }], hand: [{ card: CANDIDATE, as: "manual" }] },
        1: { battleArea: [{ card: OPP_LV5, as: "lv5", dp: 5000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    manual.state.memory = 7;
    await manual.ready();
    const lv5Id = manual.perm("lv5").permanentId;
    expect(manual.engine.applyIntent(0, { type: "playCard", instanceId: manual.inst("manual").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      manual.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === CANDIDATE),
    );
    expect(manual.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lv5Id)).toBe(true);
    expect(manual.state.pendingDecision).toBeUndefined();

    const declined = setupEngine(
      {
        0: { battleArea: [{ card: ANUBIS, as: "anubis" }], trash: [{ card: CANDIDATE, as: "candidate" }] },
        1: { battleArea: [{ card: OPP_LV5, as: "lv5", dp: 5000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    declined.state.memory = 4;
    await declined.ready();
    activateMain(declined, "anubis");
    await settle();
    expect(declined.state.players[0]!.trash.some((card) => card.cardId === CANDIDATE)).toBe(true);
    expect(declined.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === OPP_LV5)).toBe(true);
    expect(declined.state.memory).toBe(4);
    expect(declined.state.pendingDecision).toBeUndefined();
  });

  it("plays two Royal Knights from a legal breeding stack but the watcher deletes/draws only once (Q3664)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ANUBIS, as: "anubis" }],
          hand: [{ card: "BT13-112", as: "omnimon" }],
          breeding: { card: "BT13-007", as: "drasil", under: ["BT13-077", "BT13-090"] },
          deck: ["BT1-009", "BT1-012"],
        },
        1: {
          battleArea: [
            { card: OPP_LV5, as: "firstLv5", dp: 5000 },
            { card: OPP_LV5, as: "secondLv5", dp: 5000 },
            { card: OPP_LV6, as: "lv6", dp: 12000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true, preferOptionIndex: 1, autoSelectCards: true },
    );
    s.state.memory = 14;
    await s.engine.recomputeContinuousEffects();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("omnimon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding?.topCard === undefined);

    expect(
      s.state.players[0]!.battleArea.filter((permanent) =>
        ["BT13-077", "BT13-090"].includes(permanent.topCard?.cardId ?? ""),
      ),
    ).toHaveLength(2);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT13-007")).toBe(true);
    expect(s.state.players[1]!.battleArea.filter((permanent) => permanent.topCard?.cardId === OPP_LV5)).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === OPP_LV6)).toBe(true);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("deletes again when a separate effect plays another Digimon in the same turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ANUBIS, as: "anubis" }],
          hand: [
            { card: "BT2-108", as: "firstRaid" },
            { card: "BT2-108", as: "secondRaid" },
          ],
          trash: [
            { card: "ST6-03", as: "firstRevival" },
            { card: "ST6-03", as: "secondRevival" },
          ],
        },
        1: {
          battleArea: [
            { card: OPP_LV5, as: "firstTarget" },
            { card: OPP_LV5, as: "secondTarget" },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 8;
    await s.ready();
    for (const alias of ["firstRaid", "secondRaid"]) {
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst(alias).instanceId })).toEqual({ ok: true });
      await settle();
    }
    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "ST6-03")).toHaveLength(2);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.filter(({ cardId }) => cardId === OPP_LV5)).toHaveLength(2);
  });

  it("rejects an illegal direct evolution source without changing the card or memory", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "wrongBase" }], hand: [{ card: ANUBIS, as: "evolving" }] },
    });
    s.state.memory = 8;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongBase").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.perm("wrongBase").topCard?.cardId).toBe("BT1-009");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("evolving").instanceId)).toBe(true);
    expect(s.state.memory).toBe(8);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
