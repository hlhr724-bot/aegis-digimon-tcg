import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameState, PlayerState, type MatchReplay } from "@aegis/shared";
import type { LiveReplayAnnotationRequest } from "@aegis/shared/replays/annotations/LiveReplayAnnotation";
import { I18nProvider } from "@/i18n";
import { LiveReplayAnnotationBar } from "@/replays/annotations/LiveReplayAnnotationBar";
import { ReplayPlayer } from "@/replays/ReplayPlayer";

const MATCH_ID = "00000000-0000-4000-8000-000000000042";

vi.mock("@/game/GameScreen", () => ({
  GameScreen: () => <div>Replay board</div>,
}));
vi.mock("@/replays/ReplayRecording", () => ({
  ReplayRecording: () => null,
}));

function buildReplay(): MatchReplay {
  const state = new GameState();
  for (const seat of [0, 1] as const) {
    state.players.push(Object.assign(new PlayerState(), { seat, displayName: `Player ${seat}` }));
  }
  const frames = [1, 1, 2].map((turnCount, index) => {
    state.turnCount = turnCount;
    state.stateVersion = index + 1;
    return { atMs: index * 1000, state: state.toJSON() as unknown as GameState, events: [] };
  });
  return {
    id: MATCH_ID,
    mode: "casual",
    players: ["Player 0", "Player 1"],
    startedAt: 0,
    finishedAt: 3000,
    winnerSeat: 0,
    frameCount: frames.length,
    format: "aegis-replay",
    version: 1,
    viewerSeat: 0,
    visibleHandSeats: [0, 1],
    frames,
  };
}

const savedMarker = { id: "m1", matchId: MATCH_ID, frameIndex: 2, turn: 2, emoji: "⭐", createdAt: 1 };

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [] });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
  vi.unstubAllGlobals();
});

it("shows saved markers on the timeline, jumps to them and marks the current moment", async () => {
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method === "POST") {
      return Response.json({ ...savedMarker, id: "m2", frameIndex: 0, turn: 1, emoji: "💡" }, { status: 201 });
    }
    expect(String(input)).toContain(`/replay-annotations/${MATCH_ID}`);
    return Response.json({ markers: [savedMarker], notes: [], canAnnotate: true, shared: [], ownReplays: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} />
    </I18nProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "⭐ Turn 2, action 3" }));
  expect(await screen.findByText("Action 3 of 3")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Go to start" }));
  fireEvent.click(screen.getByRole("button", { name: "Show annotations" }));
  fireEvent.click(screen.getByRole("button", { name: "Idea" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "POST" })),
  );
  const body = JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
  expect(body).toEqual({ frameIndex: 0, turn: 1, emoji: "💡" });
  expect(await screen.findByRole("button", { name: "💡 Turn 1, action 1" })).toBeTruthy();
});

it("marks the shown moment from the playback bar without opening the panel", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === "POST") {
      return Response.json({ ...savedMarker, id: "m2", frameIndex: 0, turn: 1, emoji: "🔥" }, { status: 201 });
    }
    return Response.json({ markers: [], notes: [], canAnnotate: true, shared: [], ownReplays: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} />
    </I18nProvider>,
  );

  const shortcut = (await screen.findByTitle("Mark this moment")).closest("details")!;
  fireEvent.click(shortcut.querySelector("summary")!);
  fireEvent.click(await within(shortcut).findByRole("button", { name: "Great play" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "POST" })),
  );
  const body = JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
  expect(body).toEqual({ frameIndex: 0, turn: 1, emoji: "🔥" });
  expect(await screen.findByRole("button", { name: "🔥 Turn 1, action 1" })).toBeTruthy();
  expect(shortcut.open).toBe(false);
  expect(screen.queryByRole("complementary", { name: "Annotations" })).toBeNull();
});

it("marks a moment with an emoji outside the presets, typed or picked from the extra grid", async () => {
  let created = 0;
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === "POST") {
      const { emoji } = JSON.parse(String(init.body)) as { emoji: string };
      created += 1;
      return Response.json({ ...savedMarker, id: `c${created}`, frameIndex: 0, turn: 1, emoji }, { status: 201 });
    }
    return Response.json({ markers: [], notes: [], canAnnotate: true, shared: [], ownReplays: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show annotations" }));
  const panel = await screen.findByRole("complementary", { name: "Annotations" });

  fireEvent.click(within(panel).getByRole("button", { name: "Other emoji" }));
  fireEvent.click(within(panel).getByRole("button", { name: "🎯" }));
  expect(await screen.findByRole("button", { name: "🎯 Turn 1, action 1" })).toBeTruthy();
  expect(within(panel).getByRole("button", { name: "Other emoji" }).getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(within(panel).getByRole("button", { name: "Other emoji" }));
  const field = within(panel).getByLabelText("Or type any emoji");
  const use = within(panel).getByRole("button", { name: "Use" }) as HTMLButtonElement;
  fireEvent.change(field, { target: { value: "ok" } });
  expect(within(panel).getByRole("alert").textContent).toBe("Enter one emoji.");
  expect(use.disabled).toBe(true);
  fireEvent.change(field, { target: { value: " 🦖 " } });
  expect(use.disabled).toBe(false);
  fireEvent.click(use);
  expect(await screen.findByRole("button", { name: "🎯 Turn 1, action 1; 🦖 Turn 1, action 1" })).toBeTruthy();

  const posted = fetcher.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)).emoji);
  expect(posted).toEqual(["🎯", "🦖"]);
});

