import type { Seat } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import type { PermanentSpec, ScenarioFixture } from "#api/engine/scenario/types";
import { advance } from "#api/engine/testkit/advance";
import { settle, type SetupEngineOptions } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

type Setup = ReturnType<typeof setupScenario>;

type FixtureParams = {
  turnSeat: Seat;
  craniamonSide: PermanentSpec[];
  opposingSide: PermanentSpec[];
};

type AttackParams = {
  setup: Setup;
  attacker: string;
  target?: string;
};

const CRANIAMON_SEAT: Seat = 0;
const OPPOSING_SEAT: Seat = 1;
const AUTOMATION: SetupEngineOptions = { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true };

function buildFixture({ turnSeat, craniamonSide, opposingSide }: FixtureParams): ScenarioFixture {
  return {
    memory: 3,
    turnSeat,
    turnCount: 5,
    isFirstPlayersFirstTurn: false,
    board: {
      [CRANIAMON_SEAT]: { battleArea: craniamonSide, deck: Array(6).fill("BT1-009"), security: 3 },
      [OPPOSING_SEAT]: { battleArea: opposingSide, deck: Array(6).fill("BT1-009"), security: 3 },
    },
  };
}

function listTriggeredEffects(setup: Setup, cardIds: readonly string[]): string[] {
  return setup.events.flatMap((event) =>
    event.kind === "effectTriggered" && cardIds.includes(event.sourceCardId)
      ? [`${event.sourceCardId} ${event.printedTiming ?? event.timing ?? ""}`]
      : [],
  );
}

function listTrash(setup: Setup, seat: Seat): string[] {
  return setup.state.players[seat]!.trash.map((card) => card.cardId);
}

async function resolveAttack({ setup, attacker, target }: AttackParams): Promise<void> {
  const turnSeat = setup.state.turnSeat as Seat;
  const defendingSeat: Seat = turnSeat === 0 ? 1 : 0;
  expect(
    setup.engine.applyIntent(turnSeat, {
      type: "attack",
      attackerPermanentId: setup.perm(attacker).permanentId,
      target:
        target === undefined ? { kind: "player" } : { kind: "permanent", permanentId: setup.perm(target).permanentId },
    }),
  ).toEqual({ ok: true });
  const hasEnded = () => setup.events.some((event) => event.kind === "attackEnded");
  await settle(() => hasEnded() || setup.events.some((event) => event.kind === "blockWindowOpened"));
  if (!hasEnded()) {
    setup.engine.applyIntent(defendingSeat, { type: "declineBlock" });
  }
  await settle(() => hasEnded() && !setup.state.pendingDecision && !setup.state.combatWindow);
}

