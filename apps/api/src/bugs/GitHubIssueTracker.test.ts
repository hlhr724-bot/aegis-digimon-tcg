import { describe, expect, it, vi } from "vitest";
import {
  GitHubIssueTracker,
  issueBody,
  issueTitle,
  neutralizeMarkdownRefs,
  type NewBugReport,
} from "./GitHubIssueTracker.js";

function report(overrides: Partial<NewBugReport> = {}): NewBugReport {
  return {
    reporterName: "Tamer",
    kind: "bug",
    summary: "On-play never fires",
    cardIds: ["BT1-010"],
    description: "Play it, nothing happens",
    ...overrides,
  };
}

function okResponse(): Response {
  return new Response(JSON.stringify({ number: 7, html_url: "https://github.com/example/repo/issues/7" }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

describe("filing an issue", () => {
  it("posts to the configured repository with the token, the labels and the kind's label", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => okResponse());
    const tracker = new GitHubIssueTracker({
      repository: "example/repo",
      token: "secret",
      labels: ["player-report", "cards"],
      fetch: fetchMock,
    });

    const filed = await tracker.file(report());

    expect(filed).toEqual({ number: 7, url: "https://github.com/example/repo/issues/7" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/example/repo/issues");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(String(init!.body)) as { title: string; labels: string[] };
    expect(body.labels).toEqual(["player-report", "cards", "bug"]);
    expect(body.title).toBe("BT1-010 — On-play never fires");
  });

  it("labels an improvement as an enhancement and anything else as feedback", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => okResponse());
    const tracker = new GitHubIssueTracker({ repository: "example/repo", token: "secret", fetch: fetchMock });

    await tracker.file(report({ kind: "improvement" }));
    await tracker.file(report({ kind: "other" }));

    const labels = fetchMock.mock.calls.map(
      ([, init]) => (JSON.parse(String(init!.body)) as { labels: string[] }).labels,
    );
    expect(labels).toEqual([["enhancement"], ["feedback"]]);
  });

  it("stamps the server revision it was configured with", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => okResponse());
    const tracker = new GitHubIssueTracker({
      repository: "example/repo",
      token: "secret",
      serverRevision: "api-9f2",
      publicVersion: "1.0.0-beta",
      fetch: fetchMock,
    });

    await tracker.file(report({ clientRevision: "web-3a1", matchId: "f62249e5-ba6e-4528-b517-63bee8fbbb0f" }));

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { body: string };
    expect(body.body).toContain("### Match ID\n`f62249e5-ba6e-4528-b517-63bee8fbbb0f`");
    expect(body.body).toContain("client `web-3a1`");
    expect(body.body).toContain("server `api-9f2`");
    expect(body.body).toContain("version `v1.0.0-BETA`");
  });

  it("says in the issue whether the reported match's replay was kept", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => okResponse());
    const tracker = new GitHubIssueTracker({ repository: "example/repo", token: "secret", fetch: fetchMock });

    await tracker.file(report({ matchId: "f62249e5-ba6e-4528-b517-63bee8fbbb0f" }), {
      replay: { saved: true, reportId: 12, inputCount: 340 },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { body: string };
    expect(body.body).toContain(
      "### Match ID\n`f62249e5-ba6e-4528-b517-63bee8fbbb0f`\n\n### Replay\nSaved privately with report `#12` (340 inputs). Maintainers: `pnpm replay fetch 12`.",
    );
  });

  it("throws when GitHub refuses, so the route can tell the reporter", async () => {
    const tracker = new GitHubIssueTracker({
      repository: "example/repo",
      token: "secret",
      fetch: async () => new Response("forbidden", { status: 403 }),
    });
    await expect(tracker.file(report())).rejects.toThrow(/403/);
  });
});

describe("reading the tracker from the environment", () => {
  it("is absent until the flag, the token and the repository are all configured", () => {
    const enabled = { FEEDBACK_GITHUB_ENABLED: "true" };
    expect(GitHubIssueTracker.fromEnvironment(enabled)).toBeUndefined();
    expect(GitHubIssueTracker.fromEnvironment({ ...enabled, GITHUB_TOKEN: "t" })).toBeUndefined();
    expect(GitHubIssueTracker.fromEnvironment({ ...enabled, GITHUB_BUG_REPOSITORY: "a/b" })).toBeUndefined();
    expect(
      GitHubIssueTracker.fromEnvironment({ ...enabled, GITHUB_TOKEN: "t", GITHUB_BUG_REPOSITORY: "a/b" }),
    ).toBeDefined();
  });
});

