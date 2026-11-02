import { $values, ArraySchema, Decoder, Encoder } from "@colyseus/schema";
import { expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { CardInstance, DigivolveRoute } from "@aegis/shared/schema/CardInstance";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { EngineSchemaKind } from "#api/engine/snapshot/schema/EngineSchemaKind";
import { setupEngine } from "#api/engine/testkit/harness";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";

function createRegistry(): RuntimeObjectRegistry {
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  return objects;
}

function cloneGraph<T>(value: T): T {
  const original = createRegistry();
  const destination = createRegistry();
  const snapshot = encodeRuntimeGraph({ value, describeObject: original.describe.bind(original) });
  return decodeRuntimeGraph({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects: destination }) as T;
}

it("preserves the synchronized state, server fields, historical cards and cross-owner aliases", () => {
  const setup = setupEngine({
    0: { battleArea: [{ card: "BT1-009", as: "source", under: ["BT1-010"] }], hand: ["BT1-019"], deck: ["BT1-020"] },
  });
  const permanent = setup.perm("source");
  permanent.attackRedirectTargets = { observed: { targetIds: ["target"], capacity: 2 } };
  const historical = new Permanent();
  historical.permanentId = "departed";
  historical.topCard = permanent.stack[0]!;
  historical.controllerSeat = 0;
  const route = new DigivolveRoute();
  route.permanentId = permanent.permanentId;
  route.alternateRequirementIndex = -1;
  route.projectedCost = 2;
  setup.state.players[0]!.hand[0]!.digivolveRoutes.push(route);
  const value = { state: setup.state, historical, sharedCard: historical.topCard, source: permanent };
  const restored = cloneGraph(value);
  expect(restored.state).toBeInstanceOf(GameState);
  expect(restored.state.toJSON()).toEqual(setup.state.toJSON());
  expect(restored.historical).toBeInstanceOf(Permanent);
  expect(restored.sharedCard).toBeInstanceOf(CardInstance);
  expect(restored.sharedCard).toBe(restored.historical.topCard);
  expect(restored.sharedCard).toBe(restored.source.stack[0]);
  expect(restored.source).toBe(restored.state.players[0]!.battleArea[0]);
  expect(restored.source.attackRedirectTargets).toEqual(permanent.attackRedirectTargets);
  expect(restored.state.players[0]!.hand[0]!.digivolveRoutes[0]).toBeInstanceOf(DigivolveRoute);
  restored.source.attackRedirectTargets.observed!.capacity = 9;
  restored.sharedCard.faceUp = false;
  expect(permanent.attackRedirectTargets.observed!.capacity).toBe(2);
  expect(historical.topCard.faceUp).toBe(true);
});

it("rebuilds fresh Colyseus change tracking and sends subsequent changes as deltas", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }], hand: ["BT1-019"] } });
  const restored = cloneGraph(setup.state);
  const encoder = new Encoder(restored);
  const mirror = new GameState();
  const decoder = new Decoder(mirror);
  decoder.decode(encoder.encodeAll());
  const referenceMirror = new GameState();
  const referenceDecoder = new Decoder(referenceMirror);
  referenceDecoder.decode(new Encoder(setup.state).encodeAll());
  expect(mirror.toJSON()).toEqual(referenceMirror.toJSON());
  encoder.discardChanges();
  restored.memory = 4;
  restored.players[0]!.battleArea[0]!.currentDP = 11000;
  const card = restored.players[0]!.hand.shift()!;
  restored.players[0]!.trash.push(card);
  decoder.decode(encoder.encode());
  expect(mirror.memory).toBe(4);
  expect(mirror.players[0]!.battleArea[0]!.currentDP).toBe(11000);
  expect(mirror.players[0]!.hand).toHaveLength(0);
  expect(mirror.players[0]!.trash[0]!.instanceId).toBe(card.instanceId);
  expect(setup.state.players[0]!.hand).toHaveLength(1);
});

it("retains undefined fields and rejects unknown schema subclasses or altered accessors", () => {
  const card = new CardInstance();
  const restored = cloneGraph(card);
  expect(restored.instanceId).toBeUndefined();
  expect(restored.artId).toBe("");
  class SpecialCard extends CardInstance {}
  expect(() => cloneGraph(new SpecialCard())).toThrow("unsupported");
  let reads = 0;
  Object.defineProperty(card, "cardId", {
    enumerable: true,
    get: () => {
      reads++;
      return "BT1-009";
    },
  });
  expect(() => cloneGraph(card)).toThrow("accessor was replaced");
  expect(reads).toBe(0);
});

