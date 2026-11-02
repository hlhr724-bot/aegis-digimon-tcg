import { EffectTiming, digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { effectiveStaticTraits } from "@aegis/shared/cards/effectiveTraits";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT27-025.js";
import "../index.js";

type Restrictions = { continuous: { hasRestriction: (id: string, kind: string) => boolean } };

describe("BT27-025 Gawappamon", () => {
  it("encodes the DATA SQUAD alternate digivolution, Aquatic rule trait, and inherited Evade", () => {
    expect(digivolutionRequirementsFor("BT27-025")).toContainEqual({
      level: 3,
      traits: ["DATA SQUAD"],
      cost: 2,
      isAlternate: true,
    });
    expect(compiled.effects.find((effect) => effect.trigger === "Rule")?.actions).toEqual([
      expect.objectContaining({ kind: "GrantStatic", grant: "trait", tokens: ["Aquatic"] }),
    ]);
    expect(compiled.effects.find((effect) => effect.isInherited)?.keywords).toEqual([
      expect.objectContaining({ keyword: "Evade" }),
    ]);
    expect(compiled.effects.find((effect) => effect.trigger === "WhenDigivolving")?.actions).toEqual([
      expect.objectContaining({ kind: "Restrict", restriction: "beDeletedInBattle" }),
    ]);
  });

  it("protects the chosen Digimon without Blocker on a normal play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT27-025", as: "gawappamon" }],
          battleArea: [{ card: "BT1-080", as: "protected" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gawappamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("protected").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    const continuous = (s.engine as unknown as Restrictions).continuous;
    expect(continuous.hasRestriction(s.perm("protected").permanentId, "beDeletedInBattle")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("protected"), "Blocker")).toBe(false);
    expect(s.state.memory).toBe(0);
  });

  it("gives Blocker to the same protected Digimon when played by an effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-025", as: "gawappamon" },
            { card: "BT1-080", as: "protected" },
            { card: "BT1-009", as: "bystander" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();

    const fired = advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("gawappamon"), {
      enteredByEffect: 0,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("protected").permanentId] },
      }),
    ).toEqual({ ok: true });
    await fired;
    await settle(() => s.state.pendingDecision === undefined);

    const continuous = (s.engine as unknown as Restrictions).continuous;
    expect(continuous.hasRestriction(s.perm("protected").permanentId, "beDeletedInBattle")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("protected"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("bystander"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("gawappamon"), "Blocker")).toBe(false);
  });

  it.each([
    ["normal blue requirement", "BT1-030", false],
    ["alternate DATA SQUAD requirement", "BT26-036", true],
  ])("digivolves for 2 through the %s and protects without Blocker", async (_label, baseCard, useAlternateCost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: baseCard, as: "base" }],
          hand: [{ card: "BT27-025", as: "gawappamon" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("gawappamon").instanceId,
        ...(useAlternateCost ? { useAlternateCost: true, alternateRequirementIndex: 0 } : {}),
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("gawappamon").instanceId);
    await settle(() => s.state.pendingDecision === undefined);

    const continuous = (s.engine as unknown as Restrictions).continuous;
    expect(continuous.hasRestriction(s.perm("base").permanentId, "beDeletedInBattle")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blocker")).toBe(false);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([s.inst("base").instanceId]);
    expect(s.state.memory).toBe(0);
  });

  it("rejects digivolving from a non-blue, non-DATA SQUAD level 3", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "base" }], hand: [{ card: "BT27-025", as: "gawappamon" }] },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("gawappamon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("base").instanceId);
    expect(s.state.memory).toBe(4);
  });

  it("keeps the protected Digimon through the opponent's attack and drops the protection afterwards", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT27-025", as: "gawappamon" }],
          battleArea: [{ card: "BT1-009", as: "protected", dp: 1000, suspended: true }],
          deck: ["BT1-013", "BT1-014", "BT1-015"],
        },
        1: {
          battleArea: [{ card: "BT1-080", as: "attacker", dp: 15000 }],
          deck: ["BT1-013", "BT1-014", "BT1-015"],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gawappamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("protected").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(
      (s.engine as unknown as Restrictions).continuous.hasRestriction(
        s.perm("protected").permanentId,
        "beDeletedInBattle",
      ),
    ).toBe(true);
    s.state.turnSeat = 1;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("protected").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    const protectedId = s.perm("protected").permanentId;
    expect(s.events.some((event) => event.kind === "combatResolved")).toBe(true);
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === protectedId)).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    const continuous = (s.engine as unknown as Restrictions).continuous;

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(continuous.hasRestriction(protectedId, "beDeletedInBattle")).toBe(false);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("grants inherited Evade to the Digimon above it", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-080", as: "host", under: ["BT27-025"] }] } });
    const hostId = s.perm("host").permanentId;
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("host"), "Evade")).toBe(true);
    const deletion = advance(s.engine).verb.deletePermanent([hostId], "byEffect");
    await settle(() => s.events.some((event) => event.kind === "evadePrompt"));
    expect(s.engine.applyIntent(0, { type: "respondEvade", permanentId: hostId, accept: true })).toEqual({ ok: true });
    expect(await deletion).toBe(0);

    expect(s.state.players[0]!.battleArea).toContain(s.perm("host"));
    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("has the Aquatic trait from its rule in every zone", () => {
    expect(effectiveStaticTraits(getCardDefinition("BT27-025")!)).toEqual(
      expect.arrayContaining(["DATA SQUAD", "Aquatic"]),
    );
  });
});
