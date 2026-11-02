import { describe, it, expect } from "vitest";
import { CardKind, EffectTiming, type CardColor, type Seat } from "@aegis/shared";
import { resolveTiming, orderTurnPlayerFirst, type ResolutionEnv } from "./stack.js";
import type { CollectedEffect } from "./collect.js";
import type { CardSource } from "./CardSource.js";
import type { Effect } from "./Effect.js";
import type { EffectContext } from "./EffectContext.js";
import { UseTracker } from "./kernel.js";

/**
 * Resolver-focused fakes. The ordered, interruptible loop only reads
 * source.ownerSeat / source.instanceId / source.permanent() and
 * effect.{optional,effectKey,canActivate,resolve}; it never touches GameState
 * directly (that is the engine's `collect`/`makeContext`). So a minimal fake
 * CardSource/Effect exercises the loop exactly as production does.
 */

function fakeSource(seat: Seat, instanceId: string): CardSource {
  return {
    instanceId,
    cardId: instanceId,
    ownerSeat: seat,
    definition: {} as CardSource["definition"],
    permanent: () => undefined, // not on a permanent -> kernel placement guard passes
    isOnBattleArea: () => true,
    isOwnersTurn: () => true,
    hasColor: (_c: CardColor) => false,
  };
}

interface FakeEffectOptions {
  optional?: boolean;
  canActivate?: () => boolean;
  onResolve?: (ctx: EffectContext) => unknown | Promise<unknown>;
  /** Defaults to 1 so a resolved effect drops out of a stable collect() via the use
   *  ledger (the realistic "once" shape). Set -1 for an explicitly unlimited effect. */
  maxPerTurn?: number;
}

function fakeEffect(effectKey: string, opts: FakeEffectOptions = {}): Effect {
  return {
    effectKey,
    description: effectKey,
    optional: opts.optional ?? false,
    isInherited: false,
    isSecurity: false,
    isLinked: false,
    maxPerTurn: opts.maxPerTurn ?? 1,
    canTrigger: () => true,
    canActivate: () => (opts.canActivate ? opts.canActivate() : true),
    resolve: async (ctx) => {
      await opts.onResolve?.(ctx);
    },
  };
}

function collected(seat: Seat, instanceId: string, effect: Effect): CollectedEffect {
  return { source: fakeSource(seat, instanceId), effect };
}

/**
 * Build a ResolutionEnv over a fixed list of collected effects. The default `collect`
 * is STABLE — it returns the same seed every pass, mirroring production where
 * `gatherTriggeredEffects` re-queries live state each call; resolved effects drop out
 * because the default fake `maxPerTurn` is 1 (the kernel filters them via the use
 * ledger) or because their `canActivate` turns false. The loop asks for ordering only
 * when multiple effects share a controller's activation window, and `chooseOrder`
 * defaults to "resolve the first offered effect". Tests that need a one-shot or
 * growing trigger set override `collect`.
 */
function envOver(
  seed: CollectedEffect[],
  overrides: Partial<ResolutionEnv> = {},
): { env: ResolutionEnv; log: string[]; tracker: UseTracker } {
  const log: string[] = [];
  const tracker = new UseTracker();

  const env: ResolutionEnv = {
    turnSeat: 0,
    tracker,
    collect: () => seed,
    // The fakes' canActivate/resolve only read ctx.source; game/fx/ask are unused
    // here (they belong to real card bodies, exercised by the framework tests).
    makeContext: (c) => ({ source: c.source, trigger: {}, game: {}, fx: {}, ask: {} }) as never,
    ruleProcess: async () => {
      log.push("rule");
    },
    isGameOver: () => false,
    chooseOrder: async (_seat, active) => {
      log.push(`order(${active.map((c) => c.effect.effectKey).join(",")})`);
      return 0;
    },
    askOptional: async (_seat, c) => {
      log.push(`optional(${c.effect.effectKey})`);
      return true;
    },
    ...overrides,
  };
  return { env, log, tracker };
}

