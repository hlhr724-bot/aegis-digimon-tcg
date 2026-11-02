import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { searchPairedRoot } from "#api/bot/search/searchPairedRoot";

type Call = { action: number; sample: number };

function busyWait(ms: number): void {
  const started = performance.now();
  while (performance.now() - started < ms) {
    continue;
  }
}

describe("paired root search", () => {
  it("compares the baseline and the highest-prior actions on shared determinization samples", async () => {
    const calls: Call[] = [];
    const rewards = [0.5, 0.4, 0.45, 0.9, 0.9];
    const search = await searchPairedRoot({
      priors: [0.1, 0.5, 0.3, 0.05, 0.05],
      candidateLimit: 3,
      simulations: 6,
      maxDurationMs: 60_000,
      simulate: async ({ action, sample }) => {
        calls.push({ action, sample });
        return { reward: rewards[action]! + sample / 1000, valid: true };
      },
    });
    expect(new Set(calls.map(({ action }) => action))).toEqual(new Set([0, 1, 2]));
    const samples = new Map<number, number[]>();
    for (const { action, sample } of calls) samples.set(sample, [...(samples.get(sample) ?? []), action]);
    expect([...samples.values()][0]).toEqual([0, 1, 2]);
    expect(search.action).toBe(0);
    expect(search.report.attempted).toBeLessThanOrEqual(6);
  });

  it("picks the action whose paired reward beats the baseline after halving", async () => {
    const rewards = [0.5, 0.48, 0.62, 0.3];
    const search = await searchPairedRoot({
      priors: [0.4, 0.3, 0.2, 0.1],
      candidateLimit: 4,
      simulations: 20,
      maxDurationMs: 60_000,
      simulate: async ({ action, sample }) => ({ reward: rewards[action]! - (sample % 3) / 20, valid: true }),
    });
    expect(search.action).toBe(2);
    expect(search.report.root[0]).toMatchObject({ action: 2 });
    expect(search.report.attempted).toBeLessThanOrEqual(20);
  });

  it("keeps the baseline when a candidate only ties it", async () => {
    const search = await searchPairedRoot({
      priors: [0.6, 0.4],
      candidateLimit: 3,
      simulations: 6,
      maxDurationMs: 60_000,
      simulate: async () => ({ reward: 0.5, valid: true }),
    });
    expect(search.action).toBe(0);
  });

  it("drops a sample when any candidate rollout is invalid", async () => {
    const search = await searchPairedRoot({
      priors: [0.5, 0.5],
      candidateLimit: 2,
      simulations: 6,
      maxDurationMs: 60_000,
      simulate: async ({ action, sample }) =>
        sample === 0 && action === 1 ? { reward: 1, valid: false } : { reward: action === 1 ? 0.2 : 0.6, valid: true },
    });
    expect(search.action).toBe(0);
    expect(search.report.invalid).toBe(1);
    expect(search.report.root.find(({ action }) => action === 1)?.visits).toBe(2);
  });

  it("compares the evaluated part of the first sample when the deadline cuts it short", async () => {
    const rewards = [0.4, 0.7, 0.9];
    const search = await searchPairedRoot({
      priors: [0.5, 0.3, 0.2],
      candidateLimit: 3,
      simulations: 6,
      maxDurationMs: 150,
      simulate: async ({ action }) => {
        busyWait(100);
        return { reward: rewards[action]!, valid: true };
      },
    });
    expect(search.report.attempted).toBe(2);
    expect(search.action).toBe(1);
    expect(search.report.timeBudget?.exhausted).toBe(true);
  });

  it("names the invalid rollout reasons when no paired sample reaches the root", async () => {
    await expect(
      searchPairedRoot({
        priors: [0.5, 0.5],
        candidateLimit: 2,
        simulations: 4,
        maxDurationMs: 60_000,
        simulate: async () => ({ reward: 0, valid: false, reason: "stalled" }),
      }),
    ).rejects.toThrow("No valid paired samples reached the root: stalled");
  });
});
