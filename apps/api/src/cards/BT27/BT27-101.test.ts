import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, settle, setupEngine } from "#api/engine/testkit/harness";
import { compiled } from "#api/cards/BT27/BT27-101";
import "#api/cards/index";

const faceDown = (alias: string) => ({ card: "BT1-009", as: alias, faceUp: false });

describe("BT27-101 Silver-Winged Yaksha", () => {
  it("preserves the printed card and complete compiled coverage", () => {
    expect(getCardDefinition("BT27-101")).toMatchObject({
      nameEn: "Silver-Winged Yaksha",
      colors: ["Purple"],
      kinds: ["Option"],
      playCost: 5,
      types: ["DATA SQUAD"],
      rarity: "C",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["BeforePayCost", "Main", "Security"]);
  });

  it("trashes only the bottom face-down Tamer card to reduce the use cost by 2", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT27-096",
              as: "keenan",
              under: [
                { card: "BT1-009", as: "bottom", faceUp: false },
                { card: "BT1-010", as: "higher", faceUp: false },
              ],
            },
          ],
          hand: [{ card: "BT27-101", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    const optionId = s.inst("option").instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === optionId));

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("bottom").instanceId, faceUp: true }),
    );
    expect(s.perm("keenan").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("higher").instanceId]);
  });

  it("may decline the cost reduction and pay the full use cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-096", as: "keenan", under: [faceDown("bottom")] }],
          hand: [{ card: "BT27-101", as: "option" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    const optionId = s.inst("option").instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === optionId));

    expect(s.state.memory).toBe(0);
    expect(s.perm("keenan").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("bottom").instanceId]);
  });

  it("places Peckmon and Crowmon under one Falcomon and digivolves it into Ravemon from the trash for free", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT13-079", as: "falcomon" },
            { card: "BT1-009", as: "otherDigimon" },
          ],
          trash: [
            { card: "BT26-072", as: "peckmon" },
            { card: "BT13-085", as: "crowmon" },
            { card: "BT13-089", as: "ravemon" },
          ],
          hand: [{ card: "BT27-101", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("falcomon").topCard.cardId === "BT13-089");

    expect(s.state.memory).toBe(5);
    expect(s.perm("falcomon").stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("crowmon").instanceId,
      s.inst("peckmon").instanceId,
      s.inst("falcomon").instanceId,
    ]);
    expect(s.perm("otherDigimon").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("option").instanceId]);
    assertNoLoudGap(s);
  });

  it("does not digivolve into a Ravemon in the hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-079", as: "falcomon" }],
          trash: [
            { card: "BT13-082", as: "peckmon" },
            { card: "BT13-085", as: "crowmon" },
          ],
          hand: [
            { card: "BT27-101", as: "option" },
            { card: "BT13-089", as: "handRavemon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT27-101"));

    expect(s.perm("falcomon").topCard.cardId).toBe("BT13-079");
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("handRavemon").instanceId]);
  });

  it("Q6456/Q7173 analog: with only Peckmon available, moves neither card and does not digivolve", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-079", as: "falcomon" }],
          trash: [
            { card: "BT13-082", as: "peckmon" },
            { card: "BT13-089", as: "ravemon" },
          ],
          hand: [{ card: "BT27-101", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT27-101"));

    expect(s.perm("falcomon").topCard.cardId).toBe("BT13-079");
    expect(s.perm("falcomon").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT13-082", "BT13-089"]),
    );
  });

  it("plays a Falcomon from hand from security, then adds itself to the hand", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT27-101", as: "option" }],
          hand: [{ card: "BT26-065", as: "falcomon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("option").instanceId));

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("falcomon").instanceId,
    ]);
    expect(s.state.memory).toBe(0);
  });

  it("plays Keenan Crier from the trash from security, then adds itself to the hand", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT27-101", as: "option" }],
          trash: [{ card: "BT27-096", as: "keenan" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("option").instanceId));

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("keenan").instanceId,
    ]);
  });

  it("offers only its owner's Falcomon or Keenan Crier to the Security play", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT27-101", as: "option" }],
          hand: [
            { card: "BT13-079", as: "falcomon" },
            { card: "BT13-082", as: "peckmon" },
          ],
          trash: [
            { card: "BT27-096", as: "keenan" },
            { card: "BT27-098", as: "otherTamer" },
            { card: "BT13-089", as: "ravemon" },
          ],
        },
        1: { trash: [{ card: "BT26-094", as: "opponentKeenan" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("option").instanceId));

    const offered = s.decisions
      .filter(({ req }) => req.kind === "selectCards")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(offered).toEqual(expect.arrayContaining([s.inst("falcomon").instanceId, s.inst("keenan").instanceId]));
    expect(offered).not.toContain(s.inst("peckmon").instanceId);
    expect(offered).not.toContain(s.inst("otherTamer").instanceId);
    expect(offered).not.toContain(s.inst("ravemon").instanceId);
    expect(offered).not.toContain(s.inst("opponentKeenan").instanceId);
  });

  it("adds itself to the hand when the optional Security play is declined", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT27-101", as: "option" }],
          hand: [{ card: "BT13-079", as: "falcomon" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("option").instanceId));

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("falcomon").instanceId, s.inst("option").instanceId]),
    );
  });
});
