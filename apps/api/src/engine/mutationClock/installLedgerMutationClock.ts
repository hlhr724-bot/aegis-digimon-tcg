import { ContinuousEffectLedger } from "#api/engine/effects/continuous";
import { ModifierLedger } from "#api/engine/effects/modifiers";
import { SubTriggerRegistry } from "#api/engine/effects/subtriggers";
import { bumpEngineMutationClock } from "#api/engine/mutationClock/bumpEngineMutationClock";
import { LEDGER_READ_ONLY_MEMBERS } from "#api/engine/mutationClock/LEDGER_READ_ONLY_MEMBERS";
import type { LedgerClass } from "#api/engine/mutationClock/LedgerClass";

type Method = (this: object, ...args: unknown[]) => unknown;
type ChangeRule =
  | { kind: "delegates" }
  | { kind: "changesWhen"; changes: (ledger: object, args: unknown[]) => boolean }
  | { kind: "signature"; signature: (ledger: object) => string };

const CHANGE_RULES: ReadonlyMap<LedgerClass, ReadonlyMap<string, ChangeRule>> = new Map<
  LedgerClass,
  ReadonlyMap<string, ChangeRule>
>([
  [
    SubTriggerRegistry,
    new Map<string, ChangeRule>([
      ["fire", { kind: "delegates" }],
      ["fireSnapshot", { kind: "changesWhen", changes: (_ledger, args) => (args[0] as readonly unknown[]).length > 0 }],
      ["sweepExpired", { kind: "signature", signature: collectionSizes }],
    ]),
  ],
  [
    ContinuousEffectLedger,
    new Map<string, ChangeRule>([
      [
        "takeExpiredAffectationRecipients",
        {
          kind: "changesWhen",
          changes: (ledger) => fieldOf<Set<string>>(ledger, "expiredAffectationRecipients").size > 0,
        },
      ],
      ["sweep", { kind: "signature", signature: collectionSizes }],
    ]),
  ],
  [
    ModifierLedger,
    new Map<string, ChangeRule>([
      [
        "sweep",
        {
          kind: "signature",
          signature: (ledger) =>
            `${collectionSizes(ledger)}|${skippedTurnEnds(ledger, "playerDpModifiers")}|${skippedTurnEnds(ledger, "dpModifiers")}`,
        },
      ],
    ]),
  ],
]);

let installed = false;

export function installLedgerMutationClock(): void {
  if (installed) return;
  installed = true;
  for (const [ledgerClass, readOnly] of LEDGER_READ_ONLY_MEMBERS) {
    const rules = CHANGE_RULES.get(ledgerClass);
    const skipped = new Set(readOnly);
    for (const name of Object.getOwnPropertyNames(ledgerClass.prototype)) {
      if (name === "constructor" || skipped.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(ledgerClass.prototype, name)!;
      const rule = rules?.get(name);
      if (typeof descriptor.value === "function") {
        if (rule?.kind === "delegates") continue;
        Object.defineProperty(ledgerClass.prototype, name, {
          ...descriptor,
          value:
            rule === undefined
              ? bumpingMethod(descriptor.value as Method)
              : ruledMethod(descriptor.value as Method, rule),
        });
      } else if (descriptor.get !== undefined || descriptor.set !== undefined) {
        Object.defineProperty(ledgerClass.prototype, name, {
          ...descriptor,
          ...(descriptor.get === undefined ? {} : { get: bumpingMethod(descriptor.get as Method) }),
          ...(descriptor.set === undefined ? {} : { set: bumpingMethod(descriptor.set as Method) }),
        });
      }
    }
  }
}

function bumpingMethod(method: Method): Method {
  return function (this: object, ...args: unknown[]) {
    bumpEngineMutationClock();
    return method.apply(this, args);
  };
}

function ruledMethod(method: Method, rule: Exclude<ChangeRule, { kind: "delegates" }>): Method {
  if (rule.kind === "changesWhen") {
    return function (this: object, ...args: unknown[]) {
      if (rule.changes(this, args)) bumpEngineMutationClock();
      return method.apply(this, args);
    };
  }
  return function (this: object, ...args: unknown[]) {
    const before = rule.signature(this);
    const result = method.apply(this, args);
    if (result instanceof Promise) throw new Error("Signature-checked ledger methods must be synchronous");
    if (rule.signature(this) !== before) bumpEngineMutationClock();
    return result;
  };
}

function fieldOf<T>(ledger: object, name: string): T {
  return (ledger as Record<string, T>)[name]!;
}

function collectionSizes(ledger: object): string {
  const sizes: number[] = [];
  for (const value of Object.values(ledger)) {
    if (Array.isArray(value)) sizes.push(value.length);
    else if (value instanceof Set || value instanceof Map) sizes.push(value.size);
  }
  return sizes.join(",");
}

function skippedTurnEnds(ledger: object, name: string): number {
  return fieldOf<{ skipsCurrentOpponentTurnEnd?: boolean }[]>(ledger, name).filter(
    (entry) => entry.skipsCurrentOpponentTurnEnd === true,
  ).length;
}
