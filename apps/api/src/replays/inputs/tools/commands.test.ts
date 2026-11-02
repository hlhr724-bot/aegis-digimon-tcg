import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { MatchReplay } from "@aegis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryPool } from "../../../db/memoryPool.fixture.js";
import { extractReplay } from "../extract.js";
import { recordRoomMatch } from "../roomMatch.fixture.js";
import type { ReplayInput, ReplayRecord } from "../types.js";
import { runCommand, type CommandIo } from "./commands.js";
import { fetchReplayFromApi, fetchReplayFromDb, type FetchLike } from "./fetch.js";
import { describeInput, listInputs } from "./inputs.js";
import { formatJson, readRecord, ReplayRecordError, writeJson } from "./records.js";
import { renderScaffold } from "./scaffold.js";
import type { RunSummary } from "./summary.js";

let dir: string;
let lines: string[];
let record: ReplayRecord;
let recordPath: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "aegis-replay-cli-"));
  const recorded = await recordRoomMatch({ seed: 20260914 });
  lines = recorded.lines;
  record = extractReplay(lines, recorded.matchId);
  recordPath = join(dir, "match.json");
  writeJson(recordPath, record);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function io(overrides: Partial<CommandIo> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
      env: {},
      cwd: dir,
      ...overrides,
    },
  };
}

type IntentInput = Extract<ReplayInput, { kind: "intent" }>;
const firstIndex = (predicate: (input: ReplayInput) => boolean) => record.inputs.findIndex(predicate);