it("adds, edits and deletes a text note at the shown moment", async () => {
  const savedNote = {
    id: "n1",
    matchId: MATCH_ID,
    frameIndex: 0,
    turn: 1,
    text: "Hold the blocker",
    createdAt: 1,
    updatedAt: 1,
  };
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === "POST") {
      return Response.json(savedNote, { status: 201 });
    }
    if (init?.method === "PATCH") {
      return Response.json({ ...savedNote, text: JSON.parse(String(init.body)).text, updatedAt: 2 });
    }
    if (init?.method === "DELETE") {
      return Response.json({ ok: true });
    }
    return Response.json({ markers: [], notes: [], canAnnotate: true, shared: [], ownReplays: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show annotations" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add a note at this moment" }));
  const field = screen.getByLabelText("Add a note at this moment");
  fireEvent.change(field, { target: { value: "  Hold the blocker  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  expect(await screen.findByText("Hold the blocker")).toBeTruthy();
  const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ frameIndex: 0, turn: 1, text: "Hold the blocker" });
  expect(screen.getByRole("button", { name: "Note on turn 1, action 1: Hold the blocker" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
  fireEvent.change(screen.getByLabelText("Edit note"), { target: { value: "Attack first" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save note" }).at(-1)!);
  expect(await screen.findByText("Attack first")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
  expect(await screen.findByText("No markers or notes yet.")).toBeTruthy();
});

it("opens a deep link at its action, shares annotations with the replay and copies chapters", async () => {
  const sharing: unknown[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method === "PUT") {
      sharing.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return Response.json({ replayId: "11111111-1111-4111-8111-111111111111", annotationsShared: true });
    }
    return Response.json({
      markers: [savedMarker],
      notes: [],
      canAnnotate: true,
      shared: [
        {
          authorName: "Coach",
          markers: [],
          notes: [
            { id: "s1", matchId: MATCH_ID, frameIndex: 1, turn: 1, text: "Watch this", createdAt: 1, updatedAt: 1 },
          ],
        },
      ],
      ownReplays: [
        { replayId: "11111111-1111-4111-8111-111111111111", visibility: "public", annotationsShared: false },
      ],
    });
  });
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
  vi.stubGlobal("fetch", fetcher);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} initialIndex={1} />
    </I18nProvider>,
  );
  expect(screen.getByText("Action 2 of 3")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Show annotations" }));
  expect(await screen.findByText("Shared by Coach")).toBeTruthy();
  expect(screen.getByText("Watch this")).toBeTruthy();

  fireEvent.click(screen.getByRole("checkbox", { name: /Include my markers and notes/ }));
  await waitFor(() => expect(sharing).toHaveLength(1));
  expect(sharing[0]).toEqual({
    url: expect.stringContaining("/account/replays/11111111-1111-4111-8111-111111111111/annotation-sharing"),
    body: { shared: true },
  });
  await waitFor(() =>
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /Include my markers and notes/ }).checked).toBe(true),
  );

  fireEvent.click(screen.getByRole("button", { name: "Copy link to this moment" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText.mock.calls[0]![0]).toMatch(/\/replays\/11111111-1111-4111-8111-111111111111\?at=2$/);

  fireEvent.click(screen.getByRole("button", { name: "Copy YouTube chapters" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  expect(writeText.mock.calls[1]![0]).toBe("0:00 Player 0 vs Player 1 · ⭐ Key moment · Turn 2");
});

it("tells a live player whether the private marker was saved", () => {
  const send = vi.fn<(request: LiveReplayAnnotationRequest) => void>();
  const view = render(
    <I18nProvider>
      <LiveReplayAnnotationBar annotations={{ send, lastResult: undefined }} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Turning point" }));
  expect(send).toHaveBeenCalledWith({ kind: "marker", emoji: "🔄" });
  view.rerender(
    <I18nProvider>
      <LiveReplayAnnotationBar
        annotations={{
          send,
          lastResult: { kind: "marker", marker: { ...savedMarker, emoji: "🔄", turn: 4 } },
        }}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("status").textContent).toBe("Marked 🔄 on turn 4. Only you can see it.");
  view.rerender(
    <I18nProvider>
      <LiveReplayAnnotationBar annotations={{ send, lastResult: { kind: "rejected", reason: "sign_in_required" } }} />
    </I18nProvider>,
  );
  expect(screen.getByRole("status").textContent).toBe("Sign in to save replay markers.");
  fireEvent.change(screen.getByLabelText("Private note"), { target: { value: "Opponent kept two blockers" } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  expect(send).toHaveBeenLastCalledWith({ kind: "note", text: "Opponent kept two blockers" });
});
