import { describe, expect, it, afterEach } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { setupEngine } from "./testkit/harness.js";
import { advance } from "./testkit/advance.js";
import { onPlay } from "./effects/builders.js";
import { registerCard, unregisterCard } from "./effects/registry.js";
import type { EffectModule } from "./effects/EffectModule.js";
import type { EffectContext } from "./effects/EffectContext.js";
import "../cards/index.js";

const HOST_CARD = "BT2-057";
let restoreHostModule: EffectModule | undefined;
let hostModuleOverridden = false;

afterEach(() => {
  if (hostModuleOverridden) {
    unregisterCard(HOST_CARD);
    if (restoreHostModule !== undefined) registerCard(restoreHostModule);
  }
  restoreHostModule = undefined;
  hostModuleOverridden = false;
});

async function runDeferredSourceMove(
  move: (ctx: EffectContext, hostId: string, sourceId: string, otherHostId: string) => Promise<void>,
  bindDiscardedSelf = false,
): Promise<{
  fired: number;
  sourceId: string;
  hostId: string;
  sourceInHand: boolean;
  sourceInTrash: boolean;
  sourceOnHost: boolean;
  sourceOnOtherHost: boolean;
  hostInBattleArea: boolean;
  hostInBreeding: boolean;
}> {
  restoreHostModule = unregisterCard(HOST_CARD);
  hostModuleOverridden = true;
  const s = setupEngine({
    1: {
      battleArea: [
        { card: HOST_CARD, as: "host", under: [{ card: "EX8-047", as: "discarded" }] },
        { card: HOST_CARD, as: "otherHost" },
      ],
    },
  });
  const host = s.perm("host");
  const otherHost = s.perm("otherHost");
  const discarded = s.inst("discarded");
  let fired = 0;
  advance(s.engine).ledgers.subTriggers.subscribe({
    event: "onDigivolutionCardsDiscardedBatch",
    ...(bindDiscardedSelf ? { watchesSelf: true, isInheritedSource: true } : { sourcePermanentId: host.permanentId }),
    sourceInstanceId: discarded.instanceId,
    once: false,
    matches: (ctx) => (ctx.trigger.trashedDigivolutionInstanceIds ?? []).includes(ctx.source.instanceId),
    run: async () => {
      fired += 1;
    },
    description: "test: deferred discarded-source lifecycle",
  });
  registerCard({
    cardId: HOST_CARD,
    effectsForTiming: (timing, source) =>
      timing === EffectTiming.OnPlay
        ? [
            onPlay({
              source,
              effectKey: "test/deferred-discarded-source-lifecycle",
              description: "test: move discarded source before its watcher resolves",
              resolve: async (ctx) => {
                const hostId = ctx.source.permanent()?.permanentId;
                if (hostId === undefined) throw new Error("test host disappeared before On Play");
                await ctx.fx.trashDigivolutionCards(hostId, [discarded.instanceId]);
                await move(ctx, hostId, discarded.instanceId, otherHost.permanentId);
              },
            }),
          ]
        : [],
  });
  await advance(s.engine).fire(EffectTiming.OnPlay, host);
  return {
    fired,
    sourceId: discarded.instanceId,
    hostId: host.permanentId,
    sourceInHand: s.state.players.some((player) =>
      player.hand.some((card) => card.instanceId === discarded.instanceId),
    ),
    sourceInTrash: s.state.players.some((player) =>
      player.trash.some((card) => card.instanceId === discarded.instanceId),
    ),
    sourceOnHost: host.stack.some((card) => card.instanceId === discarded.instanceId),
    sourceOnOtherHost: otherHost.stack.some((card) => card.instanceId === discarded.instanceId),
    hostInBattleArea: s.state.players.some((player) =>
      player.battleArea.some((perm) => perm.permanentId === host.permanentId),
    ),
    hostInBreeding: s.state.players.some((player) => player.breeding?.permanentId === host.permanentId),
  };
}

