// @vitest-environment jsdom
import type { OwnFeedbackReport } from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { MyFeedbackPanel } from "./MyFeedbackPanel";

const resolved: OwnFeedbackReport = {
  id: 12,
  kind: "bug",
  summary: "Deck changes disappeared",
  description: "I refreshed and lost edits.",
  cardIds: [],
  createdAt: Date.UTC(2026, 9, 6),
  status: "resolved",
  finalReply: "Fixed in 1.19.",
  duplicateOfId: null,
  history: [
    { from: null, to: "new", at: Date.UTC(2026, 9, 6), byReporter: false, comment: null },
    { from: "new", to: "in_progress", at: Date.UTC(2026, 9, 8), byReporter: false, comment: null },
    { from: "in_progress", to: "resolved", at: Date.UTC(2026, 9, 9), byReporter: false, comment: null },
  ],
  reopenDeadline: Date.now() + 10 * 24 * 60 * 60 * 1000,
  confirmedBug: true,
};
const open: OwnFeedbackReport = {
  ...resolved,
  id: 10,
  summary: "Lobby stays open",
  status: "triaged",
  finalReply: null,
  history: [{ from: null, to: "new", at: Date.UTC(2026, 9, 1), byReporter: false, comment: null }],
  reopenDeadline: null,
  confirmedBug: false,
};

function mockApi(handler: (url: string, init?: RequestInit) => [number, unknown]) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const [status, body] = handler(String(input), init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function show(props: { signedIn?: boolean; focusId?: number } = {}) {
  const callbacks = { onSignIn: vi.fn<() => void>(), onSendFeedback: vi.fn<() => void>() };
  render(
    <I18nProvider>
      <MyFeedbackPanel signedIn={props.signedIn ?? true} focusId={props.focusId} {...callbacks} />
    </I18nProvider>,
  );
  return callbacks;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("my feedback", () => {
  it("asks a guest to sign in without fetching", () => {
    const fetchMock = mockApi(() => [200, {}]);
    const { onSignIn } = show({ signedIn: false });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the reporter's points and which reports earned them", async () => {
    mockApi(() => [200, { items: [resolved, open], nextBefore: null, confirmedBugs: 4 }]);
    show();
    expect(await screen.findByText("Confirmed bugs: 4")).toBeTruthy();
    const earned = screen.getByRole("heading", { name: resolved.summary }).closest("article")!;
    const pending = screen.getByRole("heading", { name: open.summary }).closest("article")!;
    expect(within(earned).getByText("Confirmed bug")).toBeTruthy();
    expect(within(pending).queryByText("Confirmed bug")).toBeNull();
  });

  it("shows each report's progress and the team's reply once expanded", async () => {
    mockApi(() => [200, { items: [resolved, open], nextBefore: null }]);
    show();
    const card = (await screen.findByRole("heading", { name: resolved.summary })).closest("article")!;
    const steps = within(card).getAllByRole("listitem");
    expect(steps.find((step) => step.getAttribute("aria-current") === "step")?.textContent).toBe("Closed");
    expect(within(card).queryByText("Fixed in 1.19.")).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: `Show details of “${resolved.summary}”` }));
    expect(within(card).getByText("Reply from the Aegis team")).toBeTruthy();
    expect(within(card).getByText("Fixed in 1.19.")).toBeTruthy();

    const pending = screen.getByRole("heading", { name: open.summary }).closest("article")!;
    fireEvent.click(within(pending).getByRole("button", { name: /Show details/ }));
    expect(within(pending).getByText(/No reply yet/)).toBeTruthy();
    expect(within(pending).getByText("Triaged", { selector: "[aria-current] span" })).toBeTruthy();
  });

  it("opens and refreshes the report a notification points to", async () => {
    const stale = { ...resolved, status: "in_progress" as const, finalReply: null };
    const fetchMock = mockApi((url) =>
      url.endsWith("/feedback/mine/12") ? [200, resolved] : [200, { items: [stale, open], nextBefore: null }],
    );
    show({ focusId: 12 });
    expect(await screen.findByText("Fixed in 1.19.")).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: resolved.summary })).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/feedback/mine/12"))).toBe(true);
  });

  it("explains an empty history and a failed load", async () => {
    mockApi(() => [200, { items: [], nextBefore: null }]);
    show();
    expect(await screen.findByText("You have not sent any feedback while signed in yet.")).toBeTruthy();
    cleanup();
    mockApi(() => [500, {}]);
    show();
    expect(await screen.findByText("Could not load your feedback. Try again later.")).toBeTruthy();
  });

  it("loads older reports on request", async () => {
    const fetchMock = mockApi((url) =>
      url.includes("before=10")
        ? [200, { items: [{ ...open, id: 3, summary: "Old one" }], nextBefore: null }]
        : [200, { items: [resolved, open], nextBefore: 10 }],
    );
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Show older reports" }));
    expect(await screen.findByRole("heading", { name: "Old one" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show older reports" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("reopening a closed report", () => {
  const reopened: OwnFeedbackReport = {
    ...resolved,
    status: "triaged",
    reopenDeadline: null,
    history: [
      ...resolved.history,
      { from: "resolved", to: "triaged", at: Date.now(), byReporter: true, comment: "Still loses edits." },
    ],
  };

  async function expandResolved() {
    const card = (await screen.findByRole("heading", { name: resolved.summary })).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: /Show details/ }));
    return card;
  }

  it("sends the comment and shows the earlier reply as disputed", async () => {
    const fetchMock = mockApi((url, init) =>
      init?.method === "POST" ? [200, reopened] : [200, { items: [resolved], nextBefore: null }],
    );
    show();
    const card = await expandResolved();
    expect(within(card).getByText(/You can reopen it once, until/)).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "This didn't solve it" }));
    const submit = within(card).getByRole("button", { name: "Reopen report" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(card).getByRole("textbox", { name: "What is still wrong?" }), {
      target: { value: "Still loses edits." },
    });
    fireEvent.click(submit);

    expect(await within(card).findByText("Earlier reply from the Aegis team")).toBeTruthy();
    expect(within(card).getByText(/You reopened this report/)).toBeTruthy();
    expect(within(card).getByText(/You reopened it: “Still loses edits.”/)).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "This didn't solve it" })).toBeNull();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toContain("/feedback/mine/12/reopen");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ comment: "Still loses edits." });
  });

  it("explains a refused reopen", async () => {
    mockApi((url, init) =>
      init?.method === "POST"
        ? [409, { error: "reopen_window_closed" }]
        : [200, { items: [resolved], nextBefore: null }],
    );
    show();
    const card = await expandResolved();
    fireEvent.click(within(card).getByRole("button", { name: "This didn't solve it" }));
    fireEvent.change(within(card).getByRole("textbox", { name: "What is still wrong?" }), {
      target: { value: "late" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Reopen report" }));
    expect(await within(card).findByText(/The time to reopen this report has ended/)).toBeTruthy();
  });

  it("offers no reopen once the window has passed", async () => {
    mockApi(() => [200, { items: [{ ...resolved, reopenDeadline: Date.now() - 1000 }], nextBefore: null }]);
    show();
    const card = await expandResolved();
    expect(within(card).queryByRole("button", { name: "This didn't solve it" })).toBeNull();
  });
});
