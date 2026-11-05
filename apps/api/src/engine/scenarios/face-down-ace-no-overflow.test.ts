import fixtureFaceDownAceNoOverflow from "./face-down-ace-no-overflow.fixture.js";
import { fixturePermanentId, fixtureInstanceId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

describe("Face-down ACE arena scenario", () => {
  it("deleting a host with a face-down ACE source costs no Overflow", async () => {
    const s = setupEngine({ 0: {}, 1: {} }, { autoSelectCards: true, autoOrderTriggers: true });
    layScenarioFixture(s.state, fixtureFaceDownAceNoOverflow, [BLUE_DECK, RED_DECK], true);
    void s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const memoryBefore = s.state.memory;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: fixturePermanentId("own-face-down-ace-host"),
        target: { kind: "permanent", permanentId: fixturePermanentId("opponent-face-down-ace-wall") },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0 && s.state.pendingDecision === undefined);

    const trashed = s.state.players[0]!.trash.map(({ instanceId }) => instanceId);
    expect(trashed).toEqual(
      expect.arrayContaining([
        fixtureInstanceId("own-card-face-down-ace-host-card"),
        fixtureInstanceId("face-down-ace-blitz-card"),
      ]),
    );
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

it("Armor Purge leaves a face-down ACE hidden and rule-trashes it without Overflow", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          {
            card: "BT8-012",
            as: "armor",
            suspended: true,
            under: [{ card: "EX9-065", as: "hiddenAce", faceUp: false }],
          },
        ],
      },
      1: { battleArea: [{ card: "BT1-025", as: "attacker" }] },
    },
    { autoSelectCards: true },
  );
  s.state.turnSeat = 1;
  await s.ready();
  const memory = s.state.memory;
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "permanent", permanentId: s.perm("armor").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "attackEnded"));
  expect(s.state.players[0]!.battleArea).toHaveLength(0);
  expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT8-012", "EX9-065"]));
  expect(s.state.memory).toBe(memory);
});
