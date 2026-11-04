import type { GameEngine } from "#api/engine/GameEngine";
import { continuousSkipVerifier } from "#api/engine/mutationClock/continuousSkipVerifier";

type Fingerprint = Map<string, string>;
type Verification = { verified: number; mismatches: string[] };

const IDENTIFIER_FIELDS = new Set(["id", "grantId"]);
const IGNORED_PARTS = new Set([
  "core.windowTokenSeq",
  "subTriggers.sequence",
  "subTriggers.seq",
  "modifiers.evoCostSeq",
  "modifiers.playCostSeq",
  "continuous.nextCustomEffectGrantId",
]);

export function installContinuousSkipVerification(): Verification {
  const verification: Verification = { verified: 0, mismatches: [] };
  continuousSkipVerifier.verify = async ({ engine, recompute }) => {
    const before = fingerprintEngine(engine);
    await recompute();
    const after = fingerprintEngine(engine);
    verification.verified++;
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (part) => !IGNORED_PARTS.has(part) && before.get(part) !== after.get(part),
    );
    if (changed.length > 0) {
      const mismatch = `A skipped continuous recompute would have changed ${changed.join(", ")}`;
      verification.mismatches.push(mismatch);
      throw new Error(mismatch);
    }
  };
  return verification;
}

function fingerprintEngine(engine: GameEngine): Fingerprint {
  const parts = new Map<string, string>();
  const ledgers = new Set<object>([
    engine.modifiers,
    engine.continuous,
    engine.memory,
    engine.tracker,
    engine.subTriggers,
    engine.securityDp,
    engine.deletionMaxDp,
    engine.dpDeleteBudget,
  ]);
  const ownFields = (ledger: object): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(ledger).filter(([, value]) => typeof value !== "function" && !ledgers.has(value as object)),
    );
  const components: [string, () => unknown, boolean][] = [
    ["state", () => engine.state.toJSON(), false],
    ["modifiers", () => ownFields(engine.modifiers), true],
    ["continuous", () => ownFields(engine.continuous), true],
    ["memory", () => ownFields(engine.memory), true],
    ["tracker", () => ownFields(engine.tracker), true],
    ["subTriggers", () => ownFields(engine.subTriggers), true],
    ["securityDp", () => ownFields(engine.securityDp), true],
    ["deletionMaxDp", () => ownFields(engine.deletionMaxDp), true],
    ["dpDeleteBudget", () => ownFields(engine.dpDeleteBudget), true],
    ["core", () => engine.getSnapshotCoreState(), true],
  ];
  for (const [name, read, stripIdentifiers] of components) {
    const value = read();
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Map)) {
      for (const [key, entry] of Object.entries(value)) {
        parts.set(`${name}.${key}`, stableText(entry, stripIdentifiers, new Set()));
      }
    } else {
      parts.set(name, stableText(value, stripIdentifiers, new Set()));
    }
  }
  return parts;
}

function stableText(value: unknown, stripIdentifiers: boolean, ancestors: Set<object>): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return `function:${value.name}:${value.toString().length}`;
  if (typeof value !== "object") return String(value);
  if (ancestors.has(value)) return "<cycle>";
  ancestors.add(value);
  let text: string;
  if (value instanceof Map) {
    text = `Map{${[...value]
      .map(
        ([key, entry]) =>
          `${stableText(key, stripIdentifiers, ancestors)}=>${stableText(entry, stripIdentifiers, ancestors)}`,
      )
      .join(",")}}`;
  } else if (value instanceof Set) {
    text = `Set{${[...value].map((entry) => stableText(entry, stripIdentifiers, ancestors)).join(",")}}`;
  } else if (Array.isArray(value)) {
    text = `[${value.map((entry) => stableText(entry, stripIdentifiers, ancestors)).join(",")}]`;
  } else if (value instanceof Promise) {
    text = "<promise>";
  } else if (
    typeof (value as { toJSON?: unknown }).toJSON === "function" &&
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    text = `${value.constructor.name}:${stableText((value as { toJSON: () => unknown }).toJSON(), stripIdentifiers, ancestors)}`;
  } else {
    const record = value as Record<string, unknown>;
    text = `{${Object.keys(record)
      .sort()
      .filter((key) => !(stripIdentifiers && IDENTIFIER_FIELDS.has(key)))
      .map((key) => `${key}:${stableText(record[key], stripIdentifiers, ancestors)}`)
      .join(",")}}`;
  }
  ancestors.delete(value);
  return text;
}
