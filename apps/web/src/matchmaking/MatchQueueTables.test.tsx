// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { I18nProvider } from "@/i18n/I18nProvider";
import { MatchQueueTables } from "@/matchmaking/MatchQueueTables";

const casualTimed = {
  queue: MatchQueue.CASUAL.value,
  format: "standard",
  matchTimer: true,
  bestOf: 1,
  allowRollback: false,
} as const;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderTables(counts: MatchQueueCounts, onChallenge = vi.fn<(selection: MatchQueueSelection) => void>()) {
  render(
    <I18nProvider>
      <MatchQueueTables counts={counts} onChallenge={onChallenge} />
    </I18nProvider>,
  );
  return onChallenge;
}

function tables() {
  return within(screen.getByRole("region", { name: "Waiting room" })).getAllByRole("listitem");
}

describe("match queue waiting room", () => {
  it("invites the player to be first when every table is empty", () => {
    renderTables({ buckets: [], waiting: [] });
    expect(screen.getByText("No one is in a quick match queue yet. Enter the queue and be the first.")).toBeTruthy();
    expect(screen.queryByText(/in queue/)).toBeNull();
  });

  it("seats waiting players at one table per settings, longest wait first, without identities", () => {
    renderTables({
      buckets: [
        { ...casualTimed, searching: 5 },
        { ...casualTimed, matchTimer: false, allowRollback: true, searching: 1 },
      ],
      waiting: [
        { ...casualTimed, waitingSeconds: 72 },
        { ...casualTimed, matchTimer: false, allowRollback: true, waitingSeconds: 3_725 },
      ],
    });
    expect(screen.getByText("6 in queue")).toBeTruthy();
    const [longest, crowded] = tables();
    expect(longest!.textContent).toContain("Best of 1 · Timer OFF · Rollback");
    expect(longest!.textContent).toContain("1h 02m");
    expect(within(crowded!).getByRole("img", { name: "5 players waiting" }).textContent).toContain("+2");
    expect(crowded!.textContent).toContain("1m 12s");
  });

  it("challenges a table with its settings", () => {
    const onChallenge = renderTables({
      buckets: [{ ...casualTimed, bestOf: 3, searching: 1 }],
      waiting: [{ ...casualTimed, bestOf: 3, waitingSeconds: 10 }],
    });
    fireEvent.click(within(tables()[0]!).getByRole("button", { name: /Challenge/ }));
    expect(onChallenge).toHaveBeenCalledWith({ ...casualTimed, bestOf: 3 });
  });

  it("names the manual table and keeps counting wait time between refreshes", async () => {
    vi.useFakeTimers();
    renderTables({
      buckets: [{ ...casualTimed, queue: MatchQueue.MANUAL.value, searching: 1 }],
      waiting: [{ ...casualTimed, queue: MatchQueue.MANUAL.value, waitingSeconds: 58 }],
    });
    const [manual] = tables();
    expect(manual!.textContent).toContain("Manual table");
    expect(manual!.textContent).not.toContain("Timer ON");
    expect(manual!.textContent).toContain("58s");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(manual!.textContent).toContain("1m 01s");
  });
});
