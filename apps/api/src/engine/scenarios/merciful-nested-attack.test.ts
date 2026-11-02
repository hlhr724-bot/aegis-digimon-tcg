import type { DecisionRequest, DecisionResponse, Seat } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine, settle, settleAcrossTimers } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

describe("recovered nested Merciful On Play sequence (Q2859)", () => {
  for (const seat of [0, 1] as const) {
    it.each([true, false])(
      `seat ${seat}: Barrier accepted=%s does not create or strand a nested attack`,
      async (acceptBarrier) => {
        const opponent: Seat = seat === 0 ? 1 : 0;
        const s = setupEngine({
          [seat]: {
            battleArea: [
              { card: "ST20-03", as: "skull" },
              { card: "AD1-022", as: "izzy" },
              { card: "AD1-019", as: "matt" },
              { card: "EX13-073", suspended: true },
            ],
            hand: [
              "ST21-10",
              { card: "BT21-075", as: "skullCard" },
              { card: "ST21-08", as: "togemon" },
              { card: "ST20-03", as: "discard" },
            ],
            trash: [
              { card: "ST21-07", as: "palmon" },
              ...["AD1-014", "BT21-061", "ST21-09", "ST20-06"].map((card, i) => ({ card, as: `material${i}` })),
            ],
            deck: ["BT1-009", { card: "EX13-077", as: "merciful" }, "BT1-009", "BT1-009", "BT1-009"],
            security: 3,
          },
          [opponent]: {
            battleArea: [
              { card: "EX13-037", as: "dynas", under: ["BT19-029"] },
              { card: "EX13-034", as: "wisemon" },
            ],
            trash: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
            security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
            deck: ["BT1-009", "BT1-009"],
          },
        });
        s.state.turnSeat = seat;
        s.state.memory = 10;
        await s.ready();
        const skullId = s.perm("skull").permanentId;
        const skullInstanceId = s.inst("skullCard").instanceId;
        const birdInstanceId = s.perm("skull").topCard.instanceId;
        const dynasId = s.perm("dynas").permanentId;
        const wisemonId = s.perm("wisemon").permanentId;
        let lastDecisionId: string | undefined;
        async function decision(sourceCardId: string, kind: DecisionRequest["kind"]) {
          await settleAcrossTimers(
            () => !!s.state.pendingDecision && s.state.pendingDecision.decisionId !== lastDecisionId,
          );
          const req = s.decisions.find(
            ({ req: candidate }) => candidate.decisionId === s.state.pendingDecision?.decisionId,
          )!.req;
          expect(req).toMatchObject({ sourceCardId, kind });
          lastDecisionId = req.decisionId;
          return req;
        }
        function respond(req: DecisionRequest, response: DecisionResponse) {
          expect(
            s.engine.applyIntent(req.seat, { type: "respondDecision", decisionId: req.decisionId, response }),
          ).toEqual({ ok: true });
        }
        async function optional(source: string, accept = true) {
          respond(await decision(source, "optional"), { kind: "optional", accept });
        }
        async function pick(source: string, kind: "selectCards" | "chooseTargets", instanceIds: string[]) {
          const req = await decision(source, kind);
          expect(req.options?.candidateInstanceIds).toEqual(expect.arrayContaining(instanceIds));
          respond(req, { kind, instanceIds });
        }
        function originalAttackStillResolving() {
          expect(observe(s.engine).isAttacking()).toBe(true);
          expect(s.events.filter(({ kind }) => kind === "attackEnded")).toHaveLength(0);
          expect(s.events.filter(({ kind }) => kind === "attackDeclared")).toEqual([
            expect.objectContaining({ attackerPermanentId: skullId, target: { kind: "player" } }),
            expect.objectContaining({
              attackerPermanentId: skullId,
              redirected: true,
              target: { kind: "permanent", permanentId: dynasId },
            }),
          ]);
        }
        // Establish SkullGreymon's granted Raid/Retaliation through its printed evolution.
        expect(
          s.engine.applyIntent(seat, {
            type: "digivolve",
            permanentId: skullId,
            instanceId: skullInstanceId,
            useAlternateCost: true,
          }),
        ).toEqual({ ok: true });
        await optional("AD1-019", false);
        await settle(() => s.state.pendingDecision === undefined);
        expect(
          s.engine.applyIntent(seat, { type: "attack", attackerPermanentId: skullId, target: { kind: "player" } }),
        ).toEqual({ ok: true });
        await pick("BT21-075", "selectCards", [s.perm("dynas").topCard.instanceId]);
        // Retaliation is prevented by the inherited protection, spending Wisemon's OPT
        // before Merciful enters, just as at 17:38:13 in the recovered match.
        await optional("BT19-029");
        await optional("BT21-075");
        expect(s.events.filter((e) => e.kind === "effectResolved" && e.sourcePermanentId === wisemonId)).toHaveLength(
          1,
        );
        expect(s.state.players[seat]!.battleArea.some((p) => p.permanentId === skullId)).toBe(false);
        originalAttackStillResolving();
        await pick("BT21-075", "selectCards", [s.inst("palmon").instanceId]);
        await pick("ST21-07", "selectCards", [s.inst("discard").instanceId]);
        await optional("AD1-022");
        await optional("AD1-022");
        // Palmon -> Togemon is the only legal evolution, but after paying the suspend cost the
        // destination is still asked so it can be declined (#5411). Togemon has no follow-up target.
        await pick("AD1-022", "selectCards", [s.inst("togemon").instanceId]);
        await optional("AD1-019");
        await pick("AD1-019", "selectCards", [s.inst("merciful").instanceId]);
        const assembly = await decision("AD1-019", "selectCards");
        expect(assembly.options).toMatchObject({ assemblyCardId: "EX13-077", max: 6 });
        const materials = [
          s.inst("material0").instanceId,
          s.inst("material1").instanceId,
          skullInstanceId,
          birdInstanceId,
          s.inst("material2").instanceId,
          s.inst("material3").instanceId,
        ];
        respond(assembly, { kind: "selectCards", instanceIds: materials });
        const warning = await decision("EX13-077", "optional");
        expect(warning.options).toMatchObject({
          promptKey: "attackAlreadyResolving",
          selectionContext: "attackSource",
          timing: "OnPlay",
        });
        expect(warning.promptText).toBe("Another attack cannot start while this attack is resolving.");
        const merciful = s.state.players[seat]!.battleArea.find((p) => p.topCard.cardId === "EX13-077")!;
        expect(merciful.stack.map((c) => c.instanceId)).toEqual(expect.arrayContaining(materials));
        expect(s.perm("matt").isSuspended).toBe(true);
        originalAttackStillResolving();
        respond(warning, { kind: "optional", accept: true });
        const firstMode = await decision("EX13-077", "chooseOption");
        expect(
          s.decisions.filter(
            ({ req }) => req.kind === "chooseTargets" && req.options?.selectionContext === "attackSource",
          ),
        ).toEqual([]);
        originalAttackStillResolving();
        respond(firstMode, { kind: "chooseOption", optionIndex: 0 });
        await optional("EX13-077");
        await pick("EX13-077", "chooseTargets", [dynasId]);
        respond(await decision("EX13-077", "chooseOption"), { kind: "chooseOption", optionIndex: 1 });
        expect(s.state.players[opponent]!.battleArea.some((p) => p.permanentId === dynasId)).toBe(false);
        const recovery = await decision("EX13-077", "selectCards");
        const returned = s.state.players[opponent]!.trash.slice(0, 5).map((c) => c.instanceId);
        respond(recovery, { kind: "selectCards", instanceIds: returned });
        respond(await decision("EX13-077", "chooseOption"), { kind: "chooseOption", optionIndex: 0 });
        expect(s.state.players[seat]!.security).toHaveLength(4);
        expect(s.state.players[opponent]!.deck.slice(-5).map((c) => c.instanceId)).toEqual(returned);
        await optional("EX13-077");
        await settle(() => s.events.some(({ kind }) => kind === "barrierPrompt"));
        originalAttackStillResolving();
        const securityBeforeBarrier = s.state.players[opponent]!.security.length;
        expect(
          s.engine.applyIntent(seat, { type: "respondBarrier", permanentId: wisemonId, accept: acceptBarrier }),
        ).toMatchObject({ ok: false });
        expect(
          s.engine.applyIntent(opponent, { type: "respondBarrier", permanentId: wisemonId, accept: acceptBarrier }),
        ).toEqual({ ok: true });
        await settleAcrossTimers(() => s.events.some(({ kind }) => kind === "attackEnded"));
        expect(s.events.filter(({ kind }) => kind === "attackDeclared")).toHaveLength(2);
        expect(s.events.filter(({ kind }) => kind === "attackEnded")).toEqual([
          expect.objectContaining({ seat, attackerPermanentId: skullId }),
        ]);
        const resolvedIndex = s.events.findIndex(
          (e) => e.kind === "effectResolved" && e.sourcePermanentId === merciful.permanentId,
        );
        expect(resolvedIndex).toBeGreaterThan(-1);
        expect(s.events.findIndex(({ kind }) => kind === "attackEnded")).toBeGreaterThan(resolvedIndex);
        expect(s.events.filter((e) => e.kind === "battleCompared" && e.effectBattle)).toEqual([
          expect.objectContaining({ attackerPermanentId: merciful.permanentId, defenderPermanentId: dynasId }),
          expect.objectContaining({ attackerPermanentId: merciful.permanentId, defenderPermanentId: wisemonId }),
        ]);
        expect(
          s.events.filter((e) => e.kind === "effectOptionChosen" && e.sourcePermanentId === merciful.permanentId),
        ).toHaveLength(3);
        expect(s.events.filter(({ kind }) => kind === "securityChecked")).toHaveLength(0);
        expect(s.events.filter((e) => e.kind === "effectResolved" && e.sourcePermanentId === wisemonId)).toHaveLength(
          1,
        );
        expect(s.state.players[opponent]!.security).toHaveLength(securityBeforeBarrier - Number(acceptBarrier));
        expect(s.state.players[opponent]!.battleArea.some((p) => p.permanentId === wisemonId)).toBe(acceptBarrier);
        expect(merciful.topCard.cardId).toBe("EX13-077");
        expect(merciful.isSuspended).toBe(false);
        expect(s.state.pendingDecision).toBeUndefined();
        expect(observe(s.engine).isAttacking()).toBe(false);
      },
    );
  }
});
