// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import { I18nProvider } from "@/i18n/I18nProvider";
import { MatchQueueActivity } from "@/matchmaking/MatchQueueActivity";

const casualTimed = {
  queue: MatchQueue.CASUAL.value,
  format: "standard",
  matchTimer: true,
  bestOf: 1,
  allowRollback: false,
} as const;

function counts(...buckets: MatchQueueCounts["buckets"]): MatchQueueCounts {
  return { buckets, waiting: [] };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("match queue activity", () => {
  it("shows players searching with the selected settings and in every queue before joining", async () => {
    const load = vi.fn<() => Promise<MatchQueueCounts>>(async () =>
      counts(
        { ...casualTimed, searching: 2 },
        { ...casualTimed, matchTimer: false, searching: 1 },
        { ...casualTimed, queue: MatchQueue.RANKED.value, searching: 4 },
      ),
    );
    render(
      <I18nProvider>
        <MatchQueueActivity selection={casualTimed} load={load} />
      </I18nProvider>,
    );
    expect(await screen.findByText("Searching now: 2 with these settings, 7 in all queues")).toBeTruthy();
  });

  it("leaves the waiting player out of the counts they see", async () => {
    const load = vi.fn<() => Promise<MatchQueueCounts>>(async () =>
      counts({ ...casualTimed, searching: 1 }, { ...casualTimed, format: "pauper", searching: 2 }),
    );
    render(
      <I18nProvider>
        <MatchQueueActivity selection={casualTimed} viewerQueued load={load} />
      </I18nProvider>,
    );
    expect(await screen.findByText("Also searching: 0 with these settings, 2 in all queues")).toBeTruthy();
  });

  it("shows nothing when the counts cannot be loaded", async () => {
    const load = vi.fn<() => Promise<MatchQueueCounts>>(async () => {
      throw new Error("offline");
    });
    const { container } = render(
      <I18nProvider>
        <MatchQueueActivity selection={casualTimed} load={load} />
      </I18nProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".match-queue-activity")).toBeNull();
  });

  it("refreshes the counts every ten seconds while the page is visible", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn<() => Promise<MatchQueueCounts>>()
      .mockResolvedValueOnce(counts())
      .mockResolvedValueOnce(counts({ ...casualTimed, searching: 3 }));
    render(
      <I18nProvider>
        <MatchQueueActivity selection={casualTimed} viewerQueued load={load} />
      </I18nProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Also searching: 0 with these settings, 0 in all queues")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Also searching: 2 with these settings, 2 in all queues")).toBeTruthy();
  });
});
