import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { type EngineSetup, setupEngine, settle } from "../../engine/testkit/harness.js";
import "./BT10-087.js";
import "../BT5/BT5-087.js";

describe("BT10-087 Taiki Kudo", () => {
  it.each(["P-224", "BT10-087"])(
    "Discord 1556107827456774256: places the revealed Digimon under the played Taiki with %s already in play",
    async (otherTamer) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: otherTamer, as: "otherTamer" }],
            hand: [{ card: "BT10-087", as: "taiki" }],
            deck: [
              { card: "BT21-021", as: "shoutmon" },
              { card: "BT21-083", as: "revealedTaiki" },
              { card: "AD1-006", as: "x7" },
              { card: "AD1-013", as: "shootingStarmon" },
            ],
          },
        },
        { autoSelectCards: true, preferInstanceIds: preferred },
      );
      s.state.memory = 4;
      preferred.push(s.inst("x7").instanceId, s.inst("shootingStarmon").instanceId);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taiki").instanceId })).toEqual({
        ok: true,
      });
      await settle();

      const taiki = s.state.players[0]!.battleArea.find(
        (permanent) => permanent.topCard.instanceId === s.inst("taiki").instanceId,
      )!;
      expect(taiki.stack.map((card) => card.instanceId)).toEqual([s.inst("shootingStarmon").instanceId]);
      expect(s.perm("otherTamer").stack).toHaveLength(0);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("x7").instanceId]);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
        s.inst("shoutmon").instanceId,
        s.inst("revealedTaiki").instanceId,
      ]);
      expect(s.decisions.some(({ req }) => req.kind === "chooseTargets")).toBe(false);
      expect(s.state.memory).toBe(1);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("Discord 1555932180322975924: places the lone AD1-006 under Taiki after adding P-224", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-087", as: "taiki" }],
          deck: [
            { card: "BT21-083", as: "otherTaiki" },
            { card: "P-224", as: "kotone" },
            { card: "AD1-006", as: "x7" },
            "BT8-097",
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 3;
    preferred.push(s.inst("kotone").instanceId);
    // The production player selected Kotone before placing the remaining Digimon.
    const pending = s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taiki").instanceId });
    expect(pending).toEqual({ ok: true });
    await settle();
    const taiki = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("taiki").instanceId)!;
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("kotone").instanceId)).toBe(true);
    expect(taiki.stack.map((c) => c.instanceId)).toContain(s.inst("x7").instanceId);
    expect(s.state.players[0]!.deck.some((c) => c.instanceId === s.inst("x7").instanceId)).toBe(false);
  });

  it("Discord 1555932180322975924: cannot place X7 again after adding that sole qualifying card", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-087", as: "taiki" }],
          deck: [{ card: "AD1-006", as: "x7" }, "BT8-097", "BT1-010", "BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taiki").instanceId })).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("x7").instanceId)).toBe(true);
    expect(
      s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("taiki").instanceId)!.stack,
    ).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  // Product decision (Discord 1557855696114946230, applied to the same reveal shape): the hand
  // pick is free, and the place-under part then uses only the cards that remain. No official
  // ruling covers this exact reveal.
  describe("Discord 1558457266485731358: hand pick with one Xros Heart Digimon revealed", () => {
    async function revealForHand() {
      const s = setupEngine({
        0: {
          hand: [{ card: "BT10-087", as: "taiki" }],
          deck: [
            { card: "BT21-083", as: "revealedTaiki" },
            { card: "P-224", as: "kotone" },
            { card: "AD1-006", as: "x7" },
            { card: "BT8-097", as: "option" },
          ],
        },
      });
      s.state.memory = 3;
      await s.ready();
      const id = (alias: string) => s.inst(alias).instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: id("taiki") })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const handRequest = s.decisions.at(-1)!.req;
      expect(handRequest.options).toMatchObject({
        candidateInstanceIds: [id("revealedTaiki"), id("kotone"), id("x7")],
        min: 1,
        max: 1,
      });
      const respond = (decisionId: string, aliases: string[]) =>
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId,
          response: { kind: "selectCards", instanceIds: aliases.map(id) },
        });
      const taiki = () => s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === id("taiki"));
      return { s, id, handRequest, respond, taiki };
    }

    it("places the only Digimon under Taiki after a Tamer is added", async () => {
      const { s, id, handRequest, respond, taiki } = await revealForHand();
      expect(respond(handRequest.decisionId, ["kotone"])).toEqual({ ok: true });

      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const placeRequest = s.decisions.at(-1)!.req;
      expect(placeRequest.options).toMatchObject({ candidateInstanceIds: [id("x7")], min: 1, max: 1 });
      expect(respond(placeRequest.decisionId, []).ok).toBe(false);
      expect(respond(placeRequest.decisionId, ["x7"])).toEqual({ ok: true });

      await settle(() => s.state.pendingDecision === undefined && taiki()?.stack.length === 1);
      expect(taiki()!.stack.map((card) => card.instanceId)).toEqual([id("x7")]);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([id("kotone")]);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId).sort()).toEqual(
        [id("revealedTaiki"), id("option")].sort(),
      );
    });

    it("adds the only Digimon to hand by player choice and places nothing", async () => {
      const { s, id, handRequest, respond, taiki } = await revealForHand();
      expect(respond(handRequest.decisionId, ["x7"])).toEqual({ ok: true });

      await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.deck.length === 3);
      expect(s.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(1);
      expect(taiki()!.stack).toHaveLength(0);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([id("x7")]);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId).sort()).toEqual(
        [id("revealedTaiki"), id("kotone"), id("option")].sort(),
      );
    });
  });

  it("adds one Xros Heart card and places a different Xros Heart Digimon under itself on play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-087", as: "taiki" }],
          deck: [{ card: "BT10-007", as: "xrosA" }, { card: "BT10-008", as: "xrosB" }, "BT1-010", "BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taiki").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (p) => p.topCard.instanceId === s.inst("taiki").instanceId && p.stack.length === 1,
      ),
    );

    const taiki = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("taiki").instanceId)!;
    const selectedIds = new Set([s.inst("xrosA").instanceId, s.inst("xrosB").instanceId]);
    expect(taiki.stack).toHaveLength(1);
    expect(selectedIds.has(taiki.stack[0]!.instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => selectedIds.has(card.instanceId))).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("names the card it added to hand on the movement event", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-087", as: "taiki" }],
          deck: [{ card: "BT10-007", as: "xrosA" }, { card: "BT10-008", as: "xrosB" }, "BT1-010", "BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taiki").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (p) => p.topCard.instanceId === s.inst("taiki").instanceId && p.stack.length === 1,
      ),
    );

    // The reveal is public, so the opponent has to be able to read which card the
    // controller took from it — their hand itself is redacted per seat.
    const added = s.state.players[0]!.hand.find(
      (card) => card.instanceId === s.inst("xrosA").instanceId || card.instanceId === s.inst("xrosB").instanceId,
    )!;
    const toHand = s.events.find(
      (event) => event.kind === "cardsMoved" && event.to === "hand" && event.instanceIds.includes(added.instanceId),
    );
    expect(toHand).toMatchObject({ cardIds: [added.cardId] });
  });

  it.each(["BT10-089", "BT10-087"])("suspends only itself when DigiXros materials are under %s", async (hostCard) => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-087", as: "taiki" },
          {
            card: hostCard,
            as: "otherTamer",
            under: [
              { card: "BT10-019", as: "greymon" },
              { card: "BT10-021", as: "mailbirdramon" },
            ],
          },
        ],
        hand: [{ card: "BT10-024", as: "metalGreymon" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("metalGreymon").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId],
          expanderPermanentIds: [s.perm("taiki").permanentId],
          underTamerHostPermanentId: s.perm("otherTamer").permanentId,
        },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.cardId === "BT10-024" && permanent.stack.length === 2,
      ),
    );

    const metalGreymon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT10-024")!;
    expect(s.perm("taiki").isSuspended).toBe(true);
    expect(s.perm("otherTamer").isSuspended).toBe(false);
    expect(metalGreymon.stack.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId]),
    );
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.state.memory).toBe(4);
  });

  it("Discord 1556119607822254110: mixes materials under two different Tamers", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-087", as: "taiki" },
          { card: "BT10-089", as: "firstTamer", under: [{ card: "BT10-019", as: "greymon" }] },
          { card: "BT10-090", as: "secondTamer", under: [{ card: "BT10-021", as: "mailbirdramon" }] },
        ],
        hand: [{ card: "BT10-024", as: "metalGreymon" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("metalGreymon").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId],
          expanderPermanentIds: [s.perm("taiki").permanentId],
          underTamerHostPermanentId: s.perm("firstTamer").permanentId,
        },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("taiki").isSuspended).toBe(true);
    expect(s.perm("firstTamer").stack).toHaveLength(0);
    expect(s.perm("secondTamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT10-024")!.stack).toHaveLength(2);
    expect(s.state.memory).toBe(4);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("cannot reuse a suspended Taiki as a DigiXros material expander", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-087", as: "taiki", suspended: true },
          { card: "BT10-089", under: [{ card: "BT10-019", as: "greymon" }] },
        ],
        hand: [{ card: "BT10-024", as: "metalGreymon" }],
      },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("metalGreymon").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("greymon").instanceId],
          expanderPermanentIds: [s.perm("taiki").permanentId],
        },
      }),
    ).toEqual({ ok: false, reason: "invalid-expander" });
  });

  it("plays itself from security without paying its memory cost", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT10-087", as: "securityTaiki", faceUp: true }] },
    });
    s.state.memory = 0;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityTaiki"));
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT10-087"));

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT10-087")).toBe(true);
    expect(s.state.memory).toBe(0);
  });
});

