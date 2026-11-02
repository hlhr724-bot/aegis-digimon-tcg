import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { identityVisibility } from "../ST24/tamerStack.testSupport.js";
import { compiled } from "./BT26-100.js";
import "../index.js";

describe("BT26-100 compiled fidelity", () => {
  it("encodes the no-face-up waiver, face-up security grants, security recycle, and two free-play modes", () => {
    const card = compiled;
    expect(getCardDefinition("BT26-100")).toMatchObject({
      nameEn: "Dark Field",
      colors: ["Purple", "Black"],
      kinds: ["Option"],
      playCost: 3,
      types: ["Titan", "TS"],
    });
    expect(card?.coverage).toBe("full");
    expect(card?.residual).toEqual([]);
    expect(card?.effects?.[0]).toMatchObject({
      trigger: "Static",
      actions: [{ kind: "WaiveColorRequirement", condition: { kind: "faceUpSecurityAtMost", value: 0 } }],
    });
    expect(card?.effects?.[1]).toMatchObject({
      trigger: "AllTurns",
      isSecurity: true,
      actions: [
        { kind: "GainKeyword", keyword: { keyword: "Blocker" } },
        { kind: "ModifyDP", amount: 3000 },
      ],
    });
    expect(card?.effects?.[2]?.actions).toMatchObject([
      { kind: "SecurityManipulation", op: "toHand", toTop: false },
      { kind: "SecurityManipulation", op: "placeAsSecurity", toTop: false, faceUp: true },
      { kind: "PlayWithoutCost", from: ["hand", "trash"], payCost: false, optional: true },
    ]);
    expect(card?.effects?.[3]?.actions).toMatchObject([
      { kind: "PlayWithoutCost", from: ["hand", "trash"], payCost: false, optional: true },
    ]);
  });

  it("grants Blocker and +3000 DP to own Titan Digimon while face up in security", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT26-100", as: "darkField", faceUp: true }],
        battleArea: [
          { card: "BT26-074", as: "titan" },
          { card: "BT26-059", as: "plutomon" },
        ],
      },
    });
    await s.ready();

    expect(s.perm("titan").keywords).toContain("Blocker");
    expect(s.perm("titan").currentDP).toBe(10000);
  });

  it("grants Blocker without the DP bonus when no Plutomon or Titamon is present", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT26-100", as: "darkField", faceUp: true }],
        battleArea: [{ card: "BT26-074", as: "titan" }],
      },
    });
    await s.ready();

    expect(s.perm("titan").keywords).toContain("Blocker");
    expect(s.perm("titan").currentDP).toBe(7000);
  });

  it("removes the conditional +3000 DP when the named enabler leaves", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT26-100", as: "darkField", faceUp: true }],
        battleArea: [
          { card: "BT26-074", as: "titan" },
          { card: "BT4-089", as: "plutomon" },
        ],
      },
    });
    await s.ready();
    expect(s.perm("titan").currentDP).toBe(10000);

    await advance(s.engine).verb.deletePermanent([s.perm("plutomon").permanentId], "byEffect");
    await s.engine.recomputeContinuousEffects();

    expect(s.perm("titan").currentDP).toBe(7000);
    expect(s.perm("titan").keywords).toContain("Blocker");
  });

  it("Q7181: a Plutomon without the Titan trait enables the bonus but does not receive it", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT26-100", as: "darkField", faceUp: true }],
        battleArea: [
          { card: "BT26-074", as: "titan" },
          { card: "BT4-089", as: "nonTitanPlutomon" },
        ],
      },
    });
    await s.ready();

    expect(s.perm("titan").keywords).toContain("Blocker");
    expect(s.perm("titan").currentDP).toBe(10000);
    expect(s.perm("nonTitanPlutomon").keywords).not.toContain("Blocker");
    expect(s.perm("nonTitanPlutomon").currentDP).toBe(12000);
  });

  it("uses its Main effect without color, recycles bottom security, and freely plays a level-4 Titan", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT26-100", as: "darkField" },
            { card: "BT24-042", as: "titan" },
          ],
          security: [{ card: "BT1-009", as: "bottomSecurity" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("darkField").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-042"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("bottomSecurity").instanceId)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security[0]).toMatchObject({
      instanceId: s.inst("darkField").instanceId,
      faceUp: true,
    });
  });

  it("Q7174/Q7175: with zero security, still uses without color and places itself face up", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT26-100", as: "darkField" }] } });
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("darkField").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.security.some(({ instanceId }) => instanceId === s.inst("darkField").instanceId),
    );

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security[0]).toMatchObject({
      instanceId: s.inst("darkField").instanceId,
      faceUp: true,
    });
  });

  it("does not waive its color requirement while any security card is face up", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-100", as: "darkField" }],
        security: [{ card: "BT1-009", faceUp: true }],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("darkField").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("Q7177/Q7178 checks a face-up copy and activates its Security free play", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "AD1-001", as: "attacker" }] },
        1: {
          security: [{ card: "BT26-100", as: "darkField", faceUp: true }],
          trash: [{ card: "BT24-042", as: "titan" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const titanId = s.inst("titan").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some(({ topCard }) => topCard.instanceId === titanId));

    expect(s.state.players[1]!.trash.some(({ instanceId }) => instanceId === titanId)).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(0);
  });
});

