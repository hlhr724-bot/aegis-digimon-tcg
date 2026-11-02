import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled as BT24_079 } from "./BT24-079.js";
import "../index.js";

describe("BT24-079 Hadesmon", () => {
  it("matches the immutable catalog identity", () => {
    expect(getCardDefinition("BT24-079")).toMatchObject({
      cardId: "BT24-079",
      nameEn: "Hadesmon",
      colors: ["Purple", "White"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      forms: ["God", "Appmon"],
      attributes: ["God"],
      types: ["Transmutation"],
      evoCosts: [{ color: "Purple", level: 5, memoryCost: 4 }],
    });
  });

  it("links an Appmon card to a separately selected friendly Digimon", () => {
    const main = BT24_079.effects?.find((entry) => entry.trigger === "WhenDigivolving");
    expect(main?.actions?.[1]).toMatchObject({
      kind: "Link",
      target: {
        filter: {
          kind: ["Digimon"],
          nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }],
          hostFilter: { isSelfRef: true },
        },
        count: 1,
      },
      from: ["hand", "digivolutionCards"],
      recipient: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
      payCost: false,
      optional: true,
    });
  });

  it("public evolution pays 4, plays a System Digimon, and then free-links an Appmon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT2-075", as: "base" },
            { card: "BT21-009", as: "recipient" },
          ],
          hand: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT24-071", as: "link" },
          ],
          trash: [{ card: "BT24-056", as: "system" }],
          deck: [{ card: "BT1-009", as: "bonusDraw" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("system").instanceId, s.perm("recipient").topCard.instanceId, s.inst("link").instanceId);
    const baseId = s.perm("base").permanentId;
    const baseInstanceId = s.inst("base").instanceId;
    const systemId = s.inst("system").instanceId;
    const linkId = s.inst("link").instanceId;
    const recipientId = s.perm("recipient").permanentId;
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("system").instanceId),
    );
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("link").instanceId),
      ),
    );

    expect(s.state.memory).toBe(2);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.perm("base").permanentId).toBe(baseId);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("hadesmon").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseInstanceId]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === recipientId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === systemId)).toBe(true);
    expect(
      s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === recipientId)?.linked.map(
        (card) => card.instanceId,
      ),
    ).toContain(linkId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(linkId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
  });

  it("may refuse the optional System revival on a public evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-075", as: "base" }],
          hand: [{ card: "BT24-079", as: "hadesmon" }],
          trash: [{ card: "BT24-071", as: "system" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("hadesmon").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("system").instanceId);
    expect(s.perm("base").linked).toHaveLength(0);
  });

  it("publicly refuses a valid Appmon link while retaining the card in hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-075", as: "base" }],
          hand: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT24-071", as: "link" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("hadesmon").instanceId);
    expect(s.state.memory).toBe(2);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("link").instanceId);
    expect(s.perm("base").linked).toHaveLength(0);
  });

  it("Q5660 keeps a revived 5000-DP System alive when linked before zero-DP cleanup", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-077", as: "base" }],
          hand: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT24-071", as: "link" },
          ],
          trash: [{ card: "BT24-056", as: "system" }],
          deck: [
            { card: "BT1-009", as: "normalDraw" },
            { card: "BT1-010", as: "bonusDraw" },
          ],
        },
        1: {
          battleArea: [{ card: "BT3-089", as: "ruinBase" }],
          hand: [{ card: "EX4-074", as: "ruinMode" }],
          deck: [{ card: "BT1-011", as: "opponentDraw" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    const baseId = s.inst("base").instanceId;
    const systemId = s.inst("system").instanceId;
    const linkId = s.inst("link").instanceId;
    const ruinBaseId = s.inst("ruinBase").instanceId;
    const ruinModeId = s.inst("ruinMode").instanceId;
    const normalDrawId = s.inst("normalDraw").instanceId;
    const bonusDrawId = s.inst("bonusDraw").instanceId;
    const opponentDrawId = s.inst("opponentDraw").instanceId;
    preferred.push(systemId, linkId);
    s.state.turnSeat = 1;
    s.state.memory = 5;
    await s.ready();

    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("ruinBase").permanentId,
        instanceId: s.inst("ruinMode").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("ruinBase").topCard.instanceId === s.inst("ruinMode").instanceId);
    expect(s.state.memory).toBe(0);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    expect(s.perm("ruinBase").topCard.instanceId).toBe(ruinModeId);
    expect(s.perm("ruinBase").stack.map((card) => card.instanceId)).toEqual([ruinBaseId]);
    expect(s.perm("base").currentDP).toBe(4000);
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(opponentDrawId);

    s.state.turnSeat = 0;
    s.state.memory = 4;
    const ownerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(normalDrawId);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([bonusDrawId]);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === systemId) &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.linked.some((card) => card.instanceId === linkId)),
    );
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("hadesmon").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseId]);
    const revived = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === systemId)!;
    expect(revived.currentDP).toBe(3000);
    expect(revived.linked.map((card) => card.instanceId)).toEqual([linkId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(systemId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === ruinBaseId)).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownerTurn;
  });

  it("rejects a public link candidate without the Link keyword", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-075", as: "base" }],
          hand: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT24-035", as: "noLink" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("hadesmon").instanceId);
    expect(s.state.memory).toBe(2);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("noLink").instanceId);
    expect(s.perm("base").linked).toHaveLength(0);
  });

  it("publicly links Biomon, then Rei App Fuses Revivemon into Hadesmon for free", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-087", as: "rei" },
            { card: "BT24-077", as: "revivemon" },
          ],
          hand: [
            { card: "BT24-038", as: "biomon" },
            { card: "BT1-009", as: "reiDiscard" },
          ],
          deck: [
            { card: "BT1-010", as: "reiDraw" },
            { card: "BT1-011", as: "appFusionDraw" },
          ],
          trash: [{ card: "BT24-079", as: "fusion" }],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.perm("revivemon").topCard.instanceId,
      s.inst("fusion").instanceId,
      s.inst("reiDiscard").instanceId,
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("biomon").instanceId,
        targetPermanentId: s.perm("revivemon").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const reiDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("BT24-087");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: reiDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const fusionDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("BT24-087");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: fusionDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const hadesLinkDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("BT24-079");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: hadesLinkDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("revivemon").topCard.instanceId === s.inst("fusion").instanceId);
    expect(s.state.memory).toBe(2);
    expect(s.perm("rei").isSuspended).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("reiDraw").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("reiDiscard").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("appFusionDraw").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("fusion").instanceId);
    expect(s.perm("revivemon").topCard.instanceId).toBe(s.inst("fusion").instanceId);
    expect(s.perm("revivemon").stack.map((card) => card.instanceId)).toEqual([
      s.inst("revivemon").instanceId,
      s.inst("biomon").instanceId,
    ]);
    expect(s.perm("revivemon").linked).toHaveLength(0);
    expect(observe(s.engine).hasKeyword(s.perm("revivemon"), "Overclock")).toBe(true);
    expect(observe(s.engine).linkMaxDelta(s.perm("revivemon"))).toBe(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("uses Overclock by deleting another Appmon and attacks without suspending", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT21-009", as: "fodder" },
          ],
        },
        1: { security: [{ card: "BT1-090", as: "checkedSecurity" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    const fodderId = s.perm("fodder").permanentId;
    const fodderCardId = s.inst("fodder").instanceId;
    const checkedSecurityId = s.inst("checkedSecurity").instanceId;
    await s.ready();

    const turn = s.engine.runOneTurn();
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    await settle(() => mainPhase.isOpen);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === fodderId)).toBe(false);
    expect(s.perm("hadesmon").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[1]!.security.length === 0);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(checkedSecurityId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(fodderCardId);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(observe(s.engine).isAttacking()).toBe(false);
  });

  it("may refuse Overclock before deleting an other-Appmon cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT24-032", as: "fodder" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const fodderId = s.perm("fodder").permanentId;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase.isOpen);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === fodderId)).toBe(true);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("pays Overclock with the supported Token fixture and completes its attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "TOKEN-Petrification-Token", as: "token" },
          ],
        },
        1: {
          security: [{ card: "BT1-090", as: "checkedSecurity" }],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const tokenId = s.perm("token").permanentId;
    const tokenCardId = s.inst("token").instanceId;
    const securityId = s.inst("checkedSecurity").instanceId;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase.isOpen);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === tokenId));
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    await turn;
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === tokenId)).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(tokenCardId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(securityId);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.perm("hadesmon").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(observe(s.engine).isAttacking()).toBe(false);
  });

  it("plays a System Digimon and then free-links an Appmon card to a chosen Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT21-009", as: "recipient" },
          ],
          hand: [
            { card: "BT24-035", as: "noLink" },
            { card: "BT24-036", as: "link" },
          ],
          trash: [{ card: "BT24-071", as: "system" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.inst("system").instanceId,
      s.perm("recipient").topCard.instanceId,
      s.inst("noLink").instanceId,
      s.inst("link").instanceId,
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("hadesmon"));
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("system").instanceId),
    );
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("link").instanceId),
      ),
    );

    expect(
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("link").instanceId),
      ),
    ).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("noLink").instanceId);
  });

  it("publicly links Hadesmon's own source to a neighboring Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-077", as: "base", under: [{ card: "BT24-071", as: "ownSource" }] },
            { card: "BT24-077", as: "neighbor", under: [{ card: "BT24-071", as: "otherSource" }] },
          ],
          hand: [{ card: "BT24-079", as: "hadesmon" }],
          deck: [{ card: "BT1-009", as: "bonusDraw" }],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: false },
    );
    const baseId = s.perm("base").permanentId;
    const neighborId = s.perm("neighbor").permanentId;
    const ownSourceId = s.inst("ownSource").instanceId;
    const otherSourceId = s.inst("otherSource").instanceId;
    const bonusDrawId = s.inst("bonusDraw").instanceId;
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: baseId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("hadesmon").instanceId);
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const linkOptional = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("BT24-079");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: linkOptional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const sourceDecision = s.state.pendingDecision!;
    expect(sourceDecision.payloadJson).toContain(ownSourceId);
    expect(sourceDecision.payloadJson).not.toContain(otherSourceId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: sourceDecision.decisionId,
        response: { kind: "selectCards", instanceIds: [ownSourceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const recipientDecision = s.state.pendingDecision!;
    expect(recipientDecision.payloadJson).toContain(neighborId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: recipientDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [neighborId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.perm("base").topCard.cardId === "BT24-079");
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(bonusDrawId);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("hadesmon").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([s.inst("base").instanceId]);
    expect(s.perm("neighbor").stack.map((card) => card.instanceId)).toEqual([otherSourceId]);
    expect(s.perm("neighbor").linked.map((card) => card.instanceId)).toEqual([ownSourceId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("rejects an invalid public App Fusion pair without changing the fusion target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-087", as: "rei" },
            { card: "BT24-077", as: "revivemon" },
          ],
          hand: [
            { card: "BT24-071", as: "wrongPair" },
            { card: "BT1-009", as: "discard" },
          ],
          deck: ["BT1-010", "BT1-011"],
          trash: [{ card: "BT24-079", as: "fusion" }],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    const revivemonId = s.perm("revivemon").permanentId;
    const revivemonTopId = s.perm("revivemon").topCard.instanceId;
    const wrongPairId = s.inst("wrongPair").instanceId;
    const fusionId = s.inst("fusion").instanceId;
    const deckBefore = s.state.players[0]!.deck.map((card) => card.instanceId);
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, { type: "linkCard", instanceId: wrongPairId, targetPermanentId: revivemonId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const suspendDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("BT24-087");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: suspendDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const fusionDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("BT24-087");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: fusionDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(deckBefore.slice(1));
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(fusionId);
    expect(s.perm("revivemon").permanentId).toBe(revivemonId);
    expect(s.perm("revivemon").topCard.instanceId).toBe(revivemonTopId);
    expect(s.perm("revivemon").stack).toHaveLength(0);
    expect(s.perm("revivemon").linked.map((card) => card.instanceId)).toEqual([wrongPairId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("rejects an illegal neutral-red level-5 evolution route", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-020", as: "neutralRed" }],
        hand: [{ card: "BT24-079", as: "hadesmon" }],
      },
    });
    const permanentId = s.perm("neutralRed").permanentId;
    const handId = s.inst("hadesmon").instanceId;
    const topId = s.perm("neutralRed").topCard.instanceId;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: handId })).toEqual({
      ok: false,
      reason: "invalid-evolution",
    });
    expect(s.state.memory).toBe(10);
    expect(s.perm("neutralRed").topCard.instanceId).toBe(topId);
    expect(s.perm("neutralRed").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(handId);
  });

  it("only free-links from Hadesmon's own digivolution cards", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon", under: [{ card: "BT24-036", as: "ownSource" }] },
            { card: "BT21-009", as: "recipient" },
            { card: "BT24-038", as: "other", under: [{ card: "BT24-036", as: "otherSource" }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.perm("recipient").topCard.instanceId,
      s.inst("otherSource").instanceId,
      s.inst("ownSource").instanceId,
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("hadesmon"));
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("ownSource").instanceId),
      ),
    );

    expect(
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("ownSource").instanceId),
      ),
    ).toBe(true);
  });

  it("reactivates its when-digivolving effect when another Digimon is deleted", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT21-009", as: "recipient" },
          ],
          hand: [{ card: "BT24-036", as: "link" }],
          trash: [{ card: "BT24-071", as: "system" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "deleted", suspended: true, dp: 3000 }], security: ["BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("system").instanceId, s.perm("recipient").topCard.instanceId, s.inst("link").instanceId);
    await s.ready();

    const deletedId = s.perm("deleted").permanentId;
    const deletedCardId = s.inst("deleted").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("hadesmon").permanentId,
        target: { kind: "permanent", permanentId: deletedId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.every((permanent) => permanent.permanentId !== deletedId));
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(deletedCardId);
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("system").instanceId),
    );
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("link").instanceId),
      ),
    );

    expect(
      s.state.players[0]!.battleArea.some((permanent) =>
        permanent.linked.some((card) => card.instanceId === s.inst("link").instanceId),
      ),
    ).toBe(true);
  });

  it("limits public deletion reactivation to once per turn and resets next turn", async () => {
    const harnessOptions = { autoAcceptOptional: true, autoDeclineOptional: false, autoSelectCards: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-079", as: "hadesmon", under: [{ card: "BT2-075", as: "hadesSource" }] },
            { card: "BT3-089", as: "firstAttacker" },
            { card: "BT1-020", as: "secondAttacker" },
          ],
          trash: [
            { card: "BT24-056", as: "firstSystem" },
            { card: "BT24-057", as: "secondSystem" },
          ],
          security: [{ card: "BT1-090", as: "ownerSecurity" }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowVictim", suspended: true, dp: 2000 },
            { card: "BT1-014", as: "midVictim", suspended: true, dp: 5000 },
            { card: "BT1-020", as: "highVictim", suspended: true, dp: 6000 },
          ],
          security: ["BT1-014"],
          deck: ["BT1-012", "BT1-013", "BT1-014"],
        },
      },
      harnessOptions,
    );
    const hadesPermanentId = s.perm("hadesmon").permanentId;
    const hadesTopId = s.inst("hadesmon").instanceId;
    const hadesSourceId = s.inst("hadesSource").instanceId;
    const lowVictimId = s.inst("lowVictim").instanceId;
    const midVictimId = s.inst("midVictim").instanceId;
    const highVictimId = s.inst("highVictim").instanceId;
    const firstSystemId = s.inst("firstSystem").instanceId;
    const secondSystemId = s.inst("secondSystem").instanceId;
    const ownerSecurityId = s.inst("ownerSecurity").instanceId;
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    const ownerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("firstAttacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("lowVictim").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "combatResolved") && !observe(s.engine).isAttacking());
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === lowVictimId));
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === firstSystemId),
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === firstSystemId)).toBe(
      true,
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === secondSystemId)).toBe(
      false,
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(lowVictimId);
    expect(s.state.memory).toBe(10);
    expect(s.perm("hadesmon").permanentId).toBe(hadesPermanentId);
    expect(s.perm("hadesmon").topCard.instanceId).toBe(hadesTopId);
    expect(s.perm("hadesmon").stack.map((card) => card.instanceId)).toEqual([hadesSourceId]);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("secondAttacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("midVictim").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.events.filter((event) => event.kind === "combatResolved").length >= 2 && !observe(s.engine).isAttacking(),
    );
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === midVictimId));
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === secondSystemId)).toBe(
      false,
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(secondSystemId);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === firstSystemId)).toBe(
      true,
    );
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === highVictimId)).toBe(
      true,
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(midVictimId);
    expect(s.state.memory).toBe(10);
    expect(s.state.pendingDecision).toBeUndefined();
    harnessOptions.autoAcceptOptional = false;
    harnessOptions.autoDeclineOptional = true;
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownerTurn;
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === firstSystemId)).toBe(
      true,
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(secondSystemId);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("highVictim").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.security.length === 0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(ownerSecurityId);
    expect(s.perm("highVictim").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    harnessOptions.autoAcceptOptional = true;
    harnessOptions.autoDeclineOptional = false;
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextOwnerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("firstAttacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("highVictim").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.events.filter((event) => event.kind === "combatResolved").length >= 3 && !observe(s.engine).isAttacking(),
    );
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === highVictimId));
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === secondSystemId),
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === secondSystemId)).toBe(
      true,
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(secondSystemId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(highVictimId);
    expect(s.state.memory).toBe(10);
    expect(s.perm("hadesmon").permanentId).toBe(hadesPermanentId);
    expect(s.perm("hadesmon").topCard.instanceId).toBe(hadesTopId);
    expect(s.perm("hadesmon").stack.map((card) => card.instanceId)).toEqual([hadesSourceId]);
    expect(s.state.pendingDecision).toBeUndefined();
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextOwnerTurn;
  });

  it("resets its deletion reactivation on the next turn through public plays", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-076", as: "ownerDeleter" }],
          battleArea: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT1-009", as: "ownerVictim" },
          ],
          trash: [
            { card: "BT24-071", as: "firstSystem" },
            { card: "BT24-071", as: "secondSystem" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          security: ["BT1-013", "BT1-014"],
        },
        1: {
          hand: [{ card: "BT24-076", as: "opponentDeleter" }],
          battleArea: [
            { card: "BT3-089", as: "purpleSource" },
            { card: "BT1-009", as: "opponentVictim" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          security: ["BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();

    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("opponentDeleter").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) =>
        [s.inst("firstSystem").instanceId, s.inst("secondSystem").instanceId].includes(permanent.topCard.instanceId),
      ),
    );
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("ownerVictim").instanceId,
      ),
    ).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    const firstPlayed = s.state.players[0]!.battleArea.find((permanent) =>
      [s.inst("firstSystem").instanceId, s.inst("secondSystem").instanceId].includes(permanent.topCard.instanceId),
    )!.topCard.instanceId;
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const ownerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ownerDeleter").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.filter((permanent) =>
          [s.inst("firstSystem").instanceId, s.inst("secondSystem").instanceId].includes(permanent.topCard.instanceId),
        ).length === 2,
    );
    expect(
      s.state.players[1]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("opponentVictim").instanceId,
      ),
    ).toBe(false);
    expect(
      s.state.players[0]!.battleArea.filter((permanent) =>
        [s.inst("firstSystem").instanceId, s.inst("secondSystem").instanceId].includes(permanent.topCard.instanceId),
      ).map((permanent) => permanent.topCard.instanceId),
    ).toEqual(
      expect.arrayContaining([
        firstPlayed,
        firstPlayed === s.inst("firstSystem").instanceId
          ? s.inst("secondSystem").instanceId
          : s.inst("firstSystem").instanceId,
      ]),
    );
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownerTurn;
  });

  it("exposes Overclock, Link +1, and the exact Revivemon-Biomon App Fusion", async () => {
    expect(BT24_079.appFusionRequirement).toEqual([{ names: ["Revivemon", "Biomon"], cost: 0 }]);
    const s = setupEngine({ 0: { battleArea: [{ card: "BT24-079", as: "hadesmon" }] } });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("hadesmon"), "Overclock")).toBe(true);
    expect(observe(s.engine).linkMaxDelta(s.perm("hadesmon"))).toBe(1);
  });

  it("publicly retains two paid Appmon links with Link +1 capacity", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-079", as: "hadesmon" }],
        hand: [
          { card: "BT24-071", as: "firstLink" },
          { card: "BT24-032", as: "secondLink" },
        ],
      },
    });
    const hostId = s.perm("hadesmon").permanentId;
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("firstLink").instanceId,
        targetPermanentId: hostId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("hadesmon").linked.some((card) => card.instanceId === s.inst("firstLink").instanceId));
    expect(s.state.memory).toBe(8);
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("secondLink").instanceId,
        targetPermanentId: hostId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("hadesmon").linked.some((card) => card.instanceId === s.inst("secondLink").instanceId));
    expect(s.state.memory).toBe(7);
    expect(s.perm("hadesmon").linked.map((card) => card.instanceId)).toEqual([
      s.inst("secondLink").instanceId,
      s.inst("firstLink").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("BT24-079 Hadesmon — KB Q&A rulings", () => {
  it("never offers an [Appmon] card without <Link> to its [When Digivolving] link (Q5659)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT2-075", as: "base" },
            { card: "BT21-009", as: "recipient" },
          ],
          hand: [
            { card: "BT24-079", as: "hadesmon" },
            { card: "BT22-039", as: "noLinkAppmon" },
            { card: "BT24-071", as: "linkAppmon" },
            { card: "BT24-071", as: "otherLinkAppmon" },
          ],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("recipient").topCard.instanceId, s.perm("recipient").permanentId);
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("hadesmon").instanceId);
    await settle(() => s.state.pendingDecision === undefined);

    const offered = (instanceId: string) =>
      s.decisions.some(({ req }) => req.options?.candidateInstanceIds?.includes(instanceId) === true);
    expect(offered(s.inst("linkAppmon").instanceId)).toBe(true);
    expect(offered(s.inst("noLinkAppmon").instanceId)).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("noLinkAppmon").instanceId);
    expect(
      [...s.state.players[0]!.battleArea].flatMap((permanent) => permanent.linked.map((card) => card.cardId)),
    ).toEqual(["BT24-071"]);
  });
});