const GREYMON = "BT10-019";
const MAILBIRDRAMON = "BT10-021";
const METALGREYMON = "BT10-024";
const OTHER_TAMER = "BT10-089";
const SKULLKNIGHTMON = "BT7-058";
const DEADLYAXEMON = "BT7-059";
const MIGHTY_AXE_MODE = "BT10-061";
const DARKKNIGHTMON = "BT10-066";
const NON_XROS_DIGIMON = "BT2-070";
const OMNIMON_ZWART = "BT5-087";
const DECK_FILLER = ["BT1-009", "BT1-010", "BT1-012", "BT1-013", "BT1-009", "BT1-010"];

function playMetalGreymonFrom(s: EngineSetup, options: { expander: boolean; underTamerHostAlias?: string }) {
  return s.engine.applyIntent(0, {
    type: "playCard",
    instanceId: s.inst("metalGreymon").instanceId,
    digiXros: {
      materialInstanceIds: [s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId],
      ...(options.expander ? { expanderPermanentIds: [s.perm("taiki").permanentId] } : {}),
      ...(options.underTamerHostAlias !== undefined
        ? { underTamerHostPermanentId: s.perm(options.underTamerHostAlias).permanentId }
        : {}),
    },
  });
}

async function playFromTrashWithOmnimonZwart(trash: string[]) {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          {
            card: "BT10-087",
            as: "taiki",
            under: [
              { card: SKULLKNIGHTMON, as: "skullKnightmon" },
              { card: DEADLYAXEMON, as: "deadlyAxemon" },
            ],
          },
          { card: OMNIMON_ZWART, as: "zwart" },
        ],
        trash: trash.map((card, index) => ({ card, as: `played${index}` })),
        deck: [...DECK_FILLER],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();

  await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("zwart"));
  await settle(() =>
    trash.every((_card, index) =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst(`played${index}`).instanceId,
      ),
    ),
  );

  const taikiInstanceId = s.inst("taiki").instanceId;
  const taikiWasOffered = s.decisions.some(
    ({ req }) => req.kind === "selectCards" && req.options?.candidateInstanceIds?.includes(taikiInstanceId) === true,
  );
  const underTaiki = s.perm("taiki").stack.map((card) => card.instanceId);
  const materialIds = [s.inst("skullKnightmon").instanceId, s.inst("deadlyAxemon").instanceId];
  return { s, taikiWasOffered, underTaiki, materialIds };
}

