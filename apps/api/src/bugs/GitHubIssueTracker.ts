import { getCardDefinition, type FeedbackKind } from "@aegis/shared";

export const MAX_BUG_REPORT_CARDS = 20;
export const MAX_BUG_REPORT_SUMMARY = 120;
export const MAX_BUG_REPORT_DESCRIPTION = 4000;
export const MAX_BUG_REPORT_OPPONENT_DECK = 120;

// GitHub's default label set already has `bug` and `enhancement`; `feedback` is created on first use.
const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "bug",
  improvement: "enhancement",
  other: "feedback",
  official_tournament: "tournament",
};

export const GITHUB_API = "https://api.github.com";
const ISSUE_TITLE_LIMIT = 90;
// Enough to name the browser and its version; the rest of a user agent string is noise.
const USER_AGENT_LIMIT = 200;

/** What the reporter filled in, plus the context their client carried on its own. */
export type NewBugReport = {
  /** Absent when the reporter had no account; the issue then credits an anonymous player. */
  reporterName?: string;
  kind: FeedbackKind;
  summary: string;
  cardIds: readonly string[];
  description: string;
  opponentDeck?: string;
  /** Correlates the report with the server match log; absent outside a match. */
  matchId?: string;
  tournamentId?: string;
  clientRevision?: string;
  userAgent?: string;
};

/** What the reporter gets back: the issue their report became. */
export type FiledBugReport = { number: number; url: string };

/** Why a report filed from a match has no saved replay, in words safe for a public issue. */
export type ReplayFailure = "logs_not_found" | "timed_out" | "error" | "busy" | "too_large";

/**
 * What happened to the replay of the match a report was filed from. Only the outcome travels to
 * the tracker: the record itself (both decks, every action) stays private in the database.
 */
export type ReplayOutcome =
  | { saved: true; reportId: number; inputCount: number }
  | { saved: false; reason: ReplayFailure };

/** Server-side facts about a report that are not part of what the reporter submitted. */
export type IssueContext = {
  /** Absent when no capture was attempted (no match ID, or capture is switched off). */
  replay?: ReplayOutcome;
};

/**
 * Where a bug report goes. The routes depend on this rather than on the GitHub client so a test can
 * file a report without a network or a token.
 */
export type IssueTracker = {
  file(report: NewBugReport, context?: IssueContext): Promise<FiledBugReport>;
};

export type GitHubIssueTrackerOptions = {
  /** `owner/repo` — the repository the issues land in. */
  repository: string;
  token: string;
  /** Labels every filed report carries, so player reports are one query away. */
  labels?: readonly string[];
  /** Stamped on every issue: which build served the reporter. */
  serverRevision?: string;
  /** Player-facing release identity, kept separate from the exact build revision. */
  publicVersion?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Files player bug reports as issues on the project's GitHub repository.
 *
 * The repository is public, so the issue body carries the reporter's display name and nothing else
 * about their account: no email, no id, and no address for the anonymous ones. Every field the
 * reporter typed is neutralized before it goes in (see `neutralizeMarkdownRefs`) — otherwise a
 * report could mass-ping maintainers or cross-link unrelated issues just by containing an `@` or
 * a `#`.
 */
export class GitHubIssueTracker implements IssueTracker {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: GitHubIssueTrackerOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  /**
   * Reads the tracker the environment configures, or undefined when this deployment has none — a
   * local run without a token still boots, and the route answers that reports are unavailable.
   */
  /** Off unless FEEDBACK_GITHUB_ENABLED is "true": the admin triage in Postgres is the record. */
  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): GitHubIssueTracker | undefined {
    if (!isEnabled(env.FEEDBACK_GITHUB_ENABLED)) return undefined;
    const token = env.GITHUB_TOKEN;
    const repository = env.GITHUB_BUG_REPOSITORY;
    if (!token || !repository) return undefined;
    const labels = env.GITHUB_BUG_LABELS?.split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    return new GitHubIssueTracker({
      repository,
      token,
      labels: labels?.length ? labels : ["player-report"],
      serverRevision: env.AEGIS_REVISION,
      publicVersion: env.AEGIS_PUBLIC_VERSION,
    });
  }

  async file(report: NewBugReport, context: IssueContext = {}): Promise<FiledBugReport> {
    const response = await this.fetch(`${GITHUB_API}/repos/${this.options.repository}/issues`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: githubHeaders(this.options.token),
      body: JSON.stringify({
        title: issueTitle(report),
        body: issueBody(report, this.options.serverRevision, this.options.publicVersion, context),
        labels: [...(this.options.labels ?? []), KIND_LABELS[report.kind]],
      }),
    });
    if (!response.ok) {
      throw new Error(`GitHub refused the issue: ${response.status} ${await response.text().catch(() => "")}`.trim());
    }
    const issue = (await response.json()) as { number: number; html_url: string };
    return { number: issue.number, url: issue.html_url };
  }
}

