import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./P-237.js";
import "../EX11/EX11-029.js";
import "../EX11/EX11-027.js";
import "../EX11/EX11-070.js";

describe("P-237 Unique Emblem: Machina's Ascension", () => {
  it("requires Maquinamon in text and plays Maquinamon or Unchained", () => {
    const effects = runtimeCompiledCard("P-237")!.effects;
    expect(effects).toContainEqual(
      expect.objectContaining({
        trigger: "Static",
        actions: [
          expect.objectContaining({
            kind: "WaiveColorRequirement",
            condition: expect.objectContaining({ kind: "youHave" }),
          }),
        ],
      }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({
        trigger: "Main",
        actions: [
          expect.objectContaining({ kind: "PlayWithoutCost", from: ["hand", "trash"], optional: true }),
          { kind: "PlaceInBattleAreaSelf" },
        ],
      }),
    );
  });

  it("opens its ＜Delay＞ window when an Unchained is played and digivolves from hand", () => {
    const effects = runtimeCompiledCard("P-237")!.effects;
    // "[All Turns] When any of your [Unchained] are played, ＜Delay＞ ・digivolve ..." is ONE
    // clause: registration folds the compiled grant/activate pair into the printed triggered
    // window, so the play itself offers the ＜Delay＞ activation (KB P-237: the [All Turns]
    // effect "triggers").
    expect(effects).toContainEqual(
      expect.objectContaining({
        trigger: "AllTurns",
        keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
        actions: [
          expect.objectContaining({
            kind: "SubTrigger",
            event: "whenPlayed",
            actions: [expect.objectContaining({ kind: "Digivolve", from: ["hand"], payCost: false, optional: true })],
          }),
        ],
      }),
    );
    expect(
      effects.some(
        (effect) => effect.trigger === "Main" && (effect.keywords ?? []).some((kw) => kw.keyword === "Delay"),
      ),
    ).toBe(false);
  });

  it("activates its Main effects from Security", () => {
    expect(runtimeCompiledCard("P-237")!.effects).toContainEqual(
      expect.objectContaining({ trigger: "Security", isSecurity: true, actions: [{ kind: "ActivateMain" }] }),
    );
  });
});
describe("P-237 engine behavior", () => {
  it("plays a Maquinamon from hand without cost and places itself", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "P-237", as: "emblem" },
            { card: "EX11-027", as: "maquinamon" },
          ],
          battleArea: ["BT1-009", "BT1-037", "BT1-063", "BT1-088", "P-016", "ST6-03", "BT1-084"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    const maquinamonId = s.inst("maquinamon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("emblem").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const playDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: playDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX11-027")).toEqual([]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === maquinamonId)).toBe(
      true,
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "P-237")).toBe(true);
  });

  it("resolves its Security Main effect and plays Maquinamon before placing itself", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: "P-237", as: "emblem" }], hand: [{ card: "EX11-027", as: "maquinamon" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("emblem"));
    await settle();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("maquinamon").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("emblem").instanceId)).toBe(true);
  });

  it("offers the ＜Delay＞ window on a real Unchained play and digivolves without paying the qualifying card's cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-237", as: "emblem" },
            { card: "BT1-064", as: "host" },
          ],
          hand: [
            { card: "EX11-070", as: "unchained" },
            { card: "EX11-029", as: "maquinamon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    s.perm("emblem").placedByEffect = true;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("unchained").instanceId })).toEqual({
      ok: true,
    });
    // The ＜Delay＞ window opens at the play itself; the auto-responder accepts it, pays the
    // §16-17-1 activation cost (trashing this card) and resolves the digivolution.
    await settle(() => s.perm("host").topCard.instanceId === s.inst("maquinamon").instanceId);
    expect(s.perm("host").topCard.instanceId).toBe(s.inst("maquinamon").instanceId);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "P-237")).toBe(true);
  });
});

describe("P-237 Unique Emblem: Machina's Ascension — KB Q&A rulings", () => {
  it.each([
    ["an effect text naming [Maquinamon]", "EX11-070", true],
    ["no [Maquinamon] text", "BT1-085", false],
  ] as const)("meets its Use Req. with a card that has %s (Q6524)", async (_label, fieldCard, usable) => {
    const s = setupEngine({
      0: { hand: [{ card: "P-237", as: "emblem" }], battleArea: [fieldCard] },
    });
    s.state.memory = 10;
    await s.ready();
    const result = s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("emblem").instanceId });
    expect(result.ok).toBe(usable);
    if (!usable) expect(result).toMatchObject({ reason: "color-requirement-unmet" });
  });

  it("opens its <Delay> when Unchained's inherited effect plays Unchained from digivolution cards (Q6523)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-237", as: "emblem" },
            { card: "EX11-027", as: "host", under: [{ card: "EX11-070", as: "unchained" }] },
          ],
          hand: [{ card: "EX11-029", as: "turbomon" }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: { deck: ["BT1-012", "BT1-013", "BT1-014"], security: ["BT1-015"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.perm("emblem").placedByEffect = true;
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("unchained").instanceId)).toBe(
      true,
    );
    expect(s.perm("host").topCard.instanceId).toBe(s.inst("turbomon").instanceId);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "P-237")).toBe(true);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
