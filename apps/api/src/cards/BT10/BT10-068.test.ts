import { EffectDuration, EffectTiming, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../BT1/BT1-106.js";
import "../BT13/BT13-019.js";
import "../BT13/BT13-105.js";
import "./BT10-068.js";

describe("BT10-068 Gankoomon (X Antibody)", () => {
  it("plays Sistermon, gives all own Digimon +2000 DP, and protects them from bounce and DP reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-067", as: "base" }],
          hand: [
            { card: "BT10-068", as: "evolving" },
            { card: "BT6-082", as: "sister" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("base"), "dpImmune"));
    expect(s.perm("base").currentDP).toBe(14000);
    expect(JSON.parse(s.state.players[0]!.fieldEffectsJson)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dp",
          sourceCardId: "BT10-068",
          effectText: "All of your Digimon get +2000 DP.",
        }),
        expect.objectContaining({
          kind: "restriction",
          value: "dpImmune",
          sourceCardId: "BT10-068",
          effectText: "Your opponent's effects can't return any of your Digimon to hands or decks or reduce their DP.",
          byOpponentEffectsOnly: true,
        }),
        expect.objectContaining({
          kind: "restriction",
          value: "beReturned",
          sourceCardId: "BT10-068",
          effectText: "Your opponent's effects can't return any of your Digimon to hands or decks or reduce their DP.",
          byOpponentEffectsOnly: true,
        }),
      ]),
    );
    // CR 15-11-2-2: a Digimon that enters afterwards is affected too.
    const lateEntrant = s.putOnBoard(0, "BT1-010");
    await advance(s.engine).recompute();
    expect(lateEntrant.currentDP - lateEntrant.baseDP).toBe(s.perm("base").currentDP - s.perm("base").baseDP);
    expect(observe(s.engine).isRestricted(s.perm("base"), "dpImmune")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("base"), "beReturned")).toBe(true);
    expect(observe(s.engine).isRestricted(lateEntrant, "dpImmune")).toBe(true);
    expect(observe(s.engine).isRestricted(lateEntrant, "beReturned")).toBe(true);
  });

  it("gives later-played Digimon +2000 DP and immunity to opposing DP reduction and bounce (Discord 1555352172206493706)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-067", as: "base" }],
          hand: [
            { card: "BT10-068", as: "evolving" },
            { card: "BT6-082", as: "sister" },
            { card: "BT1-009", as: "laterAlly" },
          ],
        },
        1: {
          hand: [
            { card: "BT1-106", as: "reduction" },
            { card: "BT13-105", as: "bounce" },
          ],
          battleArea: [
            { card: "BT1-027", as: "opponentBlue" },
            { card: "BT1-045", as: "opponentYellow" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("laterAlly").instanceId);
    s.state.memory = 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("base"), "dpImmune"));

    await advance(s.engine).verb.playInstances([s.inst("laterAlly").instanceId]);
    const laterBaseDP = s.perm("laterAlly").baseDP;
    expect(s.perm("laterAlly").currentDP).toBe(laterBaseDP + 2000);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("laterAlly"), "dpImmune", "Option")).toBe(true);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("laterAlly"), "beReturned", "Option")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    s.state.phase = Phase.Main;
    const allyIds = [s.perm("base"), s.perm("laterAlly")].map(({ permanentId }) => permanentId);
    for (const { instanceId } of [s.inst("reduction"), s.inst("bounce")]) {
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId })).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === instanceId));
    }

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(
      expect.arrayContaining(allyIds),
    );
    expect(s.perm("laterAlly").currentDP).toBe(laterBaseDP + 2000);
    expect(s.perm("base").currentDP).toBe(14000);
  });

  it("does not treat Gankoomon (X Antibody) as the exact Gankoomon source", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT10-068", as: "gankooX", under: ["BT10-068"] }] } });
    const printedDP = s.perm("gankooX").baseDP;

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("gankooX"));

    expect(s.perm("gankooX").currentDP).toBe(printedDP);
    expect(observe(s.engine).isRestricted(s.perm("gankooX"), "dpImmune")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("gankooX"), "beReturned")).toBe(false);
  });

  it("restores a previously reduced Digimon before applying the +2000 DP bonus (Q1990)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-067", as: "base" }],
          hand: [
            { card: "BT10-068", as: "evolving" },
            { card: "BT6-082", as: "sister" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 1;
    advance(s.engine).verb.enterEffectResolution(1);
    await advance(s.engine).verb.modifyDP(s.perm("base").permanentId, -3000, EffectDuration.Permanent);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("base").currentDP).toBe(9000);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("base"), "dpImmune"));

    expect(s.perm("base").currentDP).toBe(14000);
  });
});

describe("BT10-068 Gankoomon (X Antibody) — KB Q&A rulings", () => {
  it("is playable by [BT13-019 Gankoomon] from breeding-area sources, as are the X Antibody Omnimon, but a plain [Gankoomon] is not (Q2277)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT13-019", as: "playedGankoomon" }],
          breeding: {
            card: "BT13-007",
            as: "breedingTop",
            under: [
              { card: "BT13-019", as: "plainGankoomon" },
              { card: "BT5-111", as: "omnimonXAntibody" },
              { card: "BT10-086", as: "omnimonWithXAntibody" },
              { card: "BT10-068", as: "gankoomonX" },
            ],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    const gankoomonXId = s.inst("gankoomonX").instanceId;
    preferred.push(gankoomonXId);
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("playedGankoomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === gankoomonXId));

    const playChoice = s.decisions.find(({ req }) => req.options?.candidateInstanceIds?.includes(gankoomonXId));
    expect(playChoice).toBeDefined();
    const candidates = playChoice!.req.options!.candidateInstanceIds!;
    expect(candidates).toEqual(
      expect.arrayContaining([
        gankoomonXId,
        s.inst("omnimonXAntibody").instanceId,
        s.inst("omnimonWithXAntibody").instanceId,
      ]),
    );
    expect(candidates).not.toContain(s.inst("plainGankoomon").instanceId);
    expect(s.perm("breedingTop").stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("plainGankoomon").instanceId,
      s.inst("omnimonXAntibody").instanceId,
      s.inst("omnimonWithXAntibody").instanceId,
    ]);
  });
});
