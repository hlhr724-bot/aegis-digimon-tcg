import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, settle, setupEngine } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-096";
import "#api/cards/index";

const faceDown = (alias: string) => ({ card: "BT1-010", as: alias, faceUp: false });
const fiveFaceDown = () => ["first", "second", "third", "fourth", "fifth"].map(faceDown);

function setupRavemonCombo(options: { under: ReturnType<typeof faceDown>[]; decline?: boolean }) {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT27-096", as: "keenan", under: options.under },
          { card: "BT13-079", as: "falcomon" },
        ],
        trash: [
          { card: "BT27-101", as: "yaksha" },
          { card: "BT13-082", as: "peckmon" },
          { card: "BT13-085", as: "crowmon" },
          { card: "BT13-089", as: "ravemon" },
        ],
      },
    },
    options.decline === true
      ? { autoDeclineOptional: true, autoSelectCards: true }
      : { autoAcceptOptional: true, autoSelectCards: true },
  );
  return s;
}

async function activateMain(s: ReturnType<typeof setupRavemonCombo>) {
  const [mainEffect] = observe(s.engine).activatableEffects(s.perm("keenan")) as Array<{ effectKey: string }>;
  return s.engine.applyIntent(0, {
    type: "activateEffect",
    sourceInstanceId: s.perm("keenan").topCard.instanceId,
    effectKey: mainEffect?.effectKey ?? "missing",
  });
}

