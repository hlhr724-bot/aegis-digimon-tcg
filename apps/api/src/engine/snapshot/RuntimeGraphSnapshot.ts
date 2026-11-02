import type { RuntimeNumberValue } from "#api/engine/snapshot/RuntimeNumberValue";
import type { RuntimeNodeKind } from "#api/engine/snapshot/RuntimeNodeKind";

export type RuntimeGraphValue =
  | null
  | boolean
  | string
  | number
  | { reference: number }
  | { absent: true }
  | { hole: true }
  | { number: RuntimeNumberValue };

export type RuntimeGraphNode =
  | { kind: typeof RuntimeNodeKind.OBJECT.value; nullPrototype: boolean; entries: [string, RuntimeGraphValue][] }
  | { kind: typeof RuntimeNodeKind.ARRAY.value; values: RuntimeGraphValue[] }
  | { kind: typeof RuntimeNodeKind.MAP.value; entries: [RuntimeGraphValue, RuntimeGraphValue][] }
  | { kind: typeof RuntimeNodeKind.SET.value; values: RuntimeGraphValue[] }
  | { kind: typeof RuntimeNodeKind.REFERENCE.value; key: string; payload: RuntimeGraphValue }
  | { kind: typeof RuntimeNodeKind.RESOURCE.value; key: string; payload: RuntimeGraphValue }
  | { kind: typeof RuntimeNodeKind.CALLBACK.value; key: string; payload: RuntimeGraphValue };

export type RuntimeGraphSnapshot = { version: 1; root: RuntimeGraphValue; nodes: RuntimeGraphNode[] };
