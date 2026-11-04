import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/examon-suspends-before-attacking.fixture";
import "#api/cards/index";

describe("Examon suspends before its optional attack", () => {
  it.each([false, true])(
    "resolves five mixed targets and the Digimon-only unsuspend lock after evolution (DNA: %s)",
    async (dna) => {
      const s = setupScenario(fixture, { autoDeclineOptional: true });
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      const instanceId = s.inst("examon").instanceId;
      const intent = dna
        ? {
            type: "dnaDigivolve" as const,
            instanceId,
            materialPermanentIds: [s.perm("green").permanentId, s.perm("blue").permanentId],
          }
        : { type: "digivolve" as const, instanceId, permanentId: s.perm("green").permanentId };
      expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      const request = s.decisions.at(-1)!.req;
      expect(request.sourceCardId).toBe("BT23-047");
      expect(request.options).toMatchObject({ min: 5, max: 5 });
      expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseTargets", instanceIds: [] },
        }).ok,
      ).toBe(false);
      const selected = ["first", "second", "third", "firstTamer", "secondTamer"];
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseTargets", instanceIds: selected.map((alias) => s.perm(alias).permanentId) },
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(selected.map((alias) => s.perm(alias).isSuspended)).toEqual([true, true, true, true, true]);
      expect(s.perm("spared").isSuspended).toBe(false);
      expect(
        ["first", "second", "third", "spared"].map((alias) =>
          observe(s.engine).isRestricted(s.perm(alias), "unsuspendDuringOwnUnsuspendPhase"),
        ),
      ).toEqual([true, true, true, true]);
      expect(observe(s.engine).isRestricted(s.perm("firstTamer"), "unsuspendDuringOwnUnsuspendPhase")).toBe(false);
      const evolved = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === instanceId)!;
      expect(evolved.stack.map((card) => card.cardId).sort()).toEqual(
        dna ? ["BT1-038", "BT1-076", "BT1-080", "ST2-10"] : ["BT1-076", "BT1-080"],
      );
      expect(evolved.isSuspended).toBe(false);
      expect(s.state.memory).toBe(dna ? 10 : 5);
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(["first", "second", "third"].map((alias) => s.perm(alias).isSuspended)).toEqual([true, true, true]);
      expect(["firstTamer", "secondTamer"].map((alias) => s.perm(alias).isSuspended)).toEqual([false, false]);
      expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspendDuringOwnUnsuspendPhase")).toBe(false);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
});
