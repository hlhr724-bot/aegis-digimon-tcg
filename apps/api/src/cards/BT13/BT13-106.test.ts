import { Phase, type ServerEvent } from "@aegis/shared";
import "#api/cards/AD1/AD1-004";
import "#api/cards/AD1/AD1-019";
import "#api/cards/AD1/AD1-022";
import "#api/cards/EX13/EX13-073";
import "#api/cards/ST20/ST20-10";
import "../BT1/BT1-087.js";
import "./BT13-060.js";
import "./BT13-097.js";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT13-106.js";

describe("BT13-106 Odin's Breath", () => {
  it("activates Main when directly trashed from security by an effect", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "OnDiscardSecurity")?.actions?.[0]).toMatchObject({
      kind: "ActivateMain",
    });
  });

  it("reduces one opposing Digimon and conditionally grants Security Attack -1 to all opposing Digimon", () => {
    const actions = compiled.effects?.find((entry) => entry.trigger === "Main")?.actions ?? [];
    expect(actions[0]).toMatchObject({
      kind: "ModifyDP",
      amount: -3000,
      duration: "untilOpponentTurnEnd",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    });
    expect(actions[1]).toMatchObject({
      kind: "GainKeyword",
      duration: "untilOpponentTurnEnd",
      keyword: { keyword: "SecurityAttack", amount: -1 },
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
      condition: { kind: "totalSecurityCount", op: "lte", value: 6 },
    });
  });

  it("applies the DP reduction and Security Attack -1 to every opposing Digimon at six total security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-036", as: "yellowDigimon" }],
          hand: [{ card: "BT13-106", as: "option" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT13-111", as: "first" },
            { card: "BT13-111", as: "second" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.perm("first").currentDP === 10000 &&
        observe(s.engine).keywordAmount(s.perm("first"), "SecurityAttack") === -1,
    );

    expect(s.perm("first").currentDP).toBe(10000);
    expect(s.perm("second").currentDP).toBe(13000);
    expect(observe(s.engine).keywordAmount(s.perm("first"), "SecurityAttack")).toBe(-1);
    expect(observe(s.engine).keywordAmount(s.perm("second"), "SecurityAttack")).toBe(-1);
    // CR 15-11-2-2: a Digimon that enters afterwards gains it too.
    const lateKeywordEntrant1 = s.putOnBoard(1, "BT1-083");
    expect(observe(s.engine).keywordAmount(lateKeywordEntrant1, "SecurityAttack")).toBe(
      observe(s.engine).keywordAmount(s.perm("first"), "SecurityAttack"),
    );
  });

  it("activates Main when an effect directly trashes it from security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "yellowDigimon", suspended: true },
            { card: "BT13-097", as: "thomas", suspended: true },
          ],
          security: [{ card: "BT13-106", as: "option" }],
          hand: [],
        },
        1: { battleArea: [{ card: "BT13-060", as: "target" }], security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoSelectCards: true },
    );

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    const optionId = s.inst("option").instanceId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "permanent", permanentId: s.perm("yellowDigimon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 12000);
    expect(s.perm("target").currentDP).toBe(12000);
    expect(s.state.players[0]!.security.some((card) => card.instanceId === optionId)).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(-1);
  });

  it("affects a later breeding stack while WarGreymon's six Tamer colors offset its reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-036", as: "yellow" }],
          eggDeck: ["BT1-001"],
          hand: [{ card: "BT13-106", as: "option" }],
          deck: Array<string>(10).fill("BT1-009"),
          security: ["BT1-009", "BT1-009"],
        },
        1: {
          breeding: { card: "ST20-10", as: "agumon", under: ["ST21-01"] },
          battleArea: [
            { card: "AD1-019", as: "blueYellow" },
            { card: "AD1-022", as: "greenRed" },
            { card: "EX13-073", as: "blackPurple" },
          ],
          hand: [{ card: "AD1-004", as: "wargreymon" }],
          deck: Array<string>(10).fill("BT1-009"),
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT13-106"));
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId: s.perm("agumon").permanentId })).toEqual({
      ok: true,
    });
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).keywordAmount(s.perm("agumon"), "SecurityAttack")).toBe(-1);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("agumon").permanentId,
        instanceId: s.inst("wargreymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("agumon").topCard.cardId === "AD1-004" && s.state.pendingDecision === undefined);
    expect(s.perm("agumon").stack.map(({ cardId }) => cardId)).toEqual(["ST21-01", "ST20-10"]);
    expect(observe(s.engine).keywordAmount(s.perm("agumon"), "SecurityAttack")).toBe(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("agumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && s.state.pendingDecision === undefined);
    expect(s.events.filter(({ kind }) => kind === "securityChecked")).toHaveLength(2);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("keeps the DP reduction but withholds Security Attack -1 above six total security cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-036", as: "yellowDigimon" }],
          hand: [{ card: "BT13-106", as: "option" }],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT13-111", as: "target" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 10000);

    expect(s.perm("target").currentDP).toBe(10000);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(0);
  });
});