describe("discarded stack-source SubTrigger context", () => {
  it("keeps the exact discarded source while its live host remains eligible", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT2-057", as: "target" }] },
      1: { battleArea: [{ card: "BT2-057", as: "host", under: [{ card: "EX8-047", as: "discarded" }] }] },
    });
    const host = s.perm("host");
    const discarded = s.inst("discarded");
    const target = s.perm("target");
    let fires = 0;
    let observedSource: string | undefined;
    let observedHost: string | undefined;
    let observedController: number | undefined;

    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "onDigivolutionCardsDiscardedBatch",
      sourcePermanentId: host.permanentId,
      sourceInstanceId: discarded.instanceId,
      once: false,
      matches: (ctx) => (ctx.trigger.trashedDigivolutionInstanceIds ?? []).includes(ctx.source.instanceId),
      run: async (ctx) => {
        fires += 1;
        observedSource = ctx.source.instanceId;
        observedHost = ctx.trigger.subjectPermanentId;
        observedController = ctx.source.ownerSeat;
      },
      description: "test: preserve discarded stack source context",
    });

    await advance(s.engine).verb.trashDigivolutionCards(host.permanentId, [discarded.instanceId]);

    expect(fires).toBe(1);
    expect(observedSource).toBe(discarded.instanceId);
    expect(observedHost).toBe(host.permanentId);
    expect(observedController).toBe(1);
    expect(target.topCard).toBeDefined();
  });

  it("rejects a payload naming a different discarded source", async () => {
    const s = setupEngine({
      1: {
        battleArea: [
          {
            card: "BT2-057",
            as: "host",
            under: [
              { card: "EX8-005", as: "other" },
              { card: "EX8-047", as: "watched" },
            ],
          },
        ],
      },
    });
    const host = s.perm("host");
    const watched = s.inst("watched");
    const other = s.inst("other");
    let fires = 0;
    await advance(s.engine).verb.trashDigivolutionCards(host.permanentId, [watched.instanceId]);
    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "onDigivolutionCardsDiscardedBatch",
      sourcePermanentId: host.permanentId,
      sourceInstanceId: watched.instanceId,
      once: false,
      run: async () => {
        fires += 1;
      },
      description: "test: reject mismatched discarded source payload",
    });
    await advance(s.engine).fireSubTrigger("onDigivolutionCardsDiscardedBatch", {
      subjectPermanentId: host.permanentId,
      trashedDigivolutionInstanceIds: [other.instanceId],
    });

    expect(fires).toBe(0);
  });

  it("does not activate after the permanent host has left play", async () => {
    const s = setupEngine({
      1: {
        battleArea: [{ card: "BT2-057", as: "host", under: [{ card: "EX8-047", as: "discarded" }] }],
      },
    });
    const host = s.perm("host");
    const discarded = s.inst("discarded");
    let fires = 0;
    advance(s.engine).ledgers.subTriggers.subscribe({
      event: "onDigivolutionCardsDiscardedBatch",
      sourcePermanentId: host.permanentId,
      sourceInstanceId: discarded.instanceId,
      once: false,
      run: async () => {
        fires += 1;
      },
      description: "test: removed host cannot activate discarded-source watcher",
    });

    await advance(s.engine).verb.deletePermanent([host.permanentId]);
    await advance(s.engine).fireSubTrigger("onDigivolutionCardsDiscardedBatch", {
      subjectPermanentId: host.permanentId,
      trashedDigivolutionInstanceIds: [discarded.instanceId],
    });

    expect(fires).toBe(0);
  });

  it("does not activate when the discarded source moves from trash to hand before deferred resolution", async () => {
    const result = await runDeferredSourceMove(async (ctx, _hostId, sourceId) => {
      await ctx.fx.returnToHand([sourceId]);
    });
    expect(result.fired).toBe(0);
    expect(result.sourceInHand).toBe(true);
    expect(result.sourceInTrash).toBe(false);
  });

  it("does not activate when the discarded source is reattached before deferred resolution", async () => {
    const result = await runDeferredSourceMove(async (ctx, _hostId, sourceId, otherHostId) => {
      await ctx.fx.placeUnder(otherHostId, [sourceId]);
    });
    expect(result.fired).toBe(0);
    expect(result.sourceOnHost).toBe(false);
    expect(result.sourceOnOtherHost).toBe(true);
    expect(result.sourceInTrash).toBe(false);
  });

  it("does not activate when the host moves to breeding before deferred resolution", async () => {
    const result = await runDeferredSourceMove(async (ctx, hostId) => {
      expect(await ctx.fx.movePermanentZone(hostId, "toBreeding")).toBe(true);
    });
    expect(result.fired).toBe(0);
    expect(result.hostInBreeding).toBe(true);
    expect(result.hostInBattleArea).toBe(false);
  });
  it("does not revive a discarded-self trigger after its source leaves trash and returns", async () => {
    const result = await runDeferredSourceMove(async (ctx, _hostId, sourceId) => {
      await ctx.fx.returnToHand([sourceId]);
      await ctx.fx.trash([sourceId]);
    }, true);
    expect(result.fired).toBe(0);
    expect(result.sourceInTrash).toBe(true);
  });

  it("does not resolve a discarded-self trigger after its source moves to another stack", async () => {
    const result = await runDeferredSourceMove(async (ctx, _hostId, sourceId, otherHostId) => {
      await ctx.fx.placeUnder(otherHostId, [sourceId]);
    }, true);
    expect(result.fired).toBe(0);
    expect(result.sourceOnOtherHost).toBe(true);
    expect(result.sourceInTrash).toBe(false);
  });
});
