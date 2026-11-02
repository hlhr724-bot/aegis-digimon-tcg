import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Crowmon discard, Tamer payment and inherited revival", () => {
  it("highlights the discard, Tamer payment and free play as separate printed parts", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-081", as: "crowmon" },
            {
              card: "BT1-085",
              under: [
                { card: "BT1-009", faceUp: false },
                { card: "BT1-011", faceUp: false },
              ],
            },
          ],
          hand: ["BT26-094"],
        },
        1: { hand: Array<string>(6).fill("BT1-009") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("crowmon"));
    const discard =
      "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] If your opponent's hand has 6 or more cards, they trash 1 card in their hand.";
    const payment = "Then, by trashing 2 bottom face-down cards from under any of your Tamers,";
    const play =
      "you may play or use 1 [DATA SQUAD] trait card with a play or use cost of 5 or less from your hand without paying the cost.";
    const options = s.decisions.filter((d) => d.req.sourceCardId === "BT27-081").map((d) => d.req.options);
    expect([...new Set(options.map((option) => option?.effectTextEmphasis))]).toEqual([discard, payment, play]);
    for (const emphasis of [discard, payment, play]) {
      expect(options).toContainEqual(
        expect.objectContaining({
          timing: "OnPlay",
          effectText: `${discard} ${payment} ${play}`,
          effectTextEmphasis: emphasis,
        }),
      );
    }
  });

  it.each([5, 6, 7])("checks the six-card hand boundary at %i independently of the Tamer cost", async (count) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-081", as: "crowmon" }] }, 1: { hand: Array<string>(count).fill("BT1-009") } },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("crowmon"));
    expect(s.state.players[1]!.hand).toHaveLength(count - Number(count >= 6));
    expect(s.decisions.filter((d) => d.req.kind === "selectCards").every((d) => d.seat === 1)).toBe(true);
  });

  it.each(["BT27-074", "BT27-078", "BT26-094", "BT27-101"])(
    "pays two bottom face-down cards across Tamers to play or use %s even below six opponent cards",
    async (card) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT27-081", as: "crowmon" },
              {
                card: "BT1-085",
                as: "first",
                under: [
                  { card: "BT1-009", as: "bottom", faceUp: false },
                  { card: "BT1-011", as: "top", faceUp: true },
                ],
              },
              { card: "BT1-085", as: "second", under: [{ card: "BT1-012", as: "otherBottom", faceUp: false }] },
            ],
            hand: [{ card, as: "reward" }],
            deck: ["BT1-009", "BT1-009", "BT1-009"],
          },
          1: { hand: ["BT1-009"] },
        },
        { autoSelectCards: true, autoAcceptOptional: true, autoChooseOption: true },
      );
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("crowmon"));
      expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("bottom").instanceId);
      expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("otherBottom").instanceId);
      expect(s.perm("first").stack.map((c) => c.instanceId)).toEqual([s.inst("top").instanceId]);
      expect(s.perm("second").stack).toHaveLength(0);
      expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("reward").instanceId)).toBe(false);
      expect(s.state.memory).toBe(0);
      expect(s.state.players[1]!.hand).toHaveLength(1);
    },
  );

  it.each(["BT27-081", "BT1-009"])("excludes an expensive or non-DATA SQUAD hand card %s", async (card) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-081", as: "crowmon" },
            {
              card: "BT1-085",
              under: [
                { card: "BT1-009", faceUp: false },
                { card: "BT1-011", faceUp: false },
              ],
            },
          ],
          hand: [card],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("crowmon"));
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toEqual([card]);
  });

  it.each(["insufficient", "face up", "declined"])("keeps the reward in hand with a %s payment", async (reason) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-081", as: "crowmon" },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-009", faceUp: false },
                ...(reason === "insufficient" ? [] : [{ card: "BT1-011", faceUp: reason === "face up" }]),
              ],
            },
          ],
          hand: ["BT26-094"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: reason !== "declined", autoDeclineOptional: reason === "declined" },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("crowmon"));
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.perm("tamer").stack).toHaveLength(reason === "insufficient" ? 1 : 2);
  });

  it("shares one use across play, digivolution and attack timings", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-081", as: "crowmon" }] }, 1: { hand: Array<string>(8).fill("BT1-009") } },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    for (const timing of [EffectTiming.OnPlay, EffectTiming.WhenDigivolving, EffectTiming.OnUseAttack]) {
      await advance(s.engine).fire(timing, s.perm("crowmon"));
    }
    expect(s.state.players[1]!.hand).toHaveLength(7);
  });

  it.each(["BT27-074", "BT27-078", "BT26-094", "BT1-012", "BT1-014", "EX7-031", "BT15-014"])(
    "revives a cost-five-or-lower Avian, Bird or DATA SQUAD card %s",
    async (card) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT1-083", as: "host", under: ["BT27-081"] }],
            trash: [card, "BT1-009", "BT27-081"],
          },
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );
      await s.ready();
      await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
      expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain(card);
      expect(s.state.players[0]!.trash.some((c) => c.cardId === "BT1-009")).toBe(true);
      expect(s.state.players[0]!.trash.filter((c) => c.cardId === "BT27-081")).toHaveLength(2);
    },
  );

  it("can refuse inherited revival", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT1-083", as: "host", under: ["BT27-081"] }], trash: ["BT27-074"] } },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("evolves the DATA SQUAD line with the correct cards and costs", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-006", as: "line" },
          hand: [
            { card: "BT27-074", as: "rookie" },
            { card: "BT27-078", as: "champion" },
            { card: "BT27-081", as: "ultimate" },
          ],
          deck: Array<string>(5).fill("BT1-009"),
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    for (const [alias, card, memory] of [
      ["rookie", "BT27-074", 10],
      ["champion", "BT27-078", 8],
      ["ultimate", "BT27-081", 5],
    ] as const) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("line").permanentId,
          instanceId: s.inst(alias).instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("line").topCard.cardId === card && !s.state.pendingDecision);
      expect(s.state.memory).toBe(memory);
    }
    expect(s.perm("line").stack.map((c) => c.cardId)).toEqual(["BT13-006", "BT27-074", "BT27-078"]);
  });
});

it.each([
  ["BT25-002", "BT27-074", true, 0],
  ["BT1-001", "BT27-074", false, 0],
  ["BT25-021", "BT27-078", true, 2],
  ["BT1-009", "BT27-078", false, 2],
  ["BT25-023", "BT27-081", true, 3],
  ["BT1-017", "BT27-081", false, 3],
] as const)("checks alternate DATA SQUAD evolution from %s into %s", async (base, card, allowed, cost) => {
  const s = setupEngine(
    { 0: { breeding: { card: base, as: "base" }, hand: [{ card, as: "evolution" }], deck: ["BT1-009"] } },
    { autoDeclineOptional: true },
  );
  await s.ready();
  s.state.memory = 10;
  const result = s.engine.applyIntent(0, {
    type: "digivolve",
    permanentId: s.perm("base").permanentId,
    instanceId: s.inst("evolution").instanceId,
  });
  expect(result.ok).toBe(allowed);
  if (allowed) {
    await settle(() => s.perm("base").topCard.cardId === card && !s.state.pendingDecision);
  }
  expect(s.state.memory).toBe(10 - (allowed ? cost : 0));
});
