// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { FeedbackScreen } from "./FeedbackScreen";
import type { FeedbackDetail, FeedbackPage, FeedbackRecord } from "./adminClient";

const item: FeedbackRecord = {
  id: 42,
  report: {
    kind: "bug",
    summary: "Effect did not activate",
    description: "<script>alert(1)</script>\nPlay Agumon",
    cardIds: ["BT1-010"],
    matchId: "match-id",
    reporterName: "Kai",
  },
  createdAt: 1780000000000,
  githubStatus: "failed",
  githubNumber: null,
  githubUrl: null,
  status: "new",
  finalReply: null,
  internalNote: null,
  duplicateOfId: null,
  revision: 0,
  hasReporterAccount: true,
  reopenedAt: null,
  confirmedBug: false,
};

const counts = { new: 1, triaged: 0, in_progress: 0, resolved: 0, wont_fix: 0, duplicate: 0 };
const page = (items: FeedbackRecord[], nextBefore: number | null = null, reopenedCount = 0): FeedbackPage => ({
  items,
  nextBefore,
  counts,
  reopenedCount,
});
const detail = (record: FeedbackRecord = item, history: FeedbackDetail["history"] = []): FeedbackDetail => ({
  ...record,
  reporterConfirmedBugs: record.hasReporterAccount ? 2 : null,
  history: [
    { from: null, to: "new", at: record.createdAt, byReporter: false, comment: null, actorName: null },
    ...history,
  ],
});

type Reply = [status: number, body: unknown];
type Handler = (url: string, init?: RequestInit) => Reply;

const REPORTED_DECKS = "/admin/community/reports";
const PLAYTEST = "/admin/playtest/";
const REPORTED_TOURNAMENTS = "/account/admin/tournament-reports";

