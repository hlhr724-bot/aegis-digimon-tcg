import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./ignition-flare-link-without-recipient.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Ignition Flare link without a recipient", () => {
  it("replays the reported match up to the security Ignition Flare trash choice as recorded", async () => {
    const { divergences, state } = await runReplay(record, { untilInput: 69 });

    expect(divergences).toEqual([]);
    expect(state.pendingDecision).toMatchObject({ seat: 0, kind: "chooseTargets", promptText: "Ignition Flare" });
  });

  it("skips the optional link when its controller has no Digimon on the field", async () => {
    const replay = await runReplay(record, { untilInput: 69 });
    const { state } = replay;
    const controller = state.players[0]!;
    expect(controller.battleArea).toHaveLength(0);
    expect(controller.breeding).toBeUndefined();
    const trashDecision = state.pendingDecision!;
    const trashedOption = JSON.parse(trashDecision.payloadJson).candidateInstanceIds[0] as string;
    const flaresInTrash = controller.trash.filter((card) => card.cardId === "BT25-093").length;

    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: trashDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [trashedOption] },
      }),
    ).toEqual({ ok: true });

    expect(state.pendingDecision).toBeUndefined();
    expect(state.players[1]!.battleArea.some((permanent) => permanent.permanentId === trashedOption)).toBe(false);
    expect(controller.trash.filter((card) => card.cardId === "BT25-093")).toHaveLength(flaresInTrash + 1);
  });
});