describe("BT10-087 Taiki Kudo — KB Q&A rulings", () => {
  it("lets a DigiXros use Digimon cards placed under a Tamer, which is not possible without its effect (Q2011)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          {
            card: "BT10-087",
            as: "taiki",
            under: [
              { card: GREYMON, as: "greymon" },
              { card: MAILBIRDRAMON, as: "mailbirdramon" },
            ],
          },
        ],
        hand: [{ card: METALGREYMON, as: "metalGreymon" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(playMetalGreymonFrom(s, { expander: false })).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.perm("taiki").stack).toHaveLength(2);

    expect(playMetalGreymonFrom(s, { expander: true })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.cardId === METALGREYMON && permanent.stack.length === 2,
      ),
    );

    const metalGreymon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.cardId === METALGREYMON,
    )!;
    expect(metalGreymon.stack.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId]),
    );
    expect(s.perm("taiki").isSuspended).toBe(true);
    expect(s.perm("taiki").stack).toHaveLength(0);
  });

  it("also lets a DigiXros use cards placed under a Tamer other than this Tamer (Q2012)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-087", as: "taiki" },
          {
            card: OTHER_TAMER,
            as: "otherTamer",
            under: [
              { card: GREYMON, as: "greymon" },
              { card: MAILBIRDRAMON, as: "mailbirdramon" },
            ],
          },
        ],
        hand: [{ card: METALGREYMON, as: "metalGreymon" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(playMetalGreymonFrom(s, { expander: false, underTamerHostAlias: "otherTamer" })).toEqual({
      ok: false,
      reason: "invalid-material",
    });

    expect(playMetalGreymonFrom(s, { expander: true, underTamerHostAlias: "otherTamer" })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.cardId === METALGREYMON && permanent.stack.length === 2,
      ),
    );

    expect(s.perm("taiki").isSuspended).toBe(true);
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.perm("otherTamer").isSuspended).toBe(false);
  });

  it("does not let a DigiXros use the digivolution cards of a Digimon that digivolved from a Tamer (Q2013)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-087", as: "taiki" },
          {
            card: "BT1-010",
            as: "digivolvedTamer",
            under: [OTHER_TAMER, { card: GREYMON, as: "greymon" }, { card: MAILBIRDRAMON, as: "mailbirdramon" }],
          },
        ],
        hand: [{ card: METALGREYMON, as: "metalGreymon" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(playMetalGreymonFrom(s, { expander: true })).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.perm("taiki").isSuspended).toBe(false);
    expect(s.perm("digivolvedTamer").stack.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId]),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("metalGreymon").instanceId]);
  });

  it("cannot activate when 2 Digimon cards with DigiXros requirements are played at the same time (Q2014)", async () => {
    const single = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE]);
    expect(single.taikiWasOffered).toBe(true);
    expect(single.s.perm("taiki").isSuspended).toBe(true);
    expect(single.underTaiki).toEqual([]);

    const pair = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE, DARKKNIGHTMON]);
    expect(pair.taikiWasOffered).toBe(false);
    expect(pair.s.perm("taiki").isSuspended).toBe(false);
    expect(pair.underTaiki).toEqual(pair.materialIds);
  });

  it("cannot activate when 1 DigiXros Digimon and 1 Digimon without DigiXros requirements are played at the same time (Q2015)", async () => {
    const single = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE]);
    expect(single.taikiWasOffered).toBe(true);
    expect(single.underTaiki).toEqual([]);

    const mixed = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE, NON_XROS_DIGIMON]);
    expect(mixed.taikiWasOffered).toBe(false);
    expect(mixed.s.perm("taiki").isSuspended).toBe(false);
    expect(mixed.underTaiki).toEqual(mixed.materialIds);
  });
});
