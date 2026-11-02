import { describe, expect, it } from "vitest";
import { CardKind, EffectDuration, type Seat } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import "../index.js";

describe("Discord 1557920953437261854: Kanan uses the DUAL Option under Pomumon", () => {
  it.each([0, 1] as Seat[])(
    "seat %i with Pomumon: offers both DUAL copies and Central Town, excludes non-TS and rejects other seat, uses Wide Plasment at opponent 5",
    async (seat) => {
      const other = (1 - seat) as Seat;
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [
              { card: "BT26-090", as: "kanan" },
              { card: "BT9-047", as: "pomumon" },
            ],
            hand: [
              { card: "BT26-033", as: "jupiter" },
              { card: "BT26-033", as: "jupiter2" },
              { card: "BT24-094", as: "central" },
              { card: "BT1-104", as: "nonTS" },
              { card: "BT1-080", as: "endPlay" },
            ],
            security: 3,
            deck: ["BT1-009", "BT1-009", "BT1-009"],
          },
          [other]: { battleArea: [{ card: "BT1-020", as: "enemy" }], deck: ["BT1-009"] },
        },
        { autoAcceptOptional: true },
      );
      s.state.turnSeat = seat;
      s.state.memory = 5;
      await s.ready();
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(seat);
      expect(s.engine.applyIntent(seat, { type: "playCard", instanceId: s.inst("endPlay").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const req = s.state.pendingDecision!;
      expect(JSON.parse(req.payloadJson).candidateInstanceIds).toEqual(
        expect.arrayContaining([
          s.inst("jupiter").instanceId,
          s.inst("jupiter2").instanceId,
          s.inst("central").instanceId,
        ]),
      );
      expect(JSON.parse(req.payloadJson).candidateInstanceIds).not.toContain(s.inst("nonTS").instanceId);
      expect(s.state.memory).toBe(-5);
      expect(
        s.engine.applyIntent(other, {
          type: "respondDecision",
          decisionId: req.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst("jupiter").instanceId] },
        }).ok,
      ).toBe(false);
      expect(
        s.engine.applyIntent(seat, {
          type: "respondDecision",
          decisionId: req.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst("jupiter").instanceId] },
        }),
      ).toEqual({ ok: true });
      await turn;
      expect(s.state.players[other]!.battleArea).toHaveLength(0);
      expect(s.state.players[seat]!.security).toHaveLength(4);
      expect(s.state.players[seat]!.trash.map((c) => c.instanceId)).toContain(s.inst("jupiter").instanceId);
      expect(s.state.players[seat]!.hand.map((c) => c.instanceId)).toContain(s.inst("jupiter2").instanceId);
      expect(s.perm("kanan").isSuspended).toBe(true);
      expect(s.state.memory).toBe(-5);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it.each([0, 1] as Seat[])("seat %i: five security costs 7 minus opponent 5 = 2", async (seat) => {
    const other = (1 - seat) as Seat;
    const s = setupEngine(
      {
        [seat]: {
          battleArea: [{ card: "BT26-090", as: "kanan" }],
          hand: [
            { card: "BT26-033", as: "jupiter" },
            { card: "BT1-080", as: "endPlay" },
          ],
          security: 5,
          deck: ["BT1-009", "BT1-009"],
        },
        [other]: { battleArea: [{ card: "BT1-020", as: "enemy" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 5;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(seat);
    expect(s.engine.applyIntent(seat, { type: "playCard", instanceId: s.inst("endPlay").instanceId })).toEqual({
      ok: true,
    });
    await turn;
    expect(s.state.memory).toBe(-7);
    expect(s.state.players[seat]!.security).toHaveLength(6);
    expect(s.state.players[other]!.battleArea).toHaveLength(0);
    expect(s.state.players[seat]!.trash.map((c) => c.cardId)).toContain("BT26-033");
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it.each([0, 1] as Seat[])(
    "seat %i: public pass from own 5 sets opponent 3 and Wide Plasment costs 2",
    async (seat) => {
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [{ card: "BT26-090", as: "kanan" }],
            hand: [{ card: "BT26-033", as: "jupiter" }],
            security: 3,
            deck: ["BT1-009", "BT1-009"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = seat;
      s.state.memory = 5;
      await s.ready();
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(seat);
      expect(s.engine.applyIntent(seat, { type: "endPhase" })).toEqual({ ok: true });
      await turn;
      expect(s.state.memory).toBe(-5);
      expect(s.state.players[seat]!.security).toHaveLength(4);
      expect(s.state.players[seat]!.trash.map((c) => c.cardId)).toContain("BT26-033");
    },
  );
  it.each([0, 1] as Seat[])("seat %i: Central Town legal control with no red/yellow field", async (seat) => {
    const s = setupEngine(
      {
        [seat]: {
          battleArea: [{ card: "BT26-090", as: "kanan" }],
          hand: [{ card: "BT24-094", as: "central" }],
          security: 3,
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 5;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(seat);
    expect(s.engine.applyIntent(seat, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.memory).toBe(-3);
    expect(s.state.players[seat]!.security).toHaveLength(3);
    expect(s.state.players[seat]!.security.at(-1)?.cardId).toBe("BT24-094");
    expect(s.state.players[seat]!.security.at(-1)?.faceUp).toBe(true);
  });
  it.each([0, 1] as Seat[])("seat %i: non-TS and unmet native colors are excluded", async (seat) => {
    const s = setupEngine(
      {
        [seat]: {
          battleArea: [{ card: "BT26-090", as: "kanan" }],
          hand: [
            { card: "BT1-104", as: "nonTS" },
            { card: "BT24-093", as: "yellowTS" },
            { card: "BT1-080", as: "endPlay" },
          ],
          security: 3,
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 5;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(seat);
    expect(s.engine.applyIntent(seat, { type: "playCard", instanceId: s.inst("endPlay").instanceId })).toEqual({
      ok: true,
    });
    await turn;
    expect(s.state.players[seat]!.hand.map((c) => c.instanceId)).toContain(s.inst("nonTS").instanceId);
    expect(s.state.players[seat]!.hand.map((c) => c.instanceId)).toContain(s.inst("yellowTS").instanceId);
    expect(s.perm("kanan").isSuspended).toBe(true);
    expect(s.state.memory).toBe(-5);
  });
  it.each([0, 1] as Seat[])("seat %i: already suspended Kanan cannot use Jupiter", async (seat) => {
    const s = setupEngine(
      {
        [seat]: {
          battleArea: [{ card: "BT26-090", as: "kanan" }],
          hand: [{ card: "BT26-033", as: "jupiter" }],
          security: 3,
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 5;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(seat);
    s.perm("kanan").isSuspended = true;
    expect(s.engine.applyIntent(seat, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.players[seat]!.hand.map((c) => c.instanceId)).toContain(s.inst("jupiter").instanceId);
    expect(s.state.memory).toBe(-3);
    expect(s.state.players[seat]!.security).toHaveLength(3);
  });
});

describe("Discord 1557920953437261854: prohibition and shared-path controls", () => {
  it.each([0, 1] as Seat[])("seat %i: a genuine Option prohibition still prevents Kanan use", async (seat) => {
    const other = (1 - seat) as Seat;
    const s = setupEngine(
      {
        [seat]: {
          battleArea: [{ card: "BT26-090", as: "kanan" }, "BT9-047"],
          hand: [
            { card: "BT26-033", as: "jupiter" },
            { card: "BT1-080", as: "endPlay" },
          ],
          security: 3,
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 5;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(seat);
    s.engine.continuous.addPlayProhibition(
      seat,
      other,
      { kinds: [CardKind.Option] },
      "play",
      EffectDuration.Permanent,
      { byEffectOnly: true },
    );
    expect(s.engine.applyIntent(seat, { type: "playCard", instanceId: s.inst("endPlay").instanceId })).toEqual({
      ok: true,
    });
    await turn;
    expect(s.state.players[seat]!.hand.map((card) => card.instanceId)).toContain(s.inst("jupiter").instanceId);
    expect(s.state.players[seat]!.security).toHaveLength(3);
    expect(s.perm("kanan").isSuspended).toBe(true);
    expect(s.state.memory).toBe(-5);
  });

  it.each([0, 1] as Seat[])(
    "seat %i: Proximamon can use its DUAL source under Pomumon through play-or-use",
    async (seat) => {
      const other = (1 - seat) as Seat;
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [
              { card: "EX12-018", as: "siriusmon" },
              { card: "BT9-047", as: "pomumon" },
            ],
            hand: [{ card: "EX12-077", as: "proximamon" }],
          },
          [other]: { battleArea: [{ card: "BT1-020", as: "enemy" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = seat;
      s.state.memory = 5;
      await s.ready();
      expect(
        s.engine.applyIntent(seat, {
          type: "digivolve",
          permanentId: s.perm("siriusmon").permanentId,
          instanceId: s.inst("proximamon").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[other]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
      expect(s.state.players[seat]!.trash.map((card) => card.cardId)).toContain("EX12-018");
      expect(s.perm("siriusmon").stack).toHaveLength(0);
      expect(s.perm("pomumon").topCard.cardId).toBe("BT9-047");
      expect(s.state.memory).toBe(0);
    },
  );
});
