import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/alliance-suspension-evolves-hisyaryumon.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("digivolves Hisyaryumon into Ouryumon without cost when Alliance suspends its ally", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferTriggerKeys: ["/keyword/Alliance", "BT15-063"],
  });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("hisyaryumon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "alliancePrompt"));
  expect(
    s.engine.applyIntent(0, {
      type: "respondAlliance",
      allyPermanentId: s.perm("ally").permanentId,
    }),
  ).toEqual({ ok: true });
  await settle();
  expect(s.perm("hisyaryumon").topCard.cardId).toBe("BT27-015");
  expect(s.perm("hisyaryumon").stack.map((card) => card.cardId)).toEqual([
    "BT15-087",
    "BT15-056",
    "BT15-058",
    "BT15-063",
  ]);
  expect(s.state.memory).toBe(3);
  await advance(s.engine).finishAttack();
  expect(s.state.pendingDecision).toBeUndefined();
});

it("honors indexed evolution acceptance before inherited suspension effects resolve", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    autoOrderTriggers: false,
  });
  const resolutions: ReturnType<typeof s.engine.applyIntent>[] = [];
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("hisyaryumon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  for (let step = 0; step < 20; step++) {
    await settle();
    const decision = s.state.pendingDecision;
    if (decision?.kind === "orderTriggers") {
      const request = s.decisions.find(({ req }) => req.decisionId === decision.decisionId)!.req;
      const keys = request.options?.triggerKeys ?? [];
      const cards = request.options?.triggerCardIds ?? [];
      const order = keys.map((_, index) => index);
      order.sort((left, right) => {
        const getPriority = (index: number) => {
          if (keys[index]?.includes("/keyword/Alliance")) {
            return 0;
          }
          return cards[index] === "BT15-063" ? 1 : 2;
        };
        return getPriority(left) - getPriority(right);
      });
      resolutions.push(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: {
            kind: "orderTriggers",
            order: [],
            orderIndexes: order,
            optionalAnswersByIndex: keys.map((_, index) => (request.options?.triggerIsOptional?.[index] ? true : null)),
          },
        }),
      );
      continue;
    }
    if (s.state.combatWindow?.kind === "alliance") {
      resolutions.push(
        s.engine.applyIntent(0, {
          type: "respondAlliance",
          allyPermanentId: s.perm("ally").permanentId,
        }),
      );
      continue;
    }
    break;
  }
  expect(resolutions.length).toBeGreaterThan(0);
  for (const resolution of resolutions) {
    expect(resolution).toEqual({ ok: true });
  }
  await advance(s.engine).finishAttack();
  expect(s.perm("hisyaryumon").topCard.cardId).toBe("BT27-015");
  expect(s.state.memory).toBe(3);
  expect(s.state.pendingDecision).toBeUndefined();
});
