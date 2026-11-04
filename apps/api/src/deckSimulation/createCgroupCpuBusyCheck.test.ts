import { describe, expect, it } from "vitest";
import { createCgroupCpuBusyCheck } from "#api/deckSimulation/createCgroupCpuBusyCheck";

type CgroupState = { usageUsec: number; periods: number; throttled: number; cpuMax: string } | undefined;

function createHarness({ hostCores = 4, hostLoad = 7 }: { hostCores?: number; hostLoad?: number } = {}) {
  let clockMs = 0;
  let cgroup: CgroupState = { usageUsec: 0, periods: 0, throttled: 0, cpuMax: "200000 100000" };
  const isBusy = createCgroupCpuBusyCheck({
    spareCores: 1,
    maxThrottledShare: 0.25,
    minSampleWindowMs: 1_000,
    maxSampleWindowMs: 10_000,
    hostLoadPerCore: 1.5,
    readFile: (path) => {
      if (cgroup === undefined) throw new Error(`ENOENT: ${path}`);
      if (path.endsWith("cpu.max")) return `${cgroup.cpuMax}\n`;
      return `usage_usec ${cgroup.usageUsec}\nnr_periods ${cgroup.periods}\nnr_throttled ${cgroup.throttled}\n`;
    },
    hostCores: () => hostCores,
    hostLoad: () => hostLoad,
    now: () => clockMs,
  });
  const advance = ({
    ms,
    usedCores = 0,
    periods = 0,
    throttled = 0,
  }: {
    ms: number;
    usedCores?: number;
    periods?: number;
    throttled?: number;
  }) => {
    clockMs += ms;
    if (cgroup === undefined) return;
    cgroup = {
      ...cgroup,
      usageUsec: cgroup.usageUsec + usedCores * ms * 1000,
      periods: cgroup.periods + periods,
      throttled: cgroup.throttled + throttled,
    };
  };
  return {
    isBusy,
    advance,
    setCpuMax: (cpuMax: string) => {
      cgroup = { ...cgroup!, cpuMax };
    },
    removeCgroup: () => {
      cgroup = undefined;
    },
  };
}

describe("createCgroupCpuBusyCheck", () => {
  it("lets a simulation start in an idle container even when the whole host is loaded", () => {
    const harness = createHarness({ hostCores: 4, hostLoad: 7 });
    expect(harness.isBusy()).toBe(true);
    harness.advance({ ms: 2_000, usedCores: 0.4, periods: 20 });
    expect(harness.isBusy()).toBe(false);
  });

  it("holds a simulation while the container would keep less than one core free", () => {
    const harness = createHarness();
    harness.isBusy();
    harness.advance({ ms: 2_000, usedCores: 1.2, periods: 20 });
    expect(harness.isBusy()).toBe(true);
  });

  it("holds a simulation while the container is being throttled", () => {
    const harness = createHarness();
    harness.isBusy();
    harness.advance({ ms: 2_000, usedCores: 0.3, periods: 20, throttled: 6 });
    expect(harness.isBusy()).toBe(true);
  });

  it("uses the host core count when the container has no CPU quota", () => {
    const harness = createHarness({ hostCores: 4 });
    harness.setCpuMax("max 100000");
    harness.isBusy();
    harness.advance({ ms: 2_000, usedCores: 2.5, periods: 20 });
    expect(harness.isBusy()).toBe(false);
  });

  it("keeps the previous verdict until a full sample window has passed", () => {
    const harness = createHarness();
    harness.isBusy();
    harness.advance({ ms: 2_000, usedCores: 0.2, periods: 20 });
    expect(harness.isBusy()).toBe(false);
    harness.advance({ ms: 500, usedCores: 2, periods: 5 });
    expect(harness.isBusy()).toBe(false);
  });

  it("measures again from scratch after a long pause instead of averaging over it", () => {
    const harness = createHarness();
    harness.isBusy();
    harness.advance({ ms: 60_000, usedCores: 0.1, periods: 600 });
    expect(harness.isBusy()).toBe(true);
    harness.advance({ ms: 2_000, usedCores: 0.1, periods: 20 });
    expect(harness.isBusy()).toBe(false);
  });

  it("falls back to host load per host core outside a cgroup", () => {
    const idleHost = createHarness({ hostCores: 4, hostLoad: 5 });
    idleHost.removeCgroup();
    expect(idleHost.isBusy()).toBe(false);
    const loadedHost = createHarness({ hostCores: 4, hostLoad: 7 });
    loadedHost.removeCgroup();
    expect(loadedHost.isBusy()).toBe(true);
  });
});