describe("inputs", () => {
  it("lists every input on one line with its index, kind, seat, ids, outcome and stateVersion", async () => {
    const { out, io: commandIo } = io();
    expect(await runCommand({ command: "inputs", file: "match.json" }, commandIo)).toBe(0);

    expect(out).toHaveLength(record.inputs.length);
    expect(out[0]).toMatch(/^#0 +seat +seat 0 deck 50\+5 sv=0$/);
    expect(out[2]).toMatch(/seat 1 deck 50\+5 bot sv=0$/);
    const digivolve = firstIndex((input) => input.kind === "intent" && input.intent.type === "digivolve");
    const input = record.inputs[digivolve] as IntentInput;
    if (input.intent.type !== "digivolve") throw new Error("unreachable");
    expect(out[digivolve]).toContain(
      `seat ${input.seat} digivolve permanentId=${input.intent.permanentId} instanceId=${input.intent.instanceId} [ok] sv=${input.stateVersion}`,
    );
  });

  it("limits the listing to an inclusive range and describes outcomes and room inputs", () => {
    expect(listInputs(record, { from: 3, to: 5 }).map((line) => line.split(" ")[0])).toEqual(["#3", "#4", "#5"]);
    expect(listInputs(record, { from: record.inputs.length - 1, to: 10_000 })).toHaveLength(1);
    const rejected: ReplayInput = {
      kind: "intent",
      seat: 1,
      intent: { type: "attack", attackerPermanentId: "perm-2", target: { kind: "player" } },
      ok: false,
      reason: "wrong-phase",
      stateVersion: 9,
    };
    expect(describeInput(rejected, 4)).toBe(
      '#4 intent seat 1 attack attackerPermanentId=perm-2 target={"kind":"player"} [rejected(wrong-phase)] sv=9',
    );
    expect(describeInput({ kind: "expireCombatWindow", stateVersion: 3, site: "batchClose" }, 7)).toBe(
      "#7 expireCombatWindow sv=3 @batchClose",
    );
    expect(describeInput({ kind: "disconnect", seat: 0, final: true, stateVersion: 1 }, 1)).toContain("final");
  });
});

describe("run", () => {
  it("replays the whole match and prints the result, the position and both boards", async () => {
    const { out, io: commandIo } = io();
    expect(await runCommand({ command: "run", file: "match.json", json: false }, commandIo)).toBe(0);

    expect(out).toContain(`Applied ${record.inputs.length}/${record.inputs.length} inputs`);
    expect(out).toContain("Divergences: none");
    expect(out.find((line) => line.startsWith("Position: turn "))).toMatch(/phase, seat [01] to play, memory -?\d+/);
    expect(out.find((line) => line.startsWith("Seat 0: hand "))).toMatch(/deck \d+, security \d+, trash \d+/);
    expect(out.find((line) => line.startsWith("Seat 1: hand "))).toBeDefined();
    expect(out.some((line) => /^ {2}BT\d+-\d{3} .+ \d+ DP \(perm-\d+\/s[01]-[a-f0-9]+\)/.test(line))).toBe(true);
  });

  it("stops before --until and prints machine-readable output with --json", async () => {
    const until = firstIndex((input) => input.kind === "intent" && input.intent.type === "attack");
    const { out, io: commandIo } = io();
    expect(await runCommand({ command: "run", file: recordPath, until, json: true }, commandIo)).toBe(0);

    const summary = JSON.parse(out.join("\n")) as RunSummary;
    expect(summary).toMatchObject({
      matchId: record.matchId,
      totalInputs: record.inputs.length,
      applied: until,
      stoppedBefore: { index: until, input: describeInput(record.inputs[until]!, until) },
      divergences: [],
      position: { phase: "Main", stateVersion: record.inputs[until]!.stateVersion, gameOver: false },
    });
    expect(summary.board.map((board) => board.seat)).toEqual([0, 1]);
    expect(summary.board[0].battleArea[0]).toEqual(
      expect.objectContaining({ permanentId: expect.stringMatching(/^perm-/), dp: expect.any(Number) }),
    );
  });

  it("exits 1 and prints each divergence on one line when the replay disagrees with the recording", async () => {
    const tampered = structuredClone(record);
    const index = tampered.inputs.findIndex((input) => input.kind === "intent" && input.intent.type === "mulligan");
    (tampered.inputs[index] as IntentInput).ok = false;
    writeJson(join(dir, "tampered.json"), tampered);
    const { out, io: commandIo } = io();

    expect(await runCommand({ command: "run", file: "tampered.json", json: false }, commandIo)).toBe(1);
    expect(out).toContain("Divergences: 1");
    expect(out).toContain(`  intent-result: input #${index} (seat 0 mulligan): accepted, recorded rejected`);
  });

  it("--export writes the re-executed match as a player replay file", async () => {
    const { out, io: commandIo } = io();
    expect(
      await runCommand({ command: "run", file: "match.json", json: false, export: "match.aegis-replay" }, commandIo),
    ).toBe(0);

    const replay = JSON.parse(
      gunzipSync(readFileSync(join(dir, "match.aegis-replay"))).toString("utf8"),
    ) as MatchReplay;
    expect(replay.format).toBe("aegis-replay");
    expect(out).toContain(`Exported ${replay.frames.length} frames to ${join(dir, "match.aegis-replay")}`);
    expect(out).not.toContain("Ended by surrender for the viewer");
    // The summary still shows the record's own end, not the export's.
    expect(out).toContain("Divergences: none");
  });

  it("--export with --until ends the match by surrender for the viewer, and divergences keep exit code 1", async () => {
    const until = firstIndex((input) => input.kind === "intent" && input.intent.type === "attack");
    const partial = io();
    expect(
      await runCommand(
        { command: "run", file: "match.json", json: false, until, export: "partial.aegis-replay" },
        partial.io,
      ),
    ).toBe(0);
    expect(partial.out).toContain("Ended by surrender for the viewer");
    expect(partial.out.find((line) => line.startsWith("Position: turn "))).toBeDefined();

    const tampered = structuredClone(record);
    const index = tampered.inputs.findIndex((input) => input.kind === "intent" && input.intent.type === "mulligan");
    (tampered.inputs[index] as IntentInput).ok = false;
    writeJson(join(dir, "tampered-export.json"), tampered);
    const diverged = io();
    expect(
      await runCommand(
        { command: "run", file: "tampered-export.json", json: false, export: "tampered.aegis-replay" },
        diverged.io,
      ),
    ).toBe(1);
    expect(diverged.out).toContain("Divergences: 1");
    expect(existsSync(join(dir, "tampered.aegis-replay"))).toBe(true);
  });

  it("refuses a file that is not a replay record", async () => {
    writeFileSync(join(dir, "other.json"), JSON.stringify({ format: "aegis-replay-inputs/0", inputs: [] }));
    const { io: commandIo } = io();
    await expect(runCommand({ command: "run", file: "other.json", json: false }, commandIo)).rejects.toThrow(
      /not a replay record: format is "aegis-replay-inputs\/0"/,
    );
    expect(() => readRecord(join(dir, "missing.json"))).toThrow(ReplayRecordError);
  });
});

describe("extract", () => {
  it("writes the record built from a log directory", async () => {
    const logDir = join(dir, "logs");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, "api-2026-10-09-abcd.jsonl"), lines.join("\n") + "\n");
    const { out, io: commandIo } = io();

    expect(
      await runCommand(
        { command: "extract", matchId: record.matchId, logDir: "logs", out: "extracted.json" },
        commandIo,
      ),
    ).toBe(0);
    expect(readRecord(join(dir, "extracted.json"))).toEqual(record);
    expect(out[0]).toContain(`${record.inputs.length} inputs`);
  });
});

