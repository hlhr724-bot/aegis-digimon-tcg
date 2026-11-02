import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled as BT24_038 } from "./BT24-038.js";
import "../index.js";

describe("BT24-038 Biomon", () => {
  it("does not trigger when Pipomon links to a different Appmon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-038", as: "biomon" },
            { card: "BT21-009", as: "hackmon" },
          ],
          hand: [{ card: "BT24-032", as: "pipomon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 15000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("pipomon").instanceId,
        targetPermanentId: s.perm("hackmon").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("hackmon").linked.length === 1 && s.state.pendingDecision === undefined);
    expect(s.perm("target").currentDP).toBe(13000);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT24-038")).toBe(false);
  });

  it("links a level-4-or-lower Digimon from hand or this stack to itself", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      const action = BT24_038.effects?.find((entry) => entry.trigger === trigger)?.actions?.[0] as unknown as {
        kind: string;
        from: string[];
        optional: boolean;
        target: { filter: { levelComparison: unknown; hasLinkRequirement: boolean; hostFilter: unknown } };
        recipient: unknown;
      };
      expect(action).toMatchObject({ kind: "Link", from: ["hand", "digivolutionCards"], optional: true });
      expect(action.target.filter.levelComparison).toEqual({ op: "lte", value: 4 });
      expect(action.target.filter.hasLinkRequirement).toBe(true);
      expect(action.target.filter.hostFilter).toEqual({ isSelfRef: true });
      expect(action.recipient).toMatchObject({ filter: { isSelfRef: true }, count: 1, isSelf: true });
    }
  });

  it("implements its Appmon link requirement and linked when-linking effect", () => {
    expect(BT24_038.linkRequirement).toEqual([{ traits: ["Appmon"], cost: 3 }]);
    expect(BT24_038.effects.find((effect) => effect.isLinked)).toMatchObject({
      trigger: "WhenLinking",
      actions: [{ kind: "ModifyDP", amount: -7000, duration: "forTheTurn" }],
    });
  });

  it("only free-links a card that actually has Link (Q5620)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-038", as: "biomon" }],
          hand: [
            { card: "BT24-035", as: "noLink" },
            { card: "BT24-036", as: "eligible" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 10000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("noLink").instanceId, s.inst("eligible").instanceId, s.perm("target").topCard.instanceId);
    await s.ready();
    const targetPermanentId = s.perm("target").permanentId;

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("biomon"));
    await settle(() => s.perm("biomon").linked.some((card) => card.instanceId === s.inst("eligible").instanceId));

    expect(s.perm("biomon").linked.map((card) => card.instanceId)).toEqual([s.inst("eligible").instanceId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("noLink").instanceId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toContain(targetPermanentId);
    expect(s.perm("target").currentDP).toBe(3000);
  });

  it("resolves free linking through a public play intent", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT24-038", as: "biomon" },
            { card: "BT24-036", as: "linkedAppmon" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 10000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("biomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("biomon").linked.some((card) => card.instanceId === s.inst("linkedAppmon").instanceId));

    expect(s.perm("biomon").linked.map((card) => card.instanceId)).toEqual([s.inst("linkedAppmon").instanceId]);
    expect(s.state.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT1-010")!.currentDP).toBe(
      3000,
    );
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("publicly rejects the On Play link of a card without Link (Q5620)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT24-038", as: "biomon" },
            { card: "BT24-035", as: "noLink" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 10000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("biomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("biomon").topCard.instanceId === s.inst("biomon").instanceId);

    expect(s.state.memory).toBe(2);
    expect(s.perm("biomon").topCard.instanceId).toBe(s.inst("biomon").instanceId);
    expect(s.perm("biomon").linked).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("noLink").instanceId]);
    expect(s.perm("target").currentDP).toBe(10000);
  });

  it("publicly free-links its own evolution source and applies linked DP loss", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-036", as: "base" }],
          hand: [{ card: "BT24-038", as: "biomon" }],
          deck: [{ card: "BT1-009", as: "bonusDraw" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 10000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const sourceId = s.inst("base").instanceId;
    const targetId = s.perm("target").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("biomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").linked.some((card) => card.instanceId === sourceId));

    expect(s.state.memory).toBe(6);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("biomon").instanceId);
    expect(s.perm("base").linked.map((card) => card.instanceId)).toEqual([sourceId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(s.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === targetId)!.currentDP).toBe(
      3000,
    );
  });

  it("publicly free-links only its own source when a neighboring Biomon also has a linkable source", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-036", as: "base" },
            { card: "BT24-038", as: "neighbor", under: [{ card: "BT24-036", as: "neighborSource" }] },
          ],
          hand: [{ card: "BT24-038", as: "biomon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("neighborSource").instanceId, s.inst("base").instanceId);
    s.state.memory = 10;
    await s.ready();
    const ownSourceId = s.inst("base").instanceId;
    const neighborSourceId = s.inst("neighborSource").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("biomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").linked.some((card) => card.instanceId === ownSourceId));

    expect(s.perm("base").linked.map((card) => card.instanceId)).toEqual([ownSourceId]);
    expect(s.perm("base").stack).toHaveLength(0);
    expect(s.perm("neighbor").stack.map((card) => card.instanceId)).toEqual([neighborSourceId]);
    expect(s.perm("neighbor").linked).toHaveLength(0);
  });

  it("free-links only from Biomon's own digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-038", as: "biomon", under: [{ card: "BT24-036", as: "ownSource" }] },
            { card: "BT24-038", as: "other", under: [{ card: "BT24-036", as: "otherSource" }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("biomon"));

    expect(s.perm("biomon").linked.map((card) => card.instanceId)).toContain(s.inst("ownSource").instanceId);
    expect(s.perm("other").stack.map((card) => card.instanceId)).toContain(s.inst("otherSource").instanceId);
  });

  it("links to an Appmon for cost 3, contributes 4000 DP, and fires its linked effect", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-009", as: "host" }],
          hand: [{ card: "BT24-038", as: "biomon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 10000 }] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("target").topCard.instanceId);
    s.state.memory = 5;
    await s.ready();
    const hostDp = s.perm("host").currentDP;

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("biomon").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("host").linked.some((card) => card.instanceId === s.inst("biomon").instanceId) &&
        s.perm("target").currentDP === 3000,
    );

    expect(s.state.memory).toBe(2);
    expect(s.perm("host").currentDP).toBe(hostDp + 4000);
    expect(s.perm("target").currentDP).toBe(3000);
  });

  it("publicly deletes a 7000-DP target at the zero-DP boundary when linked", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT21-009", as: "host" }], hand: [{ card: "BT24-038", as: "biomon" }] },
      1: { battleArea: [{ card: "BT1-010", as: "target", dp: 7000 }] },
    });
    s.state.memory = 10;
    await s.ready();
    const targetId = s.perm("target").permanentId;
    const biomonId = s.inst("biomon").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: biomonId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("target").instanceId));

    expect(s.state.memory).toBe(7);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).not.toContain(targetId);
    expect(s.perm("host").linked.map((card) => card.instanceId)).toEqual([biomonId]);
  });

  it("expires the linked -7000 DP modifier at the end of the linking player's turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT21-009", as: "host" }], hand: [{ card: "BT24-038", as: "biomon" }] },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 10000 }], deck: ["BT1-011", "BT1-012"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("biomon").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);
    expect(s.perm("target").currentDP).toBe(3000);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    expect(s.perm("target").currentDP).toBe(10000);
  });

  it("exposes Fortitude and the exact Docmon-Medicmon App Fusion recipe", async () => {
    expect(BT24_038.appFusionRequirement).toEqual([{ names: ["Docmon", "Medicmon"], cost: 0 }]);
    const s = setupEngine({ 0: { battleArea: [{ card: "BT24-038", as: "biomon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("biomon"), "Fortitude")).toBe(true);
  });

  it("publicly App Fuses Docmon and linked Medicmon into Biomon for zero", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-057", as: "docmon" }],
          hand: [
            { card: "BT24-036", as: "medicmon" },
            { card: "BT24-038", as: "biomon" },
          ],
          deck: [{ card: "BT1-009", as: "bonusDraw" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const docmonId = s.perm("docmon").topCard.instanceId;
    const medicmonId = s.inst("medicmon").instanceId;
    const biomonId = s.inst("biomon").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: medicmonId,
        targetPermanentId: s.perm("docmon").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("docmon").linked.some((card) => card.instanceId === medicmonId));
    expect(s.state.memory).toBe(8);

    expect(
      s.engine.applyIntent(0, {
        type: "appFusion",
        permanentId: s.perm("docmon").permanentId,
        instanceId: biomonId,
        linkedInstanceId: medicmonId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("docmon").topCard.instanceId === biomonId);

    expect(s.state.memory).toBe(8);
    expect(s.perm("docmon").topCard.instanceId).toBe(biomonId);
    expect(s.perm("docmon").stack.map((card) => card.instanceId)).toEqual([docmonId, medicmonId]);
    expect(s.perm("docmon").linked).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
  });

  it("rejects App Fusion from a non-Docmon host without changing its link or memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-009", as: "wrongHost" }],
        hand: [
          { card: "BT24-036", as: "medicmon" },
          { card: "BT24-038", as: "biomon" },
        ],
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("medicmon").instanceId,
        targetPermanentId: s.perm("wrongHost").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("wrongHost").linked.some((card) => card.instanceId === s.inst("medicmon").instanceId));
    const memoryBefore = s.state.memory;
    const stackBefore = s.perm("wrongHost").stack.map((card) => card.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "appFusion",
        permanentId: s.perm("wrongHost").permanentId,
        instanceId: s.inst("biomon").instanceId,
        linkedInstanceId: s.inst("medicmon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.perm("wrongHost").stack.map((card) => card.instanceId)).toEqual(stackBefore);
    expect(s.perm("wrongHost").linked.map((card) => card.instanceId)).toEqual([s.inst("medicmon").instanceId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("biomon").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("replays the same instance through Fortitude after a public opponent deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-038", as: "biomon", under: [{ card: "BT24-035", as: "source" }] }] },
        1: { battleArea: [{ card: "BT1-009", as: "redSource" }], hand: [{ card: "BT6-095", as: "option" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const biomonInstanceId = s.perm("biomon").topCard.instanceId;
    const originalPermanentId = s.perm("biomon").permanentId;
    const sourceInstanceId = s.inst("source").instanceId;
    const optionInstanceId = s.inst("option").instanceId;

    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionInstanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === biomonInstanceId),
    );

    const replayed = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === biomonInstanceId,
    );
    expect(replayed).toBeDefined();
    expect(replayed?.permanentId).not.toBe(originalPermanentId);
    expect(replayed?.stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(sourceInstanceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(optionInstanceId);
  });

  it("does not replay through Fortitude after a public deletion without a source", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-038", as: "biomon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "redSource" }], hand: [{ card: "BT6-095", as: "option" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const biomonInstanceId = s.inst("biomon").instanceId;
    const optionInstanceId = s.inst("option").instanceId;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionInstanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === biomonInstanceId));

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([biomonInstanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(optionInstanceId);
  });

  it("regression: a linked Appmon used as an EX10-038 cost leaves its host link exactly once", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT21-009",
              as: "host",
              linked: [
                { card: "BT24-038", as: "biomon" },
                { card: "EX10-038", as: "copipemon" },
              ],
            },
          ],
          trash: [],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", suspended: true, dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: [] },
    );
    const biomonId = s.inst("biomon").instanceId;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === biomonId));
    expect(s.perm("host").linked.map((card) => card.instanceId)).not.toContain(biomonId);
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: biomonId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").linked.some((card) => card.instanceId === biomonId));
    expect(s.perm("host").linked.map((card) => card.instanceId)).toContain(biomonId);
  });
});
