import { describe, expect, it } from "vitest";
import { type ServerEvent } from "@aegis/shared/protocol/events";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine } from "#api/engine/testkit/harness";

describe("public return order narration", () => {
  it.each([true, false])("reports the actual top-to-bottom deck order when toTop is %s", async (toTop) => {
    const s = setupEngine({
      0: {
        trash: [
          { card: "ST1-03", as: "first" },
          { card: "ST1-02", as: "second" },
        ],
        deck: [{ card: "ST1-04", as: "remaining" }],
      },
    });
    await s.ready();
    await advance(s.engine).verb.returnToDeck([s.inst("first").instanceId, s.inst("second").instanceId], { toTop });
    const events = s.events.filter(
      (event): event is Extract<ServerEvent, { kind: "cardsMoved" }> =>
        event.kind === "cardsMoved" && event.deckReturnOrder === true,
    );
    expect(events).toHaveLength(1);
    const expected = toTop ? ["ST1-02", "ST1-03"] : ["ST1-03", "ST1-02"];
    expect(events[0]).toMatchObject({ cardIds: expected, to: toTop ? "deck" : "deckBottom" });
    const deck = s.state.players[0]!.deck;
    expect((toTop ? deck.slice(0, 2) : deck.slice(-2)).map((card) => card.cardId)).toEqual(expected);
    expect(events[0]!.instanceIds).toEqual((toTop ? deck.slice(0, 2) : deck.slice(-2)).map((card) => card.instanceId));
  });

  it("withholds private hand and face-down deck identities from the broadcast return event", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "ST1-03", as: "private-hand" }],
        deck: [{ card: "ST1-02", as: "private-deck" }, "ST1-04"],
      },
    });
    await s.ready();
    await advance(s.engine).verb.returnToDeck([s.inst("private-hand").instanceId, s.inst("private-deck").instanceId], {
      toTop: false,
    });
    const events = s.events.filter((event) => event.kind === "cardsMoved" && event.deckReturnOrder === true);
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event).not.toHaveProperty("cardIds");
      expect(event).not.toHaveProperty("artIds");
    }
  });
});

it("keeps face-down digivolution and linked cards private when returning them to the deck", async () => {
  const s = setupEngine({
    0: {
      battleArea: [
        {
          card: "ST1-07",
          as: "host",
          under: [{ card: "ST1-03", as: "source", faceUp: false }],
          linked: [{ card: "ST1-02", as: "link", faceUp: false }],
        },
      ],
    },
  });
  await s.ready();
  await advance(s.engine).verb.returnToDeck([s.inst("source").instanceId, s.inst("link").instanceId], { toTop: false });
  const events = s.events.filter((event) => event.kind === "cardsMoved" && event.deckReturnOrder === true);
  expect(events).toHaveLength(2);
  for (const event of events) {
    expect(event).not.toHaveProperty("cardIds");
    expect(event).not.toHaveProperty("artIds");
  }
});
