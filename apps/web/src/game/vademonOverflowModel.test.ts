import { CardInstance, Permanent, type ServerEvent } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { translator } from "../i18n";
import { displayMemory } from "./boardModel";
import { buildMatchLog } from "./matchLog";
import { decisionAllowsPick, nextDecisionPicks } from "./screen/model/decisionPicks";
import { stackCardsOf } from "./screen/model/stackCardsOf";

describe("Discord 1557652222744199228 Vademon memory and source presentation", () => {
  for (const turnSeat of [0, 1] as const) {
    it(`seat ${turnSeat}: separates one evolution payment from opponent Overflow for both viewers`, () => {
      const opponent = turnSeat === 0 ? 1 : 0;
      // Public trace: payCost and digivolve describe the same 6 -> 5 mutation.
      const events: ServerEvent[] = [
        { kind: "phaseChanged", phase: "Main", turnSeat, turnCount: 1 },
        { kind: "memoryChanged", from: 6, to: 5, reason: "payCost" },
        { kind: "memoryChanged", from: 6, to: 5, reason: "digivolve" },
        { kind: "memoryChanged", from: 5, to: 8, reason: "overflow" },
      ];
      expect(buildMatchLog(events, turnSeat, new Map(), translator("pt-BR")).map((line) => line.text)).toEqual([
        "Memória de Você: 5 → 8",
        "Memória de Você: 6 → 5",
      ]);
      expect([6, 5, 8].map((memory) => displayMemory({ turnSeat, memory }, turnSeat))).toEqual([6, 5, 8]);
      expect([6, 5, 8].map((memory) => displayMemory({ turnSeat, memory }, opponent))).toEqual([-6, -5, -8]);
    });

    it(`seat ${turnSeat}: wraps duplicate ACE sources as face down without merging their physical picks`, () => {
      const permanent = new Permanent();
      permanent.controllerSeat = turnSeat;
      permanent.topCard = new CardInstance();
      permanent.topCard.cardId = "BT22-061";
      for (const instanceId of ["bottom-payment", "retained-source"]) {
        const card = new CardInstance();
        card.cardId = "BT14-014";
        card.instanceId = instanceId;
        card.ownerSeat = turnSeat;
        card.faceUp = false;
        permanent.stack.push(card);
      }
      expect(stackCardsOf({ perm: permanent, viewerSeat: turnSeat }).slice(1)).toEqual([
        { cardId: "BT14-014", artId: "", faceDown: true, role: "stack" },
        { cardId: "BT14-014", artId: "", faceDown: true, role: "stack" },
      ]);
      expect(stackCardsOf({ perm: permanent, viewerSeat: turnSeat === 0 ? 1 : 0 }).slice(1)).toEqual([
        { cardId: "", faceDown: true, role: "stack" },
        { cardId: "", faceDown: true, role: "stack" },
      ]);
      const decisionSelectable = new Set(["return-one", "return-two"]);
      const input = {
        decisionSelectable,
        picks: ["return-one"],
        decisionInstanceColors: new Map(),
        decisionDifferentColors: false,
        decisionVisibleCardIds: new Map([
          ["return-one", "BT14-014"],
          ["return-two", "BT14-014"],
        ]),
        decisionDistinctCardIds: false,
      };
      expect(decisionAllowsPick({ ...input, instanceId: "return-two" })).toBe(true);
      expect(decisionAllowsPick({ ...input, instanceId: "bottom-payment" })).toBe(false);
      expect(nextDecisionPicks({ picks: ["return-one"], instanceId: "return-two", max: 1 })).toEqual(["return-two"]);
      expect(nextDecisionPicks({ picks: ["return-two"], instanceId: "return-two", max: 1 })).toEqual([]);
    });
  }
});
