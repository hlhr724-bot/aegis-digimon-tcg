import "#api/cards/index";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import fixture from "#api/engine/scenarios/effect-attack-suspend-trigger-order.fixture";

const DELETE_THEN_ATTACK = "AD1-008/ir-7-0";
const LOWEST_DP_DELETE = "AD1-008/ir-shared-0";
const RAID = "/keyword/Raid";
const UNSUSPEND_SOURCE = "EX13-022";

type Answer = { accept: boolean };

function withoutLowestDigimon(value: ScenarioFixture): ScenarioFixture {
  const defender = value.board[0]!;
  return {
    ...value,
    board: { ...value.board, 0: { ...defender, battleArea: defender.battleArea!.slice(0, 1) } },
  };
}

async function digivolveGallantmon(value: ScenarioFixture, answers: { attack: boolean; raid: boolean }) {
  const s = setupScenario(value, {
    autoAcceptOptional: true,
    autoSelectCards: false,
    autoOrderTriggers: false,
    declinePrompts: answers.attack ? [] : ["Attack"],
  });
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(1);
  const veedramon = s.perm("veedramon").permanentId;
  expect(
    s.engine.applyIntent(1, {
      type: "digivolve",
      permanentId: s.perm("wargrowlmon").permanentId,
      instanceId: s.inst("gallantmon").instanceId,
    }),
  ).toEqual({ ok: true });
  const answer = (key: string): Answer => {
    if (key.endsWith(DELETE_THEN_ATTACK)) return { accept: answers.attack };
    if (key.endsWith(RAID)) return { accept: answers.raid };
    return { accept: true };
  };
  for (let step = 0; step < 12; step += 1) {
    await settle(() => s.state.pendingDecision !== undefined || isIdle(s), 2000);
    const pending = s.state.pendingDecision;
    if (pending === undefined) break;
    const payload = JSON.parse(pending.payloadJson) as { triggerKeys?: string[]; candidateInstanceIds?: string[] };
    const response =
      pending.kind === "orderTriggers"
        ? {
            kind: "orderTriggers" as const,
            order: orderedKeys(payload.triggerKeys!),
            optionalAnswers: Object.fromEntries(
              payload
                .triggerKeys!.filter((key) => !key.endsWith(DELETE_THEN_ATTACK))
                .map((key) => [key, answer(key).accept]),
            ),
          }
        : {
            kind: pending.kind as "chooseTargets" | "selectCards",
            instanceIds: [
              payload.candidateInstanceIds!.includes(veedramon) ? veedramon : payload.candidateInstanceIds![0]!,
            ],
          };
    expect(
      s.engine.applyIntent(pending.seat, { type: "respondDecision", decisionId: pending.decisionId, response }),
    ).toEqual({ ok: true });
  }
  await settle(() => isIdle(s), 2000);
  return { s, loop, veedramon };
}

function orderedKeys(keys: readonly string[]): string[] {
  const rank = (key: string) => (key.endsWith(DELETE_THEN_ATTACK) || key.endsWith(RAID) ? 0 : 1);
  return [...keys].sort((left, right) => rank(left) - rank(right));
}

function isIdle(s: EngineSetup): boolean {
  return (
    [DELETE_THEN_ATTACK, LOWEST_DP_DELETE].every((effectKey) =>
      s.events.some((event) => event.kind === "effectResolved" && event.effectKey === effectKey),
    ) &&
    !observe(s.engine).isAttacking() &&
    s.state.pendingDecision === undefined
  );
}

function indexOf(events: readonly ServerEvent[], match: (event: ServerEvent) => boolean): number {
  return events.findIndex(match);
}

function resolvedBy(cardId: string, effectKey?: string) {
  return (event: ServerEvent) =>
    event.kind === "effectResolved" &&
    event.sourceCardId === cardId &&
    (effectKey === undefined || event.effectKey === effectKey);
}

describe("A suspension during an effect that ends in an attack", () => {
  it("resolves the attacker's [When Attacking] deletion before the defender's suspend trigger", async () => {
    const { s, loop, veedramon } = await digivolveGallantmon(withoutLowestDigimon(fixture), {
      attack: true,
      raid: false,
    });
    try {
      const events = s.events;
      const attackDeclared = indexOf(events, (event) => event.kind === "attackDeclared");
      const deletion = indexOf(events, resolvedBy("AD1-008", LOWEST_DP_DELETE));
      expect(attackDeclared).toBeGreaterThanOrEqual(0);
      expect(deletion).toBeGreaterThan(attackDeclared);
      expect(
        indexOf(events, (event) => event.kind === "effectTriggered" && event.sourceCardId === UNSUSPEND_SOURCE),
      ).toBe(-1);
      expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(veedramon);
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  });

  it("offers the defender's suspend trigger once the [When Attacking] effects resolve, before the attack ends", async () => {
    const { s, loop } = await digivolveGallantmon(fixture, { attack: true, raid: false });
    try {
      const events = s.events;
      const deletion = indexOf(events, resolvedBy("AD1-008", LOWEST_DP_DELETE));
      const unsuspend = indexOf(events, resolvedBy(UNSUSPEND_SOURCE));
      const attackEnded = indexOf(events, (event) => event.kind === "attackEnded");
      expect(deletion).toBeGreaterThanOrEqual(0);
      expect(unsuspend).toBeGreaterThan(deletion);
      expect(attackEnded).toBeGreaterThan(unsuspend);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  });

  it("resolves the defender's suspend trigger before the attacker's pending [When Digivolving] when no attack follows", async () => {
    const { s, loop } = await digivolveGallantmon(fixture, { attack: false, raid: false });
    try {
      const events = s.events;
      const firstEffect = indexOf(events, resolvedBy("AD1-008", DELETE_THEN_ATTACK));
      const unsuspend = indexOf(events, resolvedBy(UNSUSPEND_SOURCE));
      const pendingEffect = indexOf(
        events,
        (event) => event.kind === "effectTriggered" && event.effectKey === LOWEST_DP_DELETE,
      );
      expect(indexOf(events, (event) => event.kind === "attackDeclared")).toBe(-1);
      expect(unsuspend).toBeGreaterThan(firstEffect);
      expect(pendingEffect).toBeGreaterThan(unsuspend);
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  });
});
