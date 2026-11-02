import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMBAT_PROMPT_EVENTS, DECISION_KINDS, SERVER_EVENT_KINDS, type ServerEventKind } from "@aegis/shared";
import { SUPPORTED_COMBAT_PROMPTS, SUPPORTED_DECISION_KINDS } from "./game/overlay";

const srcDir = dirname(fileURLToPath(import.meta.url));

/**
 * Intent wrappers legitimately called only from net/ (not dispatched by any
 * overlay/board handler): `ready` is the initial handshake, sent once from
 * net/useRoom.ts on room join, before any UI decision exists.
 */
const NET_ONLY_INTENTS = new Set(["ready"]);

function listFilesRecursively(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursively(full);
    return entry.isFile() ? [full] : [];
  });
}

function extractIntentWrapperNames(): string[] {
  const source = readFileSync(join(srcDir, "net/intents.ts"), "utf-8");
  const objectBody = source.slice(source.indexOf("export const intents = {"));
  const names: string[] = [];
  for (const match of objectBody.matchAll(/^\s{2}(\w+):\s*\(/gm)) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

describe("UI decision-kind coverage", () => {
  it("the shared overlay renderer covers every DecisionRequest.kind", () => {
    expect(new Set(SUPPORTED_DECISION_KINDS)).toEqual(new Set(DECISION_KINDS));
  });
});

/**
 * The event kinds one `switch (event.kind)` narrates, read out of the source rather than
 * copied into a list here: a hand-kept list drifts from the switch silently, which is the
 * exact failure this suite exists to catch. A branch whose first statement is `return null`
 * narrates nothing, so it does not count as covered.
 */
function narratedEventKinds(relativePath: string, functionName: string): Set<string> {
  const source = readFileSync(join(srcDir, relativePath), "utf-8");
  const start = source.indexOf(`export function ${functionName}`);
  if (start < 0) throw new Error(`${functionName} not found in ${relativePath}`);
  const rest = source.slice(start);
  const body = rest.slice(0, rest.indexOf("\n}\n"));
  const parts = body.split(/case "(\w+)":/);
  const narrated = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    // A fall-through case has an empty branch and shares the next one, which is why an
    // empty branch counts as narrated.
    if (!parts[i + 1]!.trim().startsWith("return null")) narrated.add(parts[i]!);
  }
  return narrated;
}

/**
 * Event kinds that reach no narration surface on purpose. Each entry says why, because
 * the only difference between a deliberate silence and a forgotten event is this note.
 */
const DELIBERATELY_SILENT: Partial<Record<ServerEventKind, string>> = {
  phaseChanged: "rendered as turn and phase headings in the chronological match history",
  stackTopResolved: "supplies the resolved DP for the physical stack peel; cardsMoved narrates the removal",
  // Starts the physical clash before protection questions; it reports potential losses,
  // not deletions. combatResolved narrates the final result after those questions.
  battleCompared: "rendered as the field impact; final outcomes carry the log lines",
  // Terminates the ＜Alliance＞ prompt overlay and carries no outcome: the event says the
  // decision was answered, not whether an ally joined, so a log line could only repeat
  // that something was decided. The ally's own effects narrate themselves.
  allianceResolved: "window terminator carrying no outcome to report",
  // Closes the attack arrow and the open-attack memory. Whatever the attack did already has
  // its own line (`combatResolved`, `securityChecked`), so this one would only repeat it.
  attackEnded: "attack terminator; the outcome events carry the log lines",
  // The offending client gets a transient toast; nobody else is told, and a rejected
  // intent changed no game state, so it is not match history.
  actionRejected: "shown as a toast to the one client that caused it",
  // Rendered as the deck's shuffle animation (deckChrome.ts). It names no card and says
  // nothing a line of text would say better.
  deckShuffled: "rendered by the deck chrome animation",
  // Only raised when protection kept the displayed DP unchanged; useMatchCues.ts plays it
  // as the DP pulse on that permanent, and the modifying effect already has its log line.
  dpModifierApplied: "played as the DP pulse; the causing effect carries the log line",
  effectTargetsSelected: "shown as target cues before the effect actions resolve",
  effectOptionChosen: "shown as the effect notice naming the chosen bullet; the log records effectResolved",
  effectClauseAdvanced: "shown as the next printed passage; the log records effectResolved",
  // Every accepted effect is narrated when it resolves; the chosen order adds no separate notice.
  resolutionOrderChosen: "every effect it orders is narrated as it resolves",
  // Opens the centre-stage check: the shield breaks and the card is turned face up. The
  // log line belongs to `securityChecked`, which names the same card AND what it did.
  securityRevealed: "played as the shield break and the reveal; the log line is securityChecked",
  // A stream boundary, not something that happened in the match: it tells the client which
  // events the rules resolved together (net/serverBatches.ts) and names no game fact.
  batchClosed: "the boundary the presentation groups by; it narrates nothing",
  // Arrives after gameOver and only feeds the board review's card viewers.
  finalReveal: "post-match data read by the board review, not a game event",
  manualAction: "listed in the manual table's Operation history panel",
};

describe("server event coverage", () => {
  const logged = narratedEventKinds("game/matchLog.ts", "describeEvent");
  const surfaced = new Set<string>([...logged, ...SUPPORTED_COMBAT_PROMPTS]);

  it("every ServerEvent kind reaches a surface or is deliberately silent", () => {
    const unreached = SERVER_EVENT_KINDS.filter((kind) => !surfaced.has(kind) && !(kind in DELIBERATELY_SILENT));
    expect(unreached).toEqual([]);
  });

  it("nothing stays on the silent list once a surface narrates it", () => {
    const stale = Object.keys(DELIBERATELY_SILENT).filter((kind) => surfaced.has(kind));
    expect(stale).toEqual([]);
  });

  it("reads the real switches, not an empty file", () => {
    expect(logged.size).toBeGreaterThan(0);
  });
});

describe("UI combat-prompt coverage", () => {
  it("the shared overlay renderer handles every combat prompt event", () => {
    expect(new Set(SUPPORTED_COMBAT_PROMPTS)).toEqual(new Set(COMBAT_PROMPT_EVENTS));
  });
});

describe("client intent reachability", () => {
  const wrapperNames = extractIntentWrapperNames();
  const allFiles = listFilesRecursively(srcDir);
  const netFiles = allFiles.filter((f) => f.includes(`${srcDir}/net/`));
  const nonNetFiles = allFiles.filter(
    (f) => !f.includes(`${srcDir}/net/`) && f !== join(srcDir, "uiCompleteness.test.ts"),
  );

  it("found intent wrappers to check", () => {
    expect(wrapperNames.length).toBeGreaterThan(0);
  });

  for (const name of wrapperNames) {
    it(`intents.${name} is called from UI code (outside net/)${NET_ONLY_INTENTS.has(name) ? " or is an allowlisted net-only intent" : ""}`, () => {
      const callPattern = new RegExp(`intents\\.${name}\\(`);
      const calledOutsideNet = nonNetFiles.some((f) => callPattern.test(readFileSync(f, "utf-8")));
      if (NET_ONLY_INTENTS.has(name)) {
        const calledInNet = netFiles.some((f) => callPattern.test(readFileSync(f, "utf-8")));
        expect(calledOutsideNet || calledInNet).toBe(true);
      } else {
        expect(calledOutsideNet).toBe(true);
      }
    });
  }
});
