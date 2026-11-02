import { expect, it } from "vitest";
import { advance } from "./testkit/advance.js";
import { setupEngine } from "./testkit/harness.js";

// The primitive is the protocol seam shared by all return effects, including private
// recoveries and top detachments. A card-specific intent would cover only one producer.
it("reports only public whole-field returns, grouped with the correct recipient", async () => {
  const s = setupEngine({
    0: {
      battleArea: [{ card: "BT1-010", as: "own", under: ["BT1-009"] }],
      trash: [{ card: "BT1-043", as: "private" }],
    },
    1: { battleArea: [{ card: "BT1-044", as: "opponent", under: ["BT1-043"] }] },
  });
  await s.ready();
  const own = s.perm("own"),
    opponent = s.perm("opponent");
  await advance(s.engine).verb.returnToHand([
    own.topCard.instanceId,
    s.inst("private").instanceId,
    opponent.topCard.instanceId,
  ]);
  const additions = s.events.filter(
    (event) => event.kind === "cardsMoved" && event.to === "hand" && event.returnedPermanents !== undefined,
  );
  expect(additions).toHaveLength(2);
  expect(additions.map((event) => (event.kind === "cardsMoved" ? event.returnedPermanents : []))).toEqual([
    [{ permanentId: own.permanentId, instanceId: own.topCard.instanceId, cardId: "BT1-010", seat: 0 }],
    [{ permanentId: opponent.permanentId, instanceId: opponent.topCard.instanceId, cardId: "BT1-044", seat: 1 }],
  ]);
  for (const event of additions) {
    expect(event).not.toHaveProperty("cardIds");
    expect(event).not.toHaveProperty("artIds");
  }
  expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-009"]);
  expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT1-043"]);
});

it.each(["silent", "detach"] as const)("does not report a whole departure for %s additions", async (kind) => {
  const s = setupEngine({ 0: { battleArea: [{ card: "BT1-010", as: "host", under: ["BT1-043"] }] } });
  await s.ready();
  await advance(s.engine).verb.returnToHand(
    [s.perm("host").topCard.instanceId],
    kind === "silent" ? { silent: true } : { detachPermanentTop: true },
  );
  const additions = s.events.filter((event) => event.kind === "cardsMoved" && event.to === "hand");
  expect(additions).toHaveLength(1);
  expect(additions[0]).not.toHaveProperty("returnedPermanents");
  expect(s.state.players[0]!.battleArea).toHaveLength(kind === "detach" ? 1 : 0);
});

it("never publishes a field departure for private zone additions", async () => {
  const s = setupEngine({ 1: { trash: [{ card: "BT1-043", as: "trash" }], deck: [{ card: "BT1-010", as: "deck" }] } });
  await s.ready();
  await advance(s.engine).verb.returnToHand([s.inst("trash").instanceId, s.inst("deck").instanceId]);
  const additions = s.events.filter((event) => event.kind === "cardsMoved" && event.to === "hand");
  expect(additions).toHaveLength(2);
  for (const event of additions) {
    expect(event).not.toHaveProperty("returnedPermanents");
    expect(event).not.toHaveProperty("cardIds");
  }
});
