import { describe, expect, it } from "vitest";
import { CardInstance, Permanent, type DecisionRequest } from "@aegis/shared";
import { sourceHostChoiceFor } from "./sourceHostChoice";

function permanent(permanentId: string, stackInstanceIds: readonly string[]): Permanent {
  const perm = new Permanent();
  perm.permanentId = permanentId;
  const top = new CardInstance();
  top.instanceId = `${permanentId}-top`;
  perm.topCard = top;
  perm.stack.push(
    ...stackInstanceIds.map((instanceId) => {
      const card = new CardInstance();
      card.instanceId = instanceId;
      return card;
    }),
  );
  return perm;
}

const decision: DecisionRequest = {
  decisionId: "proximamon-sources",
  seat: 0,
  kind: "selectCards",
  promptText: "Play or use 1 card",
};
const battleArea = [permanent("proximamon", ["a1", "a2"]), permanent("canoweissmon", ["b1"])];
const sources = ["a1", "a2", "b1"].map((instanceId) => ({ instanceId, zone: "digivolutionCards" as const }));

describe("source host choice", () => {
  it("groups one-card source picks by the Digimon holding them", () => {
    const choice = sourceHostChoiceFor({ decision, answerOnBoard: false, candidates: sources, battleArea });
    expect(choice?.hostPermanentIds).toEqual(["proximamon", "canoweissmon"]);
    expect([...choice!.cardIdsByHost.get("proximamon")!]).toEqual(["a1", "a2"]);
    expect([...choice!.cardIdsByHost.get("canoweissmon")!]).toEqual(["b1"]);
  });

  it("identifies the sole host so its source picker can open directly", () => {
    const candidates = sources.filter((candidate) => candidate.instanceId !== "b1");
    const choice = sourceHostChoiceFor({ decision, answerOnBoard: false, candidates, battleArea });
    expect(choice?.hostPermanentIds).toEqual(["proximamon"]);
    expect([...choice!.cardIdsByHost.get("proximamon")!]).toEqual(["a1", "a2"]);
  });

  it("groups multi-card opponent source picks without including unoffered stacks", () => {
    const opponentSources = sources.map((source) => ({ ...source, zone: "opponentDigivolutionCards" as const }));
    const choice = sourceHostChoiceFor({
      decision: { ...decision, options: { min: 2, max: 2 } },
      answerOnBoard: false,
      candidates: opponentSources,
      battleArea: [...battleArea, permanent("unoffered", ["c1"])],
    });
    expect(choice?.hostPermanentIds).toEqual(["proximamon", "canoweissmon"]);
    expect([...choice!.cardIdsByHost.get("proximamon")!]).toEqual(["a1", "a2"]);
  });

  it("keeps board picks and mixed zones in one list", () => {
    expect(sourceHostChoiceFor({ decision, answerOnBoard: true, candidates: sources, battleArea })).toBeUndefined();
    expect(
      sourceHostChoiceFor({
        decision,
        answerOnBoard: false,
        candidates: [...sources, { instanceId: "h1", zone: "hand" }],
        battleArea,
      }),
    ).toBeUndefined();
  });
});