describe("BT26-100 Dark Field — KB Q&A rulings", () => {
  it("stays revealed to both players as a face-up bottom security card and counts as a security card (Q7176)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT26-100", as: "darkField" }],
          security: [
            { card: "BT1-010", as: "topSecurity" },
            { card: "BT1-009", as: "bottomSecurity" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    const darkFieldId = s.inst("darkField").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: darkFieldId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.some(({ instanceId }) => instanceId === darkFieldId));
    await settle(() => s.state.pendingDecision === undefined);

    const security = s.state.players[0]!.security;
    expect(security).toHaveLength(2);
    expect(security.at(-1)).toMatchObject({ instanceId: darkFieldId, faceUp: true });
    expect(identityVisibility(s, s.inst("darkField"))).toEqual({ owner: true, opponent: true });
    expect(identityVisibility(s, s.inst("topSecurity")).opponent).toBe(false);
  });

  it("turns face-up security cards face down when the security stack is shuffled (Q7179)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT1-087", as: "tk" }],
          security: [
            { card: "BT1-009", as: "selected" },
            { card: "BT26-100", as: "darkField", faceUp: true },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("selected").instanceId);
    s.state.memory = 4;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tk").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("selected").instanceId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security[0]).toMatchObject({ cardId: "BT26-100", faceUp: false });
    expect(identityVisibility(s, s.inst("darkField")).opponent).toBe(false);
  });

  it.each([
    { where: "face up in security", security: [{ card: "BT26-100", faceUp: true }], trash: [], blocker: true },
    { where: "face down in security", security: [{ card: "BT26-100", faceUp: false }], trash: [], blocker: false },
    { where: "in the trash", security: [], trash: ["BT26-100"], blocker: false },
  ])(
    "applies its {Security} effect only while face up in security ($where) (Q7180)",
    async ({ security, trash, blocker }) => {
      const s = setupEngine({
        0: { security, trash, hand: ["BT26-100"], battleArea: [{ card: "BT26-074", as: "titan" }] },
      });
      await s.ready();

      expect(s.perm("titan").keywords.includes("Blocker")).toBe(blocker);
    },
  );
});

describe("Dark Field used from trash", () => {
  it.each([0, 1])("places itself face up after Cerberusmon uses it with %s security cards", async (securityCount) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT26-074", as: "cerberusmon" },
            { card: "BT1-009", as: "cost" },
          ],
          trash: [{ card: "BT26-100", as: "darkField" }],
          security: Array<string>(securityCount).fill("BT1-010"),
          deck: ["BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("cost").instanceId, s.inst("darkField").instanceId);
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cerberusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT26-074"));
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security.at(-1)).toMatchObject({
      instanceId: s.inst("darkField").instanceId,
      faceUp: true,
    });
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("darkField").instanceId);
  });
});

describe("Dark Field after a Kongou security check", () => {
  it("cannot place itself into empty security while Kongou prohibits security additions", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT26-074", as: "cerberusmon" },
            { card: "BT1-009", as: "cost" },
          ],
          trash: [{ card: "BT26-100", as: "darkField" }],
          deck: ["BT1-011"],
        },
        1: { security: [{ card: "BT9-103", as: "kongou" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("kongou"));
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cerberusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT26-074"));
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("darkField").instanceId);
    expect(s.state.players[0]!.resolvingOption).toBeUndefined();
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "effectResolved", sourceCardId: "BT26-100" }));
  });
});
