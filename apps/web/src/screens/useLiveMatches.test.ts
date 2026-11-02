// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LiveMatch, LiveMatchPage } from "@aegis/shared/protocol/LiveMatch";
import { useLiveMatches } from "./useLiveMatches";

afterEach(cleanup);

function pageOf(limit: number, total: number): LiveMatchPage {
  const matches = Array.from({ length: Math.min(limit, total) }, (_, index) => ({
    spectatorCode: `CODE${index}`,
    players: ["A", "B"],
    format: "standard",
    startedAt: 1,
    spectators: 0,
  })) as LiveMatch[];
  return { matches, total };
}

it("loads one more page per request and stops at the largest page", async () => {
  const load = vi.fn(async (limit: number) => pageOf(limit, 80));
  const { result } = renderHook(() => useLiveMatches({ load }));
  await waitFor(() => expect(result.current.page?.matches).toHaveLength(10));
  expect(load).toHaveBeenLastCalledWith(10);
  for (const expected of [20, 30, 40, 50]) {
    act(() => result.current.showMore());
    await waitFor(() => expect(result.current.page?.matches).toHaveLength(expected));
  }
  expect(result.current.canShowMore).toBe(false);
});

it("has no next page once the total is loaded", async () => {
  const { result } = renderHook(() => useLiveMatches({ load: async (limit) => pageOf(limit, 4) }));
  await waitFor(() => expect(result.current.page?.total).toBe(4));
  expect(result.current.canShowMore).toBe(false);
});
