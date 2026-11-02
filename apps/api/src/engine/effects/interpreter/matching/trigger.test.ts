import { expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine } from "#api/engine/testkit/harness";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { matchingSubjectPermanentIds } from "#api/engine/effects/interpreter/matching/trigger";

it.each([
  { liveCard: "BT1-009", triggeredCard: "EX10-013", matches: true },
  { liveCard: "EX10-013", triggeredCard: "BT1-009", matches: false },
])(
  "matches digivolution watchers against $triggeredCard at trigger time instead of the later $liveCard",
  ({ liveCard, triggeredCard, matches }) => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX11-067", as: "watcher" },
          { card: liveCard, as: "live-subject" },
          { card: triggeredCard, as: "triggered-subject" },
        ],
      },
    });
    const subject = s.perm("live-subject");
    const snapshot = s.perm("triggered-subject").clone();
    snapshot.permanentId = subject.permanentId;
    const ctx = buildEffectContext(s.engine, cardSourceOf(s.engine, s.perm("watcher").topCard), {
      subjectPermanentId: subject.permanentId,
      digivolvedSubject: snapshot,
    });
    expect(
      matchingSubjectPermanentIds(ctx, {
        controller: "mine",
        nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }],
      }),
    ).toEqual(matches ? [subject.permanentId] : []);
    expect(
      matchingSubjectPermanentIds(ctx, {
        controller: "opponent",
        nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }],
      }),
    ).toEqual([]);
  },
);