describe("derived activation tiers", () => {
  it.each([
    { seat: 0, nested: false },
    { seat: 1, nested: false },
    { seat: 0, nested: true },
    { seat: 1, nested: true },
  ] as const)(
    "retires an exhausted derived effect before an older effect enables it ($seat, nested=$nested)",
    async ({ seat, nested }) => {
      let derived = false;
      let targetExists = false;
      const order: string[] = [];
      const parent = collected(
        0,
        "parent",
        fakeEffect("parent", {
          onResolve: () => {
            derived = true;
            order.push("parent");
          },
        }),
      );
      const older = collected(
        1,
        "older",
        fakeEffect("older", {
          onResolve: () => {
            targetExists = true;
            order.push("older");
          },
        }),
      );
      const child = collected(
        seat,
        "child",
        fakeEffect("child", {
          canActivate: () => targetExists,
          onResolve: () => order.push("child"),
        }),
      );
      const attack = collected(
        0,
        "attack",
        fakeEffect("attack", {
          onResolve: async (ctx) => {
            await ctx.drainCurrentTimingWindow?.();
          },
        }),
      );
      const { env } = envOver([], {
        collect: () => [...(nested ? [attack] : []), parent, older, ...(derived ? [child] : [])],
      });
      await resolveTiming(EffectTiming.OnEndTurn, env);
      expect(order).toEqual(["parent", "older"]);
    },
  );

  it("keeps an unavailable derived effect pending while its simultaneous sibling enables it", async () => {
    let derived = false;
    let targetExists = false;
    const order: string[] = [];
    const parent = collected(
      0,
      "parent",
      fakeEffect("parent", {
        onResolve: () => {
          derived = true;
          order.push("parent");
        },
      }),
    );
    const older = collected(0, "older", fakeEffect("older", { onResolve: () => order.push("older") }));
    const child = collected(
      0,
      "child",
      fakeEffect("child", {
        canActivate: () => targetExists,
        onResolve: () => order.push("child"),
      }),
    );
    const sibling = collected(
      1,
      "sibling",
      fakeEffect("sibling", {
        onResolve: () => {
          targetExists = true;
          order.push("sibling");
        },
      }),
    );
    const { env } = envOver([], { collect: () => [parent, older, ...(derived ? [child, sibling] : [])] });
    await resolveTiming(EffectTiming.OnEndTurn, env);
    expect(order).toEqual(["parent", "sibling", "child", "older"]);
  });

  it("keeps granted copies and event occurrences distinct without reactivating after evolution", async () => {
    let top = "original-top";
    const resolved: string[] = [];
    const firstEvent = {};
    const secondEvent = {};
    const grants = [
      { id: 1, event: firstEvent, label: "first-event" },
      { id: 1, event: secondEvent, label: "second-event" },
      { id: 2, event: firstEvent, label: "second-grant" },
    ];
    const { env } = envOver([], {
      collect: () =>
        grants.map(({ id, event, label }) => ({
          source: fakeSource(0, top),
          grantedEffectId: id,
          activationIdentity: event,
          effect: fakeEffect(`granted/test/grant/${id}`, {
            maxPerTurn: -1,
            onResolve: () => {
              resolved.push(label);
              top = "evolved-top";
            },
          }),
        })),
    });
    await resolveTiming(EffectTiming.OnEndAttack, env);
    expect(resolved).toEqual(["first-event", "second-event", "second-grant"]);
  });

  it("resumes the interrupted derived tier after a nested batch completes", async () => {
    let childrenArmed = false;
    let nestedArmed = false;
    const resolved: string[] = [];
    const parent = collected(
      0,
      "parent",
      fakeEffect("parent", {
        onResolve: () => {
          resolved.push("parent");
          childrenArmed = true;
        },
      }),
    );
    const older = collected(
      0,
      "older",
      fakeEffect("older", {
        onResolve: () => {
          resolved.push("older");
        },
      }),
    );
    const childA = collected(
      1,
      "child-a",
      fakeEffect("child-a", {
        onResolve: () => {
          resolved.push("child-a");
          nestedArmed = true;
        },
      }),
    );
    const childB = collected(
      1,
      "child-b",
      fakeEffect("child-b", {
        onResolve: () => {
          resolved.push("child-b");
        },
      }),
    );
    const nested = ["nested-a", "nested-b"].map((id) =>
      collected(
        0,
        id,
        fakeEffect(id, {
          onResolve: () => {
            resolved.push(id);
          },
        }),
      ),
    );
    const { env } = envOver([], {
      collect: () => [parent, older, ...(childrenArmed ? [childA, childB] : []), ...(nestedArmed ? nested : [])],
    });
    await resolveTiming(EffectTiming.OnStartMainPhase, env);
    expect(resolved).toEqual(["parent", "child-a", "nested-a", "nested-b", "child-b", "older"]);
  });
  it.each([0, 1] as const)(
    "finishes both derived effects for seat %s before returning to an older pending effect",
    async (seat) => {
      let derived = false;
      const resolved: string[] = [];
      const parent = collected(
        0,
        "parent",
        fakeEffect("parent", {
          onResolve: () => {
            resolved.push("parent");
            derived = true;
          },
        }),
      );
      const older = collected(
        0,
        "older",
        fakeEffect("older", {
          onResolve: () => {
            resolved.push("older");
          },
        }),
      );
      const children = ["child-a", "child-b"].map((id) =>
        collected(
          seat,
          id,
          fakeEffect(id, {
            onResolve: () => {
              resolved.push(id);
            },
          }),
        ),
      );
      const offered: string[][] = [];
      const { env } = envOver([], {
        collect: () => [parent, older, ...(derived ? children : [])],
        chooseOrder: async (_seat, active) => {
          offered.push(active.map((entry) => entry.effect.effectKey));
          return 0;
        },
      });
      await resolveTiming(EffectTiming.OnStartMainPhase, env);
      expect(resolved).toEqual(["parent", "child-a", "child-b", "older"]);
      expect(offered).toEqual([
        ["parent", "older"],
        ["child-a", "child-b"],
      ]);
    },
  );
});

describe("orderTurnPlayerFirst", () => {
  it("places the turn player's effects before the opponent's, stable within each side", () => {
    const turn = 0 as Seat;
    const a = collected(0, "a", fakeEffect("a"));
    const b = collected(1, "b", fakeEffect("b"));
    const c = collected(0, "c", fakeEffect("c"));
    const d = collected(1, "d", fakeEffect("d"));

    const ordered = orderTurnPlayerFirst([b, a, d, c], turn);
    expect(ordered.map((x) => x.effect.effectKey)).toEqual(["a", "c", "b", "d"]);
  });

  it("orders opponent-first when the opponent is the turn player", () => {
    const a = collected(0, "a", fakeEffect("a"));
    const b = collected(1, "b", fakeEffect("b"));
    const ordered = orderTurnPlayerFirst([a, b], 1 as Seat);
    expect(ordered.map((x) => x.effect.effectKey)).toEqual(["b", "a"]);
  });
});

