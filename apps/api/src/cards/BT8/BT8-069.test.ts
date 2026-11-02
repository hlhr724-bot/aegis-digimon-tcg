import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT8-069.js";
import "./BT8-092.js";

describe("BT8-069 Ouryumon", () => {
  it("scopes the source-placement watcher to effect-driven additions under your Digimon", () => {
    const watcher = compiled.effects.find((effect) => effect.trigger === "YourTurn")?.actions[0];
    expect(watcher).toMatchObject({
      kind: "SubTrigger",
      event: "onAddDigivolutionCards",
      sourceFilter: { byEffect: true },
      triggerFilter: { controllerDefault: "mine", kind: ["Digimon"] },
    });
  });

  it("places an X Antibody card from hand as its bottom source to delete a play-cost-7-or-less Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-013", as: "base" }],
          hand: [
            { card: "BT8-069", as: "evolving" },
            { card: "BT8-060", as: "cost" },
          ],
        },
        1: { battleArea: [{ card: "BT1-015", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT8-069"));
    expect(s.perm("base").stack[0]?.instanceId).toBe(s.inst("cost").instanceId);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("unsuspends an Alphamon host at the end of its attack", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          {
            card: "BT9-111",
            as: "alphamon",
            suspended: true,
            under: ["BT8-069"],
          },
        ],
      },
    });
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("alphamon"));

    expect(s.perm("alphamon").isSuspended).toBe(false);
  });

  it("unsuspends an Alphamon host through the real combat end window", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT9-111", as: "alphamon", under: ["BT8-069"] }],
      },
      1: { security: ["BT1-001"] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("alphamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.security.length === 0 &&
        !(s.engine as unknown as { combat: { isAttacking: boolean } }).combat.isAttacking,
    );

    expect(s.perm("alphamon").isSuspended).toBe(false);
  });

  it("reacts only when one of your effects places the digivolution card, not an opponent's effect", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT8-069", as: "ouryumon" }], hand: [{ card: "BT8-060", as: "placed" }] },
    });
    await s.ready();
    const ouryumon = s.perm("ouryumon");
    const baseDP = ouryumon.baseDP;
    const payload = (byEffectSeat: 0 | 1) => ({
      subjectPermanentId: ouryumon.permanentId,
      addedDigivolutionCardInstanceIds: [s.inst("placed").instanceId],
      byEffectSeat,
    });

    await advance(s.engine).fireSubTrigger("onAddDigivolutionCards", payload(1));
    expect(s.perm("ouryumon").currentDP).toBe(baseDP);

    await advance(s.engine).fireSubTrigger("onAddDigivolutionCards", payload(0));
    await settle(() => s.perm("ouryumon").currentDP === baseDP + 2000);
  });

  it("gains +2000 DP and opponent-effect deletion protection after an effect adds a source", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT8-069", as: "ouryumon" },
            { card: "BT8-092", as: "yuji" },
            { card: "BT8-063", as: "attacker" },
          ],
          hand: [{ card: "BT8-060", as: "placed" }],
        },
        1: { security: ["BT8-034"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const ouryumonId = s.perm("ouryumon").permanentId;
    const baseDP = s.perm("ouryumon").baseDP;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("ouryumon").currentDP === baseDP + 2000);

    s.state.turnSeat = 1;
    await advance(s.engine).verb.deletePermanent([ouryumonId], "byEffect");

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === ouryumonId)).toBe(true);
  });
});