function mockApi(handler: Handler, reportedDecks: unknown[] = []) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const [status, body] = url.endsWith(REPORTED_DECKS)
      ? [200, { decks: reportedDecks }]
      : url.endsWith(REPORTED_TOURNAMENTS)
        ? [200, { reports: [] }]
        : url.includes(PLAYTEST)
          ? [200, url.endsWith("/members") ? { members: [] } : { open: [], past: [] }]
          : handler(url, init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function show(
  props: {
    isAdmin?: boolean;
    selectedId?: number;
    onSelect?: (id: number | undefined) => void;
    onOpenDeck?: (id: string) => void;
  } = {},
) {
  return render(
    <I18nProvider>
      <FeedbackScreen
        isAdmin={props.isAdmin ?? true}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        onOpenDeck={props.onOpenDeck}
      />
    </I18nProvider>,
  );
}

const urls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => !url.endsWith(REPORTED_DECKS) && !url.includes(PLAYTEST));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("administrator feedback inbox", () => {
  it("does not fetch reports for a non-admin, even on the direct screen", () => {
    const fetchMock = mockApi(() => [200, {}]);
    show({ isAdmin: false });
    expect(screen.getByText("Only administrators can view feedback.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists reports as text with status counts and opens one on click", async () => {
    const onSelect = vi.fn<(id: number | undefined) => void>();
    const fetchMock = mockApi(() => [200, page([item])]);
    show({ onSelect });
    const row = await screen.findByRole("button", { name: /Effect did not activate/ });
    expect(document.querySelector(".feedback-row script")).toBeNull();
    expect(within(row).getByText("Kai", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New 1" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "All 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock.mock.calls.find(([input]) => String(input).includes("/admin/feedback"))![1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(42);
  });

  it("sends status, kind and debounced search filters", async () => {
    const fetchMock = mockApi(() => [200, page([item])]);
    show();
    await screen.findByRole("button", { name: /Effect did not activate/ });

    fireEvent.click(screen.getByRole("button", { name: "Resolved 0" }));
    await waitFor(() => expect(urls(fetchMock).at(-1)).toContain("status=resolved"));
    fireEvent.change(screen.getByRole("combobox", { name: "Kind" }), { target: { value: "improvement" } });
    await waitFor(() => expect(urls(fetchMock).at(-1)).toContain("kind=improvement"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search feedback" }), { target: { value: " BT1-010 " } });
    await waitFor(() => expect(urls(fetchMock).at(-1)).toContain("q=BT1-010"));
    expect(urls(fetchMock).at(-1)).toContain("status=resolved");
  });

  it("paginates by cursor", async () => {
    const fetchMock = mockApi((url) => [200, url.includes("before=42") ? page([]) : page([item], 42)]);
    show();
    await screen.findByRole("button", { name: /Effect did not activate/ });
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("No feedback on this page.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Older" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Newer" }));
    await waitFor(() => expect(urls(fetchMock).at(-1)).not.toContain("before"));
  });

  it("allows retrying after a failed request", async () => {
    let healthy = false;
    mockApi(() => (healthy ? [200, page([])] : [500, {}]));
    show();
    expect(await screen.findByText("Could not load feedback. Try refreshing.")).toBeTruthy();
    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("No feedback on this page.")).toBeTruthy();
  });

  it.each([401, 403])("handles a server-side access rejection (%s)", async (status) => {
    mockApi(() => [status, {}]);
    show();
    expect(await screen.findByText("Only administrators can view feedback.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("removes reports immediately when administrator permission disappears", async () => {
    mockApi((url) => [200, url.includes("/admin/feedback/42") ? detail() : page([item])]);
    const view = show({ selectedId: 42 });
    await screen.findByRole("heading", { name: item.report.summary });
    view.rerender(
      <I18nProvider>
        <FeedbackScreen isAdmin={false} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText(item.report.summary)).toBeNull();
  });
});

describe("triage form", () => {
  function api(patch: (body: Record<string, unknown>) => Reply) {
    return mockApi((url, init) => {
      if (init?.method === "PATCH") return patch(JSON.parse(String(init.body)) as Record<string, unknown>);
      return [200, url.includes("/admin/feedback/42") ? detail() : page([item])];
    });
  }

  it("requires a final reply to close, then saves, notifies and updates the list", async () => {
    const fetchMock = api((body) => [
      200,
      detail({ ...item, status: "resolved", finalReply: body.finalReply as string, revision: 1 }),
    ]);
    show({ selectedId: 42 });
    expect(await screen.findByText("match-id")).toBeTruthy();
    expect(screen.getByText("Report received", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Resolved" }));
    expect(screen.getByText("A closed report needs a final reply.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Final reply to the player (required)" }), {
      target: { value: "Fixed in 1.19." },
    });
    expect(screen.getByText("Saving notifies the reporter.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeTruthy();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(String(patch[0])).toContain("/admin/feedback/42");
    expect(JSON.parse(String(patch[1]!.body))).toEqual({
      revision: 0,
      status: "resolved",
      finalReply: "Fixed in 1.19.",
      internalNote: "",
      duplicateOfId: null,
      confirmedBug: false,
    });
    const row = screen.getByRole("button", { name: /Effect did not activate/ });
    expect(within(row).getByText("Resolved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolved 1" })).toBeTruthy();
  });

  it("keeps the admin's draft when another admin saved first", async () => {
    let attempts = 0;
    const fetchMock = api((body) => {
      attempts += 1;
      if (attempts === 1)
        return [409, { error: "stale_revision", current: detail({ ...item, status: "triaged", revision: 1 }) }];
      return [200, detail({ ...item, status: "in_progress", revision: 2, internalNote: body.internalNote as string })];
    });
    show({ selectedId: 42 });
    await screen.findByText("match-id");
    fireEvent.click(screen.getByRole("radio", { name: "In progress" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Internal note/ }), { target: { value: "repro" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Another admin saved this report first")).toBeTruthy();
    expect(screen.getByText(/It is now Triaged/)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /Internal note/ }) as HTMLTextAreaElement).value).toBe("repro");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init!.body)) as { revision: number });
    expect(bodies.map((body) => body.revision)).toEqual([0, 1]);
  });

  it("asks for an original report when marking a duplicate", async () => {
    api(() => [200, detail()]);
    show({ selectedId: 42 });
    await screen.findByText("match-id");
    fireEvent.click(screen.getByRole("radio", { name: "Duplicate" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Final reply/ }), { target: { value: "Tracked elsewhere." } });
    expect(screen.getByText("Enter the number of another existing report.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Duplicate of report #" }), { target: { value: "42" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Duplicate of report #" }), { target: { value: "7a" } });
    expect((screen.getByRole("textbox", { name: "Duplicate of report #" }) as HTMLInputElement).value).toBe("7");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tells the admin when nobody can be notified", async () => {
    const anonymous = { ...item, hasReporterAccount: false };
    mockApi((url) => [200, url.includes("/admin/feedback/42") ? detail(anonymous) : page([anonymous])]);
    show({ selectedId: 42 });
    expect(await screen.findByText("Anonymous report. Nobody will be notified.")).toBeTruthy();
  });

  it("asks before discarding unsaved edits when opening another report", async () => {
    const onSelect = vi.fn<(id: number | undefined) => void>();
    const other = { ...item, id: 41, report: { ...item.report, summary: "Another report" } };
    mockApi((url) => [200, url.includes("/admin/feedback/42") ? detail() : page([item, other])]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    show({ selectedId: 42, onSelect });
    await screen.findByText("match-id");
    fireEvent.change(screen.getByRole("textbox", { name: /Internal note/ }), { target: { value: "draft" } });

    fireEvent.click(screen.getByRole("button", { name: /Another report/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Another report/ }));
    expect(onSelect).toHaveBeenCalledWith(41);
  });
});

describe("reports reopened by their reporter", () => {
  const reopened: FeedbackRecord = {
    ...item,
    status: "triaged",
    finalReply: "Fixed.",
    reopenedAt: Date.now() - 60_000,
  };
  const reopening = {
    from: "resolved" as const,
    to: "triaged" as const,
    at: Date.now() - 60_000,
    byReporter: true,
    comment: "Still broken after the update.",
    actorName: "Kai",
  };

  it("flags them in the list and filters them as their own queue", async () => {
    const fetchMock = mockApi(() => [200, page([reopened], null, 1)]);
    show();
    const row = await screen.findByRole("button", { name: /Effect did not activate/ });
    expect(within(row).getByText("Reopened")).toBeTruthy();
    const chip = screen.getByRole("button", { name: "Reopened 1" });
    expect(chip.getAttribute("data-attention")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Triaged 0" }));
    await waitFor(() => expect(urls(fetchMock).at(-1)).toContain("status=triaged"));
    fireEvent.click(chip);
    await waitFor(() => expect(urls(fetchMock).at(-1)).toContain("reopened=1"));
    expect(urls(fetchMock).at(-1)).not.toContain("status=");
  });

  it("shows the reporter's comment above the form and in the history", async () => {
    mockApi((url) => [
      200,
      url.includes("/admin/feedback/42") ? detail(reopened, [reopening]) : page([reopened], null, 1),
    ]);
    show({ selectedId: 42 });
    expect(await screen.findByText(/Kai reopened this report/)).toBeTruthy();
    expect(screen.getByText("Still broken after the update.", { selector: "blockquote" })).toBeTruthy();
    expect(screen.getByText(/Kai reopened it: “Still broken after the update.”/)).toBeTruthy();
  });

  it("drops the reopened count once the report is closed again", async () => {
    api((body) => [
      200,
      detail({ ...reopened, status: "resolved", finalReply: body.finalReply as string, revision: 1 }, [reopening]),
    ]);
    show({ selectedId: 42 });
    await screen.findByText(/Kai reopened this report/);
    fireEvent.click(screen.getByRole("radio", { name: "Resolved" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopened 0" })).toBeTruthy();
    expect(screen.queryByText(/Kai reopened this report/)).toBeNull();
  });

  function api(patch: (body: Record<string, unknown>) => Reply) {
    return mockApi((url, init) => {
      if (init?.method === "PATCH") return patch(JSON.parse(String(init.body)) as Record<string, unknown>);
      return [200, url.includes("/admin/feedback/42") ? detail(reopened, [reopening]) : page([reopened], null, 1)];
    });
  }
});

describe("confirming a real bug", () => {
  function api(patch: (body: Record<string, unknown>) => Reply, record: FeedbackRecord = item) {
    return mockApi((url, init) => {
      if (init?.method === "PATCH") return patch(JSON.parse(String(init.body)) as Record<string, unknown>);
      return [200, url.includes("/admin/feedback/42") ? detail(record) : page([record])];
    });
  }

  it("awards the reporter a point and notifies them", async () => {
    const fetchMock = api(() => [
      200,
      { ...detail({ ...item, confirmedBug: true, revision: 1 }), reporterConfirmedBugs: 3 },
    ]);
    show({ selectedId: 42 });
    expect(await screen.findByText(/Kai \(2 confirmed bugs\)/)).toBeTruthy();
    expect(screen.getByText("Kai earns 1 point. They have 2 now.")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmed bug" }));
    expect(screen.getByText("Saving notifies the reporter.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]!.body))).toMatchObject({ confirmedBug: true });
    const row = screen.getByRole("button", { name: /Effect did not activate/ });
    expect(within(row).getByText("Confirmed bug")).toBeTruthy();
  });

  it("never counts a duplicate and explains who would get the point", async () => {
    api(() => [200, detail()]);
    show({ selectedId: 42 });
    await screen.findByText("match-id");
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmed bug" }));
    fireEvent.click(screen.getByRole("radio", { name: "Duplicate" }));
    const checkbox = screen.getByRole("checkbox", { name: "Confirmed bug" }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText("Duplicates earn no point; the original report holds it.")).toBeTruthy();
  });

  it("says nobody earns the point on an anonymous report", async () => {
    const anonymous = { ...item, hasReporterAccount: false };
    api(() => [200, detail(anonymous)], anonymous);
    show({ selectedId: 42 });
    expect(await screen.findByText("Anonymous report: nobody earns the point.")).toBeTruthy();
  });
});

describe("reported community decks", () => {
  it("lists decks waiting on a moderator and opens one", async () => {
    const onOpenDeck = vi.fn<(id: string) => void>();
    mockApi(
      () => [200, page([item])],
      [
        {
          id: "deck-1",
          name: "Rude name",
          authorName: "Troll",
          status: "public",
          openReports: 3,
          lastReportedAt: Date.now() - 60_000,
        },
      ],
    );
    show({ onOpenDeck });
    fireEvent.click(await screen.findByText("Reported community decks (1)"));
    fireEvent.click(screen.getByRole("button", { name: /Rude name/ }));
    expect(onOpenDeck).toHaveBeenCalledWith("deck-1");
    expect(screen.getByText(/3 reports/)).toBeTruthy();
  });

  it("stays out of the way when nothing is reported", async () => {
    mockApi(() => [200, page([item])]);
    show();
    await screen.findByRole("button", { name: /Effect did not activate/ });
    expect(screen.queryByText(/Reported community decks/)).toBeNull();
  });
});
