import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/declined-inherited-leave-replacement.fixture";
import "#api/cards/index";

async function declineReplacementPlan(s: ReturnType<typeof setupScenario>): Promise<void> {
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers" || !observe(s.engine).isAttacking());
  expect(s.state.pendingDecision?.kind).toBe("orderTriggers");
  const request = s.decisions.at(-1)!.req;
  const keys = request.options!.triggerKeys!;
  expect(keys).toHaveLength(2);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: {
        kind: "orderTriggers",
        order: keys,
        optionalAnswers: Object.fromEntries(keys.map((key) => [key, false])),
      },
    }),
  ).toEqual({ ok: true });
}

it.each([false, true])(
  "keeps declined inherited replacements available for a later removal (preset=%s)",
  async (preset) => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoOrderTriggers: !preset });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      for (const name of ["first", "second"]) {
        expect(
          s.engine.applyIntent(1, {
            type: "attack",
            attackerPermanentId: s.perm(`${name}-attacker`).permanentId,
            target: { kind: "permanent", permanentId: s.perm(`${name}-victim`).permanentId },
          }),
        ).toEqual({ ok: true });
        if (preset) {
          await declineReplacementPlan(s);
        }
        await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
        expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst(`${name}-victim`).instanceId)).toBe(
          true,
        );
      }
      const prompts = s.decisions.filter(({ req }) => req.sourceCardId === "BT22-007" && req.kind === "optional");
      expect(prompts).toHaveLength(preset ? 0 : 4);
      for (const alias of ["first-inherited", "second-inherited"]) {
        expect(prompts.filter(({ req }) => req.sourceInstanceId === s.inst(alias).instanceId)).toHaveLength(
          preset ? 0 : 2,
        );
      }
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  },
);

it("consumes each accepted inherited copy separately and cannot save a third Digimon", async () => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        0: {
          ...fixture.board[0],
          battleArea: [
            ...fixture.board[0]!.battleArea!,
            { card: "BT22-080", as: "third-victim", suspended: true, dp: 3000 },
          ],
        },
        1: {
          ...fixture.board[1],
          battleArea: [...fixture.board[1]!.battleArea!, { card: "BT1-019", as: "third-attacker", dp: 12000 }],
        },
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(1);
    for (const name of ["first", "second", "third"]) {
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm(`${name}-attacker`).permanentId,
          target: { kind: "permanent", permanentId: s.perm(`${name}-victim`).permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    }
    for (const name of ["first", "second"]) {
      expect(s.perm("mother-host").stack.some((card) => card.instanceId === s.inst(`${name}-victim`).instanceId)).toBe(
        true,
      );
    }
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("third-victim").instanceId)).toBe(true);
  } finally {
    s.engine.applyIntent(1, { type: "surrender" });
    await loop;
  }
});