it("drops the room visibility port while continuing to reject unknown schema symbols", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const source = setup.perm("source");
  Object.defineProperty(source, Symbol.for("aegis.visibilityPort"), { value: () => {} });
  const restored = cloneGraph(source);
  expect(restored.permanentId).toBe(source.permanentId);
  expect(Object.getOwnPropertySymbols(restored)).not.toContain(Symbol.for("aegis.visibilityPort"));
  Object.defineProperty(source, Symbol("unclassified"), { value: true });
  expect(() => cloneGraph(source)).toThrow("unsupported symbol");
});

it("rejects a different schema layout, duplicate fields and incomplete field payloads", () => {
  const objects = createRegistry();
  const card = new CardInstance();
  function restoreChanged(change: (payload: { fingerprint: string; fields: [string, unknown][] }) => void): void {
    const payload = objects.describe(card)!.payload as { fingerprint: string; fields: [string, unknown][] };
    change(payload);
    const destination = createRegistry();
    destination.hydrate({
      value: destination.allocate(EngineSchemaKind.CARD_INSTANCE.value),
      key: EngineSchemaKind.CARD_INSTANCE.value,
      payload,
    });
  }
  expect(() =>
    restoreChanged((payload) => {
      payload.fingerprint = "different";
    }),
  ).toThrow("fingerprint");
  expect(() =>
    restoreChanged((payload) => {
      payload.fields.push(payload.fields[0]!);
    }),
  ).toThrow("duplicate");
  expect(() =>
    restoreChanged((payload) => {
      payload.fields = [];
    }),
  ).toThrow("missing an annotated field");
});

it("rejects sparse or extended schema arrays rather than compacting their values", () => {
  const values = new ArraySchema<string>("first", "second");
  expect(cloneGraph(values)).toEqual(values);
  values[3] = "fourth";
  expect(() => cloneGraph(values)).toThrow("unsettled empty slot");
  const extended = new ArraySchema<string>("first");
  Object.defineProperty(extended, "extra", { value: true });
  expect(() => cloneGraph(extended)).toThrow("unsupported properties");
});

it("rejects incompatible primitive and collection values before applying schema fields", () => {
  const objects = createRegistry();
  const valid = new CardInstance();
  const payload = objects.describe(valid)!.payload as { fingerprint: string; fields: [string, unknown][] };
  payload.fields.find(([name]) => name === "cardId")![1] = 42;
  const allocated = objects.allocate(EngineSchemaKind.CARD_INSTANCE.value) as CardInstance;
  expect(() => objects.hydrate({ value: allocated, key: EngineSchemaKind.CARD_INSTANCE.value, payload })).toThrow(
    "wrong primitive type",
  );
  expect(allocated.cardId).toBeUndefined();
  expect(() =>
    objects.hydrate({
      value: objects.allocate(EngineSchemaKind.ARRAY.value),
      key: EngineSchemaKind.ARRAY.value,
      payload: { childType: "string", values: new Array(2) },
    }),
  ).toThrow("Invalid schema array payload");
  expect(() =>
    objects.hydrate({
      value: objects.allocate(EngineSchemaKind.ARRAY.value),
      key: EngineSchemaKind.ARRAY.value,
      payload: { childType: "string", values: [42] },
    }),
  ).toThrow("wrong primitive type");
});

it("preserves an absent server-only data field instead of adding its constructor default", () => {
  const permanent = new Permanent();
  Reflect.deleteProperty(permanent, "attackRedirectTargets");
  const restored = cloneGraph(permanent);
  expect(Object.hasOwn(restored, "attackRedirectTargets")).toBe(false);
});

it("rejects a schema prototype changed after automatic identification", () => {
  const objects = createRegistry();
  const card = new CardInstance();
  expect(objects.describe(card)).toBeDefined();
  Object.setPrototypeOf(card, Object.create(CardInstance.prototype));
  expect(() => objects.describe(card)).toThrow("prototype changed");
});

it("refuses accessors installed on schema and collection internals without executing them", () => {
  let reads = 0;
  const values = new ArraySchema<string>("first");
  Object.defineProperty(values, "items", {
    get: () => {
      reads++;
      return [];
    },
  });
  expect(() => cloneGraph(values)).toThrow("unsupported accessor");
  const card = new CardInstance();
  Object.defineProperty(card, $values, {
    get: () => {
      reads++;
      return [];
    },
  });
  expect(() => cloneGraph(card)).toThrow("unsupported accessor");
  expect(reads).toBe(0);
});
