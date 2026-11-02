import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("KnightChessmon discounted attack play", () => {
  it.each([true, false])("plays a Chessmon for two less, accepted=%s", async (accept) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-039", as: "knight" }], hand: ["BT27-036"] } },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    s.state.memory = 10;
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("knight"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.length).toBe(accept ? 2 : 1);
    expect(s.state.memory).toBe(accept ? 9 : 10);
    expect([...s.perm("knight").keywords]).toContain("Barrier");
  });
  it("does not play a DATA SQUAD card without Chessmon in its name", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-039", as: "knight" }], hand: ["BT27-074"] } },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("knight"));
    expect(s.state.players[0]!.battleArea.length).toBe(1);
    expect(s.state.memory).toBe(10);
  });
  it("grants a separate once-per-turn reduction from each inherited source", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-041", under: ["BT27-004", "BT27-036", "BT27-039"], as: "host" }] },
        1: { battleArea: [{ card: "BT1-009", dp: 12000, as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.perm("target").currentDP).toBe(8000);
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.perm("target").currentDP).toBe(8000);
  });
  it("digivolves from a plain Black level 3 Digimon through its Black cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-052", as: "host" }],
          hand: [{ card: "BT27-039", as: "card" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-039" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(8);
  });
  it("prompts with its own When Attacking clause", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-039", as: "knight" }], hand: ["BT27-036"] } },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("knight"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-039")
        .map(({ req }) => [req.options?.effectText, req.options?.effectTextEmphasis]),
    ).toEqual([
      [
        "[When Attacking] [Once Per Turn] You may play 1 Digimon card with [Chessmon] in its name from your hand with the cost reduced by 2.",
        undefined,
      ],
    ]);
  });
});
