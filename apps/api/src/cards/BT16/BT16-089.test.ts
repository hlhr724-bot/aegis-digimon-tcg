import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { EffectDuration, type ServerEvent } from "@aegis/shared";
import { setupEngine, settle, type CardSpec, type EngineSetup, type SeatSpec } from "../../engine/testkit/harness.js";
import { compiled } from "./BT16-089.js";
import "../index.js";

describe("BT16-089", () => {
  it("reduces Arukenimon or Mummymon play cost by 3 by deleting this Tamer", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "YourTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { zone: "hand" },
          actions: [
            {
              kind: "Replacement",
              mode: "reduceCost",
              amount: 3,
              cost: { kind: "deleteOwn" },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    });
  });

  it("plays a Myotismon-text level 5 or lower Digimon from trash on deletion and deletes itself later", () => {
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "OnDeletion",
      actions: [
        { kind: "PlayWithoutCost", from: ["trash"], payCost: false, optional: true },
        { kind: "DelayedDelete", timing: "endOfOpponentTurn" },
      ],
    });
  });

  it("plays itself from security", () => {
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", payCost: false }],
    });
  });

  it.each([
    ["BT16-072", true, 7],
    ["BT16-073", true, 7],
    ["BT16-089", false, 6],
  ])("only reduces the exact named Digimon %s", async (card, sacrificeDeleted, memory) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-089", as: "sacrifice" }],
          hand: [{ card, as: "played" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("played").instanceId,
        ) && s.state.pendingDecision === undefined,
    );
    expect(s.state.players[0]!.trash.some((candidate) => candidate.instanceId === s.inst("sacrifice").instanceId)).toBe(
      sacrificeDeleted,
    );
    expect(s.state.memory).toBe(memory);
  });

  it("revives a Myotismon-text Digimon from trash and deletes it at the next opponent turn end", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT16-072", as: "base" },
            { card: "BT16-089", as: "sacrifice" },
          ],
          hand: [{ card: "BT16-081", as: "malo" }],
          trash: [{ card: "BT15-070", as: "revived" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: ["BT1-090", "BT1-090"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("sacrifice").permanentId, s.perm("sacrifice").topCard.instanceId);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("malo").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT15-070"));
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT15-070")).toBe(true);

    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT15-070")).toBe(false);
  });
});

describe("BT16-089 Arukenimon & Mummymon — KB Q&A rulings", () => {
  async function reviveDemiDevimon(
    options: {
      hand?: CardSpec[];
      opponent?: SeatSpec;
      preferTriggerKeys?: string[];
      onEvent?: (event: ServerEvent) => void;
    } = {},
  ) {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT16-072", as: "base" },
            { card: "BT16-089", as: "sacrifice" },
          ],
          hand: [{ card: "BT16-081", as: "malo" }, ...(options.hand ?? [])],
          trash: [{ card: "BT15-070", as: "revived" }],
          deck: ["BT1-090", "BT1-090", "BT1-090", "BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "opponent" }],
          deck: ["BT1-090", "BT1-090", "BT1-090", "BT1-090"],
          ...options.opponent,
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderTriggers: true,
        preferInstanceIds,
        preferTriggerKeys: options.preferTriggerKeys ?? [],
        ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
      },
    );
    preferInstanceIds.push(
      s.perm("sacrifice").permanentId,
      s.perm("sacrifice").topCard.instanceId,
      s.perm("opponent").permanentId,
      s.perm("opponent").topCard.instanceId,
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("malo").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("revived").instanceId),
    );
    const revived = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("revived").instanceId,
    )!;
    return { s, revivedId: revived.permanentId };
  }

  function isOnBattleArea(s: EngineSetup, permanentId: string): boolean {
    return s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === permanentId);
  }

  async function runOpponentTurn(s: EngineSetup, duringMain?: () => Promise<void>) {
    s.state.turnSeat = 1;
    s.state.memory = 0;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    await duringMain?.();
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  }

  it("still deletes the played Digimon at the end of the opponent's turn after it digivolved (Q2683)", async () => {
    const { s, revivedId } = await reviveDemiDevimon({ hand: [{ card: "BT3-083", as: "meramon" }] });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, { type: "digivolve", permanentId: revivedId, instanceId: s.inst("meramon").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT3-083"));
    expect(isOnBattleArea(s, revivedId)).toBe(true);

    await runOpponentTurn(s);

    expect(isOnBattleArea(s, revivedId)).toBe(false);
    const trashIds = s.state.players[0]!.trash.map((card) => card.instanceId);
    expect(trashIds).toContain(s.inst("meramon").instanceId);
    expect(trashIds).toContain(s.inst("revived").instanceId);
  });

  it("deletes the played Digimon only at the end of the opponent's first turn, not later turns if prevented then (Q5534)", async () => {
    const { s, revivedId } = await reviveDemiDevimon();

    // Protection lasts until the end of seat 0's next turn: it blocks the first scheduled
    // deletion and has lapsed before the opponent's second turn ends.
    await runOpponentTurn(s, () =>
      advance(s.engine).verb.restrict(revivedId, "beDeleted", EffectDuration.UntilOwnerTurnEnd),
    );
    expect(isOnBattleArea(s, revivedId)).toBe(true);

    s.state.turnSeat = 0;
    s.state.memory = 0;
    await advance(s.engine).runTurn(0);
    await runOpponentTurn(s);

    expect(isOnBattleArea(s, revivedId)).toBe(true);
    expect(await advance(s.engine).verb.deletePermanent([revivedId])).toBe(1);
  });

  it("lets the turn player order the delayed deletion against their own end-of-turn effect (Q5535)", async () => {
    for (const first of ["delayedDeletion", "unsuspend"] as const) {
      let emperorGreymonSuspendedAtDeletion: boolean | undefined;
      let setup: EngineSetup | undefined;
      const { s, revivedId } = await reviveDemiDevimon({
        opponent: {
          battleArea: [
            { card: "BT1-009", as: "opponent" },
            { card: "P-185", as: "emperorGreymon" },
          ],
        },
        preferTriggerKeys: [first === "delayedDeletion" ? "BT15-070" : "P-185"],
        onEvent: () => {
          if (setup === undefined || emperorGreymonSuspendedAtDeletion !== undefined) return;
          if (setup.state.players[0]!.trash.some((card) => card.instanceId === setup!.inst("revived").instanceId))
            emperorGreymonSuspendedAtDeletion = setup.perm("emperorGreymon").isSuspended;
        },
      });
      setup = s;

      await runOpponentTurn(s, () => advance(s.engine).verb.suspend([s.perm("emperorGreymon").permanentId]));

      const endOfTurnOrder = s.decisions.find(
        (decision) =>
          decision.req.kind === "orderTriggers" && (decision.req.options?.triggerCardIds ?? []).includes("P-185"),
      );
      expect(endOfTurnOrder?.seat).toBe(1);
      expect(endOfTurnOrder?.req.options?.triggerKeys).toHaveLength(2);
      expect(isOnBattleArea(s, revivedId)).toBe(false);
      expect(s.perm("emperorGreymon").isSuspended).toBe(false);
      expect(emperorGreymonSuspendedAtDeletion).toBe(first === "delayedDeletion");
    }
  });
});