describe("a suspension deletion effect and the opposing [On Deletion] effects", () => {
  it.each(["EX13-062", "BT23-058", "BT27-070"])(
    "resolves the [On Deletion] that %s's deletion caused before its pending [When Attacking]",
    async (craniamon) => {
      const s = setupScenario(
        buildFixture({
          turnSeat: CRANIAMON_SEAT,
          craniamonSide: [{ card: craniamon, as: "craniamon", under: ["BT18-070"] }],
          opposingSide: [
            { card: "BT2-070", as: "tapirmon" },
            { card: "BT1-080", as: "titamon" },
          ],
        }),
        { ...AUTOMATION, preferTriggerKeys: ["subtrigger"] },
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(CRANIAMON_SEAT);
        await resolveAttack({ setup: s, attacker: "craniamon" });

        expect(listTriggeredEffects(s, [craniamon, "BT2-070", "BT18-070"])).toEqual([
          `${craniamon} AllTurns`,
          "BT2-070 OnDeletion",
          "BT18-070 WhenAttacking",
        ]);
        expect(listTrash(s, OPPOSING_SEAT)).toEqual(["BT2-070", "BT1-009"]);
        expect(s.state.players[OPPOSING_SEAT]!.hand).toHaveLength(1);
        expect(s.state.players[OPPOSING_SEAT]!.security).toHaveLength(2);
        expect(s.perm("titamon").currentDP).toBe(8000);
        expect(s.perm("craniamon").isSuspended).toBe(true);
        expect(s.state.turnSeat).toBe(CRANIAMON_SEAT);
        expect(s.state.turnCount).toBe(6);
      } finally {
        s.engine.applyIntent(s.state.turnSeat as Seat, { type: "surrender" });
        await loop;
      }
    },
  );

  it("finishes Craniamon (X Antibody)'s whole effect, including the activated [Main] effect, before the [On Deletion]", async () => {
    const s = setupScenario(
      buildFixture({
        turnSeat: CRANIAMON_SEAT,
        craniamonSide: [{ card: "BT27-070", as: "craniamon", under: [{ card: "EX13-062", as: "trashedSource" }] }],
        opposingSide: [
          { card: "BT2-070", as: "tapirmon" },
          { card: "BT1-080", as: "titamon" },
        ],
      }),
      AUTOMATION,
    );
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(CRANIAMON_SEAT);
      await resolveAttack({ setup: s, attacker: "craniamon" });

      expect(listTriggeredEffects(s, ["BT27-070", "BT2-070"])).toEqual([
        "BT27-070 AllTurns",
        "BT27-070 Main",
        "BT2-070 OnDeletion",
      ]);
      expect(listTrash(s, CRANIAMON_SEAT)).toEqual(["EX13-062"]);
      expect(listTrash(s, OPPOSING_SEAT)).toEqual(["BT2-070", "BT1-009"]);
      expect(s.perm("craniamon").currentDP).toBe(18000);
      expect(s.perm("craniamon").isSuspended).toBe(false);
      expect(s.state.turnSeat).toBe(CRANIAMON_SEAT);
      expect(s.state.turnCount).toBe(6);
    } finally {
      s.engine.applyIntent(s.state.turnSeat as Seat, { type: "surrender" });
      await loop;
    }
  });

  it.each([
    {
      turn: "its owner's",
      turnSeat: CRANIAMON_SEAT,
      attacker: "golemon",
      target: "leomon",
      order: ["BT27-070 AllTurns", "BT27-070 AllTurns", "BT2-070 OnDeletion", "BT1-035 OnDeletion"],
      memory: 1,
    },
    {
      turn: "the opponent's",
      turnSeat: OPPOSING_SEAT,
      attacker: "leomon",
      target: "golemon",
      order: ["BT27-070 AllTurns", "BT1-035 OnDeletion", "BT27-070 AllTurns", "BT2-070 OnDeletion"],
      memory: 5,
    },
  ])(
    "gives the turn player's effect priority when a battle deletion and a protecting suspension trigger together on $turn turn",
    async ({ turnSeat, attacker, target, order, memory }) => {
      const s = setupScenario(
        buildFixture({
          turnSeat,
          craniamonSide: [
            { card: "BT27-070", as: "craniamon" },
            { card: "BT10-062", as: "golemon", suspended: turnSeat === OPPOSING_SEAT },
          ],
          opposingSide: [
            { card: "BT1-035", as: "leomon", suspended: turnSeat === CRANIAMON_SEAT },
            { card: "BT2-070", as: "tapirmon" },
          ],
        }),
        AUTOMATION,
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(turnSeat);
        await resolveAttack({ setup: s, attacker, target });

        expect(listTriggeredEffects(s, ["BT27-070", "BT1-035", "BT2-070"])).toEqual(order);
        expect(listTrash(s, OPPOSING_SEAT)).toEqual(["BT1-035", "BT2-070"]);
        expect(listTrash(s, CRANIAMON_SEAT)).toEqual([]);
        expect(s.perm("golemon").isSuspended).toBe(true);
        expect(s.perm("craniamon").isSuspended).toBe(true);
        expect(s.state.players[OPPOSING_SEAT]!.battleArea).toHaveLength(0);
        expect(s.state.memory).toBe(memory);
        expect(s.state.turnSeat).toBe(turnSeat);
        expect(s.state.turnCount).toBe(6);
      } finally {
        s.engine.applyIntent(s.state.turnSeat as Seat, { type: "surrender" });
        await loop;
      }
    },
  );

  it.each(["BT27-070", "BT23-058"])(
    "resolves the turn player's [On Deletion] before %s's suspension trigger when one opposing effect deletes its own Digimon and is then prevented",
    async (craniamon) => {
      const automation = { ...AUTOMATION, preferInstanceIds: [] as string[] };
      const s = setupScenario(
        buildFixture({
          turnSeat: OPPOSING_SEAT,
          craniamonSide: [
            { card: craniamon, as: "craniamon" },
            { card: "BT10-062", as: "golemon" },
          ],
          opposingSide: [
            { card: "BT16-081", as: "malomyotismon" },
            { card: "BT2-070", as: "tapirmon" },
            { card: "BT1-080", as: "titamon" },
          ],
        }),
        automation,
      );
      automation.preferInstanceIds.push(
        s.perm("tapirmon").topCard!.instanceId,
        s.perm("tapirmon").permanentId,
        s.perm("golemon").topCard!.instanceId,
        s.perm("golemon").permanentId,
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(OPPOSING_SEAT);
        await resolveAttack({ setup: s, attacker: "malomyotismon" });

        expect(listTriggeredEffects(s, [craniamon, "BT2-070"])).toEqual([
          `${craniamon} AllTurns`,
          "BT2-070 OnDeletion",
          `${craniamon} AllTurns`,
        ]);
        expect(listTrash(s, OPPOSING_SEAT)).toEqual(["BT2-070", "BT1-080"]);
        expect(s.perm("golemon").isSuspended).toBe(false);
        expect(s.perm("craniamon").isSuspended).toBe(true);
        expect(s.state.players[CRANIAMON_SEAT]!.battleArea).toHaveLength(2);
        expect(s.state.turnSeat).toBe(OPPOSING_SEAT);
        expect(s.state.turnCount).toBe(6);
      } finally {
        s.engine.applyIntent(s.state.turnSeat as Seat, { type: "surrender" });
        await loop;
      }
    },
  );
});