describe("scaffold", () => {
  it("renders a test that replays up to the bug and a fixture trimmed to it", () => {
    const until = 9;
    const testPath = join(dir, "src", "engine", "scenarios", "bugReplay.test.ts");
    const scaffold = renderScaffold(record, {
      until,
      testPath,
      replayDir: join(dir, "src", "replays", "inputs"),
      issue: "321",
    });

    expect(scaffold.fixturePath).toBe(join(dir, "src", "engine", "scenarios", "bugReplay.replay.json"));
    expect(scaffold.test).toContain('from "../../replays/inputs/index.js"');
    expect(scaffold.test).toContain('new URL("./bugReplay.replay.json", import.meta.url)');
    expect(scaffold.test).toContain(`runReplay(record, { untilInput: ${until} })`);
    expect(scaffold.test).toContain("expect(divergences).toEqual([]);");
    expect(scaffold.test).toContain('describe("bugReplay", () => {');
    expect(scaffold.test).toContain("Regression for issue #321");
    expect(scaffold.test).toContain(`it.todo("expected behaviour at input #${until}");`);
    expect(scaffold.test).toContain(describeInput(record.inputs[until]!, until));
    const fixture = JSON.parse(scaffold.fixture) as ReplayRecord;
    expect(fixture).toEqual({ ...record, inputs: record.inputs.slice(0, until + 1) });
  });

  it("writes both files, refuses to overwrite them and refuses an index past the end", async () => {
    const { out, io: commandIo } = io();
    const command = { command: "scaffold", file: "match.json", until: 4, out: "t/regression.test.ts" } as const;

    expect(await runCommand(command, commandIo)).toBe(0);
    expect(existsSync(join(dir, "t", "regression.test.ts"))).toBe(true);
    expect(readRecord(join(dir, "t", "regression.replay.json")).inputs).toHaveLength(5);
    expect(out[2]).toMatch(/^Run it: pnpm --filter @aegis\/api exec vitest run /);
    await expect(runCommand(command, commandIo)).rejects.toThrow(/already exists/);
    await expect(runCommand({ ...command, until: record.inputs.length }, commandIo)).rejects.toThrow(
      /past the last input/,
    );
  });
});

