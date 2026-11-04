import { GameState } from "@aegis/shared/schema/GameState";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";
import type { PreparedGameEngineRestore } from "#api/engine/snapshot/PreparedGameEngineRestore";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import type { RuntimeGraphNode, RuntimeGraphValue } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { RuntimeNodeKind } from "#api/engine/snapshot/RuntimeNodeKind";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { ENGINE_SCHEMA_CLASSES } from "#api/engine/snapshot/schema/ENGINE_SCHEMA_CLASSES";
import { EngineSchemaKind } from "#api/engine/snapshot/schema/EngineSchemaKind";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";

type Params = { snapshot: GameEngineSnapshot };

const SCHEMA_KEYS: ReadonlySet<string> = new Set([
  EngineSchemaKind.ARRAY.value,
  ...ENGINE_SCHEMA_CLASSES.map((entry) => entry.key),
]);

export function prepareGameEngineRestore({ snapshot }: Params): PreparedGameEngineRestore | undefined {
  if (snapshot.version !== 1 || snapshot.fingerprint !== getEngineCodeFingerprint()) {
    throw new Error("Incompatible engine snapshot version or code fingerprint");
  }
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  const decoder = new RuntimeGraphDecoder({ snapshot: snapshot.graph, objects });
  const state = decoder.decodeRootField({ key: "state" });
  if (!(state instanceof GameState)) {
    throw new Error("Engine snapshot has no GameState");
  }
  const nodes = snapshot.graph.nodes;
  const decoded = new Set<number>();
  const schemaSeeds: (readonly [number, object])[] = [];
  for (const [index, value] of decoder.decodedEntries()) {
    decoded.add(index);
    const node = nodes[index]!;
    if (node.kind === RuntimeNodeKind.RESOURCE.value && SCHEMA_KEYS.has(node.key)) {
      schemaSeeds.push([index, value as object]);
    }
  }
  const seeded = new Set(schemaSeeds.map(([index]) => index));
  for (let index = 0; index < nodes.length; index++) {
    if (decoded.has(index)) continue;
    for (const reference of referencesOf(nodes[index]!)) {
      if (decoded.has(reference) && !seeded.has(reference)) return undefined;
    }
  }
  return { snapshot, state, schemaSeeds };
}

function referencesOf(node: RuntimeGraphNode): number[] {
  const values: RuntimeGraphValue[] = [];
  if (node.kind === RuntimeNodeKind.OBJECT.value) {
    for (const [, value] of node.entries) values.push(value);
  } else if (node.kind === RuntimeNodeKind.MAP.value) {
    for (const [key, value] of node.entries) values.push(key, value);
  } else if (node.kind === RuntimeNodeKind.ARRAY.value || node.kind === RuntimeNodeKind.SET.value) {
    values.push(...node.values);
  } else {
    values.push(node.payload);
  }
  const references: number[] = [];
  for (const value of values) {
    if (value !== null && typeof value === "object" && "reference" in value) references.push(value.reference);
  }
  return references;
}