describe("BT13-106 Odin's Breath — KB Q&A rulings", () => {
  const FILLER = "BT1-009";
  const securityOf = (count: number): string[] => Array.from({ length: count }, () => FILLER);

  async function playOdinsBreath(mySecurity: number, opponentSecurity: number) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-036", as: "yellowDigimon" }],
          hand: [{ card: "BT13-106", as: "option" }],
          security: securityOf(mySecurity),
        },
        1: { battleArea: [{ card: "BT13-111", as: "target" }], security: securityOf(opponentSecurity) },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 10000);
    return s;
  }

  it("does not activate the security-trash effect when the card is only searched and revealed from security (Q2354)", async () => {
    const searched = setupEngine(
      {
        0: {
          hand: [{ card: "BT1-087", as: "takeru" }],
          security: [{ card: "BT13-106", as: "odinsBreath" }, FILLER],
          deck: [{ card: "BT1-010", as: "recovery" }],
        },
        1: { battleArea: [{ card: "BT13-111", as: "target" }], security: securityOf(1) },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    searched.state.memory = 10;
    await searched.ready();
    const odinsBreathId = searched.inst("odinsBreath").instanceId;
    expect(
      searched.engine.applyIntent(0, { type: "playCard", instanceId: searched.inst("takeru").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => searched.state.players[0]!.hand.some((card) => card.instanceId === odinsBreathId));

    expect(searched.state.players[0]!.hand.some((card) => card.instanceId === odinsBreathId)).toBe(true);
    expect(searched.perm("target").currentDP).toBe(13000);
    expect(observe(searched.engine).keywordAmount(searched.perm("target"), "SecurityAttack")).toBe(0);

    const trashedByEffect = setupEngine(
      {
        0: { security: [{ card: "BT13-106", as: "odinsBreath" }, FILLER] },
        1: { battleArea: [{ card: "BT13-111", as: "target" }], security: securityOf(1) },
      },
      { autoSelectCards: true },
    );
    await trashedByEffect.ready();
    await advance(trashedByEffect.engine).verb.trashFromSecurity(0, 1, { fromTop: true });
    await settle(() => trashedByEffect.perm("target").currentDP === 10000);
    expect(trashedByEffect.perm("target").currentDP).toBe(10000);
  });

  it("counts the security cards of both players together, so 2 plus 4 meets the 6-or-fewer condition (Q2355)", async () => {
    const sixSplitUnevenly = await playOdinsBreath(2, 4);
    expect(sixSplitUnevenly.perm("target").currentDP).toBe(10000);
    expect(observe(sixSplitUnevenly.engine).keywordAmount(sixSplitUnevenly.perm("target"), "SecurityAttack")).toBe(-1);

    const sevenSplitUnevenly = await playOdinsBreath(2, 5);
    expect(sevenSplitUnevenly.perm("target").currentDP).toBe(10000);
    expect(observe(sevenSplitUnevenly.engine).keywordAmount(sevenSplitUnevenly.perm("target"), "SecurityAttack")).toBe(
      0,
    );
  });

  it("does not delete a 0 DP Digimon until the whole effect has resolved and the rule check runs (Q2356)", async () => {
    let recordDeletion: ((event: ServerEvent) => void) | undefined;
    const preferredTargets: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-036", as: "yellowDigimon" }],
          hand: [{ card: "BT13-106", as: "option" }],
          security: securityOf(3),
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "zeroed" },
            { card: "BT13-111", as: "bystander" },
          ],
          security: securityOf(3),
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferredTargets, onEvent: (event) => recordDeletion?.(event) },
    );
    const zeroedPermanentId = s.perm("zeroed").permanentId;
    const zeroedInstanceId = s.perm("zeroed").topCard.instanceId;
    preferredTargets.push(zeroedInstanceId, zeroedPermanentId);
    let bystanderSecurityAttackAtDeletion: number | undefined;
    recordDeletion = (event) => {
      if (event.kind !== "cardsMoved" || bystanderSecurityAttackAtDeletion !== undefined) return;
      if (!event.deletedPermanents?.some((deleted) => deleted.permanentId === zeroedPermanentId)) return;
      bystanderSecurityAttackAtDeletion = observe(s.engine).keywordAmount(s.perm("bystander"), "SecurityAttack");
    };
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === zeroedInstanceId));

    expect(s.state.players[1]!.trash.some((card) => card.instanceId === zeroedInstanceId)).toBe(true);
    expect(bystanderSecurityAttackAtDeletion).toBe(-1);
    expect(s.perm("bystander").currentDP).toBe(13000);
  });
});
