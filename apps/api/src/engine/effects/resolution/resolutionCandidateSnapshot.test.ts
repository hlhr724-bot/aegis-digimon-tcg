import { expect, it } from "vitest";
import { createResolutionCandidateReader } from "#api/engine/effects/resolution/createResolutionCandidateReader";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import { setupEngine } from "#api/engine/testkit/harness";
import { candidateSourceLocation } from "#api/engine/gameEngine/ruleProcess";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import { CardInstance } from "@aegis/shared/schema/CardInstance";

type World = ReturnType<typeof setupEngine>;
type CloneParams = { original: World; destination: World; reader: () => readonly CardInstance[] };

function restoreReader({ original, destination, reader }: CloneParams): () => readonly CardInstance[] {
  const snapshot = encodeRuntimeGraph({
    value: reader,
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
    describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
  });
  return decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
    createCallback: destination.engine.runtimeCallbacks.create.bind(destination.engine.runtimeCallbacks),
  }) as () => readonly CardInstance[];
}

it("restores explicit instance candidates and an empty scope without expanding to the board", () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({
    0: {
      battleArea: [
        { card: "BT1-009", as: "source" },
        { card: "BT1-010", as: "newcomer" },
      ],
    },
  });
  const target = destination.inst("source");
  target.instanceId = original.inst("source").instanceId;
  const reader = createResolutionCandidateReader({
    engine: original.engine,
    scope: { kind: ResolutionCandidateKind.INSTANCES.value, instanceIds: [target.instanceId] },
  });
  expect(restoreReader({ original, destination, reader })()).toEqual([target]);
  const empty = createResolutionCandidateReader({
    engine: original.engine,
    scope: { kind: ResolutionCandidateKind.NONE.value },
  });
  expect(restoreReader({ original, destination, reader: empty })()).toEqual([]);
});

it("preserves the opening role of phase-boundary sources", () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({
    0: {
      battleArea: [
        { card: "BT1-009", as: "source" },
        { card: "BT1-010", as: "newcomer" },
      ],
    },
  });
  const target = destination.inst("source");
  const permanent = destination.perm("source");
  target.instanceId = original.inst("source").instanceId;
  permanent.permanentId = original.perm("source").permanentId;
  const reader = createResolutionCandidateReader({
    engine: original.engine,
    scope: {
      kind: ResolutionCandidateKind.BOUNDARY.value,
      locations: new Map([[target.instanceId, candidateSourceLocation(original.engine, target.instanceId)]]),
    },
  });
  const restored = restoreReader({ original, destination, reader });
  expect(restored()).toEqual([target]);
  permanent.topCard = destination.inst("newcomer");
  permanent.stack.push(target);
  expect(restored()).toEqual([]);
  expect(reader()).toEqual([original.inst("source")]);
});

it("preserves permanent identity and opening instances across restore and departure", () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({
    0: {
      battleArea: [
        { card: "BT1-009", as: "source" },
        { card: "BT1-010", as: "newcomer" },
      ],
    },
  });
  const target = destination.inst("source");
  const permanent = destination.perm("source");
  target.instanceId = original.inst("source").instanceId;
  permanent.permanentId = original.perm("source").permanentId;
  const reader = createResolutionCandidateReader({
    engine: original.engine,
    permanent: original.perm("source"),
    scope: {
      kind: ResolutionCandidateKind.PERMANENT.value,
      permanentId: permanent.permanentId,
      instanceIds: [target.instanceId],
      resident: true,
    },
  });
  const restored = restoreReader({ original, destination, reader });
  expect(restored()).toEqual([target]);
  permanent.stack.push(destination.inst("newcomer"));
  expect(restored()).toEqual([target]);
  destination.state.players[0]!.battleArea.splice(0, 1);
  expect(restored()).toEqual([]);
  const departed = restoreReader({ original: destination, destination: original, reader: restored });
  expect(departed()).toEqual([]);
  expect(reader()).toEqual([original.inst("source")]);
});

it("retains transient historical cards and their aliases instead of looking them up on the new board", () => {
  const original = setupEngine({});
  const destination = setupEngine({});
  const card = new CardInstance();
  card.instanceId = "departed-card";
  card.cardId = "BT1-009";
  card.ownerSeat = 0;
  card.faceUp = false;
  card.artId = "historical-printing";
  const transientCandidates: CardInstance[] = [];
  const reader = createResolutionCandidateReader({
    engine: original.engine,
    scope: { kind: ResolutionCandidateKind.NONE.value },
    transientCandidates,
  });
  transientCandidates.push(card);
  expect(reader()).toEqual([card]);
  const snapshot = encodeRuntimeGraph({
    value: { reader, card },
    describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
    createCallback: destination.engine.runtimeCallbacks.create.bind(destination.engine.runtimeCallbacks),
  }) as { reader: () => readonly CardInstance[]; card: CardInstance };
  expect(restored.reader()).toEqual([restored.card]);
  expect(restored.reader()[0]).toBe(restored.card);
  expect(restored.card).toBeInstanceOf(CardInstance);
  expect(restored.card.artId).toBe("historical-printing");
  expect(restored.card.faceUp).toBe(false);
  restored.card.artId = "changed";
  expect(card.artId).toBe("historical-printing");
});

it("keeps a departed permanent's captured identity if that same object is later reinserted", () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({});
  const permanent = original.perm("source");
  const reader = createResolutionCandidateReader({
    engine: original.engine,
    permanent,
    scope: {
      kind: ResolutionCandidateKind.PERMANENT.value,
      permanentId: permanent.permanentId,
      instanceIds: [permanent.topCard.instanceId],
      resident: true,
    },
  });
  original.state.players[0]!.battleArea.splice(0, 1);
  const snapshot = encodeRuntimeGraph({
    value: { reader, permanent },
    describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
    createCallback: destination.engine.runtimeCallbacks.create.bind(destination.engine.runtimeCallbacks),
  }) as { reader: () => readonly CardInstance[]; permanent: typeof permanent };
  expect(restored.reader()).toEqual([]);
  destination.state.players[0]!.battleArea.push(restored.permanent);
  expect(restored.reader()[0]).toBe(restored.permanent.topCard);
  expect(reader()).toEqual([]);
});