describe("the issue a report becomes", () => {
  it("titles a cardless report with the summary alone", () => {
    expect(issueTitle(report({ cardIds: [] }))).toBe("On-play never fires");
  });

  it("counts the extra cards in the title rather than listing them", () => {
    expect(issueTitle(report({ cardIds: ["BT1-010", "BT2-030", "BT3-040"] }))).toBe("BT1-010 +2 — On-play never fires");
  });

  it("truncates a long title", () => {
    const title = issueTitle(report({ summary: "x".repeat(200) }));
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.endsWith("…")).toBe(true);
  });

  it("names each card and credits the reporter", () => {
    const body = issueBody(report());
    expect(body).toContain("`BT1-010`");
    expect(body).toContain("### Steps to reproduce");
    expect(body).toContain("Play it, nothing happens");
    expect(body).toContain("**Tamer**");
    expect(body).not.toContain("### Match ID");
  });

  it("says so when the report names no card", () => {
    expect(issueBody(report({ cardIds: [] }))).toContain("_None named._");
  });

  it("carries the opponent's deck only when it was given", () => {
    expect(issueBody(report())).not.toContain("Opponent's deck");
    expect(issueBody(report({ opponentDeck: "Red Hybrid" }))).toContain("### Opponent's deck\nRed Hybrid");
  });

  it("gives an improvement details instead of reproduction steps, and no empty card list", () => {
    const body = issueBody(report({ kind: "improvement", cardIds: [], description: "Show the trash count" }));
    expect(body).toContain("### Details\nShow the trash count");
    expect(body).not.toContain("### Steps to reproduce");
    expect(body).not.toContain("### Cards");
  });

  it("credits an anonymous player when the report carries no name", () => {
    const { reporterName: _dropped, ...anonymous } = report();
    expect(issueBody(anonymous)).toContain("Reported in-game by an anonymous player.");
  });

  it("marks the context unknown rather than lying about it", () => {
    expect(issueBody(report())).toContain("client `unknown` · server `unknown`");
  });

  // A report is written by a stranger and lands on a public repository: an `@handle` would notify a
  // real person and a `#123` would cross-link an unrelated issue.
  it("makes mentions and issue references inert", () => {
    expect(neutralizeMarkdownRefs("hey @maintainer see #123")).toBe("hey `@maintainer` see `#123`");
    expect(neutralizeMarkdownRefs("plain text with an email a@b")).toContain("`@b`");
    expect(neutralizeMarkdownRefs("# heading stays")).toBe("# heading stays");
  });

  describe("the Replay section", () => {
    const matchId = "f62249e5-ba6e-4528-b517-63bee8fbbb0f";

    it("points maintainers at the private copy, keeping the report number from cross-linking an issue", () => {
      const body = issueBody(report({ matchId }), undefined, undefined, {
        replay: { saved: true, reportId: 7, inputCount: 1 },
      });
      expect(body).toContain(
        "### Replay\nSaved privately with report `#7` (1 input). Maintainers: `pnpm replay fetch 7`.",
      );
      expect(body).not.toMatch(/(^|[^`])#7\b/);
      // It sits with the match context, above the reporter credit.
      expect(body.indexOf("### Replay")).toBeGreaterThan(body.indexOf("### Match ID"));
      expect(body.indexOf("### Replay")).toBeLessThan(body.indexOf("Reported in-game by"));
    });

    it("keeps saved replay details private in public issue bodies", () => {
      const body = issueBody(report({ matchId }), undefined, undefined, {
        replay: { saved: true, reportId: 7, inputCount: 3 },
      });
      expect(body).toContain(
        "### Replay\nSaved privately with report `#7` (3 inputs). Maintainers: `pnpm replay fetch 7`.",
      );
    });

    it.each([
      ["logs_not_found", "logs not found"],
      ["timed_out", "timed out"],
      ["error", "error"],
      ["busy", "server busy"],
      ["too_large", "too large to keep"],
    ] as const)("names a %s capture failure in plain words", (reason, text) => {
      const body = issueBody(report({ matchId }), undefined, undefined, { replay: { saved: false, reason } });
      expect(body).toContain(`### Replay\nReplay not available: ${text}.`);
    });

    it("is absent when no capture was attempted or the report has no match", () => {
      expect(issueBody(report({ matchId }))).not.toContain("### Replay");
      expect(issueBody(report({ matchId }), undefined, undefined, {})).not.toContain("### Replay");
      expect(
        issueBody(report(), undefined, undefined, { replay: { saved: true, reportId: 7, inputCount: 3 } }),
      ).not.toContain("### Replay");
    });
  });

  it("keeps a backtick in the user agent from breaking out of its code span", () => {
    const body = issueBody(report({ userAgent: "Mozilla/5.0 `evil`" }));
    expect(body).toContain("`Mozilla/5.0 evil`");
  });
});

describe("feedback GitHub mirror flag", () => {
  it.each([undefined, "", "false", "FALSE", "1", "yes"])(
    "keeps the mirror off with %s even with credentials",
    (flag) => {
      expect(
        GitHubIssueTracker.fromEnvironment({
          GITHUB_TOKEN: "token",
          GITHUB_BUG_REPOSITORY: "example/repo",
          FEEDBACK_GITHUB_ENABLED: flag,
        }),
      ).toBeUndefined();
    },
  );

  it.each(["true", "TRUE", " true "])("turns dual writes on only when asked with %s", (flag) => {
    expect(
      GitHubIssueTracker.fromEnvironment({
        GITHUB_TOKEN: "token",
        GITHUB_BUG_REPOSITORY: "example/repo",
        FEEDBACK_GITHUB_ENABLED: flag,
      }),
    ).toBeDefined();
  });
});
