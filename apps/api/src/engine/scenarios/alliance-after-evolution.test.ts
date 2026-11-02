import { describe, expect, it } from "vitest";
import type { Intent } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../testkit/harness.js";
import "../../cards/index.js";

function expectAccepted(s: EngineSetup, intent: Intent): void {
  expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
}

describe("Alliance after Mococomon evolution", () => {
  it.each(["retained", "revoked", "absent"] as const)(
    "preserves printed Raid burial and %s Lopmon grant",
    async (grant) => {
      const preferred: string[] = [];
      const options = {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: false,
        preferInstanceIds: preferred,
      };
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT17-012", as: "attacker" },
              { card: "ST17-03", as: "lopmon" },
            ],
            hand: [{ card: "BT17-014", as: "aldamon" }],
            deck: Array(12).fill("BT1-009"),
          },
          1: { battleArea: [{ card: "BT1-013", as: "raidTarget", dp: 15000 }], security: Array(5).fill("BT1-009") },
        },
        options,
      );
      preferred.push(s.inst("attacker").instanceId);
      s.state.memory = 10;
      await s.ready();
      if (grant !== "absent") {
        const effects = JSON.parse(s.perm("lopmon").activatableEffectsJson) as Array<{ effectKey: string }>;
        expectAccepted(s, {
          type: "activateEffect",
          sourceInstanceId: s.inst("lopmon").instanceId,
          effectKey: effects[0]!.effectKey,
        });
        await settle(() => s.perm("attacker").keywords.includes("Alliance"));
      }
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const request = s.decisions.at(-1)!.req;
      const keys = request.options!.triggerKeys!;
      const evolutionKey = keys.find((key) => key.includes("BT17-012/ir-"))!;
      expect(evolutionKey).toBeDefined();
      // Genuine ledger removal before a collected activation; this supplemental control
      // uses the production revoke primitive because no card prints "revoke Alliance".
      if (grant === "revoked") await advance(s.engine).verb.revokeKeyword(s.perm("attacker").permanentId, "Alliance");
      options.autoOrderTriggers = true;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: {
            kind: "orderTriggers",
            order: [evolutionKey, ...keys.filter((key) => key !== evolutionKey)],
            optionalAnswers: { [evolutionKey]: true },
          },
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.perm("attacker").topCard.cardId).toBe("BT17-014");
      expect(s.perm("attacker").keywords).not.toContain("Raid");
      expect(s.decisions.some(({ req }) => req.promptText?.includes("Raid"))).toBe(false);
      expect(s.events.some((event) => event.kind === "alliancePrompt")).toBe(grant === "retained");
      if (grant === "retained") {
        expectAccepted(s, { type: "respondAlliance", allyPermanentId: s.perm("lopmon").permanentId });
      }
      await advance(s.engine).finishAttack();
      await settle(() => s.state.pendingDecision === undefined);
      expect(s.state.players[1]!.security).toHaveLength(grant === "retained" ? 3 : 4);
      expect(s.perm("lopmon").isSuspended).toBe(grant === "retained");
    },
  );

  it.each([
    { playedCard: "EX12-056", evolveFirst: false, acceptAlliance: true },
    { playedCard: "EX12-056", evolveFirst: true, acceptAlliance: true },
    { playedCard: "EX12-056", evolveFirst: false, acceptAlliance: false },
    { playedCard: "EX12-015", evolveFirst: false, acceptAlliance: true },
    { playedCard: "EX12-029", evolveFirst: false, acceptAlliance: true },
  ])(
    "keeps $playedCard Alliance after evolution (evolve first: $evolveFirst, accept: $acceptAlliance)",
    async ({ playedCard, evolveFirst, acceptAlliance }) => {
      const preferred: string[] = [];
      const options = {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: false,
        declineDigiXros: true,
        preferInstanceIds: preferred,
        preferTriggerKeys: ["EX12-002"],
        declinePrompts: ["Recovery"],
      };
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "EX12-043", as: "host", under: ["EX12-002", "EX12-022"] },
              { card: "BT1-009", as: "suspendedAlly", suspended: true },
            ],
            breeding: { card: "BT1-009", as: "breedingAlly" },
            hand: [
              { card: "EX12-045", as: "sanzomon" },
              { card: playedCard, as: "cho" },
              { card: "EX12-034", as: "evolution" },
            ],
            security: Array(3).fill("BT1-009"),
            deck: Array(12).fill("BT1-009"),
          },
          1: { security: Array(5).fill("BT1-009") },
        },
        options,
      );
      preferred.push(s.inst("host").instanceId, s.inst("evolution").instanceId, s.inst("cho").instanceId);
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          instanceId: s.inst("sanzomon").instanceId,
          permanentId: s.perm("host").permanentId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const request = s.decisions.at(-1)!.req;
      expect(request.options?.triggerCardIds).toEqual(expect.arrayContaining([playedCard, "EX12-002"]));
      const keys = request.options!.triggerKeys!;
      const choKey = keys[request.options!.triggerCardIds!.indexOf(playedCard)]!;
      const eggKey = keys[request.options!.triggerCardIds!.indexOf("EX12-002")]!;
      const firstKey = evolveFirst ? eggKey : choKey;
      options.autoOrderTriggers = true;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: {
            kind: "orderTriggers",
            order: [firstKey, ...keys.filter((key) => key !== firstKey)],
            optionalAnswers: Object.fromEntries(keys.filter((key) => key !== choKey).map((key) => [key, true])),
          },
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.perm("host").topCard.cardId).toBe(evolveFirst ? "EX12-034" : "EX12-045");
      expect(s.perm("host").keywords).toContain("Alliance");
      expect(s.events.some((event) => event.kind === "alliancePrompt")).toBe(true);
      for (const alias of ["host", "suspendedAlly", "breedingAlly"]) {
        expect(
          s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm(alias).permanentId }).ok,
        ).toBe(false);
      }
      const cho = s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === playedCard)!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondAlliance",
          ...(acceptAlliance ? { allyPermanentId: cho.permanentId } : {}),
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.perm("host").topCard.cardId).toBe("EX12-034");
      expect(s.perm("host").keywords).toContain("Alliance");
      expect(cho.isSuspended).toBe(acceptAlliance);
      const checked = s.events.filter((event) => event.kind === "securityChecked");
      expect(checked).toHaveLength(acceptAlliance ? 2 : 1);
      expect(checked[0]).toMatchObject({ battle: { attackerDP: acceptAlliance ? 19000 : 12000 } });
      expect(s.state.memory).toBe(1);
      await advance(s.engine).finishAttack();
      await settle(() => s.state.pendingDecision === undefined);
      expect(s.state.players[1]!.security).toHaveLength(acceptAlliance ? 3 : 4);
      expect(
        s.events.filter((event) => event.kind === "effectResolved" && event.sourceCardId === "EX12-002"),
      ).toHaveLength(1);
      const attack = s.events.findIndex((event) => event.kind === "attackDeclared");
      const evolved = s.events.findIndex((event) => event.kind === "digivolved" && event.cardId === "EX12-034");
      expect(evolved >= 0).toBe(true);
      expect(evolveFirst ? evolved < attack : evolved > attack).toBe(true);
    },
  );
});