describe("resolveTiming: ordering and single-trigger resolution", () => {
  it("classifies a linked Option clause as a Digimon effect while it resolves (BT25-100/101, Q6471/Q6476)", async () => {
    const source = {
      ...fakeSource(0, "linked-option"),
      definition: { kinds: [CardKind.Option] } as CardSource["definition"],
    } as CardSource;
    source.permanent = () =>
      ({
        permanentId: "host",
        topCard: { instanceId: "host-card" },
        stack: [],
        linked: [{ instanceId: source.instanceId }],
      }) as never;
    const effect = { ...fakeEffect("linked-clause"), isLinked: true };
    const enteredKinds: string[][] = [];
    const { env } = envOver([{ source, effect }], {
      makeContext: (item) =>
        ({
          source: item.source,
          trigger: {},
          game: {},
          ask: {},
          fx: {
            enterEffectResolution: (_seat: Seat, kinds?: string[]) => enteredKinds.push(kinds ?? []),
            leaveEffectResolution: () => undefined,
          },
        }) as never,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(enteredKinds).toEqual([[CardKind.Digimon]]);
  });

  it("re-entrantly drains the remaining effects without re-entering the current effect", async () => {
    const order: string[] = [];
    const first = fakeEffect("first", {
      onResolve: async (ctx) => {
        order.push("first:start");
        await ctx.drainCurrentTimingWindow?.();
        order.push("first:end");
      },
    });
    const second = fakeEffect("second", { onResolve: () => order.push("second") });
    const { env, tracker } = envOver([collected(0, "a", first), collected(0, "b", second)]);

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["first:start", "second", "first:end"]);
    expect(tracker.count("a", "first")).toBe(1);
    expect(tracker.count("b", "second")).toBe(1);
  });

  it("does not re-offer an optional effect declined during a re-entrant drain", async () => {
    const order: string[] = [];
    const first = fakeEffect("first", {
      onResolve: async (ctx) => {
        order.push("first:start");
        await ctx.drainCurrentTimingWindow?.();
        order.push("first:end");
      },
    });
    const declined = fakeEffect("declined", { optional: true, onResolve: () => order.push("unexpected") });
    let optionalCalls = 0;
    const { env } = envOver([collected(0, "a", first), collected(0, "b", declined)], {
      askOptional: async (_seat, effect) => {
        if (effect.effect.effectKey === "declined") optionalCalls += 1;
        return false;
      },
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["first:start", "first:end"]);
    expect(optionalCalls).toBe(1);
  });

  it.each([false, true])(
    "only a completed attack drain retires an unpayable remainder (retire=%s)",
    async (retireUnactivatable) => {
      let payable = false;
      const order: string[] = [];
      const attack = fakeEffect("attack", {
        onResolve: async (ctx) => {
          await ctx.drainCurrentTimingWindow?.({ retireUnactivatable });
          // Security can unsuspend the attacker's only cost target after this drain.
          payable = true;
          order.push("security");
        },
      });
      const cost = fakeEffect("cost", {
        canActivate: () => payable,
        onResolve: () => order.push("cost"),
      });
      const { env } = envOver([collected(0, "a", attack), collected(0, "b", cost)]);
      await resolveTiming(EffectTiming.EndOfYourTurn, env);
      expect(order).toEqual(retireUnactivatable ? ["security"] : ["security", "cost"]);
    },
  );

  it("keeps an initially unpayable cost pending while earlier effects can enable it", async () => {
    let payable = false;
    const order: string[] = [];
    const attack = fakeEffect("attack", {
      onResolve: async (ctx) => {
        await ctx.drainCurrentTimingWindow?.({ retireUnactivatable: true });
        order.push("security");
      },
    });
    const cost = fakeEffect("cost", { canActivate: () => payable, onResolve: () => order.push("cost") });
    const draw = fakeEffect("draw", {
      onResolve: () => {
        payable = true;
        order.push("draw");
      },
    });
    const { env } = envOver([collected(0, "a", attack), collected(0, "b", cost), collected(0, "c", draw)]);
    await resolveTiming(EffectTiming.EndOfYourTurn, env);
    expect(order).toEqual(["draw", "cost", "security"]);
  });

  it("propagates a drained effect error and clears the outer effect's in-progress guard", async () => {
    const order: string[] = [];
    let shouldThrow = true;
    const first = fakeEffect("first", {
      onResolve: async (ctx) => {
        order.push("first:start");
        await ctx.drainCurrentTimingWindow?.();
        order.push("first:end");
      },
    });
    const second = fakeEffect("second", {
      onResolve: () => {
        order.push("second");
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error("drained failure");
        }
      },
    });
    const { env } = envOver([collected(0, "a", first), collected(0, "b", second)]);

    await expect(resolveTiming(EffectTiming.OnPlay, env)).rejects.toThrow("drained failure");
    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["first:start", "second", "first:start", "second", "first:end"]);
  });

  it("resolves a single mandatory triggered effect without an ordering decision", async () => {
    const order: string[] = [];
    const eff = fakeEffect("solo", { onResolve: () => order.push("solo") });
    const { env, log } = envOver([collected(0, "s1", eff)]);

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["solo"]);
    expect(log).not.toContain("order(solo)");
  });

  it("resolves the turn player's bucket fully before the opponent's", async () => {
    const order: string[] = [];
    const turnEff = fakeEffect("turn", { onResolve: () => order.push("turn") });
    const oppEff = fakeEffect("opp", { onResolve: () => order.push("opp") });
    // Seed deliberately opponent-first to prove ordering, not input order, decides.
    const { env } = envOver([collected(1, "o1", oppEff), collected(0, "t1", turnEff)]);

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["turn", "opp"]);
  });

  it("records a use per resolved effect (maxPerTurn accounting)", async () => {
    const eff = fakeEffect("counted");
    const { env, tracker } = envOver([collected(0, "c1", eff)]);

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(tracker.count("c1", "counted")).toBe(1);
  });

  it("resolves an UNLIMITED mandatory triggered effect exactly once per window", async () => {
    // maxPerTurn = -1 (unlimited) with a standing canTrigger/canActivate that never
    // clears: without the window's resolved-set this would re-collect and re-resolve
    // forever (until MAX_RESOLUTION_PASSES throws). The single-trigger rule
    // (§15-4-4-2) requires it to fire once. `collect` is the realistic stable seed.
    let resolveCount = 0;
    const eff = fakeEffect("loopy", { maxPerTurn: -1, onResolve: () => (resolveCount += 1) });
    const { env } = envOver([collected(0, "u1", eff)]);

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(resolveCount).toBe(1);
  });
});