/** GitHub writes are opt-in per feature; anything but an explicit "true" leaves them off. */
export function isEnabled(flag: string | undefined): boolean {
  return flag?.trim().toLowerCase() === "true";
}

export function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** `BT1-010 +2 — the summary`, so a card bug is recognizable straight from the issue list. */
export function issueTitle({ summary, cardIds }: NewBugReport): string {
  const [first, ...rest] = cardIds;
  const prefix = first ? `${first}${rest.length ? ` +${rest.length}` : ""} — ` : "";
  return truncate(`${prefix}${summary}`, ISSUE_TITLE_LIMIT);
}

export function issueBody(
  report: NewBugReport,
  serverRevision?: string,
  publicVersion?: string,
  context: IssueContext = {},
): string {
  const { reporterName, kind, cardIds, description, opponentDeck } = report;
  const isBug = kind === "bug";
  const sections: string[] = [];
  // A bug with no card named is worth flagging to triage; an improvement usually names none.
  if (isBug || cardIds.length) {
    sections.push(
      "### Cards",
      cardIds.length
        ? cardIds.map((cardId) => `- \`${cardId}\` — ${getCardDefinition(cardId)?.nameEn ?? "unknown"}`).join("\n")
        : "_None named._",
      "",
    );
  }
  sections.push(isBug ? "### Steps to reproduce" : "### Details", neutralizeMarkdownRefs(description));
  if (opponentDeck) sections.push("", "### Opponent's deck", neutralizeMarkdownRefs(opponentDeck));
  if (report.matchId) sections.push("", "### Match ID", `\`${code(report.matchId)}\``);
  if (report.matchId && context.replay) sections.push("", "### Replay", replayNote(context.replay));
  const credit = reporterName ? `**${neutralizeMarkdownRefs(reporterName)}**` : "an anonymous player";
  sections.push("", "---", `Reported in-game by ${credit}.`, reportContext(report, serverRevision, publicVersion));
  return sections.join("\n");
}

const REPLAY_FAILURE_TEXT: Record<ReplayFailure, string> = {
  logs_not_found: "logs not found",
  timed_out: "timed out",
  error: "error",
  busy: "server busy",
  too_large: "too large to keep",
};

/**
 * Where the replay is, never what is in it. The report number sits in a code span because a bare
 * `#12` would cross-link GitHub issue 12, which has nothing to do with feedback report 12.
 */
function replayNote(replay: ReplayOutcome): string {
  if (!replay.saved) {
    return `Replay not available: ${REPLAY_FAILURE_TEXT[replay.reason]}.`;
  }
  const inputs = `${replay.inputCount} input${replay.inputCount === 1 ? "" : "s"}`;
  return `Saved privately with report \`#${replay.reportId}\` (${inputs}). Maintainers: \`pnpm replay fetch ${replay.reportId}\`.`;
}

/** The build and browser the reporter was on, which they should never have to type. */
function reportContext(
  { clientRevision, userAgent }: NewBugReport,
  serverRevision?: string,
  publicVersion?: string,
): string {
  const parts = [
    ...(publicVersion ? [`version \`${code(displayVersion(publicVersion))}\``] : []),
    `client \`${code(clientRevision ?? "unknown")}\``,
    `server \`${code(serverRevision ?? "unknown")}\``,
    ...(userAgent ? [`\`${code(truncate(userAgent, USER_AGENT_LIMIT))}\``] : []),
  ];
  return parts.join(" · ");
}

function displayVersion(version: string): string {
  return `v${version.replace(/-beta$/i, "-BETA")}`;
}

// GitHub turns `@handle` into a notification and `#123` into a cross-link, so text a stranger typed
// is a way to ping maintainers and litter unrelated issues. Backticks make both inert while leaving
// the text readable.
export function neutralizeMarkdownRefs(text: string): string {
  return text.replace(/[@#][\w-]+/g, (reference) => `\`${reference}\``);
}

/** Strips the one character that could break out of the code span this value is rendered inside. */
function code(value: string): string {
  return value.replace(/`/g, "");
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
