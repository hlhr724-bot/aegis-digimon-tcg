import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/zero-dp-after-attack-immunity.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it("deletes a zero-DP Digimon as attack immunity ends before another Main action", async () => {
  const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
  s.state.phase = Phase.Main;
  await s.ready();
  const ouryukenId = s.perm("ouryuken").permanentId;
  const ouryukenInstanceId = s.perm("ouryuken").topCard.instanceId;

  async function resolveAttack(attacker: string): Promise<void> {
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm(attacker).permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.combatWindow?.kind === "block");
    expect(s.perm("ouryuken").currentDP).toBe(16000);
    expect(s.perm("ouryuken").immuneToOpponentDigimonEffects).toBe(true);
    await advance(s.engine).finishAttack();
    await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
  }

  await resolveAttack("first-attacker");
  expect(s.perm("ouryuken").currentDP).toBe(8000);
  expect(s.perm("ouryuken").immuneToOpponentDigimonEffects).toBe(false);
  expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(ouryukenId);
  await resolveAttack("second-attacker");

  expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(ouryukenId);
  expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(ouryukenInstanceId);
  expect(s.state.players[1]!.security).toHaveLength(3);
  expect(s.state.phase).toBe(Phase.Main);
  expect(s.state.memory).toBe(5);
  expect(s.state.turnSeat).toBe(0);
  expect(s.state.pendingDecision).toBeUndefined();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("next-play").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
  expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
    s.inst("next-play").instanceId,
  );
});

it("resolves Partition when immunity ends before the next attack can be declared", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  s.state.phase = Phase.Main;
  await s.ready();
  const ouryukenId = s.perm("ouryuken").permanentId;
  const materialIds = s.perm("ouryuken").stack.map(({ instanceId }) => instanceId);

  for (const attacker of ["first-attacker", "second-attacker"]) {
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm(attacker).permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.combatWindow?.kind === "block");
    await advance(s.engine).finishAttack();
    await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
  }

  expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(ouryukenId);
  expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId).sort()).toEqual(materialIds.sort());
  expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(["BT13-075", "BT27-015"]);
  expect(s.events).toContainEqual(
    expect.objectContaining({
      kind: "effectResolved",
      sourceCardId: "BT27-103",
      effectKey: `replacement/keyword-partition/${ouryukenId}`,
    }),
  );
  expect(s.state.players[0]!.security).toHaveLength(5);
  expect(s.state.phase).toBe(Phase.Main);
  expect(s.state.turnSeat).toBe(0);
  expect(s.state.pendingDecision).toBeUndefined();
});

it("finishes zero-DP deletion reactions after an effect-directed attack and before Main resumes", async () => {
  let setup: EngineSetup | undefined;
  let ouryukenInstanceId = "";
  const deletionDepths: number[] = [];
  const s = setupScenario(
    {
      ...fixture,
      board: {
        0: {
          ...fixture.board[0],
          battleArea: [
            { card: "BT1-080", as: "first-attacker", under: ["AD1-015", "AD1-015"] },
            { card: "BT24-046", as: "second-attacker", under: ["AD1-015", "AD1-015"] },
          ],
          hand: [
            { card: "BT25-017", as: "flaremon" },
            { card: "BT1-009", as: "attack-payment" },
          ],
        },
        1: {
          ...fixture.board[1],
          battleArea: [{ card: "BT27-103", as: "ouryuken", under: ["BT3-006"] }],
        },
      },
    },
    {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      onEvent(event) {
        if (
          event.kind === "cardsMoved" &&
          event.from === "battleArea" &&
          event.to === "trash" &&
          event.instanceIds.includes(ouryukenInstanceId)
        ) {
          deletionDepths.push(setup?.engine.effectResolutionDepth ?? -1);
        }
      },
    },
  );
  setup = s;
  ouryukenInstanceId = s.perm("ouryuken").topCard.instanceId;
  const ouryukenId = s.perm("ouryuken").permanentId;
  const secondAttackerId = s.perm("second-attacker").permanentId;
  s.state.phase = Phase.Main;
  await s.ready();

  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("first-attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).finishAttack();
  expect(s.perm("ouryuken").currentDP).toBe(8000);

  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: secondAttackerId,
      instanceId: s.inst("flaremon").instanceId,
      useAlternateCost: true,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.combatWindow?.kind === "block");
  expect(s.perm("ouryuken").currentDP).toBe(16000);
  await advance(s.engine).finishAttack();
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);

  expect(deletionDepths).toHaveLength(1);
  expect(deletionDepths[0]).toBe(0);
  expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(ouryukenId);
  const deletionResolved = s.events.findIndex(
    (event) => event.kind === "effectResolved" && event.sourceCardId === "BT3-006",
  );
  const attackEnded = s.events.findIndex(
    (event) => event.kind === "attackEnded" && event.attackerPermanentId === secondAttackerId,
  );
  expect(attackEnded).toBeGreaterThan(-1);
  expect(deletionResolved).toBeGreaterThan(attackEnded);
  expect(s.perm("second-attacker").topCard.cardId).toBe("BT25-017");
  expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("attack-payment").instanceId);
  expect(s.state.players[1]!.security).toHaveLength(3);
  expect(s.state.phase).toBe(Phase.Main);
  expect(s.state.memory).toBe(2);
  expect(s.engine.effectResolutionDepth).toBe(0);
  expect(s.state.pendingDecision).toBeUndefined();
});