describe("resolveTiming: choosing which effect to process first", () => {
  it("prompts chooseOrder when two same-side effects are simultaneously active and resolves the chosen one first", async () => {
    const order: string[] = [];
    const first = fakeEffect("first", { onResolve: () => order.push("first") });
    const second = fakeEffect("second", { onResolve: () => order.push("second") });

    // Controller picks index 1 ("second") first; the remaining mandatory "first"
    // effect then resolves directly because there is no ordering choice left.
    let asked = 0;
    const { env, log } = envOver([collected(0, "e1", first), collected(0, "e2", second)], {
      chooseOrder: async (_seat, active) => {
        asked += 1;
        log.push(`order(${active.map((c) => c.effect.effectKey).join(",")})`);
        return active.findIndex((c) => c.effect.effectKey === "second");
      },
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(asked).toBe(1);
    expect(log).not.toContain("order(first)");
    expect(order).toEqual(["second", "first"]);
  });

  it("honors a decline (null) only when every remaining effect is optional", async () => {
    const order: string[] = [];
    const optA = fakeEffect("optA", { optional: true, onResolve: () => order.push("optA") });
    const optB = fakeEffect("optB", { optional: true, onResolve: () => order.push("optB") });

    const { env } = envOver([collected(0, "a", optA), collected(0, "b", optB)], {
      chooseOrder: async () => null, // decline all
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual([]); // nothing resolved; decline was honored
  });

  it("coerces a chooseOrder decline to the first effect when a mandatory effect remains", async () => {
    const order: string[] = [];
    const mandatory = fakeEffect("must", { onResolve: () => order.push("must") });
    const optional = fakeEffect("may", { optional: true, onResolve: () => order.push("may") });

    // Two active (one mandatory, one optional) -> chooseOrder is consulted; a decline
    // is INVALID here (a mandatory trigger is present) so the resolver forces index 0
    // ("must"). After "must" resolves, only the optional remains: with a single active
    // effect there is no choose-order prompt, and its own optional prompt is declined.
    const { env } = envOver([collected(0, "m", mandatory), collected(0, "o", optional)], {
      chooseOrder: async () => null,
      askOptional: async () => false,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    // "must" ran despite the decline (coercion); "may" was offered alone and declined.
    expect(order).toEqual(["must"]);
  });

  it("forces the mandatory effect first when chooseOrder declines, then offers the lone optional", async () => {
    const order: string[] = [];
    const mandatory = fakeEffect("must", { onResolve: () => order.push("must") });
    const optional = fakeEffect("may", { optional: true, onResolve: () => order.push("may") });

    // Same as above but the controller ACCEPTS the lone optional when finally asked.
    const { env } = envOver([collected(0, "m", mandatory), collected(0, "o", optional)], {
      chooseOrder: async () => null,
      askOptional: async () => true,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["must", "may"]);
  });
});

describe("resolveTiming: optional prompt", () => {
  it("skips an optional effect the controller declines and does NOT record a use", async () => {
    const order: string[] = [];
    const eff = fakeEffect("maybe", { optional: true, onResolve: () => order.push("maybe") });
    const { env, tracker } = envOver([collected(0, "x", eff)], {
      askOptional: async () => false,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual([]);
    expect(tracker.count("x", "maybe")).toBe(0);
  });

  it("resolves an optional effect the controller accepts and records the use", async () => {
    const order: string[] = [];
    const eff = fakeEffect("maybe", { optional: true, onResolve: () => order.push("maybe") });
    const { env, tracker } = envOver([collected(0, "x", eff)], {
      askOptional: async () => true,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["maybe"]);
    expect(tracker.count("x", "maybe")).toBe(1);
  });
});

describe("resolveTiming: effects triggered during resolution (re-scan)", () => {
  it("resolves an effect that becomes active only after an earlier one resolves", async () => {
    const order: string[] = [];
    let secondReady = false;
    const firstEff = fakeEffect("first", {
      onResolve: () => {
        order.push("first");
        secondReady = true; // first makes second activatable
      },
    });
    const secondEff = fakeEffect("second", {
      canActivate: () => secondReady,
      onResolve: () => order.push("second"),
    });

    // Both are collected up front for the same seat, but `second` cannot activate
    // until `first` resolves. `collect` is stable (re-queried each pass); the loop
    // re-checks canActivate so `second` joins the active set only after `first` runs.
    // Each fake is maxPerTurn=1, so a resolved effect drops out of the stable set.
    const seed = [collected(0, "f", firstEff), collected(0, "s", secondEff)];
    const { env } = envOver(seed, {
      // With one active at a time, no prompt is needed; index 0 each pass.
      chooseOrder: async () => 0,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["first", "second"]);
  });

  it("picks up a brand-new trigger surfaced by collect() after a resolution", async () => {
    const order: string[] = [];
    const initial = fakeEffect("initial", { onResolve: () => order.push("initial") });
    // The reactive trigger is edge-triggered: it is only collectable on the pass
    // right after `initial` resolves (its trigger condition just became true), then
    // stops being offered — the realistic shape of an "on X happening" trigger.
    let resolved = false;
    const reactive = fakeEffect("reactive", {
      canActivate: () => !resolved,
      onResolve: () => {
        order.push("reactive");
        resolved = true;
      },
    });

    const seed = [collected(0, "i", initial)];
    const reactiveCollected = collected(0, "r", reactive);

    let calls = 0;
    const { env } = envOver(seed, {
      collect: () => {
        calls += 1;
        if (calls === 1) return seed; // initial scan: only `initial`
        if (calls === 2) return [reactiveCollected]; // after `initial` resolves, `reactive` triggers
        return []; // quiet thereafter
      },
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["initial", "reactive"]);
  });

  it("stops immediately when the game ends mid-resolution", async () => {
    const order: string[] = [];
    let over = false;
    const ender = fakeEffect("ender", {
      onResolve: () => {
        order.push("ender");
        over = true; // this resolution ends the game
      },
    });
    const never = fakeEffect("never", { onResolve: () => order.push("never") });

    const seed = [collected(0, "e", ender), collected(0, "n", never)];
    const { env } = envOver(seed, {
      isGameOver: () => over,
      collect: () => seed, // would keep offering "never", but game-over short-circuits
      chooseOrder: async () => 0,
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(order).toEqual(["ender"]); // "never" never runs
  });
});

describe("resolveTiming: pass-cap overflow (Comprehensive Rules §18-3-2 infinite loops)", () => {
  it("throws when the pass cap is exceeded and the env has no declareDraw (today's safety net)", async () => {
    // A fresh instance id each pass never dedupes against the `resolved` ledger (keyed
    // on instanceId+effectKey), so the fixpoint spins forever — a runaway effect that
    // re-derives a "new" trigger every pass instead of clearing its own guard — until
    // MAX_RESOLUTION_PASSES trips.
    const runaway = fakeEffect("runaway", { maxPerTurn: -1 });
    let n = 0;
    const { env } = envOver([], { collect: () => [collected(0, `r${n++}`, runaway)] });

    await expect(resolveTiming(EffectTiming.OnPlay, env)).rejects.toThrow(/exceeded 1000 resolution passes/);
  });

  it("§18-3-2: resolves the match to a draw instead of throwing when the env wires declareDraw", async () => {
    const runaway = fakeEffect("runaway", { maxPerTurn: -1 });
    let n = 0;
    let drawDeclared = false;
    let gameOver = false;
    const { env } = envOver([], {
      collect: () => [collected(0, `r${n++}`, runaway)],
      isGameOver: () => gameOver,
      declareDraw: async () => {
        drawDeclared = true;
        gameOver = true;
      },
    });

    await expect(resolveTiming(EffectTiming.OnPlay, env)).resolves.toBeUndefined();
    expect(drawDeclared).toBe(true);
  });

  it("§18-3-3: stops a loop a player CAN stop (an optional link) instead of declaring a draw", async () => {
    // Same runaway shape as the two above — a fresh instance id every pass, so nothing
    // dedupes against the `resolved` ledger — except the looping effect is OPTIONAL. The
    // controller therefore HAS the ability to stop it, which puts the case under §18-3-3
    // rather than §18-3-2: the processing is stopped ("the player stops the processing when
    // possible", §18-3-3-3) and the same loop is not performed again, instead of the match
    // ending in a draw.
    const looper = fakeEffect("looper", { optional: true, maxPerTurn: -1 });
    let n = 0;
    let resolutions = 0;
    let drawDeclared = false;
    const { env } = envOver([], {
      collect: () => [collected(0, `loop-${n++}`, looper)],
      // The player keeps accepting, so the loop never self-limits through the ordinary
      // decline path — the §18-3-3 stop is the only thing that can end it.
      askOptional: async () => {
        resolutions += 1;
        return true;
      },
      declareDraw: async () => {
        drawDeclared = true;
      },
    });

    await expect(resolveTiming(EffectTiming.OnPlay, env)).resolves.toBeUndefined();
    expect(drawDeclared).toBe(false);
    // §18-3-3-3: "executed at least the number of times that was declared it would be
    // repeated, then the player stops the processing" — it ran, then stopped.
    expect(resolutions).toBeGreaterThan(0);
  });

  it("§18-3-3-3: the stopped loop is not re-entered later in the same window", async () => {
    // After the stop, a mandatory effect that was pending behind the loop must still resolve
    // (the stop retires the looping processing, not the window), and the looping effect must
    // never be offered again even though `collect` keeps producing brand-new instances of it.
    const looper = fakeEffect("looper", { optional: true, maxPerTurn: -1 });
    let n = 0;
    let bystanderRuns = 0;
    let loopRunsAfterStop = 0;
    let stopped = false;
    const bystander = fakeEffect("bystander", {
      onResolve: () => {
        bystanderRuns += 1;
        stopped = true;
      },
    });
    const bystanderEntry = collected(0, "bystander-1", bystander);
    const { env } = envOver([], {
      collect: () => [collected(0, `loop-${n++}`, looper), bystanderEntry],
      chooseOrder: async () => 0, // always prefer the looping effect while it is offered
      askOptional: async () => {
        if (stopped) loopRunsAfterStop += 1;
        return true;
      },
      declareDraw: async () => {
        throw new Error("§18-3-2 draw must not be reached for a stoppable loop");
      },
    });

    await resolveTiming(EffectTiming.OnPlay, env);

    expect(bystanderRuns).toBe(1);
    expect(loopRunsAfterStop).toBe(0);
  });
});

describe("resolveTiming: a pending effect whose source stops being collectable (§15-4-4-3/5)", () => {
  it("does not activate an effect whose source left its area mid-window and later returned", async () => {
    // §15-4-4-3: "When a card with an effect that's pending activation becomes a new card before
    // the effect activates, the effect can no longer be activated." Leaving an area and coming
    // back makes a card a new card, so the round trip kills the pending trigger — it does not
    // park it until the card is home again. §15-4-4-5 says the same for an effect whose trigger
    // conditions stop being met while it is pending. Both look identical from here: the effect
    // drops out of `collect(timing)`.
    //
    // `mover` resolves first and takes `pending` out of the collectable set (its card left the
    // area). `restorer` resolves next and puts it back (the card returned). Without a record of
    // the departure the fixpoint — which re-derives the activatable set purely from live state —
    // sees `pending` sitting there again on the following pass and resolves it.
    //
    // Known limit: a card that leaves and returns inside ONE effect body is invisible here, since
    // the loop only re-collects between resolutions. Catching that needs the zone-move seam to
    // report the departure, not a per-pass snapshot.
    const resolvedKeys: string[] = [];
    const pending = fakeEffect("pending", { onResolve: () => resolvedKeys.push("pending") });
    const pendingEntry = collected(0, "pending-card", pending);

    let collectable: CollectedEffect[] = [];
    const mover = fakeEffect("mover", {
      onResolve: () => {
        resolvedKeys.push("mover");
        collectable = collectable.filter((c) => c !== pendingEntry); // the card leaves its area
      },
    });
    const restorer = fakeEffect("restorer", {
      onResolve: () => {
        resolvedKeys.push("restorer");
        collectable = [...collectable, pendingEntry]; // ...and comes back, as a new card
      },
    });
    collectable = [collected(0, "mover-card", mover), collected(0, "restorer-card", restorer), pendingEntry];

    const { env } = envOver([], { collect: () => collectable });
    await resolveTiming(EffectTiming.OnPlay, env);

    expect(resolvedKeys).toEqual(["mover", "restorer"]);
  });

  it("still resolves an effect that stays collectable for the whole window", async () => {
    // The discriminator: nothing departs, so every collected effect resolves as usual.
    const resolvedKeys: string[] = [];
    const first = fakeEffect("first", { onResolve: () => resolvedKeys.push("first") });
    const second = fakeEffect("second", { onResolve: () => resolvedKeys.push("second") });
    const collectable = [collected(0, "a", first), collected(0, "b", second)];

    const { env } = envOver([], { collect: () => collectable });
    await resolveTiming(EffectTiming.OnPlay, env);

    expect(resolvedKeys).toEqual(["first", "second"]);
  });
});

/**
 * Permanent identity (§15-4-4-3 "becomes a new card"). These fakes model the board the way the
 * resolver reads it: `source.permanent()` resolves live, so a body that digivolves or re-hosts a
 * card changes what the next collection pass sees without the effect ever leaving `collect()`.
 */
interface FakePermanent {
  permanentId: string;
  topCard?: { instanceId: string };
  stack: { instanceId: string }[];
  linked: { instanceId: string }[];
}

/**
 * An inherited/linked effect's placement guard reads the host top card's definition, so these
 * scenarios need a context whose `game` answers `definitionOf` (the plain fake leaves it empty).
 */
const digimonHostContext = (c: CollectedEffect): EffectContext =>
  ({
    source: c.source,
    trigger: {},
    game: { definitionOf: () => ({ kinds: [CardKind.Digimon] }) },
    fx: {},
    ask: {},
  }) as never;

function makePermanent(permanentId: string, topInstanceId?: string): FakePermanent {
  return {
    permanentId,
    ...(topInstanceId === undefined ? {} : { topCard: { instanceId: topInstanceId } }),
    stack: [],
    linked: [],
  };
}

/** A CardSource whose permanent is looked up live, exactly as the engine's lookup does. */
function sourceOnBoard(seat: Seat, instanceId: string, board: () => FakePermanent[]): CardSource {
  return {
    ...fakeSource(seat, instanceId),
    permanent: () =>
      board().find(
        (p) =>
          p.topCard?.instanceId === instanceId ||
          p.stack.some((c) => c.instanceId === instanceId) ||
          p.linked.some((c) => c.instanceId === instanceId),
      ) as unknown as ReturnType<CardSource["permanent"]>,
  };
}

describe("resolveTiming: a pending effect whose source card changes permanent identity (§15-4-4-3)", () => {
  it("keeps an already-activated consequence pending after its installer becomes a stack card", async () => {
    const permanent = makePermanent("recipient", "installer");
    const board = [permanent];
    const resolvedKeys: string[] = [];
    const source = sourceOnBoard(0, "installer", () => board);
    const digivolve = fakeEffect("digivolve", {
      onResolve: () => {
        resolvedKeys.push("digivolve");
        permanent.stack.push({ instanceId: "installer" });
        permanent.topCard = { instanceId: "evolved" };
      },
    });
    const consequence = {
      ...fakeEffect("consequence", { onResolve: () => resolvedKeys.push("consequence") }),
      isActivatedConsequence: true,
    };
    const printed = fakeEffect("printed", { onResolve: () => resolvedKeys.push("printed") });
    const collectable: CollectedEffect[] = [
      { source, effect: digivolve },
      { source, effect: consequence },
      { source, effect: printed },
    ];
    const { env } = envOver([], { collect: () => collectable });
    await resolveTiming(EffectTiming.OnDestroyedAnyone, env);
    expect(resolvedKeys).toEqual(["digivolve", "consequence"]);
    expect(permanent.stack.map((card) => card.instanceId)).toEqual(["installer"]);
  });

  it("Q2738/Q2769: digivolving on top of the source kills its other pending [When Attacking]", async () => {
    // BT17-023 shape: one card, two [When Attacking] effects triggered together. Resolving the
    // digivolve one makes the attacker's top card a digivolution card. Q2769: "if you activate
    // the 2nd [When Attacking] effect first and digivolve, the 1st [When Attacking] can no
    // longer be activated." Q2738 is the same answer for BT17-012's ＜Raid＞.
    const permanent = makePermanent("p1", "attacker");
    const board = [permanent];
    const resolvedKeys: string[] = [];

    const digivolve = fakeEffect("digivolve", {
      onResolve: () => {
        resolvedKeys.push("digivolve");
        permanent.stack.push({ instanceId: "attacker" });
        permanent.topCard = { instanceId: "evolved" };
      },
    });
    const draw = fakeEffect("draw", { onResolve: () => resolvedKeys.push("draw") });
    const source = sourceOnBoard(0, "attacker", () => board);
    const collectable: CollectedEffect[] = [
      { source, effect: digivolve },
      { source, effect: draw },
    ];

    const { env } = envOver([], { collect: () => collectable });
    await resolveTiming(EffectTiming.OnUseAttack, env);

    expect(resolvedKeys).toEqual(["digivolve"]);
  });

  it("Q2738/Q2769: the buried trigger stays dead even if its card becomes the top card again", async () => {
    // The discriminator for the LATCH. While the card is a digivolution card the kernel
    // placement guard already refuses its printed effect, but that guard has no memory: promote
    // the card back to top card (its host's new top leaves) and it would offer the pending
    // trigger again. §15-4-4-3 makes the promoted card a new card, so the effect is gone for good.
    const permanent = makePermanent("p1", "attacker");
    const board = [permanent];
    const resolvedKeys: string[] = [];

    const digivolve = fakeEffect("digivolve", {
      onResolve: () => {
        resolvedKeys.push("digivolve");
        permanent.stack.push({ instanceId: "attacker" });
        permanent.topCard = { instanceId: "evolved" };
      },
    });
    const deEvolve = fakeEffect("deEvolve", {
      onResolve: () => {
        resolvedKeys.push("deEvolve");
        permanent.stack = permanent.stack.filter((c) => c.instanceId !== "attacker");
        permanent.topCard = { instanceId: "attacker" };
      },
    });
    const raid = fakeEffect("raid", { onResolve: () => resolvedKeys.push("raid") });
    const attacker = sourceOnBoard(0, "attacker", () => board);
    const collectable: CollectedEffect[] = [
      { source: attacker, effect: digivolve },
      { source: attacker, effect: raid },
      { source: sourceOnBoard(0, "de-evolver", () => board), effect: deEvolve },
    ];

    const { env } = envOver([], { collect: () => collectable });
    await resolveTiming(EffectTiming.OnUseAttack, env);

    expect(resolvedKeys).toEqual(["digivolve", "deEvolve"]);
  });

  it("Q2805: a pending effect is dropped when its card is re-hosted under another permanent", async () => {
    // BT17-050 shape: the card carrying the pending effect is a digivolution card of one
    // Digimon and is moved out from under it (placed under / played from the stack) before the
    // effect activates. Same role, different permanent — still a new card (§15-4-4-3).
    const host = makePermanent("host", "host-top");
    const other = makePermanent("other", "other-top");
    host.stack.push({ instanceId: "parasite" });
    const board = [host, other];
    const resolvedKeys: string[] = [];

    const mover = fakeEffect("mover", {
      onResolve: () => {
        resolvedKeys.push("mover");
        host.stack = host.stack.filter((c) => c.instanceId !== "parasite");
        other.stack.push({ instanceId: "parasite" });
      },
    });
    // Inherited: the kernel placement guard accepts a digivolution card as its source, so the
    // only thing that can retire this effect is the identity change.
    const pending = { ...fakeEffect("pending", { onResolve: () => resolvedKeys.push("pending") }), isInherited: true };
    const collectable: CollectedEffect[] = [
      { source: sourceOnBoard(0, "mover-card", () => board), effect: mover },
      { source: sourceOnBoard(0, "parasite", () => board), effect: pending },
    ];

    const { env } = envOver([], { collect: () => collectable, makeContext: digimonHostContext });
    await resolveTiming(EffectTiming.OnDestroyedAnyone, env);

    expect(resolvedKeys).toEqual(["mover"]);
  });

  it("keeps an inherited effect pending while its own permanent's stack grows", async () => {
    // The Q2738 nuance in reverse: an inherited effect's source is a digivolution card from the
    // start, and digivolving the host again leaves it exactly that. Its identity is unchanged,
    // so the pending inherited effect still activates.
    const permanent = makePermanent("p1", "top-a");
    permanent.stack.push({ instanceId: "inherited-card" });
    const board = [permanent];
    const resolvedKeys: string[] = [];

    const digivolve = fakeEffect("digivolve", {
      onResolve: () => {
        resolvedKeys.push("digivolve");
        permanent.stack.push({ instanceId: "top-a" });
        permanent.topCard = { instanceId: "top-b" };
      },
    });
    const inherited = {
      ...fakeEffect("inherited", { onResolve: () => resolvedKeys.push("inherited") }),
      isInherited: true,
    };
    const collectable: CollectedEffect[] = [
      { source: sourceOnBoard(0, "top-a", () => board), effect: digivolve },
      { source: sourceOnBoard(0, "inherited-card", () => board), effect: inherited },
    ];

    const { env } = envOver([], { collect: () => collectable, makeContext: digimonHostContext });
    await resolveTiming(EffectTiming.OnUseAttack, env);

    expect(resolvedKeys).toEqual(["digivolve", "inherited"]);
  });

  it("still collects the NEW top card's trigger after a mid-window digivolution", async () => {
    // The new top card was never collected under the old identity, so it records its own on the
    // pass it first appears and resolves normally.
    const permanent = makePermanent("p1", "top-a");
    const board = [permanent];
    const resolvedKeys: string[] = [];

    const digivolve = fakeEffect("digivolve", {
      onResolve: () => {
        resolvedKeys.push("digivolve");
        permanent.stack.push({ instanceId: "top-a" });
        permanent.topCard = { instanceId: "top-b" };
      },
    });
    const whenDigivolving = fakeEffect("whenDigivolving", { onResolve: () => resolvedKeys.push("whenDigivolving") });
    const collectable: CollectedEffect[] = [{ source: sourceOnBoard(0, "top-a", () => board), effect: digivolve }];

    const { env } = envOver([], {
      collect: () =>
        permanent.topCard?.instanceId === "top-b"
          ? [...collectable, { source: sourceOnBoard(0, "top-b", () => board), effect: whenDigivolving }]
          : collectable,
    });
    await resolveTiming(EffectTiming.OnUseAttack, env);

    expect(resolvedKeys).toEqual(["digivolve", "whenDigivolving"]);
  });

  it("leaves a linked card's pending effect alone when an unrelated permanent changes", async () => {
    const linkHost = makePermanent("host", "host-top");
    linkHost.linked.push({ instanceId: "link-card" });
    const elsewhere = makePermanent("elsewhere", "elsewhere-top");
    const board = [linkHost, elsewhere];
    const resolvedKeys: string[] = [];

    const unrelated = fakeEffect("unrelated", {
      onResolve: () => {
        resolvedKeys.push("unrelated");
        elsewhere.stack.push({ instanceId: "elsewhere-top" });
        elsewhere.topCard = { instanceId: "elsewhere-new-top" };
      },
    });
    const linked = { ...fakeEffect("linked", { onResolve: () => resolvedKeys.push("linked") }), isLinked: true };
    const collectable: CollectedEffect[] = [
      { source: sourceOnBoard(0, "elsewhere-top", () => board), effect: unrelated },
      { source: sourceOnBoard(0, "link-card", () => board), effect: linked },
    ];

    const { env } = envOver([], { collect: () => collectable, makeContext: digimonHostContext });
    await resolveTiming(EffectTiming.OnDestroyedAnyone, env);

    expect(resolvedKeys).toEqual(["unrelated", "linked"]);
  });

  it("does not mark the running effect departed when its own body re-hosts its source card", async () => {
    // BT17-050's own [End of Attack] "place this card under another Digimon": the effect that is
    // executing may move its own source. `inProgress` keeps that from retiring it mid-body, and
    // the other pending effect on the same board is unaffected.
    const from = makePermanent("from", "self-mover");
    const to = makePermanent("to", "to-top");
    const board = [from, to];
    const resolvedKeys: string[] = [];

    const selfMove = fakeEffect("selfMove", {
      onResolve: async (ctx) => {
        resolvedKeys.push("selfMove:start");
        delete from.topCard;
        to.stack.push({ instanceId: "self-mover" });
        await ctx.drainCurrentTimingWindow?.();
        resolvedKeys.push("selfMove:end");
      },
    });
    const other = fakeEffect("other", { onResolve: () => resolvedKeys.push("other") });
    const collectable: CollectedEffect[] = [
      { source: sourceOnBoard(0, "self-mover", () => board), effect: selfMove },
      { source: sourceOnBoard(0, "to-top", () => board), effect: other },
    ];

    const { env } = envOver([], { collect: () => collectable });
    await resolveTiming(EffectTiming.OnEndAttack, env);

    expect(resolvedKeys).toEqual(["selfMove:start", "other", "selfMove:end"]);
  });
});

it("exposes only unresolved effects across nested resolver windows and removes readers on errors", async () => {
  const readers = new Set<() => readonly CollectedEffect[]>();
  const readKeys = () => [...readers].flatMap((read) => read().map((entry) => entry.effect.effectKey));
  const registerPendingEffects: NonNullable<ResolutionEnv["registerPendingEffects"]> = (read) => {
    readers.add(read);
    return () => {
      readers.delete(read);
    };
  };
  const waiting = collected(1, "waiting", fakeEffect("waiting"));
  const first = collected(
    0,
    "first",
    fakeEffect("first", {
      onResolve: async () => {
        expect(readKeys()).toEqual(["waiting"]);
        const nested = collected(
          0,
          "nested",
          fakeEffect("nested", {
            onResolve: () => {
              expect(readKeys()).toEqual(["waiting"]);
              throw new Error("failed body");
            },
          }),
        );
        const { env } = envOver([nested], { registerPendingEffects });
        await expect(resolveTiming(EffectTiming.OnPlay, env)).rejects.toThrow("failed body");
        expect(readers.size).toBe(1);
        expect(readKeys()).toEqual(["waiting"]);
      },
    }),
  );
  const { env } = envOver([first, waiting], { registerPendingEffects });
  await resolveTiming(EffectTiming.OnPlay, env);
  expect(readers.size).toBe(0);
});

it("retires declined optional effects from the pending display reader", async () => {
  let read: (() => readonly CollectedEffect[]) | undefined;
  const declined = collected(0, "declined", fakeEffect("declined", { optional: true, maxPerTurn: -1 }));
  const next = collected(
    1,
    "next",
    fakeEffect("next", {
      onResolve: () => expect(read?.()).toEqual([]),
    }),
  );
  const { env } = envOver([declined, next], {
    registerPendingEffects: (reader) => {
      read = reader;
      return () => {
        read = undefined;
      };
    },
    askOptional: async () => false,
  });
  await resolveTiming(EffectTiming.OnPlay, env);
  expect(read).toBeUndefined();
});
