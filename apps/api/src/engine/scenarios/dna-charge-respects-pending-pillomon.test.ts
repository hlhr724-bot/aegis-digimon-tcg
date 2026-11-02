import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/dna-charge-respects-pending-pillomon.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

it.each([true, false])(
  "offers Kudamon only after Pillomon's play prohibition has left the field (present: %s)",
  async (hasPillomon) => {
    const preferred: string[] = [];
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          1: { ...fixture.board[1], battleArea: hasPillomon ? fixture.board[1]!.battleArea : [] },
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferInstanceIds: preferred,
        declinePrompts: ["digivolve into a yellow"],
      },
    );
    s.state.phase = Phase.Main;
    preferred.push(s.inst("dnaCharge").instanceId, s.inst("kudamon").instanceId);
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rizeGreymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST24-06"));
    await settle(() => s.state.pendingDecision === undefined);
    const selection = s.decisions.find(({ req }) => req.sourceCardId === "ST24-15" && req.kind === "selectCards");
    const expectedCandidates = hasPillomon ? [] : [s.inst("tamer").instanceId, s.inst("kudamon").instanceId];
    expect(selection !== undefined).toBe(!hasPillomon);
    expect(selection?.req.options?.candidateInstanceIds ?? []).toEqual(expect.arrayContaining(expectedCandidates));
    const hasOptionalPlay = s.decisions.some(({ req }) => req.sourceCardId === "ST24-15" && req.kind === "optional");
    expect(hasPillomon && hasOptionalPlay).toBe(hasPillomon);
    const playedIds = s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId);
    expect(playedIds).toContain(s.inst("dnaCharge").instanceId);
    expect(playedIds.includes(s.inst("kudamon").instanceId)).toBe(!hasPillomon);
    expect(playedIds.includes(s.inst("tamer").instanceId)).toBe(hasPillomon);
    const expectedTrashIds = hasPillomon ? [s.inst("pillomon").instanceId] : [];
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining(expectedTrashIds));
  },
);
