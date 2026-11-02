import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { compiled } from "./EX13-029.js";
import "../index.js";

const CARD_ID = "EX13-029";

const WITCHELNY_TEXT_SOURCE = "BT18-030";
const PLAIN_YELLOW_SOURCE = "BT1-045";
const ILLEGAL_SOURCE = "BT1-064";
const WITCHELNY_HOST = "BT18-036";
const NON_WITCHELNY_HOST = "BT9-035";
const OPPONENT = "BT1-037";
const INERT = "BT1-009";
const DECK = ["BT1-011", "BT1-012", "BT1-013", "BT1-014"];
const AUTOMATION = { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true };

describe("EX13-029 FlameWizardmon", () => {
  it("matches the catalog printed text, stats and evolution costs", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "FlameWizardmon",
      colors: ["Yellow", "Red"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      forms: ["Armor Form"],
      attributes: ["Virus"],
      types: ["Wizard", "Witchelny"],
      evoCosts: [
        { color: "Yellow", level: 3, memoryCost: 3 },
        { color: "Red", level: 3, memoryCost: 3 },
      ],
      effectText:
        "[Digivolve] Lv.3 w/[Witchelny] in text: Cost 2 \n\n＜Armor Purge＞ \n[When Digivolving] [When Attacking] [Once Per Turn] By trashing your top security card, 1 of your opponent's Digimon gets -4000 DP for the turn. After, if you have 3 or fewer security cards, delete 1 of your opponent's Digimon with 4000 DP or less.\n[Rule] Name: Also treated as [Wizardmon].",
      inheritedEffectText:
        "[All Turns] [Once Per Turn] When this Digimon with [Dynasmon] or [Witchelny] in its text would leave the battle area by your opponent's effects, by trashing your top security card, it doesn't leave.",
    });
  });

  it("compiles every printed clause", () => {
    expect(runtimeCompiledCard(CARD_ID)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toHaveLength(5);

    expect(compiled.digivolutionRequirement).toEqual([{ level: 3, texts: ["Witchelny"], cost: 2, isAlternate: true }]);
    expect(compiled.assemblyRequirement).toBeUndefined();

    expect(compiled.effects[0]).toMatchObject({
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Armor Purge", raw: "＜Armor Purge＞" }],
    });

    const [whenDigivolving, whenAttacking] = [compiled.effects[1], compiled.effects[2]];
    expect(whenDigivolving).toMatchObject({ trigger: "WhenDigivolving", frequency: "OncePerTurn" });
    expect(whenAttacking).toMatchObject({ trigger: "WhenAttacking", frequency: "OncePerTurn" });
    expect(whenDigivolving?.sharedUseKey).toBe(whenAttacking?.sharedUseKey);
    expect(whenDigivolving?.sharedUseKey).toBeTypeOf("string");

    for (const effect of [whenDigivolving, whenAttacking]) {
      expect(effect?.actions).toMatchObject([
        {
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -4000,
          duration: "forTheTurn",
          cost: {
            kind: "trash",
            target: { filter: { controller: "mine", zone: "security", position: "top" }, count: 1 },
          },
        },
        {
          kind: "Delete",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 4000 } },
            count: 1,
          },
          condition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 3 },
        },
      ]);
      expect(effect?.actions[0]).toMatchObject({ optional: true, abortOnDecline: true });
      expect(effect?.actions[1]).not.toHaveProperty("optional");
    }

    expect(compiled.effects[3]).toMatchObject({
      trigger: "Rule",
      actions: [{ kind: "GrantStatic", grant: "name", tokens: ["Wizardmon"] }],
    });

    expect(compiled.effects[4]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          leaveCause: "opponentEffect",
          sourceFilter: {
            isSelfRef: true,
            kind: ["Digimon"],
            printedTextOnly: true,
            nameOrTrait: [{ tokens: ["Dynasmon", "Witchelny"], match: "text" }],
          },
          actions: [],
        },
      ],
    });
  });

  it("Q7289 digivolves off a Lv.3 whose printed text contains [Witchelny] for 2", async () => {
    const textSource = getCardDefinition(WITCHELNY_TEXT_SOURCE)!;
    expect(textSource.nameEn).not.toContain("Witchelny");
    expect(textSource.types).not.toContain("Witchelny");
    expect(`${textSource.effectText ?? ""} ${textSource.inheritedEffectText ?? ""}`).toContain("Witchelny");

    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "middle" },
            { card: "BT1-012", as: "bottom" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "victim" }],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("middle").instanceId,
      s.inst("bottom").instanceId,
    ]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain(OPPONENT);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("charges the catalog EvoCost's 3 from a Lv.3 that never names [Witchelny]", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: PLAIN_YELLOW_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: { battleArea: [{ card: OPPONENT, as: "bystander" }], security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 2);

    expect(s.perm("source").topCard.cardId).toBe(CARD_ID);
    expect(s.state.memory).toBe(7);
  });

  it("refuses a Lv.3 that matches neither the catalog EvoCosts nor the printed header", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ILLEGAL_SOURCE, as: "green" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("green").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("green").topCard.cardId).toBe(ILLEGAL_SOURCE);
    expect(s.state.memory).toBe(10);
    expect(s.state.players[0]!.security).toHaveLength(3);
  });

  it("skips the delete while the post-cost security stack is still above 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          deck: DECK,
        },
        1: { battleArea: [{ card: OPPONENT, as: "victim" }], security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 4);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("victim").currentDP).toBe(2000);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("respects the printed 4000 DP ceiling on the delete", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "survivor", dp: 9000 }],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("survivor").currentDP).toBe(5000);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q7291 cannot process the debuff or the After clause when the security cost isn't paid", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: [],
          deck: DECK,
        },
        1: { battleArea: [{ card: OPPONENT, as: "victim" }], security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await drainMicrotasks();

    expect(s.perm("source").topCard.cardId).toBe(CARD_ID);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("victim").currentDP).toBe(6000);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Discord 1555472780571705354 lets the player decline the security cost, keeping the quota for [When Attacking]", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "middle" },
            { card: "BT1-012", as: "bottom" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "victim" }],
          security: [INERT, INERT, INERT, INERT],
          deck: DECK,
        },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 20;
    const fullSecurity = s.state.players[0]!.security.map(({ instanceId }) => instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const digivolveDecision = s.state.pendingDecision!;
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual(fullSecurity);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: digivolveDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual(fullSecurity);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("victim").currentDP).toBe(6000);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const attackDecision = s.state.pendingDecision!;
    expect(attackDecision.decisionId).not.toBe(digivolveDecision.decisionId);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: attackDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 3 && s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual(fullSecurity.slice(1));
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(fullSecurity[0]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("Discord 1555472780571705354 lets the player decline the inherited security cost and leave", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_HOST, as: "host", under: [CARD_ID] }],
          security: [{ card: "BT1-010", as: "top" }],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    const deletion = advance(s.engine).verb.deletePermanent([hostId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.state.players[0]!.security).toHaveLength(1);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    expect(await deletion).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([s.inst("top").instanceId]);
  });

  it("spends one shared quota across both printed windows and resets next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "first", dp: 30_000 }],
          security: [INERT, INERT, INERT, INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    await s.ready();
    s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 20;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 2);
    const securityAfterDigivolve = s.state.players[0]!.security.length;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 3);

    expect(s.state.players[0]!.security).toHaveLength(securityAfterDigivolve);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);

    await advance(s.engine).verb.unsuspend([s.perm("source").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === securityAfterDigivolve - 1);

    expect(s.state.players[0]!.security).toHaveLength(securityAfterDigivolve - 1);
  });

  it("declares ＜Armor Purge＞ live and is read as [Wizardmon] by its printed [Rule] clause", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: CARD_ID, as: "flameWizardmon" }], security: [INERT], deck: DECK },
      1: { security: [INERT], deck: DECK },
    });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("flameWizardmon"), "Armor Purge")).toBe(true);
    expect(getCardDefinition(CARD_ID)?.nameEn).toBe("FlameWizardmon");
    expect(observe(s.engine).grantedNames(s.perm("flameWizardmon"))).toContain("wizardmon");
  });

  it("Q7289/Q7290 keeps a [Witchelny]-text host on the board, but not a host with neither token", async () => {
    const protectedBoard = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_HOST, as: "host", under: [CARD_ID] }],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await protectedBoard.ready();
    const protectedId = protectedBoard.perm("host").permanentId;

    advance(protectedBoard.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(protectedBoard.engine).verb.deletePermanent([protectedId], "byEffect")).toBe(0);
    advance(protectedBoard.engine).verb.leaveEffectResolution();
    await settle(() => protectedBoard.state.pendingDecision === undefined);

    expect(protectedBoard.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([protectedId]);
    expect(protectedBoard.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      protectedBoard.inst("bottom").instanceId,
    ]);

    const unprotected = setupEngine(
      {
        0: {
          battleArea: [{ card: NON_WITCHELNY_HOST, as: "host", under: [CARD_ID] }],
          security: [{ card: "BT1-010", as: "top" }],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await unprotected.ready();
    const unprotectedId = unprotected.perm("host").permanentId;

    advance(unprotected.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(unprotected.engine).verb.deletePermanent([unprotectedId], "byEffect")).toBe(1);
    advance(unprotected.engine).verb.leaveEffectResolution();
    await settle(() => unprotected.state.pendingDecision === undefined);

    expect(unprotected.state.players[0]!.battleArea).toHaveLength(0);
    expect(unprotected.state.players[0]!.security).toHaveLength(1);
  });

  it("Q7290 also protects a host matching the [Dynasmon] side of the text union", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-044", as: "dynasmon", under: [CARD_ID] }],
          security: ["BT1-010"],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await s.ready();
    const hostId = s.perm("dynasmon").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([hostId]);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).not.toContain("BT1-010");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-010");
  });

  it("fires the delete when the post-cost security stack is exactly 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          deck: DECK,
        },
        1: { battleArea: [{ card: OPPONENT, as: "victim" }], security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 3);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain(OPPONENT);
  });

  it("deletes a target the debuff leaves at exactly 4000 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "victim", dp: 8000 }],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain(OPPONENT);
  });

  it("Q7292 finishes the After deletion before the 0-DP rule check deletes the debuffed Digimon", async () => {
    const preferred: string[] = [];
    let zeroDpStillPresentWhenAfterDeleted = false;
    let s!: ReturnType<typeof setupEngine>;
    s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_TEXT_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "flameWizardmon" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: OPPONENT, as: "zeroTarget", dp: 4000 },
            { card: "BT1-009", as: "afterTarget", dp: 3000 },
          ],
          security: [INERT],
          deck: DECK,
        },
      },
      {
        ...AUTOMATION,
        preferInstanceIds: preferred,
        onEvent(event) {
          if (event.kind !== "cardsMoved" || !event.instanceIds.includes(s.inst("afterTarget").instanceId)) return;
          zeroDpStillPresentWhenAfterDeleted = s.state.players[1]!.battleArea.some(
            ({ permanentId }) => permanentId === s.perm("zeroTarget").permanentId,
          );
        },
      },
    );
    preferred.includes = (id: string) =>
      s.perm("zeroTarget").currentDP === 4000
        ? id === s.perm("zeroTarget").permanentId
        : id === s.perm("afterTarget").permanentId;
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("flameWizardmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(zeroDpStillPresentWhenAfterDeleted).toBe(true);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining([OPPONENT, "BT1-009"]),
    );
  });

  it("ignores the host's own effects and cannot prevent with an empty security stack", async () => {
    const ownEffect = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_HOST, as: "host", under: [CARD_ID] }],
          security: [{ card: "BT1-010", as: "top" }],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await ownEffect.ready();
    const ownHostId = ownEffect.perm("host").permanentId;

    advance(ownEffect.engine).verb.enterEffectResolution(0, ["Digimon"]);
    expect(await advance(ownEffect.engine).verb.deletePermanent([ownHostId], "byEffect")).toBe(1);
    advance(ownEffect.engine).verb.leaveEffectResolution();
    await settle(() => ownEffect.state.pendingDecision === undefined);

    expect(ownEffect.state.players[0]!.battleArea).toHaveLength(0);
    expect(ownEffect.state.players[0]!.security).toHaveLength(1);

    const noSecurity = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_HOST, as: "host", under: [CARD_ID] }],
          security: [],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await noSecurity.ready();
    const hostId = noSecurity.perm("host").permanentId;

    advance(noSecurity.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(noSecurity.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(noSecurity.engine).verb.leaveEffectResolution();
    await settle(() => noSecurity.state.pendingDecision === undefined);

    expect(noSecurity.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("prevents only one departure per turn and reopens next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_HOST, as: "host", under: [CARD_ID] }],
          security: ["BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.security).toHaveLength(2);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security).toHaveLength(2);

    const revived = s.putOnBoard(0, { card: WITCHELNY_HOST, as: "host2", under: [CARD_ID] });
    await s.ready();
    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([revived.permanentId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(revived.permanentId);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });
});

describe("FlameWizardmon against inherited leave prevention", () => {
  it("pays its security cost and reduces DP while MachGaogamon protects the deletion target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "attacker" }],
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: "BT25-029", as: "protected", dp: 7000, under: ["BT25-027"] },
            { card: "ST24-13", as: "tamer", under: [{ card: "BT1-009", as: "payment", faceUp: false }] },
          ],
          security: ["BT1-009"],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID));
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
      s.perm("protected").permanentId,
    );
    expect(s.perm("protected").currentDP).toBe(3000);
    expect(s.perm("tamer").stack).toHaveLength(0);
  });
});
