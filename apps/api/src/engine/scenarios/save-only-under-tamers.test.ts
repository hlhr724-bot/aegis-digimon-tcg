import { expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/BT10/BT10-020";
import "#api/cards/BT21/BT21-063";

it.each(["BT10-020", "BT21-063"])("%s cannot Save under a Digimon without a Tamer", async (card) => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card, as: "source" },
          { card: "BT1-009", as: "digimon" },
        ],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  const sourceId = s.inst("source").instanceId;
  await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
  await settle(() => s.state.pendingDecision === undefined);
  expect(s.perm("digimon").stack).toHaveLength(0);
  expect(s.state.players[0]!.trash.map((entry) => entry.instanceId)).toContain(sourceId);
});
