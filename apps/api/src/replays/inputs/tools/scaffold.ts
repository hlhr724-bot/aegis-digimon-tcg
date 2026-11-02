import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import type { ReplayRecord } from "../types.js";
import { describeInput } from "./inputs.js";
import { formatJson, ReplayRecordError, trimRecord } from "./records.js";

export interface ScaffoldOptions {
  /** The input where the bug shows; the test replays up to it and the fixture keeps inputs 0..until. */
  until: number;
  /** Absolute path of the test file to write (`*.test.ts`). */
  testPath: string;
  /** Absolute path of `apps/api/src/replays/inputs`, which the test imports `runReplay` from. */
  replayDir: string;
  issue?: string;
}

export interface Scaffold {
  testPath: string;
  fixturePath: string;
  test: string;
  fixture: string;
}

/**
 * Render a regression test for a replayed bug and its trimmed fixture.
 *
 * The test passes as generated: it replays the match up to the input where the bug shows and
 * asserts the replay matches the recording so far. The bug's expected behaviour is an `it.todo`,
 * so vitest lists it as pending (the file still passes) until someone writes the assertion; a
 * placeholder that passes silently would read as coverage that does not exist.
 */
export function renderScaffold(record: ReplayRecord, options: ScaffoldOptions): Scaffold {
  const { until, testPath, replayDir, issue } = options;
  if (until >= record.inputs.length)
    throw new ReplayRecordError(`--until ${until} is past the last input (#${record.inputs.length - 1}).`);
  const name = basename(testPath, ".test.ts");
  const fixtureName = `${name}.replay.json`;
  const fixturePath = join(dirname(testPath), fixtureName);
  let importPath = relative(dirname(testPath), join(replayDir, "index.js")).split(sep).join("/");
  if (!importPath.startsWith(".")) importPath = `./${importPath}`;
  const bug = describeInput(record.inputs[until]!, until);
  const repoPath = relative(join(replayDir, "..", "..", "..", "..", ".."), fixturePath)
    .split(sep)
    .join("/");
  const tag = issue !== undefined ? `issue #${issue}` : "replayed bug";

  const fixtureLine = `const fixture = new URL("./${fixtureName}", import.meta.url);`;
  const fixtureDeclaration =
    fixtureLine.length <= 120 ? fixtureLine : `const fixture = new URL(\n  "./${fixtureName}",\n  import.meta.url,\n);`;

  const test = `import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay, type ReplayRecord } from "${importPath}";

/**
 * Regression for ${tag}, reproduced from match replay ${record.matchId} (\`pnpm replay scaffold\`).
 *
 * \`${fixtureName}\` is that match trimmed to inputs 0..${until}: both decklists and every action up to
 * the bug, and nothing else (no names, chat or accounts). Input #${until} is where the bug shows:
 *
 *   ${bug}
 *
 * Inspect the position with \`pnpm replay run ${repoPath} --until ${until}\`.
 */
${fixtureDeclaration}
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;

describe("${name}", () => {
  it("replays the reported match up to input #${until} as recorded", async () => {
    const { divergences } = await runReplay(record, { untilInput: ${until} });

    expect(divergences).toEqual([]);
  });

  // TODO(${tag}): turn this into the assertion of the expected behaviour at input #${until}.
  // Replay through it with \`runReplay(record, { untilInput: ${until + 1} })\` and assert on \`state\`
  // (costs, card identities, destinations, effect order, turn progression), or take \`engine\`
  // from the replay above, apply the intent yourself and \`settle()\` (engine/testkit). Once the
  // bug is fixed, input #${until} may legitimately diverge from the recording; assert that
  // divergence instead of expecting none.
  it.todo("expected behaviour at input #${until}");
});
`;
  return { testPath, fixturePath, test, fixture: formatJson(trimRecord(record, until)) + "\n" };
}

/** Write the scaffold; refuses to overwrite an existing test or fixture. */
export function writeScaffold(scaffold: Scaffold): void {
  for (const path of [scaffold.testPath, scaffold.fixturePath])
    if (existsSync(path)) throw new ReplayRecordError(`${path} already exists; not overwriting it.`);
  mkdirSync(dirname(scaffold.testPath), { recursive: true });
  writeFileSync(scaffold.fixturePath, scaffold.fixture);
  writeFileSync(scaffold.testPath, scaffold.test);
}
