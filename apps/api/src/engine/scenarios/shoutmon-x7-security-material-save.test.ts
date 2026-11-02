import { describe, expect, it } from "vitest";
import "#api/cards/BT11/BT11-019";
import "#api/cards/BT10/BT10-087";
import "#api/cards/BT19/BT19-061";
import "#api/cards/BT10/BT10-029";
import "#api/cards/BT19/BT19-038";
import "#api/cards/BT19/BT19-047";
import "#api/cards/AD1/AD1-013";
import "#api/cards/BT11/BT11-015";
import { settle } from "#api/engine/testkit/harness";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/shoutmon-x7-material-save-activation.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { observe } from "#api/engine/testkit/observe";

describe("Shoutmon X7 Material Save in security battle", () => {
  it.each([false, true])(
    "offers saving four printed materials among DigiXros-only aliases (accept=%s)",
    async (accept) => {
      const s = setupScenario(fixture, {
        autoAcceptOptional: accept,
        autoDeclineOptional: !accept,
        autoSelectCards: true,
        declinePrompts: accept ? [] : ["Material Save"],
      });
      await s.ready();
      s.state.phase = Phase.Main;
      expect(observe(s.engine).hasKeyword(s.perm("shoutmon"), "MaterialSave")).toBe(true);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("shoutmon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(s.events.find((e) => e.kind === "securityChecked")).toMatchObject({ battle: { attackerDeleted: true } });
      const activation = s.decisions.find(({ req }) => req.promptText?.includes("Material Save 4"))!.req;
      expect(activation).toMatchObject({
        sourceCardId: "BT11-019",
        options: { selectionContext: "materialSaveActivation", visibleInstanceIds: expect.any(Array) },
      });
      expect(activation.options?.visibleInstanceIds).toHaveLength(4);
      expect(
        s
          .perm("tamer")
          .stack.map((c) => c.cardId)
          .sort(),
      ).toEqual(accept ? ["BT10-029", "BT19-047", "AD1-013", "BT11-015"].sort() : []);
      expect(s.state.players[0]!.trash.map((c) => c.cardId)).toEqual(
        expect.arrayContaining(["BT11-019", "BT19-061", "BT19-038"]),
      );
    },
  );
});