describe("fetch", () => {
  async function poolWith(rows: { id: number; record: unknown; inputCount: number; createdAt?: number }[]) {
    const pool = createMemoryPool();
    await pool.query(
      "CREATE TABLE feedback_report_replays (report_id integer PRIMARY KEY, record jsonb NOT NULL, input_count integer NOT NULL, created_at bigint NOT NULL)",
    );
    for (const row of rows)
      await pool.query(
        "INSERT INTO feedback_report_replays (report_id, record, input_count, created_at) VALUES ($1, $2, $3, $4)",
        [row.id, JSON.stringify(row.record), row.inputCount, row.createdAt ?? Date.now()],
      );
    return pool;
  }

  it("reads the record saved with a report through the database configuration", async () => {
    const pool = await poolWith([{ id: 7, record, inputCount: record.inputs.length }]);
    let closed = false;
    const seen: NodeJS.ProcessEnv[] = [];
    const {
      out,
      err,
      io: commandIo,
    } = io({
      env: { DATABASE_URL: "postgres://example/aegis" },
      connect: async (env) => {
        seen.push(env);
        return { db: pool, close: async () => void (closed = true) };
      },
    });

    expect(await runCommand({ command: "fetch", reportId: 7, out: "report.json" }, commandIo)).toBe(0);
    expect(readRecord(join(dir, "report.json"))).toEqual(record);
    expect(seen[0]!.DATABASE_URL).toBe("postgres://example/aegis");
    expect(closed).toBe(true);
    expect(err).toEqual([]);
    expect(out[0]).toContain(`match ${record.matchId}, ${record.inputs.length} inputs`);
    await pool.end();
  });

  it("does not return a replay past the retention window that pruning has not removed yet", async () => {
    const pool = await poolWith([{ id: 5, record, inputCount: record.inputs.length, createdAt: 1_000 }]);
    await expect(fetchReplayFromDb(pool, 5, 2_000)).rejects.toThrow("No replay is saved with report #5.");
    expect((await fetchReplayFromDb(pool, 5, 1_000)).record).toEqual(record);
    await pool.end();
  });

  it("explains a missing replay, a miscounted row and a missing database configuration", async () => {
    const pool = await poolWith([{ id: 8, record, inputCount: 3 }]);
    await expect(fetchReplayFromDb(pool, 9)).rejects.toThrow("No replay is saved with report #9.");
    expect((await fetchReplayFromDb(pool, 8)).warning).toBe(
      `report #8 lists 3 inputs but its record has ${record.inputs.length}`,
    );
    await pool.end();

    const { err, io: commandIo } = io();
    expect(await runCommand({ command: "fetch", reportId: 8 }, commandIo)).toBe(2);
    expect(err[0]).toMatch(/set DATABASE_URL/);
  });

  it("reads the record through the admin endpoint with the session cookie", async () => {
    const requests: { url: string; cookie?: string }[] = [];
    const fake: FetchLike = async (url, init) => {
      requests.push({ url, cookie: init.headers.cookie });
      return url.endsWith("/5/replay")
        ? { ok: true, status: 200, statusText: "OK", json: async () => structuredClone(record) }
        : { ok: false, status: 403, statusText: "Forbidden", json: async () => ({}) };
    };

    expect((await fetchReplayFromApi("https://aegis.example/api/", "s3cret", 5, fake)).record).toEqual(record);
    expect(requests[0]).toEqual({
      url: "https://aegis.example/api/account/admin/feedback/5/replay",
      cookie: "aegis_session=s3cret",
    });
    await expect(fetchReplayFromApi("https://aegis.example", "s3cret", 6, fake)).rejects.toThrow(/403: .*admin/);
    await expect(fetchReplayFromApi("https://aegis.example", undefined, 5, fake)).rejects.toThrow(/AEGIS_SESSION/);
  });
});

describe("formatJson", () => {
  it("prints JSON as Oxfmt does: objects expanded, primitive arrays on one line when they fit", () => {
    expect(formatJson({ a: [1, 2], b: {}, c: [], d: { e: "x" } })).toBe(
      '{\n  "a": [1, 2],\n  "b": {},\n  "c": [],\n  "d": {\n    "e": "x"\n  }\n}',
    );
    const long = Array.from({ length: 30 }, (_, index) => `BT1-${String(index).padStart(3, "0")}`);
    expect(formatJson({ deck: long }).split("\n")).toHaveLength(long.length + 4);
    expect(JSON.parse(formatJson(record))).toEqual(record);
    expect(readFileSync(recordPath, "utf8")).toBe(formatJson(record) + "\n");
  });
});