describe("BT27-096 Keenan Crier", () => {
  it("preserves the printed card and complete compiled coverage", () => {
    expect(getCardDefinition("BT27-096")).toMatchObject({
      nameEn: "Keenan Crier",
      colors: ["Purple"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["DATA SQUAD"],
      rarity: "R",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual([
      "StartOfYourTurn",
      "AllTurns",
      "Main",
      "Security",
    ]);
  });

  it("sets memory from 2 or less to 3 at the start of its owner's turn only", async () => {
    const low = setupEngine({ 0: { battleArea: [{ card: "BT27-096", as: "keenan" }] } });
    low.state.memory = 2;
    await advance(low.engine).fire(EffectTiming.OnStartTurn, low.perm("keenan"));
    expect(low.state.memory).toBe(3);

    const high = setupEngine({ 0: { battleArea: [{ card: "BT27-096", as: "keenan" }] } });
    high.state.memory = 4;
    await advance(high.engine).fire(EffectTiming.OnStartTurn, high.perm("keenan"));
    expect(high.state.memory).toBe(4);

    const opponentTurn = setupEngine({ 0: { battleArea: [{ card: "BT27-096", as: "keenan" }] } });
    opponentTurn.state.turnSeat = 1;
    opponentTurn.state.memory = 1;
    await advance(opponentTurn.engine).fire(EffectTiming.OnStartTurn, opponentTurn.perm("keenan"));
    expect(opponentTurn.state.memory).toBe(1);
  });

  it.each([
    ["its owner's", 0],
    ["the opponent's", 1],
  ] as const)(
    "suspends to place the top 2 deck cards face down at the bottom when %s hand is trashed from",
    async (_, seat) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT27-096", as: "keenan", under: [faceDown("existing")] }],
            hand: [{ card: "BT1-009", as: "ownHandCard" }],
            deck: [
              { card: "BT1-009", as: "firstTop" },
              { card: "BT1-011", as: "secondTop" },
              { card: "BT1-012", as: "remaining" },
            ],
          },
          1: { hand: [{ card: "BT1-009", as: "opponentHandCard" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();

      await advance(s.engine).verb.trash([s.inst(seat === 0 ? "ownHandCard" : "opponentHandCard").instanceId]);
      await settle(() => s.perm("keenan").stack.length === 3);

      expect(s.perm("keenan").isSuspended).toBe(true);
      expect(s.perm("keenan").stack.map((card) => card.instanceId)).toEqual([
        s.inst("secondTop").instanceId,
        s.inst("firstTop").instanceId,
        s.inst("existing").instanceId,
      ]);
      expect(s.perm("keenan").stack.every((card) => card.faceUp === false)).toBe(true);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("remaining").instanceId]);
      assertNoLoudGap(s);
    },
  );

  it("stays active and places nothing when the hand-trash reaction is declined", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-096", as: "keenan" }], deck: ["BT1-009", "BT1-011"] },
        1: { hand: [{ card: "BT1-009", as: "opponentHandCard" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.trash([s.inst("opponentHandCard").instanceId]);
    await settle(() => s.state.players[1]!.trash.length === 1);

    expect(s.perm("keenan").isSuspended).toBe(false);
    expect(s.perm("keenan").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("cannot pay the suspension while already suspended", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-096", as: "keenan", suspended: true }], deck: ["BT1-009", "BT1-011"] },
        1: { hand: [{ card: "BT1-009", as: "opponentHandCard" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.trash([s.inst("opponentHandCard").instanceId]);
    await settle(() => s.state.players[1]!.trash.length === 1);

    expect(s.perm("keenan").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("does not react when cards are trashed from a zone other than a hand", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-096", as: "keenan" }], deck: ["BT1-009", "BT1-011"] },
        1: { security: ["BT1-009", "BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.trashFromSecurity(1, 1);
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.perm("keenan").isSuspended).toBe(false);
    expect(s.perm("keenan").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("trashes 5 bottom face-down cards to use Silver-Winged Yaksha from the trash for free", async () => {
    const s = setupRavemonCombo({ under: [...fiveFaceDown(), faceDown("kept")] });
    s.state.memory = 0;
    await s.ready();

    expect(await activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("falcomon").topCard.cardId === "BT13-089");

    expect(s.state.memory).toBe(0);
    expect(s.perm("keenan").stack.map((card) => card.instanceId)).toEqual([s.inst("kept").instanceId]);
    expect(s.perm("falcomon").stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT13-079", "BT13-082", "BT13-085"]),
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("yaksha").instanceId,
        ...["first", "second", "third", "fourth", "fifth"].map((alias) => s.inst(alias).instanceId),
      ]),
    );
    assertNoLoudGap(s);
  });

  it("can be used only once per turn", async () => {
    const s = setupRavemonCombo({
      under: [...fiveFaceDown(), ...["sixth", "seventh", "eighth", "ninth", "tenth"].map(faceDown)],
    });
    await s.ready();

    expect(await activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("falcomon").topCard.cardId === "BT13-089");

    expect(observe(s.engine).activatableEffects(s.perm("keenan"))).toEqual([]);
    expect(s.perm("keenan").stack).toHaveLength(5);
  });

  it("is not activatable with fewer than 5 face-down Tamer cards", async () => {
    const s = setupRavemonCombo({ under: ["first", "second", "third", "fourth"].map(faceDown) });
    await s.ready();

    expect(await activateMain(s)).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("keenan").stack).toHaveLength(4);
    expect(s.perm("falcomon").topCard.cardId).toBe("BT13-079");
  });

  it("offers only Options with [Ravemon] in their text from its owner's trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-096", as: "keenan", under: fiveFaceDown() }],
          trash: [
            { card: "EX4-071", as: "ravemonText" },
            { card: "BT26-098", as: "otherOption" },
            { card: "BT13-089", as: "ravemonDigimon" },
          ],
        },
        1: { trash: [{ card: "BT27-101", as: "opponentYaksha" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("keenan").stack.length === 0 && s.state.pendingDecision === undefined);

    const offered = s.decisions
      .filter(({ req }) => req.kind === "selectCards")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(offered).toContain(s.inst("ravemonText").instanceId);
    expect(offered).not.toContain(s.inst("otherOption").instanceId);
    expect(offered).not.toContain(s.inst("ravemonDigimon").instanceId);
    expect(offered).not.toContain(s.inst("opponentYaksha").instanceId);
  });

  it("plays itself from security without paying the cost", async () => {
    const s = setupEngine({ 0: { security: [{ card: "BT27-096", as: "securityKeenan" }] } });
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityKeenan"));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("securityKeenan").instanceId,
    ]);
    expect(s.state.memory).toBe(0);
  });
});
