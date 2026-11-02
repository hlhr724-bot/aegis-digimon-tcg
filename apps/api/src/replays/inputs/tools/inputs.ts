import type { ReplayInput, ReplayRecord } from "../types.js";

/** The intent's own fields after its type, as `key=value` (objects as compact JSON). */
export function intentDetails(intent: Record<string, unknown>): string {
  return Object.entries(intent)
    .filter(([key, value]) => key !== "type" && value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
}

/** What the recorded match did with an intent: `ok`, `rejected(<reason>)`, `threw`, or `?`. */
export function recordedOutcome(input: Extract<ReplayInput, { kind: "intent" }>): string {
  if (input.threw) return "threw";
  if (input.ok === undefined) return "?";
  return input.ok ? "ok" : `rejected(${input.reason ?? "no reason"})`;
}

/** The longest input kind, `expireMulliganWindow`. */
const KIND_WIDTH = 20;

/**
 * One input on one line: `#index kind seat N <what> [outcome] sv=<stateVersion>`, plus the room
 * site when the room issued it mid-resolution. Meant to be grepped and read by people and agents.
 */
export function describeInput(input: ReplayInput, index: number, indexWidth?: number): string {
  // Columns are aligned only in a listing (`indexWidth` given); a single description stays compact.
  const parts =
    indexWidth === undefined
      ? [`#${index}`, input.kind]
      : [`#${index}`.padEnd(indexWidth + 1), input.kind.padEnd(KIND_WIDTH)];
  switch (input.kind) {
    case "intent": {
      const details = intentDetails(input.intent as unknown as Record<string, unknown>);
      parts.push(`seat ${input.seat}`, details ? `${input.intent.type} ${details}` : input.intent.type);
      parts.push(`[${recordedOutcome(input)}]`);
      break;
    }
    case "seat":
      parts.push(
        `seat ${input.seat}`,
        `deck ${input.deck.mainDeck.length}+${input.deck.eggDeck.length}${input.bot ? " bot" : ""}`,
      );
      break;
    case "startScenarioFixture":
      parts.push(input.fixture.name ?? "fixture");
      break;
    case "startDevScenario":
      parts.push(input.scenario);
      break;
    case "disconnect":
      parts.push(`seat ${input.seat}`, input.final ? "final (left the match)" : "dropped");
      break;
    case "reconnect":
    case "clearReady":
    case "expireMatchTimer":
      parts.push(`seat ${input.seat}`);
      break;
    case "expireMulliganWindow":
      parts.push(`seat ${input.seat}`, "kept the hand");
      break;
    case "expireRankedRound":
    case "startMatch":
    case "expireCombatWindow":
      break;
  }
  parts.push(`sv=${input.stateVersion}`);
  if ("site" in input && input.site) parts.push(`@${input.site}`);
  return parts.join(" ");
}

/** The `inputs` command: every input in `[from, to]` (inclusive), one line each. */
export function listInputs(record: ReplayRecord, range: { from?: number; to?: number } = {}): string[] {
  const from = range.from ?? 0;
  const to = Math.min(range.to ?? record.inputs.length - 1, record.inputs.length - 1);
  const width = String(to).length;
  const lines: string[] = [];
  for (let index = from; index <= to; index++) lines.push(describeInput(record.inputs[index]!, index, width));
  return lines;
}
