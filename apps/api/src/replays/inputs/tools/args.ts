import { parseArgs } from "node:util";

/** A parsed `pnpm replay` invocation. Paths are as given; the caller resolves them. */
export type ReplayCommand =
  | { command: "help"; topic?: ReplayCommandName }
  | { command: "fetch"; reportId: number; out?: string; url?: string }
  | { command: "extract"; matchId: string; logDir?: string; out?: string }
  | { command: "run"; file: string; until?: number; json: boolean; export?: string }
  | { command: "inputs"; file: string; from?: number; to?: number }
  | { command: "scaffold"; file: string; until: number; out: string; issue?: string };

export type ReplayCommandName = Exclude<ReplayCommand["command"], "help">;

/** A command line that cannot be run; the message says why, for the user. */
export class UsageError extends Error {
  override name = "UsageError";
  constructor(
    message: string,
    readonly topic?: ReplayCommandName,
  ) {
    super(message);
  }
}

const USAGE: Record<ReplayCommandName, string> = {
  fetch: `pnpm replay fetch <reportId> [--out <file>] [--url <apiBase>]

  Download the replay saved privately with a bug report (the "Replay" section of the issue).
  Reads feedback_report_replays through the API's database configuration (DATABASE_URL, or the
  PG* variables). With --url, asks the API instead: GET <apiBase>/account/admin/feedback/<id>/replay
  with the admin session cookie from AEGIS_SESSION.
  Default --out: <repo>/replays/report-<reportId>.json`,
  extract: `pnpm replay extract <matchId> [--log-dir <dir>] [--out <file>]

  Build a replay from the API's JSONL logs (api-*.jsonl), for a match without a report.
  Default --log-dir: AEGIS_LOG_DIR, else apps/api/logs. Default --out: <repo>/replays/<matchId>.json`,
  run: `pnpm replay run <file> [--until <inputIndex>] [--json] [--strict] [--export <file.aegis-replay>]

  Replay the match on a fresh engine and print the inputs applied, every divergence from the
  recorded match, the position and a compact board per seat. --until N stops before input N,
  showing the state that input arrived at. --json prints the same as one JSON object.
  Unsupported card effects log and continue, as on the production server; --strict makes them
  throw, as in tests, which shows up as a divergence at the input that reached one.
  --export writes the replayed match as a player replay file the web viewer opens (Profile →
  Replays → Open file). The viewer shows finished games only: a replay that stops before the end
  (--until, or a record cut short) is ended there by seat 0 surrendering.
  Exit code 1 when the replay diverged (the file is still written).`,
  inputs: `pnpm replay inputs <file> [--from N] [--to M]

  List the recorded inputs one per line: index, kind, seat, intent and its ids, the recorded
  outcome and the stateVersion it arrived at. --from/--to are inclusive input indexes.`,
  scaffold: `pnpm replay scaffold <file> --until <N> --out <path.test.ts> [--issue <number>]

  Write a vitest regression test that replays the match up to input N (the input where the bug
  shows), asserts no divergence and leaves an it.todo for the expected behaviour. The record,
  trimmed to inputs 0..N, is written next to the test as <name>.replay.json.`,
};

export const HELP = `Usage: pnpm replay <command> [options]

Reproduce a reported match from its replay record (format aegis-replay-inputs/1).

Commands:
  fetch <reportId>    Download the replay saved with a bug report
  extract <matchId>   Build a replay from the API's JSONL logs
  inputs <file>       List the recorded inputs, to find the moment of the bug
  run <file>          Replay the match; report divergences, position and board
  scaffold <file>     Write a vitest regression test from the replay

Run "pnpm replay <command> --help" for its options. Relative paths resolve against the
directory pnpm was run from. Replays hold both decklists and every action (no names or chat):
keep them in replays/ (git-ignored) and commit only trimmed test fixtures.`;

export function usageFor(topic?: ReplayCommandName): string {
  return topic ? `Usage: ${USAGE[topic]}` : HELP;
}

const OPTIONS = {
  out: { type: "string" },
  export: { type: "string" },
  url: { type: "string" },
  "log-dir": { type: "string" },
  until: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  issue: { type: "string" },
  json: { type: "boolean" },
  strict: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

/** Options each command accepts; anything else is a usage error rather than silently ignored. */
const ALLOWED: Record<ReplayCommandName, (keyof typeof OPTIONS)[]> = {
  fetch: ["out", "url"],
  extract: ["log-dir", "out"],
  run: ["until", "json", "strict", "export"],
  inputs: ["from", "to"],
  scaffold: ["until", "out", "issue"],
};

function isCommandName(value: string | undefined): value is ReplayCommandName {
  return value !== undefined && Object.hasOwn(USAGE, value);
}

export function parseReplayArgs(argv: readonly string[]): ReplayCommand {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  const name = argv[0];
  const topic = isCommandName(name) ? name : undefined;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError((error as Error).message, topic);
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (command === undefined || command === "help") {
    const helpTopic = rest[0];
    return isCommandName(helpTopic) ? { command: "help", topic: helpTopic } : { command: "help" };
  }
  if (!isCommandName(command)) throw new UsageError(`Unknown command "${command}".`);
  if (values.help) return { command: "help", topic: command };

  for (const option of Object.keys(values) as (keyof typeof OPTIONS)[]) {
    if (option !== "help" && !ALLOWED[command].includes(option))
      throw new UsageError(`"${command}" does not take --${option}.`, command);
  }
  if (rest.length !== 1)
    throw new UsageError(
      rest.length === 0 ? `"${command}" needs its argument.` : `Unexpected argument "${rest[1]}".`,
      command,
    );
  const subject = rest[0]!;
  const digits = (option: "until" | "from" | "to" | "issue") => {
    const value = values[option];
    if (value === undefined) return undefined;
    if (!/^\d+$/.test(value))
      throw new UsageError(`--${option} must be a non-negative integer, got "${value}".`, command);
    return value;
  };
  const index = (option: "until" | "from" | "to") => {
    const value = digits(option);
    return value === undefined ? undefined : Number(value);
  };

  switch (command) {
    case "fetch": {
      if (!/^\d+$/.test(subject) || Number(subject) < 1)
        throw new UsageError(`The report id must be a positive integer, got "${subject}".`, command);
      return { command, reportId: Number(subject), ...defined({ out: values.out, url: values.url }) };
    }
    case "extract":
      return { command, matchId: subject, ...defined({ logDir: values["log-dir"], out: values.out }) };
    case "run":
      return {
        command,
        file: subject,
        json: values.json === true,
        ...defined({ until: index("until"), export: values.export }),
      };
    case "inputs": {
      const from = index("from");
      const to = index("to");
      if (from !== undefined && to !== undefined && from > to)
        throw new UsageError(`--from ${from} is after --to ${to}.`, command);
      return { command, file: subject, ...defined({ from, to }) };
    }
    case "scaffold": {
      const until = index("until");
      if (until === undefined) throw new UsageError(`"scaffold" needs --until <inputIndex>.`, command);
      if (!values.out) throw new UsageError(`"scaffold" needs --out <path.test.ts>.`, command);
      if (!values.out.endsWith(".test.ts"))
        throw new UsageError(`--out must end in .test.ts, got "${values.out}".`, command);
      return { command, file: subject, until, out: values.out, ...defined({ issue: digits("issue") }) };
    }
  }
}

/** Drops undefined values, so optional fields stay absent (exactOptionalPropertyTypes-friendly). */
function defined<T extends Record<string, unknown>>(values: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
