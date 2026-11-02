import { compiledEffects } from "@aegis/shared/effects/data";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { describe, expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { internalsOf } from "#api/engine/testkit/internals";
import { observe } from "#api/engine/testkit/observe";
import { runSubTrigger, SUBTRIGGER_EVENT_MAP } from "#api/engine/effects/interpreter/actions/subTrigger";
import { buildSubTriggerContext, playerFacingWatcherClause } from "#api/engine/gameEngine/subTriggers";
import "#api/cards/index";

const nextReturn = "[Pending] At the next end of your opponent’s turn, return it to the hand.";
const cases = [
  { cardId: "BT16-084", event: "endOfTurn", clause: nextReturn },
  { cardId: "BT16-085", event: "endOfTurn", clause: nextReturn },
  { cardId: "BT16-088", event: "endOfTurn", clause: nextReturn },
  { cardId: "BT6-087", event: "endOfTurn", clause: "[Pending] At the end of the turn, delete that Digimon." },
  { cardId: "BT6-088", event: "endOfTurn", clause: "[Pending] At the end of the turn, delete that Digimon." },
  {
    cardId: "EX3-069",
    event: "endOfOpponentTurn",
    clause: "[Pending] At the next end of your opponent's turn, delete that Digimon.",
  },
  {
    cardId: "EX4-013",
    event: "endOfTurn",
    clause: "[Pending] At the end of the turn, return this Digimon to the hand.",
  },
  { cardId: "EX10-072", event: "endOfTurn", clause: "[Pending] At turn end, delete the Digimon this effect played." },
  {
    cardId: "BT4-098",
    event: "whenBlocked",
    clause: "[Granted] [Your Turn] When this Digimon is blocked, gain +3 memory.",
  },
];

describe("pending and granted watcher presentation", () => {
  it.each(cases)(
    "keeps $cardId's consequence distinct from the recipient's printed effect",
    async ({ cardId, event, clause }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: cardId, as: "source" },
              { card: "AD1-024", as: "recipient" },
            ],
          },
        },
        { autoSelectCards: true },
      );
      const action = compiledEffects[cardId]!.effects.flatMap((effect) => effect.actions ?? []).find(
        (candidate): candidate is Extract<Action, { kind: "SubTrigger" }> =>
          candidate.kind === "SubTrigger" && candidate.event === event,
      )!;
      expect(action).toBeDefined();
      const engine = internalsOf(s.engine);
      const ctx = engine.buildEffectContext(engine.cardSourceOf(s.inst("source")), {});
      const recipientId = s.perm("recipient").permanentId;
      const boundRef = action.on?.filter.boundRef ?? action.on?.fromSelectionRef;
      if (boundRef !== undefined) {
        ctx.boundPlayed = new Map([[boundRef, new Set([recipientId])]]);
        ctx.selections = new Map([[boundRef, recipientId]]);
      }
      await runSubTrigger(ctx, action);
      const subscriptions = observe(s.engine).subscriptions(SUBTRIGGER_EVENT_MAP[event]!);
      expect(subscriptions).toHaveLength(1);
      const sub = subscriptions[0]!;
      const pendingContext = buildSubTriggerContext(s.engine, sub, {});
      expect(pendingContext).toBeDefined();
      expect(playerFacingWatcherClause(sub, pendingContext!)).toBe(clause);
    },
  );
});
