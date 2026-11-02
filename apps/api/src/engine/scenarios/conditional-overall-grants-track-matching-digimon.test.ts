import "../../cards/index.js";
import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import type { Permanent } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { type EngineSetup, setupEngine, settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

const grantedOnPlayBlitz = "OnPlayBlitzIfHasDigivolutionCard";

function hasGrantedOnPlayBlitz(s: EngineSetup, permanent: Permanent): boolean {
  return observe(s.engine)
    .customEffectGrants(permanent)
    .some((grant) => grant.token === grantedOnPlayBlitz && grant.isActive?.() !== false);
}

function heavyMobileGrants(s: EngineSetup, alias: string): { rush: boolean; onPlayBlitz: boolean } {
  return {
    rush: observe(s.engine).hasKeyword(s.perm(alias), "Rush"),
    onPlayBlitz: hasGrantedOnPlayBlitz(s, s.perm(alias)),
  };
}

async function digivolve(s: EngineSetup, permanentAlias: string, cardAlias: string): Promise<void> {
  s.state.memory = 10;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm(permanentAlias).permanentId,
      instanceId: s.inst(cardAlias).instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm(permanentAlias).topCard?.instanceId === s.inst(cardAlias).instanceId);
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
}

async function play(s: EngineSetup, cardAlias: string): Promise<void> {
  s.state.memory = 10;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst(cardAlias).instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
}

describe("overall grants with conditions affect exactly the Digimon that currently meet them", () => {
  async function resolveHeavyMobileAttack(): Promise<EngineSetup> {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT2-066", as: "original", under: ["BT9-063"] },
            { card: "BT9-063", as: "riser" },
          ],
          hand: [
            { card: "BT9-102", as: "option" },
            { card: "BT9-063", as: "fodder" },
            { card: "BT2-066", as: "entrant" },
            { card: "BT2-066", as: "riserMachine" },
            { card: "BT3-019", as: "originalLevel7" },
            { card: "BT3-019", as: "entrantLevel7" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009"], deck: ["BT1-009", "BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("fodder").instanceId);
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT9-102"));
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("fodder").instanceId);
    return s;
  }

  it("stops affecting an original target once it no longer meets the condition", async () => {
    const s = await resolveHeavyMobileAttack();
    expect(heavyMobileGrants(s, "original")).toEqual({ rush: true, onPlayBlitz: true });

    await digivolve(s, "original", "originalLevel7");

    expect(heavyMobileGrants(s, "original")).toEqual({ rush: false, onPlayBlitz: false });
  });

  it("stops affecting a later entrant once it no longer meets the condition", async () => {
    const s = await resolveHeavyMobileAttack();
    await play(s, "entrant");
    expect(heavyMobileGrants(s, "entrant")).toEqual({ rush: true, onPlayBlitz: true });

    await digivolve(s, "entrant", "entrantLevel7");

    expect(heavyMobileGrants(s, "entrant")).toEqual({ rush: false, onPlayBlitz: false });
  });

  it("starts affecting a Digimon on the field once it meets the condition", async () => {
    const s = await resolveHeavyMobileAttack();
    expect(heavyMobileGrants(s, "riser")).toEqual({ rush: false, onPlayBlitz: false });

    await digivolve(s, "riser", "riserMachine");

    expect(heavyMobileGrants(s, "riser")).toEqual({ rush: true, onPlayBlitz: true });
  });

  it("keeps an unconditional grant on original targets and later entrants after they digivolve", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT12-084", as: "jet", under: ["BT10-060"] },
            { card: "BT9-063", as: "original" },
          ],
          hand: [
            { card: "BT9-063", as: "entrant" },
            { card: "BT15-066", as: "originalLevel6" },
            { card: "BT15-066", as: "entrantLevel6" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009"], deck: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jet"));
    await play(s, "entrant");
    expect(observe(s.engine).hasKeyword(s.perm("original"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("entrant"), "Blocker")).toBe(true);

    await digivolve(s, "original", "originalLevel6");
    await digivolve(s, "entrant", "entrantLevel6");

    expect(observe(s.engine).hasKeyword(s.perm("original"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("entrant"), "Blocker")).toBe(true);
  });
});
