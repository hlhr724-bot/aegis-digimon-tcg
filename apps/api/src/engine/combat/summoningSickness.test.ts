import { describe, it, expect } from "vitest";
import type { PlayerState } from "@aegis/shared";
import { makeDigimon as digimon, setupEngine as setup } from "../testkit/harness.js";
import "../../cards/index.js";

/**
 * `Permanent.summoningSick` is the server's answer to "may this Digimon attack yet this
 * turn?", published so the client can draw the summoning-sickness ring without rebuilding
 * Comprehensive Rules §16-1 from `enterFieldTurnCount` and a turn counter.
 */

const VANILLA_CARD = "AD1-001"; // no keywords
const RUSH_CARD = "AD1-002"; // printed <Rush>

describe("Permanent.summoningSick projection", () => {
  it("flags a Digimon that enters during turn zero", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const fresh = digimon(0, 5000, VANILLA_CARD);
    fresh.enterFieldTurnCount = s.state.turnCount;
    p0.battleArea.push(fresh);

    await s.engine.recomputeContinuousEffects();

    expect(s.state.turnCount).toBe(0);
    expect(fresh.summoningSick).toBe(true);
  });

  it("flags a Digimon that entered this turn and clears it once the turn moves on", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    s.state.turnCount = 1;

    const fresh = digimon(0, 5000, VANILLA_CARD);
    fresh.enterFieldTurnCount = s.state.turnCount;
    const established = digimon(0, 5000, VANILLA_CARD);
    established.enterFieldTurnCount = s.state.turnCount - 1;
    p0.battleArea.push(fresh, established);

    await s.engine.recomputeContinuousEffects();
    expect(fresh.summoningSick).toBe(true);
    expect(established.summoningSick).toBe(false);

    s.state.turnCount += 1;
    await s.engine.recomputeContinuousEffects();
    expect(fresh.summoningSick).toBe(false);
  });

  it("leaves a Digimon with <Rush> unflagged the turn it enters", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    s.state.turnCount = 1;

    const rusher = digimon(0, 5000, RUSH_CARD);
    rusher.enterFieldTurnCount = s.state.turnCount;
    p0.battleArea.push(rusher);

    await s.engine.recomputeContinuousEffects();
    expect(rusher.summoningSick).toBe(false);
  });

  it("flags the opponent's freshly played Digimon too, so both seats read the same board", async () => {
    const s = setup();
    const p1 = s.state.players[1] as PlayerState;
    s.state.turnCount = 3;

    const theirs = digimon(1, 5000, VANILLA_CARD);
    theirs.enterFieldTurnCount = s.state.turnCount;
    p1.battleArea.push(theirs);

    await s.engine.recomputeContinuousEffects();
    expect(theirs.summoningSick).toBe(true);
  });
});

describe("Tamer entry age projection", () => {
  it.each([0, 1] as const)(
    "marks a fresh Tamer for seat %s without marking an established Tamer or Option",
    async (seat) => {
      const s = setup({
        [seat]: {
          battleArea: [
            { card: "BT12-088", as: "fresh", enteredThisTurn: true },
            { card: "BT12-088", as: "established" },
            { card: "P-107", as: "option", enteredThisTurn: true },
          ],
        },
      });
      await s.ready();
      expect(s.perm("fresh").summoningSick).toBe(true);
      expect(s.perm("established").summoningSick).toBe(false);
      expect(s.perm("option").summoningSick).toBe(false);
      expect(s.perm("fresh").canAttackPlayer).toBe(false);
      s.state.turnCount += 1;
      await s.engine.recomputeContinuousEffects();
      expect(s.perm("fresh").summoningSick).toBe(false);
    },
  );
});
