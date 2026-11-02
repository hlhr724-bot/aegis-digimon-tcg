// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { buildTriggerKey, getCardDefinition, type DecisionRequest, type DecisionResponse } from "@aegis/shared";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/i18n/I18nContext";
import { TOUCH_LAYOUT_QUERY } from "@/design/useMediaQuery";
import { I18nProvider, translator } from "../i18n";
import {
  BlockOverlay,
  cardEffectClauseForTiming,
  DecisionOverlay,
  EvoCostChoiceOverlay,
  OpponentDroppedOverlay,
  WaitingOverlay,
} from "./overlay";
import type { EvoCostOption } from "./digivolveModel";
import { CardOpenerProvider } from "./cardLinks";
import { choiceLabel } from "./overlay/choice/decisionChoiceLabels";
import { printedModalBullets } from "@aegis/shared/effects/printedClauses";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows a complete authored Chinese step while preserving the optional response", async () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <DecisionOverlay
        request={{
          decisionId: "authored-short-step",
          seat: 0,
          kind: "optional",
          promptText: "Use this effect?",
          sourceCardId: "BT10-008",
          options: { timing: "OnPlay", effectTextPart: "Add 1 Digimon card" },
        }}
        sourceCardId="BT10-008"
        candidates={[]}
        picks={[]}
        onTogglePick={vi.fn<() => void>()}
        onRespond={onRespond}
      />
    </I18nContext.Provider>,
  );
  const text = () => document.querySelector(".decision-overlay__effect-text")?.textContent;
  await waitFor(() => expect(text()).toContain("3张卡牌"));
  expect(text()).toContain("驯兽师");
  expect(text()).not.toContain("Add 1 Digimon card");
  fireEvent.click(screen.getByRole("button", { name: translator("zh-CN")("overlay.activate") }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});

it("uses source card translations for printed modal option buttons and submits the original index", async () => {
  const cardId = "BT22-013";
  const clause = cardEffectClauseForTiming(cardId, "WhenDigivolving")!;
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <DecisionOverlay
        request={{
          decisionId: "translated-modal-bullets",
          seat: 0,
          kind: "chooseOption",
          promptText: "WarGreymon",
          options: {
            choices: ["Digivolve", "Delete 1 target(s)"],
            choiceClauses: printedModalBullets(clause),
            timing: "WhenDigivolving",
          },
        }}
        sourceCardId={cardId}
        candidates={[]}
        picks={[]}
        onTogglePick={vi.fn<() => void>()}
        onRespond={onRespond}
      />
    </I18nContext.Provider>,
  );
  const deletion = await screen.findByRole("button", { name: /消灭.*DP最低/ });
  expect(screen.getByRole("button", { name: /加布兽.*钢铁加鲁鲁兽/ })).toBeTruthy();
  fireEvent.click(deletion);
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
});

it.each([
  {
    timing: "WhenDigivolving",
    emphasis:
      "[When Digivolving] [When Attacking] [Once Per Turn] You may return 1 of your opponent's level 5 or lower Digimon to the hand.",
  },
  {
    timing: "WhenAttacking",
    emphasis:
      "[When Digivolving] [When Attacking] [Once Per Turn] You may return 1 of your opponent's level 5 or lower Digimon to the hand.",
  },
  {
    timing: "WhenDigivolving",
    emphasis:
      "Then, by trashing the bottom face-down card under any of your Tamers, return 1 of your opponent's lowest level Digimon to the hand.",
  },
])("highlights MirageGaogamon's current activation clause at $timing: $emphasis", ({ timing, emphasis }) => {
  const effectText = cardEffectClauseForTiming("BT25-029", timing)!;
  renderDecision({
    decisionId: "optional-return-current-clause",
    seat: 0,
    kind: "optional",
    sourceCardId: "BT25-029",
    promptText: "Use this effect?",
    options: { timing, effectText, effectTextEmphasis: emphasis },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(effectText);
  expect(document.querySelector(".decision-overlay__effect-step")?.textContent).toBe(emphasis);
});

it.each([
  {
    cardId: "EX13-032",
    choices: ["Trash your top security card", "Trash the bottom face-down card from under 1 of your Tamers"],
    labels: ["丢弃我方最上方的1张安防卡牌", "丢弃我方1只驯兽师下方最下方的1张背面表示卡牌"],
  },
  {
    cardId: "BT26-026",
    choices: ["Trash the bottom face-down card from under 1 of your Tamers", "Trash your top security card"],
    labels: ["丢弃我方1只驯兽师下方最下方的1张背面表示卡牌", "丢弃我方最上方的1张安防卡牌"],
  },
])(
  "localizes alternative payment buttons without changing their response order for $cardId",
  ({ cardId, choices, labels }) => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
        <DecisionOverlay
          request={{
            decisionId: "alternative-payment",
            seat: 0,
            kind: "chooseOption",
            promptText: "Choose a cost to pay",
            sourceCardId: cardId,
            options: { choices: [...choices, "Don't use"], declineIndex: 2, timing: "WhenDigivolving" },
          }}
          sourceCardId={cardId}
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn<() => void>()}
          onRespond={onRespond}
        />
      </I18nContext.Provider>,
    );
    const buttons = document.querySelectorAll(".decision-overlay__choices button");
    expect(buttons[0]?.textContent).toBe(labels[0]);
    expect(buttons[1]?.textContent).toBe(labels[1]);
    fireEvent.click(screen.getByRole("button", { name: labels[0] }));
    expect(onRespond).toHaveBeenLastCalledWith({ kind: "chooseOption", optionIndex: 0 });
    fireEvent.click(screen.getByRole("button", { name: labels[1] }));
    expect(onRespond).toHaveBeenLastCalledWith({ kind: "chooseOption", optionIndex: 1 });
    fireEvent.click(screen.getByRole("button", { name: "不使用" }));
    expect(onRespond).toHaveBeenLastCalledWith({ kind: "chooseOption", optionIndex: 2 });
  },
);

it("translates Davis and Ken's delayed play effect in the activation dialog", async () => {
  const effectTextPart =
    "[Start of Your Main Phase] You may play 1 [Veemon] or [Wormmon] from your hand without paying the cost. At the next end of your opponent’s turn, return it to the hand.";
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <DecisionOverlay
        request={{
          decisionId: "davis-ken-activation",
          seat: 0,
          kind: "optional",
          promptText: "Use this effect?",
          sourceCardId: "BT16-085",
          options: {
            timing: "StartOfYourMainPhase",
            effectText: getCardDefinition("BT16-085")!.effectText,
            effectTextPart,
          },
        }}
        sourceCardId="BT16-085"
        candidates={[]}
        picks={[]}
        onTogglePick={vi.fn<() => void>()}
        onRespond={vi.fn<() => void>()}
      />
    </I18nContext.Provider>,
  );
  const getText = () => document.querySelector(".decision-overlay__effect-text")?.textContent;
  await waitFor(() => expect(getText()).toContain("“V仔兽”/“虫虫兽”"));
  expect(getText()).toContain("当下个对方的回合结束时，将该数码宝贝放回到手牌中。");
  expect(getText()).not.toContain("You may play");
  expect(screen.getByRole("heading", { name: "使用这个效果？" })).toBeTruthy();
});

it("feedback #51: copied donor text is shown while Jesmon GX remains the effect source", () => {
  const clause = "Then, until your opponent's turn ends, their Digimon effects don't affect 1 of your white Digimon.";
  renderDecision({
    decisionId: "feedback51-copied-target",
    seat: 0,
    kind: "chooseTargets",
    sourceCardId: "BT10-112",
    sourceInstanceId: "gx",
    sourcePermanentId: "gx-host",
    promptText: "Jesmon GX",
    options: {
      timing: "WhenDigivolving",
      effectTextCardId: "EX13-061",
      effectText: getCardDefinition("EX13-061")!.effectText,
      effectTextPart: clause,
      candidateInstanceIds: ["gx-host"],
      min: 1,
      max: 1,
    },
  });
  expect(screen.getByRole("dialog", { name: "Jesmon GX · effect" })).toBeTruthy();
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(clause);
});

it("keeps Sakuyamon's optional cost in the clause under the standard activation heading", () => {
  const cost = "By placing 1 of your opponent's Digimon with the lowest DP as the bottom security card";
  const clause =
    "[All Turns] [Once Per Turn] When you use Option cards or your security stack is removed from, by placing 1 of your opponent's Digimon with the lowest DP as the bottom security card, trash their top security card.";
  renderDecision({
    decisionId: "sakuyamon-optional-cost",
    seat: 0,
    kind: "optional",
    sourceCardId: "ST22-06",
    promptText: cost,
    options: { timing: "AllTurns", effectTextPart: clause },
  });
  expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: cost })).toBeNull();
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(clause);
});

it.each([
  ["EX13-015", 1],
  ["AD1-003", 1],
  ["EX8-012", 2],
] as const)("GitHub bug #5043: selects granted Blitz before %s's printed effect (%s copies)", (cardId, copies) => {
  const printed = buildTriggerKey("host", `${cardId}/ir-0`);
  const blitzKeys = Array.from({ length: copies }, (_, index) =>
    buildTriggerKey("host", `subtrigger/${3956 + index}/[When Digivolving] ＜Blitz＞`),
  );
  const { onRespond } = renderDecision({
    decisionId: "takato-granted-blitz",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next pending effect to resolve.",
    sourceCardId: cardId,
    options: {
      triggerKeys: [printed, ...blitzKeys],
      triggerCardIds: Array.from({ length: copies + 1 }, () => cardId),
      triggerTimings: ["WhenDigivolving", ...blitzKeys.map(() => "whenOneOfYoursDigivolves")],
      triggerDescriptions: [
        cardEffectClauseForTiming(cardId, "WhenDigivolving")!,
        ...blitzKeys.map(() => "[When Digivolving] ＜Blitz＞"),
      ],
      triggerIsOptional: Array.from({ length: copies + 1 }, () => false),
      acceptsResolutionPlan: true,
      timing: "WhenDigivolving",
    },
  });
  const blitzTexts = screen.getAllByText(/Blitz/);
  expect(blitzTexts).toHaveLength(copies);
  const blitzButton = blitzTexts.at(-1)!.closest("button")!;
  expect(blitzButton).toBeTruthy();
  expect(within(blitzButton).queryByText(/Delete 1 of your opponent/)).toBeNull();
  fireEvent.click(blitzButton);
  fireEvent.click(screen.getByRole("button", { name: /Resolve next effect/i }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [blitzKeys.at(-1)] });
});

it.each([
  [
    "legacy watcher",
    "[All Turns] When your hand is trashed from, delete 1 of your opponent's Digimon with the lowest DP.",
    false,
  ],
  [
    "printed watcher",
    "[All Turns] When your hand is trashed from, delete 1 of your opponent's lowest DP Digimon.",
    false,
  ],
  [
    "repeated occurrence",
    "[All Turns] When your hand is trashed from, delete 1 of your opponent's lowest DP Digimon.",
    true,
  ],
])(
  "Discord 1556765492197326870: %s Titamon triggers never display leave protection",
  (_name, description, sameInstance) => {
    const keys = [
      buildTriggerKey("s0-24", `subtrigger/3447/${description}`),
      buildTriggerKey(
        sameInstance ? "s0-24" : "s0-25",
        sameInstance ? `subtrigger/3447/${description}/activation-2` : `subtrigger/3449/${description}`,
      ),
    ];
    const { onRespond } = renderDecision({
      decisionId: "dec-74",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: {
        triggerKeys: keys,
        triggerCardIds: ["BT25-084", "BT25-084"],
        triggerTimings: ["AllTurns", "AllTurns"],
        triggerDescriptions: [description, description],
        triggerIsOptional: [false, false],
      },
    });
    expect(screen.queryByText(/When this Digimon would leave the battle area/)).toBeNull();
    expect(screen.getAllByText(/When your hand is trashed from/)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: /Titamon/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Resolve next effect/i }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [keys[0]] });
  },
);

it("renders each Monarchlizamon trigger's authoritative clause instead of repeating the first timing match", () => {
  renderDecision({
    decisionId: "monarch-two-evolution-effects",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next pending effect to resolve.",
    options: {
      triggerKeys: [buildTriggerKey("monarch", "BT25-057/ir-0"), buildTriggerKey("monarch", "BT25-057/ir-2")],
      triggerCardIds: ["BT25-057", "BT25-057"],
      triggerTimings: ["WhenDigivolving", "WhenDigivolving"],
      triggerDescriptions: [
        "[When Digivolving] [When Attacking] [Once Per Turn] By trashing the bottom face-down card under any of your Tamers, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
        "[When Digivolving] This Digimon may battle 1 of your opponent's Digimon.",
      ],
    },
  });
  expect(screen.getAllByText(/By trashing the bottom face-down card/)).toHaveLength(1);
  expect(screen.getByText(/This Digimon may battle 1 of your opponent's Digimon/)).toBeTruthy();
});

it("MiMiMi Homeros report: visibly distinguishes Neptunemon's borrowed activation timings", () => {
  const clause = cardEffectClauseForTiming("BT24-030", "OnPlay")!;
  const { onRespond } = renderDecision({
    decisionId: "homeros-neptunemon-timings",
    seat: 0,
    kind: "chooseOption",
    promptText: "Homeros",
    sourceCardId: "BT24-102",
    options: {
      choices: [clause, clause],
      choiceEffects: [
        { cardId: "BT24-030", timing: "OnPlay" },
        { cardId: "BT24-030", timing: "WhenDigivolving" },
      ],
      timing: "EndOfYourTurn",
    },
  });
  const onPlay = screen.getByRole("button", { name: "[On Play], Neptunemon" });
  const whenDigivolving = screen.getByRole("button", { name: "[When Digivolving], Neptunemon" });
  expect(onPlay.querySelector(".effect-choice__body")!.textContent).not.toBe(
    whenDigivolving.querySelector(".effect-choice__body")!.textContent,
  );
  expect(onPlay.querySelector(".effect-choice__title")!.textContent).toContain("[On Play]");
  expect(whenDigivolving.querySelector(".effect-choice__title")!.textContent).toContain("[When Digivolving]");
  expect(within(onPlay).getByText(/Return all of your opponent's Digimon/)).toBeTruthy();
  expect(within(whenDigivolving).getByText(/Return all of your opponent's Digimon/)).toBeTruthy();
  fireEvent.click(whenDigivolving);
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
});

it("Discord 1555770458866065499: shows each borrowable effect as its full printed clause", () => {
  const { onRespond } = renderDecision({
    decisionId: "rina-activates-ulforce",
    seat: 0,
    kind: "chooseOption",
    promptText: "Rina Shinomiya",
    sourceCardId: "BT11-112",
    options: {
      choices: [
        "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] 1 of your Digimon may change orientation.",
        "[On Play] [When Digivolving] You may return all of your opponent's Digimon with the fewest digivolution cards to the bottom of the deck.",
      ],
      choiceEffects: [
        { cardId: "EX13-023", timing: "WhenDigivolving" },
        { cardId: "EX13-023", timing: "WhenDigivolving" },
      ],
      timing: "Static",
      effectText:
        "[All Turns] When one of your Digimon with [Veedramon] in its name becomes suspended, by suspending this Tamer, activate 1 of that Digimon's [When Digivolving] effects.",
    },
  });
  expect(screen.getByText(/1 of your Digimon may change orientation/)).toBeTruthy();
  expect(
    screen.getByText(/You may return all of your opponent's Digimon with the fewest digivolution cards/),
  ).toBeTruthy();
  expect(screen.queryByText(/Until the end of your opponent's turn/)).toBeNull();
  expect(screen.getByText(/activate 1 of that Digimon's \[When Digivolving\] effects/)).toBeTruthy();
  const effectButtons = screen.getAllByRole("button", { name: /\[When Digivolving\], UlforceVeedramon/ });
  expect(within(effectButtons[0]!).getByText(/1 of your Digimon may change orientation/)).toBeTruthy();
  expect(within(effectButtons[0]!).queryByText(/You may return all/)).toBeNull();
  expect(within(effectButtons[1]!).getByText(/You may return all/)).toBeTruthy();
  expect(within(effectButtons[1]!).queryByText(/1 of your Digimon may change orientation/)).toBeNull();
  fireEvent.click(effectButtons[1]!);
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
});

const optionalDecision: DecisionRequest = {
  decisionId: "decision-1",
  seat: 0,
  kind: "optional",
  promptText: "Activate the effect?",
};

function renderDecision(request: DecisionRequest = optionalDecision) {
  const onRespond = vi.fn();
  const result = render(
    <I18nProvider>
      <DecisionOverlay
        request={request}
        sourceCardId={request.sourceCardId}
        candidates={[]}
        picks={[]}
        onTogglePick={vi.fn()}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  return { ...result, onRespond };
}

it.each([true, false])("offers Ascension on the left without card selection and accepts: %s", (accept) => {
  const { onRespond } = renderDecision({
    decisionId: "ascension-activation",
    seat: 0,
    kind: "optional",
    sourceCardId: "BT25-040",
    promptText: "Activate ＜Ascension＞?",
    options: {
      timing: "Ascension",
      effectText: "＜Ascension＞: When this card is deleted, you may place it at the top of your security stack.",
    },
  });
  expect(screen.getByRole("dialog").getAttribute("data-prompt-surface")).toBe("left");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: accept ? "Yes, activate" : "No, decline" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept });
});

it("shows Genshi's activating effect instead of its Use Requirement", () => {
  renderDecision({
    decisionId: "genshi-main",
    seat: 0,
    kind: "optional",
    promptText: "Use this effect?",
    sourceCardId: "EX12-074",
    options: { timing: "Main", effectText: getCardDefinition("EX12-074")!.effectText },
  });
  expect(screen.getByText(/Add your bottom security card to the hand/)).toBeTruthy();
  expect(screen.queryByText(/Use Req/)).toBeNull();
});

it.each(["optional", "orderTriggers"] as const)("names granted Execute in the %s choice", (kind) => {
  const description =
    "＜Execute＞: at the end of this turn, this Digimon may attack (including an unsuspended opponent's Digimon). At the end of the attack, this Digimon is deleted.";
  renderDecision({
    decisionId: "granted-execute",
    seat: 0,
    kind,
    promptText: "Use this effect?",
    sourceCardId: "EX12-009",
    options:
      kind === "optional"
        ? { timing: "EndOfYourTurn", effectText: description }
        : {
            triggerKeys: ["wankomon/execute"],
            triggerCardIds: ["EX12-009"],
            triggerTimings: ["EndOfYourTurn"],
            triggerDescriptions: [description],
          },
  });
  expect(screen.getByText(/at the end of this turn, this Digimon may attack/)).toBeTruthy();
  expect(screen.getByText(/Execute/)).toBeTruthy();
});

it("drops the effect text and offers another Digimon when a source pick is narrowed to one host", () => {
  const onChangeSourceHost = vi.fn();
  render(
    <I18nProvider>
      <DecisionOverlay
        request={{
          decisionId: "proximamon-sources",
          seat: 0,
          kind: "selectCards",
          promptText: "Proximamon",
          sourceCardId: "EX12-077",
          options: {
            candidateInstanceIds: ["siriusmon"],
            timing: "WhenDigivolving",
            effectText: "[When Digivolving] You may play or use 1 card from any of your Digimon's digivolution cards.",
          },
        }}
        sourceCardId="EX12-077"
        candidates={[
          {
            instanceId: "siriusmon",
            cardId: "EX12-018",
            hostCardId: "ST4-13",
            hostPermanentId: "host",
            selectable: true,
          },
        ]}
        picks={[]}
        onTogglePick={vi.fn()}
        onRespond={vi.fn()}
        onChangeSourceHost={onChangeSourceHost}
      />
    </I18nProvider>,
  );
  expect(screen.queryByText(/You may play or use/)).toBeNull();
  expect(screen.getByRole("heading", { name: "HerculesKabuterimon" })).toBeTruthy();
  expect(screen.getByText("Digivolution cards")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Choose another Digimon" }));
  expect(onChangeSourceHost).toHaveBeenCalled();
});

describe("digivolution requirement choice", () => {
  const request: DecisionRequest = {
    decisionId: "weregarurumon-requirement",
    seat: 0,
    kind: "chooseOption",
    promptText: "WereGarurumon",
    sourceCardId: "EX12-032",
    options: {
      choices: ["Printed digivolution requirement (cost 4)", "Alternate digivolution requirement (cost 3)"],
      timing: "WhenAttacking",
      effectText: "[When Attacking] If this Digimon's stack has 2 or more same-level cards, it may digivolve.",
      digivolveCostChoice: { fromCardId: "EX12-032", intoCardId: "EX12-035", costs: [4, 3], costDelta: -2 },
    },
  };

  it("shows the digivolution, each cost after the reduction, and no clause", () => {
    const { onRespond } = renderDecision(request);
    expect(screen.getByRole("heading", { name: "Digivolve" })).toBeTruthy();
    expect(screen.getByText("4 − 2 = 2")).toBeTruthy();
    expect(screen.getByText("3 − 2 = 1")).toBeTruthy();
    expect(screen.queryByText(/When Attacking/)).toBeNull();

    const alternate = screen.getByRole("button", { name: "Alternate requirement, pays 1 memory" });
    expect(alternate.hasAttribute("data-recommended")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Printed requirement, pays 2 memory" }).hasAttribute("data-recommended"),
    ).toBe(false);
    fireEvent.click(alternate);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  });

  it("opens Return to decision on the left edge, level with View board", () => {
    renderDecision(request);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("decision-board-return")) return new DOMRect(0, 0, 320, 56);
      if (this.classList.contains("game-modal__panel")) return new DOMRect(300, 200, 400, 360);
      return new DOMRect(300, 540, 200, 40);
    });

    fireEvent.click(screen.getByRole("button", { name: "View board" }));

    const control = screen.getByRole("button", { name: "Return to decision" }).parentElement!;
    expect(control.hasAttribute("data-docked")).toBe(true);
    expect(control.style.getPropertyValue("--decision-return-left")).toBe("16px");
    expect(control.style.getPropertyValue("--decision-return-top")).toBe("532px");
  });
});

describe("resolution plan chooser", () => {
  const keys = {
    beelzemon: buildTriggerKey("beelzemon", "BT12-085/ir-1"),
    creepymon: buildTriggerKey("creepymon", "EX10-009/ir-0"),
    sukamon: buildTriggerKey("sukamon", "EX13-028/ir-1"),
  };
  const planRequest: DecisionRequest = {
    decisionId: "gate-deletion-plan",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next pending effect to resolve.",
    options: {
      triggerKeys: [keys.beelzemon, keys.creepymon, keys.sukamon],
      triggerCardIds: ["BT12-085", "EX10-009", "EX13-028"],
      triggerTimings: ["OnDeletion", "OnDeletion", "OnDeletion"],
      triggerIsOptional: [true, false, true],
      acceptsResolutionPlan: true,
    },
  };

  it("numbers effects in click order and renumbers when one is removed", () => {
    renderDecision(planRequest);
    const sukamon = screen.getByRole("button", { name: /Sukamon/ });
    const creepymon = screen.getByRole("button", { name: /Creepymon/ });
    const beelzemon = screen.getByRole("button", { name: /Beelzemon/ });

    fireEvent.click(sukamon);
    fireEvent.click(creepymon);
    fireEvent.click(beelzemon);
    expect(sukamon.querySelector(".decision-overlay__order-badge")?.textContent).toBe("1");
    expect(beelzemon.querySelector(".decision-overlay__order-badge")?.textContent).toBe("3");

    fireEvent.click(sukamon);
    expect(sukamon.querySelector(".decision-overlay__order-badge")).toBeNull();
    expect(creepymon.querySelector(".decision-overlay__order-badge")?.textContent).toBe("1");
    expect(beelzemon.querySelector(".decision-overlay__order-badge")?.textContent).toBe("2");
  });

  it("sends the full order and presets, and shows no preset for a mandatory effect", () => {
    const { onRespond } = renderDecision(planRequest);
    expect(screen.queryByRole("group", { name: /Creepymon/ })).toBeNull();
    expect(screen.getByText("Mandatory")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Sukamon/ }));
    expect(screen.getByText("1 of 3 ordered")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes to all" }));
    const sukamonPreset = screen.getByRole("group", { name: /Sukamon/ });
    fireEvent.click(within(sukamonPreset).getByRole("button", { name: "No" }));
    expect(screen.getByText("3 of 3 ordered")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));

    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [keys.sukamon, keys.beelzemon, keys.creepymon],
      optionalAnswers: { [keys.beelzemon]: true, [keys.sukamon]: false },
    });
  });

  it.each([
    ["Yes to all", true],
    ["No to all", false],
  ] as const)("%s selects every effect and presets only optional effects", (label, answer) => {
    const { onRespond } = renderDecision(planRequest);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(screen.getByText("3 of 3 ordered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select all, top to bottom" })).toBeNull();
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));

    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [keys.beelzemon, keys.creepymon, keys.sukamon],
      optionalAnswers: { [keys.beelzemon]: answer, [keys.sukamon]: answer },
    });
  });

  it("selects every effect top to bottom in one click", () => {
    const { onRespond } = renderDecision(planRequest);
    fireEvent.click(screen.getByRole("button", { name: "Select all, top to bottom" }));
    expect(screen.getByText("3 of 3 ordered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select all, top to bottom" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));

    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [keys.beelzemon, keys.creepymon, keys.sukamon],
    });
  });

  it("Discord 1557582469409144852: appends known mandatory physical copies without accepting optional effects", () => {
    const mandatoryOne = buildTriggerKey("drasil-1", "BT13-007/ir-1");
    const mandatoryTwo = buildTriggerKey("drasil-2", "BT13-007/ir-1");
    const unknown = buildTriggerKey("unknown", "BT13-007/ir-1");
    const optionalAsk = buildTriggerKey("ask", "EX13-028/ir-1");
    const { onRespond } = renderDecision({
      ...planRequest,
      options: {
        ...planRequest.options,
        triggerKeys: [mandatoryOne, keys.beelzemon, mandatoryTwo, keys.sukamon, optionalAsk, unknown],
        triggerCardIds: ["BT13-007", "BT12-085", "BT13-007", "EX13-028", "EX13-028", "BT13-007"],
        triggerTimings: undefined,
        triggerIsOptional: [false, true, false, true, true],
      },
    });
    fireEvent.click(within(screen.getByRole("group", { name: /Beelzemon/ })).getByRole("button", { name: "Yes" }));
    const sukamonPresets = screen.getAllByRole("group", { name: /Sukamon/ });
    fireEvent.click(within(sukamonPresets[0]!).getByRole("button", { name: "No" }));
    const list = screen.getByRole("list", { name: "Order pending effects" });
    fireEvent.click(within(list).getAllByRole("button", { name: /Sukamon/ })[0]!);
    fireEvent.click(within(list).getByRole("button", { name: /Beelzemon/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select mandatory, top to bottom" }));
    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByText("4 of 6 ordered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select mandatory, top to bottom" })).toBeNull();
    expect(within(sukamonPresets[0]!).getByRole("button", { name: "No" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sukamonPresets[1]!).getByRole("button", { name: "Ask" }).getAttribute("aria-pressed")).toBe("true");
    expect(
      [...list.querySelectorAll(".trigger-chooser__option[aria-pressed=true]")].map((button) =>
        button.closest("[data-reorder-id]")?.getAttribute("data-reorder-id"),
      ),
    ).toEqual([keys.sukamon, keys.beelzemon, mandatoryOne, mandatoryTwo]);
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [keys.sukamon, keys.beelzemon, mandatoryOne, mandatoryTwo],
      optionalAnswers: { [keys.beelzemon]: true, [keys.sukamon]: false },
    });
  });

  it("Discord 1557582469409144852: starts a mandatory-only partial plan while optional effects stay on Ask", () => {
    const { onRespond } = renderDecision(planRequest);
    fireEvent.click(screen.getByRole("button", { name: "Select mandatory, top to bottom" }));
    expect(screen.getByText("1 of 3 ordered")).toBeTruthy();
    expect(screen.getByText("You will be asked about the rest later.")).toBeTruthy();
    expect(onRespond).not.toHaveBeenCalled();
    for (const name of [/Beelzemon/, /Sukamon/]) {
      expect(
        within(screen.getByRole("group", { name })).getByRole("button", { name: "Ask" }).getAttribute("aria-pressed"),
      ).toBe("true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Resolve next effect" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [keys.creepymon] });
  });

  it("Discord 1557582469409144852: uses one explicit all control for a mandatory-only batch", () => {
    const triggerKeys = [1, 2, 3].map((copy) => buildTriggerKey(`drasil-${copy}`, "BT13-007/ir-1"));
    const { onRespond } = renderDecision({
      ...planRequest,
      options: {
        triggerKeys,
        triggerCardIds: triggerKeys.map(() => "BT13-007"),
        triggerIsOptional: [false, false, false],
        acceptsResolutionPlan: true,
      },
    });
    const all = screen.getByRole("button", { name: "Select all, top to bottom" });
    expect(all).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select mandatory, top to bottom" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /copy 3/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add the rest in shown order" }));
    expect(screen.getByText("3 of 3 ordered")).toBeTruthy();
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [triggerKeys[2], triggerKeys[0], triggerKeys[1]],
    });
  });

  it.each([undefined, [true, true, true]])(
    "Discord 1557582469409144852: never offers mandatory selection without known mandatory flags (%s)",
    (triggerIsOptional) => {
      renderDecision({ ...planRequest, options: { ...planRequest.options, triggerIsOptional } });
      expect(screen.queryByRole("button", { name: "Select mandatory, top to bottom" })).toBeNull();
      expect(screen.queryAllByText("Mandatory")).toHaveLength(0);
    },
  );

  it("Discord 1557475935962398842: resolves the shown order with presets without clicking each effect", () => {
    const { onRespond } = renderDecision(planRequest);
    fireEvent.click(within(screen.getByRole("group", { name: /Beelzemon/ })).getByRole("button", { name: "Yes" }));
    fireEvent.click(within(screen.getByRole("group", { name: /Sukamon/ })).getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));

    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [keys.beelzemon, keys.creepymon, keys.sukamon],
      optionalAnswers: { [keys.beelzemon]: true, [keys.sukamon]: false },
    });
  });

  it("keeps a plain prompt to one checked effect", () => {
    const { onRespond } = renderDecision({
      ...planRequest,
      options: { ...planRequest.options, acceptsResolutionPlan: undefined },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sukamon/ }));
    fireEvent.click(screen.getByRole("button", { name: /Creepymon/ }));
    expect(screen.queryByRole("button", { name: "Yes to all" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resolve next effect" }));

    expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [keys.creepymon] });
  });

  it("Discord 1555502942403043389: lists earlier pending effects without offering them", () => {
    const { onRespond } = renderDecision({
      ...planRequest,
      options: {
        ...planRequest.options,
        waitingTriggerCardIds: ["BT24-026"],
        waitingTriggerDescriptions: [
          "[Your Turn] [Once Per Turn] When your hand is trashed from, this [Demon] or [Titan] trait Digimon may digivolve into [Titamon] or a [Titan] trait Digimon card in the trash with the digivolution cost reduced by 1.",
        ],
        waitingTriggerIsInherited: [true],
      },
    });
    const waiting = screen.getByRole("region", { name: "Resolve after these" });
    expect(within(waiting).getByText("Hyogamon")).toBeTruthy();
    expect(within(waiting).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /Hyogamon/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select all, top to bottom" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve in this order" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "orderTriggers",
      order: [keys.beelzemon, keys.creepymon, keys.sukamon],
    });
  });

  it("Discord 1555741214014447737: counts identical earlier effects in one row", () => {
    const yoshino =
      "[Your Turn] When any of your opponent's Digimon or Tamers suspend, or effects trash cards from under this Tamer, by suspending this Tamer, 1 of your Digimon may digivolve into a [Vegetation], [Fairy] or [DATA SQUAD] trait Digimon card in the hand with the cost reduced by 1.";
    const ravemon =
      "[On Deletion] Your opponent trashes 1 card in their hand. Then, if their hand has 7 or fewer cards, you may place this card face up as the bottom security card.";
    renderDecision({
      ...planRequest,
      options: {
        ...planRequest.options,
        waitingTriggerCardIds: ["BT26-091", "BT26-091", "BT26-091", "BT26-091", "BT26-091", "BT26-082"],
        waitingTriggerDescriptions: [yoshino, yoshino, yoshino, yoshino, yoshino, ravemon],
        waitingTriggerIsInherited: [false, false, false, false, false, false],
      },
    });

    const waiting = screen.getByRole("region", { name: "Resolve after these" });
    expect(within(waiting).getAllByRole("listitem")).toHaveLength(2);
    expect(within(waiting).getByText("×5")).toBeTruthy();
    expect(within(waiting).getByText("Ravemon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolve in this order" })).toBeTruthy();
  });
});

it("uses authoritative trigger card ids for order-trigger labels and art", () => {
  renderDecision({
    decisionId: "garurumon-attack-order",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next pending effect to resolve.",
    options: {
      triggerKeys: [
        buildTriggerKey("garurumon-source", "P-008/ir-6-0"),
        buildTriggerKey("x-antibody-source", "BT9-109/when-attacking-digivolve"),
      ],
      triggerCardIds: ["P-007", "BT9-109"],
    },
  });

  expect(screen.getByRole("button", { name: "Garurumon" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "X Antibody" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "WereGarurumon" })).toBeNull();
  expect(screen.getByRole("img", { name: "Garurumon" })).toBeTruthy();
});

describe("order-trigger chooser identity", () => {
  /**
   * One Megadramon (EX12-064) played onto a base fires its [On Play] and its
   * [When Digivolving] at once. Both entries carry the same permanent, so the
   * chooser once numbered them "copy 1"/"copy 2" and claimed a second Megadramon
   * that was never on the board.
   */
  it("offers one tile for repeated [Once Per Turn] watcher activations without using the enclosing timing", () => {
    const keys = [
      buildTriggerKey("source", "subtrigger/755/whenHandTrashed"),
      buildTriggerKey("source", "subtrigger/755/whenHandTrashed/activation-2"),
    ];
    const { onRespond } = renderDecision({
      decisionId: "repeated-discard",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: {
        triggerKeys: keys,
        triggerCardIds: ["BT24-042", "BT24-042"],
        triggerTimings: ["whenHandTrashed", "whenHandTrashed"],
        timing: "WhenDigivolving",
      },
    });
    const tiles = screen.getAllByRole("button", { name: "[When Cards Are Trashed from Your Hand], Goblimon" });
    expect(tiles).toHaveLength(1);
    fireEvent.click(tiles[0]!);
    expect(tiles[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("[When Digivolving]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Resolve( next)? effect/i }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [keys[0]] });
  });

  it("offers one tile for a [Once Per Turn] clause triggered by two separate events", () => {
    const keys = [
      buildTriggerKey("logimon", "BT25-052/when-linking"),
      buildTriggerKey("rebootmon", "subtrigger/12/whenLinked"),
      buildTriggerKey("rebootmon", "subtrigger/12/whenUnsuspended"),
    ];
    const { onRespond } = renderDecision({
      decisionId: "rebootmon-linked-and-unsuspended",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: {
        triggerKeys: keys,
        triggerCardIds: ["BT25-052", "BT25-060", "BT25-060"],
        triggerTimings: ["OnLinking", "AllTurns", "AllTurns"],
      },
    });

    expect(screen.getAllByRole("button", { name: /Rebootmon/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Logimon/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Rebootmon/ }));
    fireEvent.click(screen.getByRole("button", { name: /Resolve next effect/i }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [keys[1]] });
  });

  it("does not repeat an unrelated source effect or the selected Digimon below the choices", () => {
    renderDecision({
      decisionId: "distinct-pending-effects",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      sourceCardId: "EX11-074",
      options: {
        effectText: "This source effect belongs to a different pending effect.",
        triggerKeys: [
          buildTriggerKey("vortexdramon", "EX11-074/when-digivolving"),
          buildTriggerKey("vortexdramon", "EX11-074/all-turns"),
        ],
        triggerCardIds: ["EX11-074", "EX11-074"],
        triggerDescriptions: ["First pending effect.", "Second pending effect."],
      },
    });

    expect(document.querySelector(".decision-overlay__effect-text")).toBeNull();
    expect(document.querySelector(".trigger-chooser__selection")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /Vortexdramon/ })[0]!);
    expect(document.querySelector(".trigger-chooser__selection")).toBeNull();
  });

  it("names two effects of ONE permanent by their firing window, never as copies", () => {
    renderDecision({
      decisionId: "megadramon-two-timings",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: {
        triggerKeys: [
          buildTriggerKey("megadramon-permanent", "EX12-064/on-play"),
          buildTriggerKey("megadramon-permanent", "EX12-064/when-digivolving"),
        ],
        triggerCardIds: ["EX12-064", "EX12-064"],
        triggerTimings: ["OnPlay", "WhenDigivolving"],
      },
    });

    expect(screen.getByRole("button", { name: "[On Play], Megadramon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "[When Digivolving], Megadramon" })).toBeTruthy();
    expect(screen.queryByText(/copy/i)).toBeNull();
  });

  it("still numbers two DIFFERENT permanents of the same card", () => {
    renderDecision({
      decisionId: "two-megadramon",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: {
        triggerKeys: [
          buildTriggerKey("megadramon-a", "EX12-064/on-play"),
          buildTriggerKey("megadramon-b", "EX12-064/on-play"),
        ],
        triggerCardIds: ["EX12-064", "EX12-064"],
        triggerTimings: ["OnPlay", "OnPlay"],
      },
    });

    expect(screen.getByRole("button", { name: "[On Play], Megadramon (copy 1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "[On Play], Megadramon (copy 2)" })).toBeTruthy();
  });

  it("shows full printed text for each option even when the clauses repeat", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "identical-summaries",
            seat: 0,
            kind: "orderTriggers",
            promptText: "Choose the next pending effect to resolve.",
            options: {
              triggerKeys: [
                buildTriggerKey("megadramon-permanent", "EX12-064/on-play"),
                buildTriggerKey("megadramon-permanent", "EX12-064/when-digivolving"),
              ],
              triggerCardIds: ["EX12-064", "EX12-064"],
              triggerTimings: ["OnPlay", "WhenDigivolving"],
            },
          }}
          candidates={[]}
          picks={[]}
          triggerDetails={[
            { sourceLabel: "Field", summary: "Delete 1 of your opponent's level 4 or lower Digimon…" },
            { sourceLabel: "Field", summary: "Delete 1 of your opponent's level 4 or lower Digimon…" },
          ]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText(/Delete 1 of your opponent/)).toHaveLength(2);
    expect(screen.getAllByText("Field")).toHaveLength(2);
  });

  it("shows the Digimon carrying an inherited effect beside the effect's own card", () => {
    const { container } = render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "inherited-host",
            seat: 0,
            kind: "orderTriggers",
            promptText: "Choose the next pending effect to resolve.",
            options: {
              triggerKeys: [
                buildTriggerKey("agumon-source", "BT1-010/inherited"),
                buildTriggerKey("megadramon-permanent", "EX12-064/on-play"),
              ],
              triggerCardIds: ["BT1-010", "EX12-064"],
              triggerIsInherited: [true, false],
            },
          }}
          candidates={[]}
          picks={[]}
          triggerDetails={[{ sourceLabel: "Inherited by Omnimon", hostCardId: "BT1-084" }, { sourceLabel: "Field" }]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    const hosts = container.querySelectorAll(".trigger-chooser__host");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]!.textContent).toContain("Inherited by Omnimon");
    expect(hosts[0]!.querySelector(".trigger-chooser__host-art")).toBeTruthy();
    expect(screen.getByText("Field")).toBeTruthy();
  });

  it("uses full catalog text instead of shortened summaries", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "differing-summaries",
            seat: 0,
            kind: "orderTriggers",
            promptText: "Choose the next pending effect to resolve.",
            options: {
              triggerKeys: [
                buildTriggerKey("permanent-a", "EX12-064/on-play"),
                buildTriggerKey("permanent-b", "P-008/ir-6-0"),
              ],
              triggerCardIds: ["EX12-064", "P-007"],
            },
          }}
          candidates={[]}
          picks={[]}
          triggerDetails={[{ summary: "Delete 1 Digimon" }, { summary: "Draw 1 card" }]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("Delete 1 Digimon")).toBeNull();
    expect(screen.getByText(/Delete 1 of your opponent/)).toBeTruthy();
    expect(document.querySelectorAll(".trigger-chooser__effect-text")).toHaveLength(2);
    expect(screen.queryByText("Inherited (ESS)")).toBeNull();
  });
});

it("distinguishes duplicate card candidates accessibly while preserving unique names", () => {
  render(
    <I18nProvider>
      <DecisionOverlay
        request={{
          decisionId: "duplicate-copies",
          seat: 0,
          kind: "selectCards",
          promptText: "Choose a card",
          options: { candidateInstanceIds: ["trial-1", "trial-2"], min: 1, max: 1 },
        }}
        candidates={[
          { instanceId: "trial-1", cardId: "EX3-069" },
          { instanceId: "trial-2", cardId: "EX3-069" },
          { instanceId: "agumon", cardId: "BT1-010", selectable: false },
        ]}
        picks={[]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={vi.fn<(response: DecisionResponse) => void>()}
      />
    </I18nProvider>,
  );

  expect(screen.getByRole("button", { name: "Trial of the Four Great Dragons, copy 1 of 2" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Trial of the Four Great Dragons, copy 2 of 2" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Agumon" })).toBeTruthy();
  expect(translator("pt-BR")("overlay.cardCopy", { index: 2, total: 3 })).toBe("cópia 2 de 3");
});

describe("connection error action", () => {
  it("shows an explicit way back to the lobby and invokes it", () => {
    const onAction = vi.fn<() => void>();
    render(
      <I18nProvider>
        <WaitingOverlay
          spinner={false}
          title="Não foi possível conectar o bot"
          detail="Volte ao lobby e tente iniciar outra partida contra o bot."
          actionLabel="Voltar ao lobby"
          onAction={onAction}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Voltar ao lobby" }));

    expect(onAction).toHaveBeenCalledOnce();
  });
});

it("lets the viewer leave while the opponent is disconnected", () => {
  const onLeave = vi.fn<() => void>();
  render(
    <I18nProvider>
      <OpponentDroppedOverlay onLeave={onLeave} />
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: /Sair da partida|Leave match/ }));

  expect(onLeave).toHaveBeenCalledOnce();
});

it("Discord suggestion 1557418616729768076: counts down from the 60 second grace", () => {
  render(
    <I18nProvider>
      <OpponentDroppedOverlay onLeave={vi.fn<() => void>()} />
    </I18nProvider>,
  );

  expect(screen.getByText(/1:00/)).toBeTruthy();
});

describe("generic engine selection prompts", () => {
  it.each(["Choose targets", "Select cards"])("replaces %s with the localized decision title", (promptText) => {
    renderDecision({
      decisionId: `generic-${promptText}`,
      seat: 0,
      kind: promptText.startsWith("Choose") ? "chooseTargets" : "selectCards",
      promptText,
      options: { min: 1, max: 1 },
    });

    expect(screen.queryByText(promptText)).toBeNull();
  });

  it("titles the engine's card-order prompt in the player's language (Discord 1555224478416633927)", () => {
    localStorage.setItem("aegis:locale", "pt-BR");
    try {
      render(
        <I18nProvider>
          <DecisionOverlay
            request={{
              decisionId: "generic-order",
              seat: 0,
              kind: "orderCards",
              promptText: "Choose the card order",
              sourceCardId: "EX12-018",
              options: { orderDestination: "stackBottom" },
            }}
            sourceCardId="EX12-018"
            candidates={[
              { instanceId: "first", cardId: "EX12-007" },
              { instanceId: "second", cardId: "EX12-013" },
            ]}
            picks={[]}
            onTogglePick={vi.fn()}
            onRespond={vi.fn()}
          />
        </I18nProvider>,
      );

      expect(screen.queryByText("Choose the card order")).toBeNull();
      expect(screen.getByText("Ordenar cartas")).toBeTruthy();
    } finally {
      localStorage.removeItem("aegis:locale");
    }
  });

  it("replaces the generic modal prompt with a friendly localized instruction", () => {
    renderDecision({
      decisionId: "generic-modal",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose one effect to activate",
      options: { choices: ["Draw 1", "Gain 1 memory"] },
    });

    expect(screen.queryByText("Choose one effect to activate")).toBeNull();
  });

  it("renders the executable EX3-008 modal labels without card-specific UI", () => {
    const { onRespond } = renderDecision({
      decisionId: "flamedramon-modal",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose one effect to activate",
      sourceCardId: "EX3-008",
      options: {
        choices: [
          "Digivolve 1 of your other Digimon into a purple level 4 [Free] Digimon from your trash",
          "DNA digivolve this Digimon and 1 of your other Digimon into a Digimon in your hand",
        ],
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "DNA digivolve this Digimon and 1 of your other Digimon into a Digimon in your hand",
      }),
    );
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  });
});

describe("optional modal with a decline entry", () => {
  const chirinmonCostChoice: DecisionRequest = {
    decisionId: "chirinmon-cost-choice",
    seat: 0,
    kind: "chooseOption",
    promptText: "Chirinmon",
    sourceCardId: "EX13-032",
    options: {
      choices: [
        "Trash your top security card",
        "Trash the bottom face-down card from under 1 of your Tamers",
        "engine decline label",
      ],
      declineIndex: 2,
    },
  };

  it("asks whether to use the effect and answers the decline entry by its index", () => {
    const { onRespond } = renderDecision(chirinmonCostChoice);

    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "engine decline label" })).toBeNull();
    const decline = screen.getByRole("button", { name: "Don't use" });
    expect(decline.className).toContain("aegis-button--ghost");
    fireEvent.click(decline);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 2 });
  });

  it("lists the options before the decline entry and answers an option by its index", () => {
    const { onRespond } = renderDecision(chirinmonCostChoice);

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((label) => label === "Don't use" || label?.startsWith("Trash"));
    expect(labels).toEqual([
      "Trash your top security card",
      "Trash the bottom face-down card from under 1 of your Tamers",
      "Don't use",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Trash the bottom face-down card from under 1 of your Tamers" }),
    );
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  });
});

describe("EX3-058 Shadramon decisions", () => {
  it("shows friendly labels for both branches and returns the selected DNA branch", () => {
    const { onRespond } = renderDecision({
      decisionId: "shadramon-modal",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose one effect to activate",
      sourceCardId: "EX3-058",
      options: {
        choices: ["Digivolve", "DNA digivolve"],
        timing: "WhenDigivolving",
      },
    });

    expect(screen.getByRole("button", { name: "Digivolve" })).toBeTruthy();
    const dna = screen.getByRole("button", { name: "DNA digivolve" });
    expect(dna).toBeTruthy();
    expect(screen.queryByText("Dna digivolve")).toBeNull();
    fireEvent.click(dna);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  });

  it("offers explicit accept and decline actions for its optional evolution", () => {
    renderDecision({
      decisionId: "shadramon-optional",
      seat: 0,
      kind: "optional",
      promptText: "Digivolve another Digimon from your trash?",
      sourceCardId: "EX3-058",
      options: { timing: "WhenDigivolving" },
    });

    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });
});

describe("EX3-059 DarkTyrannomon decisions", () => {
  it("names each opposing target and exposes a clear confirmation action", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "darktyrannomon-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose an opponent's Digimon to suspend",
            sourceCardId: "EX3-059",
            options: {
              candidateInstanceIds: ["elecmon", "gabumon"],
              min: 1,
              max: 1,
              timing: "OnDeletion",
              effectText: "[On Deletion] Suspend 1 of your opponent's Digimon.",
            },
          }}
          sourceCardId="EX3-059"
          candidates={[
            { instanceId: "elecmon", cardId: "BT1-028" },
            { instanceId: "gabumon", cardId: "BT1-029" },
          ]}
          picks={["elecmon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("[On Deletion] Suspend 1 of your opponent's Digimon.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Elecmon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gabumon" })).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm targets" });
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["elecmon"] });
  });
});

describe("phone target grid", () => {
  function stubViewportWidth(matched: string): void {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === matched,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  afterEach(() => vi.unstubAllGlobals());

  function renderTargets(): HTMLElement {
    const { container } = render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "narrow-targets",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose an opponent's Digimon to suspend",
            options: { candidateInstanceIds: ["elecmon", "gabumon", "agumon"], min: 1, max: 2 },
          }}
          candidates={[
            { instanceId: "elecmon", cardId: "BT1-028" },
            { instanceId: "gabumon", cardId: "BT1-029" },
            { instanceId: "agumon", cardId: "BT1-009" },
          ]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );
    const grid = container.querySelector<HTMLElement>(".decision-overlay__grid");
    expect(grid).not.toBeNull();
    return grid as HTMLElement;
  }

  // Three tiles, their gaps and the row's badge gutter have to clear the sheet's
  // padding on the narrowest phones; at the wider size the row was sliced by the
  // screen edge instead of fitting.
  it("steps the candidate cards down on a phone narrower than the grid's breakpoint", () => {
    stubViewportWidth("(width < 400px)");
    const cards = renderTargets().querySelectorAll<HTMLElement>("button > div");
    expect([...cards].map((card) => card.style.width)).toEqual(["96px", "96px", "96px"]);
  });

  it("keeps the compact size on a phone wide enough for it", () => {
    stubViewportWidth(TOUCH_LAYOUT_QUERY);
    const cards = renderTargets().querySelectorAll<HTMLElement>("button > div");
    expect([...cards].map((card) => card.style.width)).toEqual(["110px", "110px", "110px"]);
  });
});

describe("EX3-061 Dinobeemon decisions", () => {
  it.each([
    [
      "WhenDigivolving",
      "DNA Digivolution: 0 from purple Lv.4 + red Lv.4[When Digivolving] When DNA digivolving, you may play 1 [Paildramon] from your trash without paying the cost.[On Deletion] You may play 1 [Wormmon] from your trash without paying the cost.",
      "Paildramon",
    ],
    [
      "OnDeletion",
      "DNA Digivolution: 0 from purple Lv.4 + red Lv.4[When Digivolving] When DNA digivolving, you may play 1 [Paildramon] from your trash without paying the cost.[On Deletion] You may play 1 [Wormmon] from your trash without paying the cost.",
      "Wormmon",
    ],
  ])("shows a friendly %s activation with the relevant %s clause", (timing, effectText, cardName) => {
    renderDecision({
      decisionId: `dinobeemon-${timing}`,
      seat: 0,
      kind: "optional",
      promptText: "Play without paying the cost",
      sourceCardId: "EX3-061",
      options: { timing, effectText },
    });

    expect(screen.getByText(new RegExp(`play 1 \\[${cardName}\\]`, "i"))).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
    expect(screen.queryByText("PlayWithoutCost")).toBeNull();
  });

  it("names both Paildramon choices and sends the selected card instance", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "dinobeemon-paildramon",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-061",
            options: {
              candidateInstanceIds: ["ex3-paildramon", "st9-paildramon"],
              min: 1,
              max: 1,
              timing: "WhenDigivolving",
              effectText:
                "[When Digivolving] When DNA digivolving, you may play 1 [Paildramon] from your trash without paying the cost.",
            },
          }}
          sourceCardId="EX3-061"
          candidates={[
            { instanceId: "ex3-paildramon", cardId: "EX3-010" },
            { instanceId: "st9-paildramon", cardId: "ST9-05" },
          ]}
          picks={["ex3-paildramon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("button", { name: /^(?!Open ).*Paildramon/ })).toHaveLength(2);
    const confirm = screen.getByRole("button", { name: "Confirm targets" });
    fireEvent.click(confirm);
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["ex3-paildramon"] });
  });

  it("names Wormmon in the On Deletion selection and confirms the chosen instance", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "dinobeemon-wormmon",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-061",
            options: {
              candidateInstanceIds: ["stack-wormmon", "trash-wormmon"],
              min: 1,
              max: 1,
              timing: "OnDeletion",
              effectText: "[On Deletion] You may play 1 [Wormmon] from your trash without paying the cost.",
            },
          }}
          sourceCardId="EX3-061"
          candidates={[
            { instanceId: "stack-wormmon", cardId: "EX3-055" },
            { instanceId: "trash-wormmon", cardId: "BT3-047" },
          ]}
          picks={["stack-wormmon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("button", { name: /^(?!Open ).*Wormmon/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["stack-wormmon"] });
  });
});

describe("mixed-zone card selection", () => {
  it("groups hand and digivolution-card candidates in the standard selection modal", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "examon-play-or-use",
            seat: 0,
            kind: "selectCards",
            promptText: "Examon",
            sourceCardId: "EX13-045",
            options: {
              candidateInstanceIds: ["dragon-option", "dracomon-source"],
              min: 1,
              max: 1,
            },
          }}
          sourceCardId="EX13-045"
          candidates={[
            { instanceId: "dragon-option", cardId: "BT20-093", zone: "hand" },
            { instanceId: "dracomon-source", cardId: "EX13-008", zone: "digivolutionCards" },
          ]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Your hand")).toBeTruthy();
    expect(screen.getByText("Digivolution cards")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Unleash the Dragon Gene/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Dracomon/ })).toBeTruthy();
  });
});

describe("EX3-062 WarGrowlmon decisions", () => {
  const effectText =
    "[When Digivolving] Trash the top 3 cards of both players' decks. Then, if either player has 5 or more cards in their trash, you may play 1 [Guilmon] or [Takato Matsuki] from your hand or trash without paying the cost.";

  it("explains the post-mill optional play and exposes clear accept and decline actions", () => {
    renderDecision({
      decisionId: "wargrowlmon-optional",
      seat: 0,
      kind: "optional",
      promptText: "Play without paying the cost",
      sourceCardId: "EX3-062",
      options: { timing: "WhenDigivolving", effectText },
    });

    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
    expect(screen.queryByText("PlayWithoutCost")).toBeNull();
  });

  it("names Guilmon and Takato, confirms the selected instance, and never exposes a Cyborg peer", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "wargrowlmon-target",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-062",
            options: {
              candidateInstanceIds: ["guilmon", "takato"],
              min: 1,
              max: 1,
              timing: "WhenDigivolving",
              effectText,
            },
          }}
          sourceCardId="EX3-062"
          candidates={[
            { instanceId: "guilmon", cardId: "EX3-056" },
            { instanceId: "takato", cardId: "EX2-056" },
          ]}
          picks={["takato"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Guilmon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Takato Matsuki/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /MetalGreymon/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["takato"] });
  });
});

describe("EX3-063 Imperialdramon: Dragon Mode decisions", () => {
  const dnaText =
    "[When Digivolving] When DNA digivolving, your opponent chooses 1 of their Digimon. Delete all of their other Digimon. Then, ＜Blitz＞.";

  it("shows the opponent every possible survivor and submits the chosen permanent", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "dragon-mode-survivor",
            seat: 1,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-063",
            options: {
              candidateInstanceIds: ["elecmon", "gabumon", "monodramon"],
              min: 1,
              max: 1,
              timing: "WhenDigivolving",
              effectText: dnaText,
            },
          }}
          sourceCardId="EX3-063"
          candidates={[
            { instanceId: "elecmon", cardId: "BT1-028" },
            { instanceId: "gabumon", cardId: "BT1-029" },
            { instanceId: "monodramon", cardId: "BT1-030" },
          ]}
          picks={["gabumon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(cardEffectClauseForTiming("EX3-063", "WhenDigivolving")!)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elecmon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gabumon, selected" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gomamon" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["gabumon"] });
  });

  it("explains the optional Fighter Mode evolution with explicit accept and decline actions", () => {
    const attackText =
      "[When Attacking][Once Per Turn] This Digimon gets +2000 DP for the turn. Then, this Digimon may digivolve into [Imperialdramon: Fighter Mode] in your hand for its digivolution cost.";
    renderDecision({
      decisionId: "dragon-mode-fighter",
      seat: 0,
      kind: "optional",
      promptText: "Digivolve into Imperialdramon: Fighter Mode?",
      sourceCardId: "EX3-063",
      options: { timing: "WhenAttacking", effectText: attackText },
    });

    expect(screen.getByText(cardEffectClauseForTiming("EX3-063", "WhenAttacking")!)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("uses the standard activation question for Dragon Mode's Blitz", () => {
    const { onRespond } = renderDecision({
      decisionId: "dragon-mode-blitz",
      seat: 0,
      kind: "optional",
      promptText: "Activate Blitz?",
      sourceCardId: "EX3-063",
      options: { promptKey: "activateBlitz", timing: "WhenDigivolving", effectText: dnaText },
    });

    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.getByText(cardEffectClauseForTiming("EX3-063", "WhenDigivolving")!)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
  });
});

describe("EX3-064 Megidramon decisions", () => {
  const deletionText =
    "[On Deletion] If you don't have a [Trial of the Four Great Dragons] in play, you may place 1 [Trial of the Four Great Dragons] from your hand in your battle area.";

  it("presents the errata placement as a clear optional action", () => {
    renderDecision({
      decisionId: "megidramon-place-trial",
      seat: 0,
      kind: "optional",
      promptText: "Place Trial of the Four Great Dragons?",
      sourceCardId: "EX3-064",
      options: { timing: "OnDeletion", effectText: deletionText },
    });

    expect(screen.getByText(deletionText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("names Trial and submits the chosen Option card", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "megidramon-select-trial",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-064",
            options: {
              candidateInstanceIds: ["trial"],
              min: 1,
              max: 1,
              timing: "OnDeletion",
              effectText: deletionText,
            },
          }}
          sourceCardId="EX3-064"
          candidates={[{ instanceId: "trial", cardId: "EX3-069" }]}
          picks={["trial"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /Trial of the Four Great Dragons, selected/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["trial"] });
  });
});

describe("EX3-065 Hina Kurihara decisions", () => {
  it("explains the Dragon watcher as an optional Tamer suspension with clear actions", () => {
    const effectText =
      "[Your Turn] When one of your Digimon digivolves into a Digimon with [Rock Dragon], " +
      "[Earth Dragon], [Machine Dragon], or [Sky Dragon] in its traits, by suspending this Tamer, " +
      "activate 1 of that Digimon's [On Play] effects.";
    const { onRespond } = renderDecision({
      decisionId: "hina-dragon-on-play",
      seat: 0,
      kind: "optional",
      promptText: "Activate Hina Kurihara's effect?",
      sourceCardId: "EX3-065",
      options: { timing: "OnEnterFieldAnyone", effectText },
    });

    expect(screen.getByText(cardEffectClauseForTiming("EX3-065", "YourTurn")!)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
  });
});

describe("EX3-066 Hyper Infinity Cannon decisions", () => {
  const mainText =
    "[Main] ＜De-Digivolve 3＞ 1 of your opponent's Digimon. Then, by placing 1 card with [Cyborg] " +
    "in its traits from your hand or trash under 1 of your level 6 Digimon with [Machine] in its " +
    "traits as its bottom digivolution card, delete 1 of your opponent's Digimon with 6000 DP or less.";

  it("explains the optional Cyborg cost with explicit decline and activation actions", () => {
    renderDecision({
      decisionId: "cannon-cyborg-cost",
      seat: 0,
      kind: "optional",
      promptText: "Pay the Cyborg placement cost?",
      sourceCardId: "EX3-066",
      options: { timing: "Main", effectText: mainText },
    });

    expect(screen.getByText(mainText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("names eligible Cyborg cards and submits the selected cost card", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "cannon-select-cyborg",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-066",
            options: {
              candidateInstanceIds: ["metalgreymon", "metaltyrannomon"],
              min: 1,
              max: 1,
              timing: "Main",
              effectText: mainText,
            },
          }}
          sourceCardId="EX3-066"
          candidates={[
            { instanceId: "metalgreymon", cardId: "BT1-021" },
            { instanceId: "metaltyrannomon", cardId: "BT1-024" },
          ]}
          picks={["metalgreymon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /MetalGreymon, selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "MetalTyrannomon" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["metalgreymon"] });
  });
});

describe("EX3-067 Sourai decisions", () => {
  const mainText =
    "[Main] Trash the top 4 digivolution cards of 1 of your opponent's Digimon. Then, until the end " +
    "of your opponent's turn, all of your opponent's Digimon with no digivolution cards can't attack.";

  it("shows the complete consequence while naming and submitting the chosen opposing Digimon", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "sourai-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-067",
            options: {
              candidateInstanceIds: ["machinedramon", "metalgreymon"],
              min: 1,
              max: 1,
              timing: "Main",
              effectText: mainText,
            },
          }}
          sourceCardId="EX3-067"
          candidates={[
            { instanceId: "machinedramon", cardId: "EX1-073", sourceCount: 5 },
            { instanceId: "metalgreymon", cardId: "BT1-021", sourceCount: 2 },
          ]}
          picks={["machinedramon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(cardEffectClauseForTiming("EX3-067", "Main")!)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Machinedramon, 5 source.*, selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /MetalGreymon, 2 source/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["machinedramon"] });
  });
});

describe("EX3-068 God Flame decisions", () => {
  const mainText =
    "[Main] 1 of your opponent's Digimon gets -6000 DP for the turn. Then, you may return 1 card " +
    "with the [Four Great Dragons] trait from your trash to your hand.";

  it("shows the complete effect while naming and submitting the DP-reduction target", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "god-flame-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-068",
            options: {
              candidateInstanceIds: ["target"],
              min: 1,
              max: 1,
              timing: "Main",
              effectText: mainText,
            },
          }}
          sourceCardId="EX3-068"
          candidates={[{ instanceId: "target", cardId: "EX3-064", currentDP: 12_000 }]}
          picks={["target"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(mainText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Megidramon, 12,000 DP, selected/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["target"] });
  });

  it("explains that recovery is optional and exposes clear decline and activation actions", () => {
    renderDecision({
      decisionId: "god-flame-recovery",
      seat: 0,
      kind: "optional",
      promptText: "Return 1 to hand?",
      sourceCardId: "EX3-068",
      options: { timing: "Main", effectText: mainText },
    });

    expect(screen.getByText(mainText)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("names Four Great Dragons recovery candidates and submits exactly the selected card", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "god-flame-recovery-card",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-068",
            options: {
              candidateInstanceIds: ["azulongmon", "trial"],
              min: 1,
              max: 1,
              timing: "Main",
              effectText: mainText,
            },
          }}
          sourceCardId="EX3-068"
          candidates={[
            { instanceId: "azulongmon", cardId: "EX3-025" },
            { instanceId: "trial", cardId: "EX3-069" },
          ]}
          picks={["trial"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Azulongmon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Trial of the Four Great Dragons, selected/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["trial"] });
  });
});

describe("EX3-069 Trial of the Four Great Dragons decisions", () => {
  const delayText =
    "[Main] ＜Delay＞ Play 1 Digimon card with [Four Great Dragons] in its traits from your hand " +
    "without paying the cost. The Digimon played by this effect can't digivolve to level 7, and " +
    "at the next end of your opponent's turn, delete that Digimon.";

  it("shows the complete Delay consequence and submits the named Four Great Dragons choice", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "trial-four-dragons",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-069",
            options: {
              candidateInstanceIds: ["azulongmon", "magnadramon"],
              min: 1,
              max: 1,
              timing: "Main",
              effectText: delayText,
            },
          }}
          sourceCardId="EX3-069"
          candidates={[
            { instanceId: "azulongmon", cardId: "EX3-025" },
            { instanceId: "magnadramon", cardId: "EX3-036" },
          ]}
          picks={["azulongmon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByText(
        getCardDefinition("EX3-069")!.effectText!.slice(
          getCardDefinition("EX3-069")!.effectText!.indexOf("[Main] ＜Delay＞"),
        ),
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Azulongmon, selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Magnadramon" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["azulongmon"] });
  });
});

describe("EX3-070 Avalon's Gate decisions", () => {
  it("shows the complete printed effect and names every action in each modal branch", () => {
    const effectText =
      "[Main] Activate 1 of the effects below. If you have a Digimon with [Examon] in its name in play, " +
      "activate all of the effects below instead.・Suspend 1 of your opponent's Digimon, and 1 of your Digimon " +
      "gains ＜Piercing＞ for the turn.・Unsuspend 1 of your Digimon.";
    const { onRespond } = renderDecision({
      decisionId: "avalons-gate-modal",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose one effect to activate",
      sourceCardId: "EX3-070",
      options: {
        choices: ["Suspend 1 target(s) · Gain ＜Piercing＞", "Unsuspend 1 target(s)"],
        timing: "Main",
        effectText,
      },
    });

    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suspend 1 target(s) · Gain ＜Piercing＞" })).toBeTruthy();
    const unsuspend = screen.getByRole("button", { name: "Unsuspend 1 target(s)" });
    fireEvent.click(unsuspend);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  });
});

describe("EX3-071 Laser Cannon decisions", () => {
  it("shows the complete sequence while selecting the cost-5 deletion target", () => {
    const effectText =
      "[Main] ＜De-Digivolve 1＞ 1 of your opponent's Digimon. (Trash 1 card from the top of 1 of your " +
      "opponent's Digimon. Stop trashing when you would trash a level 3 card or the Digimon's last card.) " +
      "Then, delete 1 of your opponent's Digimon with a play cost of 5 or less.";
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "laser-cannon-delete",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-071",
            options: {
              candidateInstanceIds: ["sealsdramon"],
              min: 1,
              max: 1,
              timing: "Main",
              effectText,
            },
          }}
          sourceCardId="EX3-071"
          candidates={[{ instanceId: "sealsdramon", cardId: "EX3-049" }]}
          picks={["sealsdramon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sealsdramon, selected/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["sealsdramon"] });
  });
});

describe("EX3-072 Megiddo Flame decisions", () => {
  const mainText =
    "[Main] Delete 1 of your opponent's level 4 or lower Digimon. By deleting 1 of your Digimon, " +
    "delete 1 of your opponent's level 6 or lower Digimon instead.";

  it("presents the two mutually exclusive Main branches with their complete consequences", () => {
    const { onRespond } = renderDecision({
      decisionId: "megiddo-flame-modal",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose one effect to activate",
      sourceCardId: "EX3-072",
      options: {
        choices: [
          "Delete 1 opponent's level 4 or lower Digimon",
          "Delete 1 of your Digimon to delete 1 opponent's level 6 or lower Digimon instead",
        ],
        timing: "Main",
        effectText: mainText,
      },
    });

    expect(screen.getByText(mainText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete 1 opponent's level 4 or lower Digimon" })).toBeTruthy();
    const instead = screen.getByRole("button", {
      name: "Delete 1 of your Digimon to delete 1 opponent's level 6 or lower Digimon instead",
    });
    fireEvent.click(instead);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  });

  it("shows the Security Guilmon clause and the named family candidates", () => {
    const securityText = "[Security] You may play 1 [Guilmon] from your trash without paying the cost.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "megiddo-flame-security",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-072",
            options: {
              candidateInstanceIds: ["guilmon", "guilmon-x"],
              min: 1,
              max: 1,
              timing: "Security",
              effectText: securityText,
            },
          }}
          sourceCardId="EX3-072"
          candidates={[
            { instanceId: "guilmon", cardId: "EX3-056" },
            { instanceId: "guilmon-x", cardId: "BT9-009" },
          ]}
          picks={["guilmon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(securityText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guilmon, selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guilmon (X Antibody)" })).toBeTruthy();
  });
});

describe("EX3-074 Examon decisions", () => {
  const whenDigivolvingText =
    "[When Digivolving] You may place 1 green or blue Digimon card with [Dramon] in its name from your hand " +
    "under this Digimon as its bottom digivolution card. When DNA digivolving, you may play 1 green or blue " +
    "Digimon card with [Dramon] in its name and 12000 DP or less from your hand without paying the cost.";

  it("explains bottom placement and exposes the eligible Dramon family choices", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "examon-place-bottom",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-074",
            options: {
              candidateInstanceIds: ["slayerdramon", "breakdramon"],
              min: 1,
              max: 1,
              timing: "WhenDigivolving",
              effectText: whenDigivolvingText,
            },
          }}
          sourceCardId="EX3-074"
          candidates={[
            { instanceId: "slayerdramon", cardId: "EX3-024" },
            { instanceId: "breakdramon", cardId: "EX3-044" },
          ]}
          picks={["slayerdramon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(whenDigivolvingText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Slayerdramon, selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Breakdramon" })).toBeTruthy();
  });

  it("shows the DNA-only free-play limit beside its playable Dramon candidates", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "examon-play-dramon",
            seat: 0,
            kind: "selectCards",
            promptText: "Select cards",
            sourceCardId: "EX3-074",
            options: {
              candidateInstanceIds: ["slayerdramon", "breakdramon"],
              min: 1,
              max: 1,
              timing: "WhenDigivolving",
              effectText: whenDigivolvingText,
            },
          }}
          sourceCardId="EX3-074"
          candidates={[
            { instanceId: "slayerdramon", cardId: "EX3-024" },
            { instanceId: "breakdramon", cardId: "EX3-044" },
          ]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/When DNA digivolving.*12000 DP or less.*without paying the cost/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Slayerdramon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Breakdramon" })).toBeTruthy();
  });

  it("shows the complete Once Per Turn consequence while selecting the opposing Digimon", () => {
    const allTurnsText =
      "[All Turns][Once Per Turn] When this Digimon becomes suspended, unsuspend it, and suspend 1 of your opponent's Digimon.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "examon-suspend-opponent",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-074",
            options: {
              candidateInstanceIds: ["opponent-digimon"],
              min: 1,
              max: 1,
              timing: "AllTurns",
              effectText: allTurnsText,
            },
          }}
          sourceCardId="EX3-074"
          candidates={[{ instanceId: "opponent-digimon", cardId: "BT1-028" }]}
          picks={["opponent-digimon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(allTurnsText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Elecmon, selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });
});

describe("EX3-040 Parasaurmon decisions", () => {
  it("explains the optional suspend-cost reduction and exposes clear accept/decline actions", () => {
    const effectText =
      "[Your Turn] When you would play a green Digimon card, by suspending this Digimon, reduce the cost by 1.";
    renderDecision({
      decisionId: "parasaurmon-reducer",
      seat: 0,
      kind: "optional",
      promptText: "Suspend Parasaurmon to reduce this green Digimon's play cost by 1?",
      sourceCardId: "EX3-040",
      options: { timing: "YourTurn", effectText },
    });

    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("shows the inherited clause and a clear confirmation for the opposing Digimon target", () => {
    const effectText =
      "[Your Turn][Once Per Turn] When an effect suspends one of your Digimon, suspend 1 of your opponent's Digimon.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "parasaurmon-inherited-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Parasaurmon",
            sourceCardId: "EX3-040",
            options: {
              candidateInstanceIds: ["opponent-digimon"],
              min: 1,
              max: 1,
              timing: "YourTurn",
              isInherited: true,
              effectText,
            },
          }}
          sourceCardId="EX3-040"
          candidates={[{ instanceId: "opponent-digimon", cardId: "BT1-028" }]}
          picks={["opponent-digimon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(cardEffectClauseForTiming("EX3-040", "YourTurn", true)!)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Elecmon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });
});

describe("EX3-054 Darkdramon decisions", () => {
  const reducerText =
    "When you would digivolve into this card, by returning up to 5 cards with [D-Brigade] in their traits from your trash to the top of your deck, reduce the digivolution cost by 1 for each returned card.";

  it("presents the reducer as a clear choice with explicit decline and activate actions", () => {
    renderDecision({
      decisionId: "darkdramon-reducer",
      seat: 0,
      kind: "optional",
      promptText: "Return D-Brigade cards to reduce the digivolution cost?",
      sourceCardId: "EX3-054",
      options: { timing: "Static", effectText: reducerText },
    });

    expect(screen.getByText(reducerText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("shows eligible D-Brigade cards and explains their deck-top order", () => {
    const candidates = [
      { instanceId: "commandramon", cardId: "EX3-046" },
      { instanceId: "sealsdramon", cardId: "EX3-049" },
    ];
    const { rerender } = render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "darkdramon-select",
            seat: 0,
            kind: "selectCards",
            promptText: "Darkdramon",
            sourceCardId: "EX3-054",
            options: { min: 1, max: 5, timing: "Static", effectText: reducerText },
          }}
          sourceCardId="EX3-054"
          candidates={candidates}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(reducerText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Commandramon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sealsdramon" })).toBeTruthy();

    rerender(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "darkdramon-order",
            seat: 0,
            kind: "orderCards",
            promptText: "Choose the card order",
            sourceCardId: "EX3-054",
            options: { orderDestination: "deckTop", timing: "Static", effectText: reducerText },
          }}
          sourceCardId="EX3-054"
          candidates={candidates}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Number 1 will be nearest the top/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeTruthy();
  });
});

describe("EX3-055 Wormmon errata decisions", () => {
  const effectText =
    "[On Play] Reveal the top 3 cards of your deck. Add 1 purple or red card with [Imperialdramon] in its name or [Free] in its traits among them to your hand, and trash 1 purple or red card with [Imperialdramon] in its name or [Free] in its traits among them. Place the rest at the bottom of your deck in any order.";
  const revealed = [
    { instanceId: "dinobeemon", cardId: "EX3-061" },
    { instanceId: "imperialdramon", cardId: "EX3-063" },
    { instanceId: "agumon", cardId: "BT1-010", selectable: false },
  ];

  it("shows the full reveal, disables the ineligible card, and offers a clear confirmation", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "wormmon-add",
            seat: 0,
            kind: "selectCards",
            promptText: "Wormmon",
            sourceCardId: "EX3-055",
            options: {
              candidateInstanceIds: ["dinobeemon", "imperialdramon"],
              visibleInstanceIds: ["dinobeemon", "imperialdramon", "agumon"],
              min: 1,
              max: 1,
              timing: "OnPlay",
              effectText,
            },
          }}
          sourceCardId="EX3-055"
          candidates={revealed}
          picks={["dinobeemon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(cardEffectClauseForTiming("EX3-055", "OnPlay")!)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^(?!Open ).*Dinobeemon/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: /^(?!Open ).*Imperialdramon: Dragon Mode/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((screen.getByRole("button", { name: "Agumon" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Confirm targets" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("labels the remaining-card order as deck bottom and exposes reorder controls", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "wormmon-bottom-order",
            seat: 0,
            kind: "orderCards",
            promptText: "Choose the card order",
            sourceCardId: "EX3-055",
            options: { orderDestination: "deckBottom", timing: "OnPlay", effectText },
          }}
          sourceCardId="EX3-055"
          candidates={revealed.slice(1)}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Arrange the cards going to the bottom of the deck/)).toBeTruthy();
    expect(screen.getByText(/Number 1 will be nearest the top/)).toBeTruthy();
    expect(screen.queryByText(/Arrange the cards in deck order/)).toBeNull();
    expect((screen.getAllByRole("button", { name: /Move card down/ })[0] as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Confirm order" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("EX3-056 Guilmon On Deletion decision", () => {
  it("shows the complete consequence, eligible targets, and a friendly confirmation", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    const onTogglePick = vi.fn<(instanceId: string) => void>();
    const effectText =
      "[On Deletion] Delete 1 of your opponent's Digimon with 3000 DP or less. If no Digimon is deleted by this effect, trash the top 2 cards of both players' decks.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "guilmon-delete",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose 1 Digimon to delete",
            sourceCardId: "EX3-056",
            options: {
              candidateInstanceIds: ["agumon", "guilmon"],
              min: 1,
              max: 1,
              timing: "OnDeletion",
              effectText,
            },
          }}
          sourceCardId="EX3-056"
          candidates={[
            { instanceId: "agumon", cardId: "BT1-010", sourceCount: 0 },
            { instanceId: "guilmon", cardId: "EX3-056", sourceCount: 1 },
          ]}
          picks={["agumon"]}
          onTogglePick={onTogglePick}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Agumon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guilmon.*1 source/ })).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm targets" });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["agumon"] });
  });
});

describe("EX3-057 Growlmon decisions", () => {
  const inheritedText =
    "[When Attacking][Once Per Turn] By deleting 1 of your other Digimon, this Digimon gains ＜Security Attack +1＞ for the turn. (This Digimon checks 1 additional security card.)";

  it("offers one clear accept/decline prompt for the inherited attack effect", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "growlmon-optional",
            seat: 0,
            kind: "optional",
            promptText: "Activate Growlmon's inherited effect?",
            sourceCardId: "EX3-057",
            options: { timing: "WhenAttacking", effectText: inheritedText },
          }}
          sourceCardId="EX3-057"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(inheritedText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
  });

  it("shows distinguishable other-Digimon cost targets and confirms the chosen one", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "growlmon-cost",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose 1 of your other Digimon to delete",
            sourceCardId: "EX3-057",
            options: {
              candidateInstanceIds: ["guilmon", "gazimon"],
              min: 1,
              max: 1,
              timing: "WhenAttacking",
              effectText: inheritedText,
            },
          }}
          sourceCardId="EX3-057"
          candidates={[
            { instanceId: "guilmon", cardId: "ST7-03", sourceCount: 0 },
            { instanceId: "gazimon", cardId: "BT10-071", sourceCount: 1 },
          ]}
          picks={["guilmon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /^(?!Open ).*Guilmon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gazimon.*1 source/ })).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm targets" });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["guilmon"] });
  });
});

describe("EX3-041 Groundramon decisions", () => {
  it("shows only the friendly end-turn DNA clause and both optional actions", () => {
    const fullText =
      "Digivolve: 3 from [Coredramon]＜Blocker＞ (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead.) [Your Turn] [Examon] in your hand can treat this Digimon as level 6 for DNA digivolution.[End of Your Turn] This Digimon and 1 of your other Digimon with [Dramon] in its name may DNA digivolve into a Digimon card in your hand by paying its DNA digivolve cost.";
    renderDecision({
      decisionId: "groundramon-end-turn-dna",
      seat: 0,
      kind: "optional",
      promptText: "Activate the effect?",
      sourceCardId: "EX3-041",
      options: { timing: "EndOfYourTurn", effectText: fullText },
    });

    expect(screen.getByText(cardEffectClauseForTiming("EX3-041", "EndOfYourTurn")!)).toBeTruthy();
    expect(screen.queryByText(/When an opponent's Digimon attacks/)).toBeNull();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });
});

describe("EX3-042 Toropiamon decisions", () => {
  it("shows the exact When Digivolving clause and a clear target confirmation", () => {
    const effectText = "[When Digivolving] If this Digimon is suspended, suspend 1 of your opponent's Digimon.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "toropiamon-when-digivolving",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Toropiamon",
            sourceCardId: "EX3-042",
            options: {
              candidateInstanceIds: ["opponent-digimon"],
              min: 1,
              max: 1,
              timing: "WhenDigivolving",
              effectText,
            },
          }}
          sourceCardId="EX3-042"
          candidates={[{ instanceId: "opponent-digimon", cardId: "BT1-028" }]}
          picks={["opponent-digimon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Elecmon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });

  it("keeps the inherited once-per-turn clause distinct from the main effect", () => {
    const inheritedEffect =
      "[Your Turn][Once Per Turn] When an effect suspends one of your Digimon, suspend 1 of your opponent's Digimon.";
    renderDecision({
      decisionId: "toropiamon-inherited",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Toropiamon",
      sourceCardId: "EX3-042",
      options: { candidateInstanceIds: [], min: 1, max: 1, timing: "YourTurn", effectText: inheritedEffect },
    });

    expect(screen.getByText(inheritedEffect)).toBeTruthy();
    expect(screen.queryByText(/If this Digimon is suspended/)).toBeNull();
    // No candidates: the server accepts the empty shortage selection.
    expect(screen.getByRole("button", { name: "Confirm targets" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("EX3-043 Entmon decisions", () => {
  const digisorptionEffect =
    "＜Digisorption -3＞ (When one of your Digimon digivolves into this card from your hand, you may suspend 1 of your Digimon to reduce the digivolution cost by 3.)";

  it("explains Digisorption's payment and exposes clear accept/decline actions", () => {
    renderDecision({
      decisionId: "entmon-digisorption",
      seat: 0,
      kind: "optional",
      promptText: "＜Digisorption -3＞: suspend 1 Digimon to reduce the digivolution cost by 3?",
      sourceCardId: "EX3-043",
      options: { timing: "Static", effectText: digisorptionEffect },
    });

    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(
      screen.getByText(getCardDefinition("EX3-043")!.effectText!.match(/＜Digisorption[^＞]*＞/)![0]),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("shows the eligible Vegetation cost and confirms exactly one target", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "entmon-digisorption-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Entmon",
            sourceCardId: "EX3-043",
            options: {
              candidateInstanceIds: ["pomumon-cost"],
              min: 1,
              max: 1,
              timing: "Static",
              effectText: digisorptionEffect,
            },
          }}
          sourceCardId="EX3-043"
          candidates={[{ instanceId: "pomumon-cost", cardId: "EX3-038" }]}
          picks={["pomumon-cost"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByText(getCardDefinition("EX3-043")!.effectText!.match(/＜Digisorption[^＞]*＞/)![0]),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Pomumon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });
});

describe("EX3-044 Breakdramon decisions", () => {
  it("shows only the friendly suspension clause and exposes the opposing Digimon action", () => {
    const fullText =
      "Digivolve: 3 from [Groundramon] or [Wingdramon][All Turns][Once Per Turn] When this Digimon becomes suspended, suspend 1 of your opponent's Digimon.[All Turns][Once Per Turn] When one of your Digimon with [Dramon] or [Examon] in its name deletes an opponent's Digimon in battle and survives, trash the top card of your opponent's security stack.";

    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "breakdramon-suspend-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Breakdramon",
            sourceCardId: "EX3-044",
            options: {
              candidateInstanceIds: ["opponent-digimon"],
              min: 1,
              max: 1,
              timing: "AllTurns",
              effectText: fullText,
            },
          }}
          sourceCardId="EX3-044"
          candidates={[{ instanceId: "opponent-digimon", cardId: "BT1-028" }]}
          picks={["opponent-digimon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(cardEffectClauseForTiming("EX3-044", "AllTurns")!)).toBeTruthy();
    expect(screen.queryByText(/deletes an opponent's Digimon in battle/)).toBeNull();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Elecmon/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });
});

describe("EX3-045 Hydramon decisions", () => {
  it("explains the optional digivolution suspension with clear accept and decline actions", () => {
    const effectText = "[When Digivolving] You may suspend 1 Digimon.";
    renderDecision({
      decisionId: "hydramon-optional-suspend",
      seat: 0,
      kind: "optional",
      promptText: "Activate Hydramon's effect?",
      sourceCardId: "EX3-045",
      options: { timing: "WhenDigivolving", effectText },
    });

    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("shows every Digimon candidate and the optional zero-to-one target contract", () => {
    const effectText = "[When Digivolving] You may suspend 1 Digimon.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "hydramon-suspend-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Hydramon",
            sourceCardId: "EX3-045",
            options: {
              candidateInstanceIds: ["own-digimon", "opponent-digimon"],
              min: 0,
              max: 1,
              timing: "WhenDigivolving",
              effectText,
            },
          }}
          sourceCardId="EX3-045"
          candidates={[
            { instanceId: "own-digimon", cardId: "EX3-038", sourceCount: 0 },
            { instanceId: "opponent-digimon", cardId: "BT1-028", sourceCount: 2 },
          ]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(effectText)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pomumon, 0 source/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Elecmon, 2 source/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });

  it("shows only the end-turn return clause and a clear opposing target action", () => {
    const effectText =
      "[End of Your Turn][Once Per Turn] If you have 2 or more suspended Digimon with [Vegetation], [Plant], or [Fairy] in one of their traits, return 1 of your opponent's suspended Digimon to the bottom of its owner's deck.";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "hydramon-return-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Hydramon",
            sourceCardId: "EX3-045",
            options: {
              candidateInstanceIds: ["opponent-digimon"],
              min: 1,
              max: 1,
              timing: "OnEndTurn",
              effectText,
            },
          }}
          sourceCardId="EX3-045"
          candidates={[{ instanceId: "opponent-digimon", cardId: "BT1-028", isSuspended: true }]}
          picks={["opponent-digimon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(cardEffectClauseForTiming("EX3-045", "EndOfYourTurn")!)).toBeTruthy();
    expect(screen.queryByText(/When an opponent's Digimon becomes suspended/)).toBeNull();
    expect(screen.getByRole("button", { name: /Elecmon.*Suspended/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });
});

describe("EX3-046 Commandramon decisions", () => {
  it("explains the Decoy cost and exposes clear protect-or-decline actions", () => {
    const effectText =
      "＜Decoy ([D-Brigade])＞ (When one of your other Digimon with [D-Brigade] in its traits would be deleted by an opponent's effect, you may delete this Digimon to prevent that deletion.)";
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "commandramon-decoy",
            seat: 0,
            kind: "selectCards",
            promptText: "＜Decoy＞: excluir este Digimon para impedir que o outro Digimon seja excluído?",
            sourceCardId: "EX3-046",
            options: {
              candidateInstanceIds: ["commandramon"],
              min: 0,
              max: 1,
              timing: "Static",
              effectText,
            },
          }}
          sourceCardId="EX3-046"
          candidates={[{ instanceId: "commandramon", cardId: "EX3-046", sourceCount: 0 }]}
          picks={["commandramon"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByText("＜Decoy＞: excluir este Digimon para impedir que o outro Digimon seja excluído?"),
    ).toBeTruthy();
    expect(screen.getByText(getCardDefinition("EX3-046")!.effectText!.match(/＜Decoy[^＞]*＞/)![0])).toBeTruthy();
    expect(screen.getByRole("button", { name: /Commandramon, 0 source/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "None" })).toBeTruthy();
    expect(screen.queryByText("EX3-046")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
    expect(screen.getByRole("button", { name: /Commandramon, 0 source/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["commandramon"] });
  });
});

describe("EX3-051 Tankdramon decisions", () => {
  it("shows the full reveal, enables only Commandramon, and offers a clear decline action", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "tankdramon-reveal",
            seat: 0,
            kind: "selectCards",
            promptText: "Tankdramon",
            sourceCardId: "EX3-051",
            options: {
              candidateInstanceIds: ["commandramon"],
              visibleInstanceIds: ["commandramon", "tankdramon", "hina"],
              visibleCards: [
                { instanceId: "commandramon", cardId: "EX3-046" },
                { instanceId: "tankdramon", cardId: "EX3-051" },
                { instanceId: "hina", cardId: "EX3-065" },
              ],
              min: 0,
              max: 1,
              timing: "YourTurn",
            },
          }}
          sourceCardId="EX3-051"
          candidates={[
            { instanceId: "commandramon", cardId: "EX3-046", selectable: true },
            { instanceId: "tankdramon", cardId: "EX3-051", selectable: false },
            { instanceId: "hina", cardId: "EX3-065", selectable: false },
          ]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Reveal the top 2 cards of your deck/i)).toBeTruthy();
    expect(screen.getByText(/play 1 \[Commandramon\].*without paying the cost/i)).toBeTruthy();
    expect(screen.getByText(/Trash the rest/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Commandramon/ }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /^(?!Open ).*Tankdramon/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^(?!Open ).*Hina Kurihara/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Confirm targets" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: [] });
  });
});

describe("EX3-052 Jazarichmon decisions", () => {
  it("shows the full De-Digivolve clause and distinguishes opposing stacks by source count", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "jazarichmon-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-052",
            options: {
              candidateInstanceIds: ["large-stack", "small-stack"],
              min: 1,
              max: 1,
              timing: "OnPlay",
              effectText: "[On Play] DeDigivolve",
            },
          }}
          sourceCardId="EX3-052"
          candidates={[
            { instanceId: "large-stack", cardId: "EX3-053", sourceCount: 2 },
            { instanceId: "small-stack", cardId: "EX3-053", sourceCount: 1 },
          ]}
          picks={["large-stack"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/De-Digivolve 1.*opponent's Digimon/i)).toBeTruthy();
    expect(screen.getByText(/play 1 \[Hina Kurihara\].*without paying the cost/i)).toBeTruthy();
    expect(screen.queryByText("[On Play] DeDigivolve")).toBeNull();
    expect(screen.getByRole("button", { name: /Metallicdramon, 2 sources/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Metallicdramon, 1 source/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["large-stack"] });
  });

  it("offers friendly accept and decline actions for the optional Hina play", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "jazarichmon-hina",
            seat: 0,
            kind: "optional",
            promptText: "PlayWithoutCost",
            sourceCardId: "EX3-052",
            options: { timing: "OnPlay", effectText: "[OnPlay] PlayWithoutCost" },
          }}
          sourceCardId="EX3-052"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/play 1 \[Hina Kurihara\].*without paying the cost/i)).toBeTruthy();
    expect(screen.queryByText("PlayWithoutCost")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No, decline" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: false });
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });
});

describe("EX3-053 Metallicdramon decisions", () => {
  it("shows the full consequence before confirming the Digimon to delete", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "metallicdramon-delete",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose targets",
            sourceCardId: "EX3-053",
            options: {
              candidateInstanceIds: ["first-target", "second-target"],
              min: 1,
              max: 1,
              timing: "OnPlay",
              effectText: "[On Play] Delete",
            },
          }}
          sourceCardId="EX3-053"
          candidates={[
            { instanceId: "first-target", cardId: "EX3-049" },
            { instanceId: "second-target", cardId: "EX3-049" },
          ]}
          picks={["second-target"]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/De-Digivolve 1.*all of your opponent's Digimon/i)).toBeTruthy();
    expect(screen.getByText(/delete 1.*play cost of 5 or less/i)).toBeTruthy();
    expect(screen.getByText(/If no Digimon is deleted.*unsuspended Digimon can digivolve/i)).toBeTruthy();
    expect(screen.queryByText("[On Play] Delete")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^(?!Open ).*Sealsdramon/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["second-target"] });
  });
});

describe("digivolution cost choice", () => {
  function renderCostChoice(onConfirm = vi.fn<(option: EvoCostOption) => void>()) {
    render(
      <I18nProvider>
        <EvoCostChoiceOverlay
          evolvingCardId="EX12-035"
          baseCardId="EX12-032"
          memory={3}
          options={[
            { type: "normal", label: "Blue Lv.5", cost: 4 },
            { type: "alternate", label: "Garurumon / [ME/VB] trait Lv.5", cost: 3, alternateRequirementIndex: 0 },
          ]}
          onConfirm={onConfirm}
          onCancel={vi.fn<() => void>()}
        />
      </I18nProvider>,
    );
    return onConfirm;
  }

  it("names the digivolution from the base to the new card, in the board prompt rail", () => {
    renderCostChoice();
    const rail = screen.getByTestId("board-prompt");
    expect(rail.classList.contains("evo-cost-prompt")).toBe(true);
    expect(rail.dataset.variant).toBe("prompt");
    expect(screen.getByText("Digivolve cost")).toBeTruthy();
    expect(screen.getByText("WereGarurumon → MetalGarurumon")).toBeTruthy();
  });

  it("shows each cost and where memory lands, cheapest first and recommended", () => {
    renderCostChoice();
    const tiles = [...document.querySelectorAll<HTMLElement>(".evo-cost-prompt__option")];
    expect(tiles.map((tile) => tile.textContent)).toEqual(["3memory3 → 0", "4memory3 → -1"]);
    expect(tiles.map((tile) => tile.dataset.recommended)).toEqual(["true", undefined]);
    // Paying past 0 hands memory to the opponent, which ends the turn.
    expect(tiles.map((tile) => tile.dataset.passesTurn)).toEqual([undefined, "true"]);
  });

  it("sends the chosen path, keeping the route in each tile's accessible name", () => {
    const onConfirm = renderCostChoice();
    fireEvent.click(screen.getByRole("button", { name: "Garurumon / [ME/VB] trait Lv.5 · 3 memory, from 3 to 0" }));
    expect(onConfirm).toHaveBeenCalledWith({
      type: "alternate",
      label: "Garurumon / [ME/VB] trait Lv.5",
      cost: 3,
      alternateRequirementIndex: 0,
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View board" })).toBeTruthy();
  });
});

describe("decision board preview", () => {
  function expectDracomonRevealText() {
    expect(screen.getByText(/Reveal the top 4 cards of your deck/i)).toBeTruthy();
    expect(screen.getByText(/1 green or blue card with \[Dramon\] in its name/i)).toBeTruthy();
    expect(screen.getByText(/1 card with \[Examon\] in its name/i)).toBeTruthy();
    expect(screen.getByText(/bottom of your deck in any order/i)).toBeTruthy();
  }

  it("shows Pomumon's friendly self-suspension reaction and target action", () => {
    renderDecision({
      decisionId: "pomumon-effect-suspend",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Choose targets",
      sourceCardId: "EX3-038",
      options: {
        timing: "YourTurn",
        candidateInstanceIds: ["opponent-digimon"],
        min: 1,
        max: 1,
      },
    });

    expect(screen.getByText(/When an effect suspends this Digimon/i)).toBeTruthy();
    expect(screen.getByText(/suspend 1 of your opponent's Digimon/i)).toBeTruthy();
    expect(screen.queryByText("Choose targets")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
  });

  it("shows Dracomon's complete reveal action for the card selection step", () => {
    renderDecision({
      decisionId: "dracomon-reveal-select",
      seat: 0,
      kind: "selectCards",
      promptText: "Select cards",
      sourceCardId: "EX3-037",
      options: {
        timing: "OnPlay",
        candidateInstanceIds: ["dramon", "examon", "other"],
        min: 1,
        max: 1,
      },
    });

    expect(screen.queryByText("Select cards")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
    expectDracomonRevealText();
  });

  it("shows Dracomon's complete reveal action for the deck-order step", () => {
    renderDecision({
      decisionId: "dracomon-reveal-order",
      seat: 0,
      kind: "orderCards",
      promptText: "Choose the card order",
      sourceCardId: "EX3-037",
      options: {
        timing: "OnPlay",
        candidateInstanceIds: ["other-1", "other-2", "other-3"],
        min: 3,
        max: 3,
        orderDestination: "deckBottom",
      },
    });

    expect(screen.getByText("Choose the card order")).toBeTruthy();
    expect(screen.getByText(/Arrange the cards going to the bottom of the deck/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeTruthy();
    expectDracomonRevealText();
  });

  it.each([
    ["selectCards", "Confirm targets"],
    ["orderCards", "Confirm order"],
  ] as const)("shows Jazardmon's full mandatory Dragon/Hina search during %s", (kind, actionName) => {
    renderDecision({
      decisionId: `jazardmon-${kind}`,
      seat: 0,
      kind,
      promptText: kind === "selectCards" ? "Select cards" : "Choose the card order",
      sourceCardId: "EX3-048",
      options: {
        timing: "OnPlay",
        candidateInstanceIds: ["eligible"],
        visibleInstanceIds: ["eligible", "disabled-1", "disabled-2", "disabled-3"],
        min: 1,
        max: 1,
        orderDestination: kind === "orderCards" ? "deckBottom" : undefined,
      },
    });

    expect(screen.getByText(/Reveal the top 4 cards of your deck/i)).toBeTruthy();
    expect(screen.getByText(/\[Rock Dragon\].*\[Earth Dragon\].*\[Bird Dragon\]/i)).toBeTruthy();
    expect(screen.getByText(/\[Machine Dragon\].*\[Sky Dragon\]/i)).toBeTruthy();
    expect(screen.getByText(/and 1 \[Hina Kurihara\]/i)).toBeTruthy();
    expect(screen.getByText(/Place the rest at the bottom of your deck in any order/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: actionName })).toBeTruthy();
    expect(screen.queryByText("Select cards")).toBeNull();
  });

  it("shows both Magnadramon Security Attack branches in its On Play clause", () => {
    renderDecision({
      decisionId: "magnadramon-security-attack",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Choose targets",
      sourceCardId: "EX3-036",
      options: { timing: "OnPlay", candidateInstanceIds: ["opponent-digimon"], min: 1, max: 1 },
    });

    expect(screen.getByText(/All of your opponent's Digimon gain.*Security Attack -1/i)).toBeTruthy();
    expect(screen.getByText(/played by \[Trial of the Four Great Dragons\]'s effect/i)).toBeTruthy();
    expect(screen.getByText(/Security Attack -2.*instead/i)).toBeTruthy();
    expect(screen.getByText(/until the end of your opponent's turn/i)).toBeTruthy();
    expect(screen.queryByText("Choose targets")).toBeNull();
  });

  it("shows Magnadramon's optional On Deletion placement with explicit actions", () => {
    renderDecision({
      decisionId: "magnadramon-place-trial",
      seat: 0,
      kind: "optional",
      promptText: "Use this effect?",
      sourceCardId: "EX3-036",
      options: { timing: "OnDestroyedAnyone" },
    });

    expect(screen.getByText(/If you don't have a \[Trial of the Four Great Dragons\] in play/i)).toBeTruthy();
    expect(screen.getByText(/you may place 1 \[Trial of the Four Great Dragons\] from your hand/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, activate" })).toBeTruthy();
  });

  it("shows Goldramon's optional Four Great Dragons return on digivolution", () => {
    renderDecision({
      decisionId: "goldramon-return-dragon",
      seat: 0,
      kind: "optional",
      promptText: "Use this effect?",
      sourceCardId: "EX3-035",
      options: { timing: "WhenDigivolving" },
    });

    expect(screen.getByText(/You may return 1 card with the \[Four Great Dragons\] trait/i)).toBeTruthy();
    expect(screen.getByText(/from your trash to your hand/i)).toBeTruthy();
  });

  it.each([
    ["selectCards", "Select cards"],
    ["orderCards", "Choose the card order"],
  ] as const)("shows Goldramon's complete attack clause for the %s step", (kind, promptText) => {
    renderDecision({
      decisionId: `goldramon-attack-${kind}`,
      seat: 0,
      kind,
      promptText,
      sourceCardId: "EX3-035",
      options: {
        timing: "WhenAttacking",
        candidateInstanceIds: ["magnadramon", "azulongmon", "megidramon"],
        min: kind === "selectCards" ? 0 : 3,
        max: kind === "selectCards" ? 1 : 3,
        orderDestination: kind === "orderCards" ? "deckBottom" : undefined,
      },
    });

    if (kind === "orderCards") {
      expect(screen.getByText("Choose the card order")).toBeTruthy();
      expect(screen.getByText(/Arrange the cards going to the bottom of the deck/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Confirm order" })).toBeTruthy();
    } else {
      expect(screen.queryByText(promptText)).toBeNull();
      expect(screen.getByRole("button", { name: "None" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Confirm targets" })).toBeTruthy();
    }
    expect(screen.getByText(/1 of your opponent's Digimon gets -6000/i)).toBeTruthy();
    expect(screen.getByText(/Magnadramon.*Azulongmon.*Megidramon/i)).toBeTruthy();
    expect(screen.getByText(/bottom of your deck in any order/i)).toBeTruthy();
    expect(screen.getByText(/trash the top 2 cards of your opponent's security stack/i)).toBeTruthy();
  });

  it("shows Angewomon's complete Four Great Dragons DP-reduction action", () => {
    renderDecision({
      decisionId: "angewomon-four-great-dragons-debuff",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Choose targets",
      sourceCardId: "EX3-034",
      options: { timing: "YourTurn", candidateInstanceIds: ["opponent-digimon"], min: 1, max: 1 },
    });

    expect(screen.getByText(/When you play a Digimon with \[Four Great Dragons\]/i)).toBeTruthy();
    expect(screen.getByText(/or place \[Trial of the Four Great Dragons\] in your battle area/i)).toBeTruthy();
    expect(screen.getByText(/1 of your opponent's Digimon gets -3000 DP for the turn/i)).toBeTruthy();
    expect(screen.queryByText("Choose targets")).toBeNull();
  });

  it("shows AeroVeedramon's optional Trial placement using the errata wording", () => {
    renderDecision({
      decisionId: "aeroveedramon-place-trial",
      seat: 0,
      kind: "optional",
      promptText: "Use this effect?",
      sourceCardId: "EX3-033",
      options: { timing: "WhenDigivolving" },
    });

    expect(screen.getByText(/If you don't have a \[Trial of the Four Great Dragons\] in play/i)).toBeTruthy();
    expect(screen.getByText(/you may place 1 \[Trial of the Four Great Dragons\] from your hand/i)).toBeTruthy();
    expect(screen.getByText(/in your battle area/i)).toBeTruthy();
    expect(screen.queryByText(/play 1 \[Trial of the Four Great Dragons\]/i)).toBeNull();
  });

  it("shows Majiramon's complete target debuff and Four Sovereigns bonus", () => {
    renderDecision({
      decisionId: "majiramon-security-attack-debuff",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Choose targets",
      sourceCardId: "EX3-032",
      options: { timing: "OnPlay", candidateInstanceIds: ["opponent-digimon"], min: 1, max: 1 },
    });

    expect(screen.getByText(/1 of your opponent's Digimon gains.*Security Attack -2/i)).toBeTruthy();
    expect(screen.getByText(/until the end of your opponent's turn/i)).toBeTruthy();
    expect(screen.getByText(/Four Sovereigns.*gain 2 memory/i)).toBeTruthy();
    expect(screen.queryByText("Choose targets")).toBeNull();
  });

  it("shows Veedramon's full Dramon/Four Great Dragons search for each mandatory choice", () => {
    renderDecision({
      decisionId: "veedramon-reveal-search",
      seat: 0,
      kind: "selectCards",
      promptText: "Select cards",
      sourceCardId: "EX3-031",
      options: { timing: "WhenDigivolving", candidateInstanceIds: ["dramon"], min: 1, max: 1 },
    });

    expect(screen.getByText(/Reveal the top 4 cards of your deck/i)).toBeTruthy();
    expect(screen.getByText(/1 yellow card with \[Dramon\] in its name/i)).toBeTruthy();
    expect(screen.getByText(/1 card with \[Four Great Dragons\] in its traits/i)).toBeTruthy();
    expect(screen.getByText(/bottom of your deck in any order/i)).toBeTruthy();
    expect(screen.queryByText("Select cards")).toBeNull();
  });

  it("shows Gatomon's errata search for its revealed-card choice", () => {
    renderDecision({
      decisionId: "gatomon-reveal-search",
      seat: 0,
      kind: "selectCards",
      promptText: "Select cards",
      sourceCardId: "EX3-030",
      options: { timing: "OnPlay", candidateInstanceIds: ["angel"], min: 1, max: 1 },
    });

    expect(screen.getByText(/Reveal the top 4 cards of your deck/i)).toBeTruthy();
    expect(screen.getByText(/other than \[Three Great Angels\]/i)).toBeTruthy();
    expect(screen.getByText(/1 card with the \[Four Great Dragons\] trait/i)).toBeTruthy();
    expect(screen.queryByText("Select cards")).toBeNull();
  });

  it("shows Airdramon's private security search and conditional Recovery in one friendly clause", () => {
    renderDecision({
      decisionId: "airdramon-security-search",
      seat: 0,
      kind: "selectCards",
      promptText: "Select cards",
      sourceCardId: "EX3-029",
      options: {
        timing: "OnPlay",
        candidateInstanceIds: ["security-1", "security-2"],
        visibleInstanceIds: ["security-1", "security-2"],
        min: 1,
        max: 1,
      },
    });

    expect(
      screen.getByText(/Search your security stack, reveal 1 card from it, and add it to your hand/i),
    ).toBeTruthy();
    expect(screen.getByText(/If it's a yellow card, ＜Recovery \+1 \(Deck\)＞/i)).toBeTruthy();
    expect(screen.getByText(/Then, shuffle your security stack/i)).toBeTruthy();
    expect(screen.queryByText("Select cards")).toBeNull();
  });

  it("shows Patamon's complete errata search while hiding the generic selection prompt", () => {
    renderDecision({
      decisionId: "patamon-reveal-search",
      seat: 0,
      kind: "selectCards",
      promptText: "Select cards",
      sourceCardId: "EX3-028",
      options: {
        timing: "OnPlay",
        candidateInstanceIds: ["authority"],
        visibleInstanceIds: ["authority", "three-great-angels", "dragon", "filler"],
        min: 1,
        max: 1,
      },
    });

    expect(screen.getByText(/Reveal the top 4 cards of your deck/i)).toBeTruthy();
    expect(
      screen.getByText(/\[Angel\], \[Cherub\], \[Throne\], \[Authority\], \[Seraph\] or \[Virtue\]/i),
    ).toBeTruthy();
    expect(screen.getByText(/other than \[Three Great Angels\]/i)).toBeTruthy();
    expect(screen.getByText(/Place the rest at the bottom of your deck in any order/i)).toBeTruthy();
    expect(screen.queryByText("Select cards")).toBeNull();
  });

  it("shows Aegisdramon's errata play branches for its When Digivolving choice", () => {
    renderDecision({
      decisionId: "aegisdramon-play-source",
      seat: 0,
      kind: "optional",
      promptText: "playWithoutCost",
      sourceCardId: "EX3-026",
      options: { timing: "WhenDigivolving" },
    });

    expect(screen.getByText(/1 blue level 3 Digimon card or 1 Digimon card with \[Seadramon\]/i)).toBeTruthy();
    expect(screen.getByText(/\[Aqua\] or \[Sea Animal\] in one of its traits/i)).toBeTruthy();
    expect(screen.queryByText("playWithoutCost")).toBeNull();
  });

  it("shows Aegisdramon's opponent-turn reactivation instead of the ActivateEffect slug", () => {
    renderDecision({
      decisionId: "aegisdramon-reactivate",
      seat: 0,
      kind: "optional",
      promptText: "ActivateEffect",
      sourceCardId: "EX3-026",
      options: { timing: "OpponentsTurn" },
    });

    expect(
      screen.getByText(
        /When your opponent plays a Digimon, you may activate 1 of this Digimon's \[When Digivolving\] effects\.$/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("ActivateEffect")).toBeNull();
  });

  it("shows Azulongmon's optional placement with the errata wording instead of an internal verb", () => {
    renderDecision({
      decisionId: "azulongmon-place-trial",
      seat: 0,
      kind: "optional",
      promptText: "placeInBattleAreaSelf",
      sourceCardId: "EX3-025",
      options: { timing: "OnDeletion" },
    });

    expect(
      screen.getByText(
        /If you don't have a \[Trial of the Four Great Dragons\] in play, you may place 1 \[Trial of the Four Great Dragons\] from your hand/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("placeInBattleAreaSelf")).toBeNull();
  });

  it("shows Slayerdramon's opponent-main-phase action with the errata wording", () => {
    renderDecision({
      decisionId: "slayerdramon-forced-attack",
      seat: 0,
      kind: "optional",
      promptText: "attack",
      sourceCardId: "EX3-024",
      options: { timing: "OnStartMainPhase" },
    });

    expect(
      screen.getByText(
        /By suspending 1 of your Digimon with \[Dramon\] or \[Examon\] in its name, your opponent attacks with 1 of their Digimon/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("attack")).toBeNull();
  });

  it("shows Plesiomon's optional digivolution action with its full errata text", () => {
    renderDecision({
      decisionId: "plesiomon-play",
      seat: 0,
      kind: "optional",
      promptText: "playWithoutCost",
      sourceCardId: "EX3-023",
      options: { timing: "WhenDigivolving" },
    });

    expect(
      screen.getByText(
        /play 1 blue level 3 Digimon card or 1 level 4 or lower Digimon card with \[Aqua\] or \[Sea Animal\]/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/place 1 blue Digimon card from your hand under this Digimon as its bottom digivolution card/i),
    ).toBeTruthy();
    expect(screen.queryByText("playWithoutCost")).toBeNull();
  });

  it("shows MegaSeadramon's optional attack action with its printed text instead of an internal verb", () => {
    renderDecision({
      decisionId: "mega-seadramon-play",
      seat: 0,
      kind: "optional",
      promptText: "playWithoutCost",
      sourceCardId: "EX3-022",
      options: { timing: "WhenAttacking" },
    });

    expect(
      screen.getByText(/play 1 blue level 3 Digimon card from 1 of your blue Digimon's digivolution cards/i),
    ).toBeTruthy();
    expect(screen.queryByText("playWithoutCost")).toBeNull();
  });

  it("explains CrysPaledramon's source choice with the printed clause and a localized title", () => {
    renderDecision({
      decisionId: "crys-paledramon-sources",
      seat: 0,
      kind: "selectCards",
      promptText: "Select cards",
      sourceCardId: "EX3-021",
      options: {
        candidateInstanceIds: ["source-1", "source-2"],
        min: 2,
        max: 2,
        timing: "WhenDigivolving",
      },
    });

    expect(screen.getByText(/Trash any 2 digivolution cards under 1 of your opponent's Digimon/)).toBeTruthy();
    expect(screen.queryByText("Select cards")).toBeNull();
    expect(screen.queryByText(/TrashDigivolution|Restrict/)).toBeNull();
  });

  it("shows From Master to Disciple's printed text instead of declarative effect record action names", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "from-master-reveal",
            seat: 0,
            kind: "selectCards",
            promptText: "From Master to Disciple",
            sourceCardId: "ST12-15",
            options: {
              candidateInstanceIds: ["huckmon"],
              min: 0,
              max: 1,
              timing: "Main",
              effectText: "[Main] RevealAdd, PlaceInBattleAreaSelf",
            },
          }}
          sourceCardId="ST12-15"
          candidates={[{ instanceId: "huckmon", cardId: "ST12-01" }]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/\[Main\] Reveal the top 3 cards of your deck/)).toBeTruthy();
    expect(screen.queryByText(/RevealAdd|PlaceInBattleAreaSelf/)).toBeNull();
  });

  it("replaces an internal action-kind prompt with the generic optional question", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "cool-boy-gain-memory",
            seat: 0,
            kind: "optional",
            promptText: "gainMemory",
            sourceCardId: "BT9-092",
            options: { timing: "Your Turn" },
          }}
          sourceCardId="BT9-092"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("gainMemory")).toBeNull();
  });

  it("hides Millenniummon's generated cost summary and docks the prompt on the left rail", () => {
    const generated =
      "By paying: By returning 3 [Composite], [Wicked God] or [DM] cards from your trash to the bottom of the deck → Play without paying the cost";
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "millenniummon-on-deletion",
            seat: 0,
            kind: "optional",
            promptText: generated,
            sourceCardId: "P-220",
            options: { timing: "OnDeletion" },
          }}
          sourceCardId="P-220"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(generated)).toBeNull();
    expect(screen.getByText(/\[On Deletion\] By returning 3 \[Composite\]/)).toBeTruthy();
    expect(screen.getByRole("dialog").classList.contains("decision-overlay--side")).toBe(true);
  });

  it("shows Homeros's printed clause for its cost-bearing foreign-effect decision", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "homeros-activate",
            seat: 0,
            kind: "optional",
            promptText: "ActivateForeignEffect",
            sourceCardId: "BT24-102",
            options: { timing: "EndOfYourTurn" },
          }}
          sourceCardId="BT24-102"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(/ActivateForeignEffect|By paying:/)).toBeNull();
    expect(screen.getByText(/By suspending this Tamer, you may activate 1/)).toBeTruthy();
    expect(screen.getByText(/effect of 1 of your \[Olympos XII\].*trait Digimon/)).toBeTruthy();
  });

  it("shows Chaosdramon's printed clause instead of the generated DeDigivolve label", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "chaosdramon-place",
            seat: 0,
            kind: "optional",
            promptText: "De-Digivolve",
            sourceCardId: "EX3-013",
            options: { timing: "OnPlay", effectText: "[OnPlay] DeDigivolve" },
          }}
          sourceCardId="EX3-013"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/By placing up to 3 red and black level 5 cards/)).toBeTruthy();
    expect(screen.queryByText("[OnPlay] DeDigivolve")).toBeNull();
  });

  it("shows Crabmon's printed target-and-placement clause instead of SelectBind internals", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "crabmon-target",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Select bind",
            sourceCardId: "EX3-015",
            options: {
              candidateInstanceIds: ["blue-digimon"],
              min: 1,
              max: 1,
              timing: "OnPlay",
              effectText: "[OnPlay] Select bind, Gain Jamming",
            },
          }}
          sourceCardId="EX3-015"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/1 of your blue Digimon gains ＜Jamming＞ for the turn/)).toBeTruthy();
    expect(screen.queryByText(/Select bind/i)).toBeNull();
  });

  it("keeps a single-token card name as the prompt for a selection decision", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "select-1",
            seat: 0,
            kind: "chooseTargets",
            promptText: "MetalGreymon",
            options: { candidateInstanceIds: [], min: 0, max: 1 },
          }}
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("MetalGreymon")).toBeTruthy();
  });

  it("does not mix SaviorHuckmon's main effect into its inherited optional decision", () => {
    const inheritedEffect =
      "[When Attacking][Inherited][Once Per Turn] If this Digimon has [Royal Knight] in its traits, " +
      "you may play 1 Digimon card with [Sistermon] in its name from your hand or trash without paying its memory cost.";

    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "saviorhuckmon-inherited",
            seat: 0,
            kind: "optional",
            promptText: "Use this effect?",
            sourceCardId: "ST12-08",
            options: { effectText: inheritedEffect, isInherited: true },
          }}
          sourceCardId="ST12-08"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(getCardDefinition("ST12-08")!.inheritedEffectText!)).toBeTruthy();
    expect(screen.queryByText(/\[When Digivolving\].*unsuspended Digimon/)).toBeNull();
  });

  it("keeps SaviorHuckmon's inherited clause in the following Sistermon selection", () => {
    const inheritedEffect =
      "[When Attacking][Inherited][Once Per Turn] If this Digimon has [Royal Knight] in its traits, " +
      "you may play 1 Digimon card with [Sistermon] in its name from your hand or trash without paying its memory cost.";

    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "saviorhuckmon-select-sistermon",
            seat: 0,
            kind: "selectCards",
            promptText: "SaviorHuckmon",
            sourceCardId: "ST12-08",
            options: {
              candidateInstanceIds: ["sistermon"],
              min: 0,
              max: 1,
              timing: "OnAllyAttack",
              effectText: inheritedEffect,
            },
          }}
          sourceCardId="ST12-08"
          candidates={[{ instanceId: "sistermon", cardId: "ST12-12" }]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(getCardDefinition("ST12-08")!.inheritedEffectText!)).toBeTruthy();
    expect(screen.queryByText(/\[When Digivolving\].*unsuspended Digimon/)).toBeNull();
    expect(screen.getByRole("button", { name: /^(?!Open ).*Sistermon Blanc/ })).toBeTruthy();
  });

  it("does not guess a main card effect for legacy optional decisions without provenance", () => {
    const inheritedPrompt = "Use [When Attacking][Inherited] Play 1 [Sistermon] from your hand or trash?";

    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "legacy-saviorhuckmon-inherited",
            seat: 0,
            kind: "optional",
            promptText: inheritedPrompt,
            sourceCardId: "ST12-08",
          }}
          sourceCardId="ST12-08"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(inheritedPrompt)).toBeTruthy();
    expect(screen.queryByText(/\[When Digivolving\].*unsuspended Digimon/)).toBeNull();
  });

  it("does not mix SaviorHuckmon's main effect into an inherited card selection without provenance", () => {
    const inheritedPrompt =
      "Use [When Attacking][Inherited][Once Per Turn] If this Digimon has [Royal Knight] in its traits, " +
      "you may play 1 Digimon card with [Sistermon] in its name from your hand or trash without paying its memory cost.?";

    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "legacy-saviorhuckmon-select-sistermon",
            seat: 0,
            kind: "selectCards",
            promptText: inheritedPrompt,
            sourceCardId: "ST12-08",
            options: {
              candidateInstanceIds: ["sistermon"],
              min: 0,
              max: 1,
            },
          }}
          sourceCardId="ST12-08"
          candidates={[{ instanceId: "sistermon", cardId: "ST12-12" }]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(inheritedPrompt)).toBeTruthy();
    expect(screen.queryByText(/\[When Digivolving\].*unsuspended Digimon/)).toBeNull();
  });

  it("renders a Blitz opportunity with the granted card as its visible source", () => {
    const onRespond = vi.fn();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "betel-blitz",
            seat: 0,
            kind: "optional",
            promptText: "Activate Blitz?",
            sourceCardId: "BT8-013",
            options: { promptKey: "activateBlitz", timing: "When Digivolving" },
          }}
          sourceCardId="BT8-013"
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    // The art says which card asked; the sheet no longer spells its name out above the clause.
    expect(screen.queryByText("BetelGammamon · effect")).toBeNull();
    expect(screen.getByRole("dialog", { name: "BetelGammamon · effect" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Use this effect?" })).toBeTruthy();
    expect(screen.getByText(/\[When Digivolving\].*Blitz/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
  });

  it("distinguishes identical Blockers by stack size and submits the chosen permanent", () => {
    const onBlock = vi.fn();
    render(
      <I18nProvider>
        <BlockOverlay
          attackerCardId="BT1-009"
          blockers={[
            { permanentId: "empty", cardId: "EX1-073", currentDP: 11000, sourceCount: 0 },
            { permanentId: "loaded", cardId: "EX1-073", currentDP: 15000, sourceCount: 5 },
          ]}
          onBlock={onBlock}
          onDecline={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /Machinedramon, 11,000 DP, 0 source/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Machinedramon, 15,000 DP, 5 source/ }));
    expect(onBlock).toHaveBeenCalledWith("loaded");
  });

  it("shows Coredramon as a friendly Blocker action and submits its permanent id", () => {
    const onBlock = vi.fn<(permanentId: string) => void>();
    render(
      <I18nProvider>
        <BlockOverlay
          attackerCardId="BT1-028"
          blockers={[{ permanentId: "coredramon-permanent", cardId: "EX3-039", currentDP: 6000, sourceCount: 1 }]}
          onBlock={onBlock}
          onDecline={vi.fn<() => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Block window" })).toBeTruthy();
    expect(screen.getByText(/When an opponent's Digimon attacks/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Coredramon, 6,000 DP, 1 source/i }));
    expect(onBlock).toHaveBeenCalledWith("coredramon-permanent");
  });

  it("drops the refusal when ＜Collision＞ forces the block", () => {
    render(
      <I18nProvider>
        <BlockOverlay
          attackerCardId="BT1-028"
          blockers={[{ permanentId: "coredramon-permanent", cardId: "EX3-039", currentDP: 6000, sourceCount: 1 }]}
          mustBlock
          onBlock={vi.fn<(permanentId: string) => void>()}
          onDecline={vi.fn<() => void>()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: "Take the attack, no block" })).toBeNull();
    expect(screen.getByText(/must block if possible/i)).toBeTruthy();
    expect(screen.getByText("Mandatory")).toBeTruthy();
  });

  it("shows an eligible sourced ExTyrannomon with its DP and source count", () => {
    const onBlock = vi.fn<(permanentId: string) => void>();
    render(
      <I18nProvider>
        <BlockOverlay
          attackerCardId="BT1-028"
          blockers={[{ permanentId: "extyrannomon-permanent", cardId: "EX3-060", currentDP: 9000, sourceCount: 1 }]}
          onBlock={onBlock}
          onDecline={vi.fn<() => void>()}
        />
      </I18nProvider>,
    );

    const blocker = screen.getByRole("button", { name: /ExTyrannomon, 9,000 DP, 1 source/i });
    expect(blocker).toBeTruthy();
    fireEvent.click(blocker);
    expect(onBlock).toHaveBeenCalledWith("extyrannomon-permanent");
  });

  it("renders and submits the abstract security target used by forced attacks", () => {
    const onRespond = vi.fn();
    function ForcedAttackHarness() {
      const [picks, setPicks] = useState<string[]>([]);
      return (
        <I18nProvider>
          <DecisionOverlay
            request={{
              decisionId: "forced-attack",
              seat: 0,
              kind: "chooseTargets",
              promptText: "Choose attack target",
              options: { min: 1, max: 1 },
            }}
            candidates={[
              { instanceId: "player", selectable: true },
              { instanceId: "defender", cardId: "BT1-009", selectable: true },
            ]}
            picks={picks}
            onTogglePick={(instanceId) => setPicks([instanceId])}
            onRespond={onRespond}
          />
        </I18nProvider>
      );
    }
    render(<ForcedAttackHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Opponent security" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));

    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["player"] });
  });

  it("distinguishes both players in a tied security-stack decision", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "security-owner",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose a player",
            options: { min: 0, max: 1 },
          }}
          candidates={[
            { instanceId: "mine", selectable: true },
            { instanceId: "opponent", selectable: true },
          ]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Your security" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Opponent security" })).toBeTruthy();
  });

  it("distinguishes identical permanent targets by their digivolution source count", () => {
    const onRespond = vi.fn();
    function DuplicateTargetHarness() {
      const [picks, setPicks] = useState<string[]>([]);
      return (
        <I18nProvider>
          <DecisionOverlay
            request={{
              decisionId: "duplicate-targets",
              seat: 0,
              kind: "chooseTargets",
              promptText: "Choose",
              options: { min: 1, max: 1 },
            }}
            candidates={[
              { instanceId: "machinedramon-empty", cardId: "EX1-073", sourceCount: 0 },
              { instanceId: "machinedramon-stack", cardId: "EX1-073", sourceCount: 5 },
            ]}
            picks={picks}
            onTogglePick={(instanceId) => setPicks([instanceId])}
            onRespond={onRespond}
          />
        </I18nProvider>
      );
    }
    render(<DuplicateTargetHarness />);

    expect(screen.getByRole("button", { name: /Machinedramon, 0 source/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Machinedramon, 5 source/ })).toBeTruthy();
    expect(screen.queryByText("0 sources")).toBeNull();
    expect(screen.queryByText("5 sources")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Machinedramon, 5 source/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));

    expect(onRespond).toHaveBeenCalledWith({
      kind: "chooseTargets",
      instanceIds: ["machinedramon-stack"],
    });
  });

  it("distinguishes equal-stack targets by live DP and suspension", () => {
    const onRespond = vi.fn();
    function LiveTargetHarness() {
      const [picks, setPicks] = useState<string[]>([]);
      return (
        <I18nProvider>
          <DecisionOverlay
            request={{
              decisionId: "live-targets",
              seat: 0,
              kind: "chooseTargets",
              promptText: "Choose",
              options: { min: 1, max: 1 },
            }}
            candidates={[
              { instanceId: "active", cardId: "EX1-073", sourceCount: 2, currentDP: 11_000, isSuspended: false },
              { instanceId: "suspended", cardId: "EX1-073", sourceCount: 2, currentDP: 14_000, isSuspended: true },
            ]}
            picks={picks}
            onTogglePick={(instanceId) => setPicks([instanceId])}
            onRespond={onRespond}
          />
        </I18nProvider>
      );
    }
    render(<LiveTargetHarness />);

    expect(screen.getByRole("button", { name: /Machinedramon, 11,000 DP, 2 source/ })).toBeTruthy();
    const boosted = screen.getByRole("button", { name: /Machinedramon, 14,000 DP, Suspended, 2 source/ });
    fireEvent.click(boosted);
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));

    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: ["suspended"] });
  });

  it("hides the dialog and leaves a persistent return control", () => {
    const stage = document.createElement("div");
    stage.id = "aegis-stage";
    document.body.append(stage);
    const onRespond = vi.fn();
    render(
      <I18nProvider>
        <div data-testid="overlay-host">
          <DecisionOverlay
            request={optionalDecision}
            candidates={[]}
            picks={[]}
            onTogglePick={vi.fn()}
            onRespond={onRespond}
          />
        </div>
      </I18nProvider>,
      { container: stage },
    );

    fireEvent.click(screen.getByRole("button", { name: "View board" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Decision pending")).toBeTruthy();
    const returnButton = screen.getByRole("button", { name: "Return to decision" });
    expect(returnButton).toBe(document.activeElement);
    expect(returnButton.closest("#aegis-stage")).toBeNull();
    expect(returnButton.parentElement?.parentElement).toBe(document.body);
    expect(returnButton.parentElement?.style.position).toBe("fixed");
  });

  it("returns to the same decision without submitting a response", () => {
    const { onRespond } = renderDecision();
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));

    expect(screen.getByRole("dialog")).toBe(document.activeElement);
    expect(screen.getByText("Activate the effect?")).toBeTruthy();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("keeps target picks while the decision dialog is hidden", () => {
    function SelectionHarness() {
      const [picks, setPicks] = useState<string[]>([]);
      return (
        <I18nProvider>
          <DecisionOverlay
            request={{
              decisionId: "decision-select",
              seat: 0,
              kind: "selectCards",
              promptText: "Choose",
              options: { min: 1, max: 1 },
            }}
            candidates={[{ instanceId: "agumon", cardId: "BT1-009" }]}
            picks={picks}
            onTogglePick={(instanceId) => setPicks([instanceId])}
            onRespond={vi.fn()}
          />
        </I18nProvider>
      );
    }
    render(<SelectionHarness />);

    fireEvent.click(screen.getByRole("button", { pressed: false }));
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));

    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
  });

  it("contains keyboard focus inside the required decision", () => {
    renderDecision();
    const dialog = screen.getByRole("dialog");
    const buttons = screen.getAllByRole("button");
    const first = buttons[0]!;
    const last = buttons.at(-1)!;

    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toBe(document.activeElement);

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toBe(document.activeElement);

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toBe(document.activeElement);
  });

  it("preserves an edited card order while the board is visible", () => {
    const onRespond = vi.fn();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{ decisionId: "decision-order", seat: 0, kind: "orderCards", promptText: "Order cards" }}
          candidates={[
            { instanceId: "first", cardId: "BT1-009" },
            { instanceId: "second", cardId: "ST1-02" },
          ]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Move card down/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm order" }));

    expect(onRespond).toHaveBeenCalledWith({ kind: "orderCards", order: ["second", "first"] });
  });

  it("shows canonical deck-edge choices as readable labels", () => {
    const { onRespond } = renderDecision({
      decisionId: "decision-deck-edge",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose the deck edge",
      options: { choices: ["top", "bottom"] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Bottom of the deck" }));

    expect(screen.getByRole("button", { name: "Top of the deck" })).toBeTruthy();
    expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
    expect(screen.queryByRole("button", { name: "bottom" })).toBeNull();
  });

  it("names the digivolution-card ends for a digivolution-card placement choice", () => {
    renderDecision({
      decisionId: "decision-stack-edge",
      seat: 0,
      kind: "chooseOption",
      promptText: "Siriusmon",
      options: { choices: ["top", "bottom"], topBottomZone: "digivolutionCards" },
    });

    expect(screen.getByRole("button", { name: "Top of the digivolution cards" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bottom of the digivolution cards" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Top of the deck" })).toBeNull();
  });

  it("explains that position 1 is the bottom card when ordering digivolution sources", () => {
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "decision-stack-order",
            seat: 0,
            kind: "orderCards",
            promptText: "Order digivolution cards",
            options: { orderDestination: "stackBottom" },
          }}
          candidates={[
            { instanceId: "first", cardId: "BT7-058" },
            { instanceId: "second", cardId: "BT7-059" },
          ]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Number 1 will be the bottom card of the stack/)).toBeTruthy();
  });

  it("opens a replacement decision instead of carrying over board view", () => {
    const { rerender } = renderDecision();
    fireEvent.click(screen.getByRole("button", { name: "View board" }));

    rerender(
      <I18nProvider>
        <DecisionOverlay
          request={{ ...optionalDecision, decisionId: "decision-2", promptText: "Second decision" }}
          candidates={[]}
          picks={[]}
          onTogglePick={vi.fn()}
          onRespond={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Second decision")).toBeTruthy();
  });
});

describe("card links in prompts", () => {
  it("opens the attacker a block window names", () => {
    const opened: string[] = [];
    render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={(cardId) => opened.push(cardId)}>
          <BlockOverlay
            attackerCardId="BT1-009"
            blockers={[{ permanentId: "empty", cardId: "EX1-073", currentDP: 11000, sourceCount: 0 }]}
            onBlock={vi.fn<(permanentId: string) => void>()}
            onDecline={vi.fn<() => void>()}
          />
        </CardOpenerProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Open / }));
    expect(opened).toEqual(["BT1-009"]);
  });

  it("opens the source card a decision names, and still names the dialog after it", () => {
    const opened: string[] = [];
    render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={(cardId) => opened.push(cardId)}>
          <DecisionOverlay
            request={{
              decisionId: "link-1",
              seat: 0,
              kind: "optional",
              promptText: "Activate the effect?",
            }}
            sourceCardId="BT1-010"
            candidates={[]}
            picks={[]}
            onTogglePick={vi.fn<(instanceId: string) => void>()}
            onRespond={vi.fn<(response: DecisionResponse) => void>()}
          />
        </CardOpenerProvider>
      </I18nProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Agumon · effect" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Agumon" }));
    expect(opened).toEqual(["BT1-010"]);
  });

  it("leaves a name that only exists in server prose unlinked", () => {
    // The client holds no id for a card the engine merely wrote about, and a link
    // to the wrong card is worse than none.
    render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={vi.fn<(cardId: string) => void>()}>
          <DecisionOverlay
            request={{
              decisionId: "link-2",
              seat: 0,
              kind: "optional",
              promptText: "Trash Greymon to draw 1 card?",
            }}
            candidates={[]}
            picks={[]}
            onTogglePick={vi.fn<(instanceId: string) => void>()}
            onRespond={vi.fn<(response: DecisionResponse) => void>()}
          />
        </CardOpenerProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("Trash Greymon to draw 1 card?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
  });
});

it("allows selecting all available candidates when fewer than min exist", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nProvider>
      <DecisionOverlay
        request={{
          decisionId: "shortage",
          seat: 0,
          kind: "selectCards",
          promptText: "Select 2",
          options: { candidateInstanceIds: ["only"], min: 2, max: 2 },
        }}
        candidates={[{ instanceId: "only", cardId: "BT1-010" }]}
        picks={["only"]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: translator("en")("overlay.confirmTargets") }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["only"] });
});

it("shows start-main timing and full formatted text for each pending effect", () => {
  renderDecision({
    decisionId: "start-main-full-text",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next pending effect to resolve.",
    options: {
      triggerKeys: [buildTriggerKey("first", "BT26-009/start-main"), buildTriggerKey("second", "BT26-092/start-main")],
      triggerCardIds: ["BT26-009", "BT26-092"],
      triggerTimings: ["StartOfYourMainPhase", "StartOfYourMainPhase"],
    },
  });
  expect(document.querySelectorAll(".trigger-chooser__timing")).toHaveLength(0);
  expect(document.querySelector(".trigger-chooser__context")?.textContent).toBe("[Start of Your Main Phase]");
  expect(screen.queryByText("Inherited (ESS)")).toBeNull();
  expect(screen.queryByText("Security effect")).toBeNull();
  expect(screen.getByText("BT26-009")).toBeTruthy();
  const text = document.querySelector(".trigger-chooser__effect-text")!;
  expect(text.textContent).not.toContain("[Digivolve]");
  expect(document.querySelector(".trigger-chooser")?.textContent).not.toContain("[Opponent's Turn]");
  expect(document.querySelector(".trigger-chooser")?.textContent).not.toContain("[Security]");
  expect(text.textContent).toContain("gain 1 memory.");
  expect(Array.from(text.querySelectorAll("mark")).map((mark) => mark.textContent)).toContain(
    "[Start of Your Main Phase]",
  );
});

it.each(["optional", "selectCards"] as const)("shows Decode's keyword and rules text for the %s decision", (kind) => {
  const effectText =
    "＜Decode (Lv.5 or lower w/[Aqua]/[Sea Animal] in any trait or w/[TB] trait)＞ When this Digimon would leave the battle area other than by battle, you may play 1 Digimon card specified by this keyword from this Digimon's digivolution cards without paying the cost.";
  renderDecision({
    decisionId: "decode-choice",
    seat: 0,
    kind,
    sourceCardId: "EX12-036",
    promptText: kind === "optional" ? "Play without paying the cost" : "Ryugumon",
    options: { timing: "AllTurns", effectText, candidateInstanceIds: [], min: 1, max: 1 },
  });
  expect(screen.getByText(getCardDefinition("EX12-036")!.effectText!.match(/＜Decode[^＞]*＞/)![0])).toBeTruthy();
});

it.each(["OnPlay", "WhenDigivolving", "WhenAttacking"])(
  "shows only Marsmon's Then passage for the %s battle prompt",
  (timing) => {
    renderDecision({
      decisionId: "marsmon-battle",
      seat: 0,
      kind: "optional",
      sourceCardId: "BT25-020",
      promptText: "Battle",
      options: {
        timing,
        effectText: getCardDefinition("BT25-020")!.effectText,
        effectTextPart: "Then, 1 of your Digimon may battle 1 of your opponent's Digimon.",
      },
    });
    expect(screen.getByText("Then, 1 of your Digimon may battle 1 of your opponent's Digimon.")).toBeTruthy();
    expect(screen.queryByText(/gets \+3000 DP/)).toBeNull();
  },
);

describe("DUAL Option decisions", () => {
  it("shows Final Judgment's Option text for Monarchlizamon's Main attack prompt", () => {
    renderDecision({
      decisionId: "dual-main",
      seat: 0,
      kind: "optional",
      promptText: "Use this effect?",
      sourceCardId: "BT25-057",
      options: { timing: "Main", effectText: "[Main] Modify DP, GainKeyword, Attack" },
    });
    expect(screen.getByText(/Then, it may attack/)).toBeTruthy();
    expect(screen.queryByText(/De-Digivolve 1/)).toBeNull();
  });
});

it.each([
  "[All Turns] [Once Per Turn] When Digimon are played or digivolve, you may suspend 1 of your opponent's Digimon and unsuspend this Digimon.",
  "Then, if played or digivolved by effects, you may return 1 of your opponent's suspended Digimon to the bottom of the deck.",
])("shows Imperial's confirmation passage and preserves the accept response: %s", (effectTextPart) => {
  const { onRespond } = renderDecision({
    decisionId: "imperial-part",
    seat: 0,
    kind: "optional",
    sourceCardId: "AD1-024",
    promptText: "Activate this triggered effect?",
    options: { timing: "AllTurns", effectText: "Suspend, Unsuspend, Return", effectTextPart },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(effectTextPart);
  fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});

it("shows only Ryutaro's pre-After clause for the activation decision", () => {
  const effectText = getCardDefinition("EX11-056")!.effectText!;
  const effectTextPart = effectText.slice(0, effectText.indexOf(" After,"));
  renderDecision({
    decisionId: "ryutaro-activation",
    seat: 0,
    kind: "optional",
    sourceCardId: "EX11-056",
    promptText: "Activate this triggered effect?",
    options: { timing: "AllTurns", effectText, effectTextPart },
  });

  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(effectTextPart);
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).not.toContain("After,");
});

it("shows the revealed cards in Zubamon's top-or-bottom choice so the player does not decide blind", () => {
  render(
    <I18nProvider>
      <DecisionOverlay
        request={{
          decisionId: "zubamon-top-or-bottom",
          seat: 0,
          kind: "chooseOption",
          promptText: "Zubamon",
          sourceCardId: "P-097",
          options: {
            choices: ["Top of deck", "Bottom of deck"],
            visibleInstanceIds: ["revealed-1", "revealed-2", "revealed-3"],
            visibleCards: [
              { instanceId: "revealed-1", cardId: "BT1-009" },
              { instanceId: "revealed-2", cardId: "BT1-010" },
              { instanceId: "revealed-3", cardId: "BT1-011" },
            ],
          },
        }}
        sourceCardId="P-097"
        candidates={[
          { instanceId: "revealed-1", cardId: "BT1-009" },
          { instanceId: "revealed-2", cardId: "BT1-010" },
          { instanceId: "revealed-3", cardId: "BT1-011" },
        ]}
        picks={[]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={vi.fn<(response: DecisionResponse) => void>()}
      />
    </I18nProvider>,
  );

  expect(screen.getByText("Revealed cards")).toBeTruthy();
  for (const cardId of ["BT1-009", "BT1-010", "BT1-011"]) {
    const name = getCardDefinition(cardId)!.nameEn;
    expect(screen.getAllByAltText(name).length).toBeGreaterThan(0);
    expect(screen.getByText(name).className).toBe("decision-overlay__candidate-name");
    expect(
      screen
        .getAllByRole("button", { name: new RegExp(`^Open ${name}$`, "i") })
        .every((button) => button.textContent?.trim() === ""),
    ).toBe(true);
  }
});

describe("printed clause selection for prompts", () => {
  it.each(["separate copies", "repeated occurrence"])(
    "does not assign sibling clauses to %s without descriptions",
    (kind) => {
      const keys = [
        buildTriggerKey("first", "EX13-036/ir-7-0"),
        kind === "separate copies"
          ? buildTriggerKey("second", "EX13-036/ir-7-0")
          : buildTriggerKey("first", "EX13-036/ir-7-0/activation-2"),
      ];
      renderDecision({
        decisionId: "kentaurosmon-repeated-effect",
        seat: 0,
        kind: "orderTriggers",
        promptText: "Choose the next pending effect to resolve.",
        options: {
          triggerKeys: keys,
          triggerCardIds: ["EX13-036", "EX13-036"],
          triggerTimings: ["WhenDigivolving", "WhenDigivolving"],
        },
      });
      const tiles = screen.getAllByRole("button", { name: /Kentaurosmon/ });
      expect(tiles).toHaveLength(2);
      for (const tile of tiles) {
        expect(tile.textContent).toContain("you may activate 1 of this Digimon's");
        expect(tile.textContent).not.toContain("You may place 1 of each player's Digimon");
      }
    },
  );

  it("shows only Richard Sampson's security-trash sentence for its bracketless timing", () => {
    const effectText = getCardDefinition("BT13-098")?.effectText;
    const { container } = renderDecision({
      decisionId: "sampson-play-from-security",
      seat: 0,
      kind: "optional",
      promptText: "Play without paying the cost",
      sourceCardId: "BT13-098",
      options: { timing: "OnDiscardSecurity", effectText },
    });
    const text = container.textContent ?? "";
    expect(text).toContain(
      "When an effect trashes this card from the security stack, you may play this card without paying the cost.",
    );
    expect(text).not.toContain("Start of Your Main Phase");
    expect(text).not.toContain("by suspending this Tamer");
  });

  it("gives Kentaurosmon's two [When Digivolving] entries their own printed lines when no description arrives", () => {
    const { container } = renderDecision({
      decisionId: "kentaurosmon-two-evolution-effects",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      sourceCardId: "EX13-036",
      options: {
        triggerKeys: [
          buildTriggerKey("kentaurosmon", "EX13-036/ir-7-0"),
          buildTriggerKey("kentaurosmon", "EX13-036/EX13-036/place-one-each-as-security"),
        ],
        triggerCardIds: ["EX13-036", "EX13-036"],
        triggerTimings: ["WhenDigivolving", "WhenDigivolving"],
        triggerDescriptions: ["", ""],
      },
    });
    const tiles = screen.getAllByRole("button", { name: /Kentaurosmon/ });
    expect(tiles).toHaveLength(2);
    expect(tiles[0]!.textContent).toContain("you may activate 1 of this Digimon's");
    expect(tiles[0]!.textContent).not.toContain("place 1 of each player's Digimon");
    expect(tiles[1]!.textContent).toContain("You may place 1 of each player's Digimon as the top security cards.");
    expect(tiles[1]!.textContent).not.toContain("you may activate 1 of this Digimon's");
    expect(container.textContent).toContain("[End of Attack]");
  });

  it("shows Airdramon's suspension watcher as its own [Your Turn] sentence, not the cost reducer before it", () => {
    const printed = getCardDefinition("LM-009")!.effectText!;
    const description = printed.slice(printed.indexOf("[Your Turn]", printed.indexOf("[Your Turn]") + 1)).trim();
    renderDecision({
      decisionId: "airdramon-suspended",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      sourceCardId: "LM-009",
      options: {
        triggerKeys: [buildTriggerKey("airdramon", "subtrigger/1/whenSuspended")],
        triggerCardIds: ["LM-009"],
        triggerTimings: ["YourTurn"],
        triggerDescriptions: [description],
      },
    });
    const tile = screen.getByRole("button", { name: /Airdramon/ });
    expect(tile.textContent).toContain("When this Digimon becomes suspended");
    expect(tile.textContent).not.toContain("would be played");
  });

  it("localizes the printed/alternate digivolution requirement choices and keeps the cost", () => {
    const t = translator("pt-BR");
    expect(choiceLabel({ choice: "Printed digivolution requirement (cost 4)", t })).toBe(
      "Requisito de digivolução impresso (custo 4)",
    );
    expect(choiceLabel({ choice: "Alternate digivolution requirement (cost 3)", t })).toBe(
      "Requisito de digivolução alternativo (custo 3)",
    );
    expect(choiceLabel({ choice: "Some other choice", t })).toBe("Some other choice");
  });
});

it("offers each printed bullet as a full-text option under the clause's lead-in", () => {
  const digivolveBullet =
    "1 of your [Gabumon] may digivolve into [MetalGarurumon] in the hand, ignoring digivolution requirements and without paying the cost.";
  const deleteBullet = "Delete 1 of your opponent's Digimon with the lowest DP.";
  const { onRespond } = renderDecision({
    decisionId: "wargreymon-modal",
    seat: 0,
    kind: "chooseOption",
    promptText: "WarGreymon",
    sourceCardId: "BT22-013",
    options: {
      choices: ["Digivolve", "Delete 1 target(s)"],
      choiceClauses: [digivolveBullet, deleteBullet],
      timing: "WhenDigivolving",
      effectText: getCardDefinition("BT22-013")!.effectText,
    },
  });
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelector(".decision-overlay__effect-text")?.textContent).toBe(
    "[When Digivolving] Activate 1 of the effects below:",
  );
  expect(screen.queryByRole("button", { name: /^Delete 1 target/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Delete 1 of your opponent's Digimon with the lowest DP/ }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 1 });
  expect(screen.getByRole("button", { name: /may digivolve into/ })).toBeTruthy();
});

it("keeps the decline entry apart from the printed bullets", () => {
  const { onRespond } = renderDecision({
    decisionId: "optional-modal",
    seat: 0,
    kind: "chooseOption",
    promptText: "WarGreymon",
    sourceCardId: "BT22-013",
    options: {
      choices: ["Digivolve", "Delete 1 target(s)", "Don't use"],
      choiceClauses: ["First bullet text.", "Second bullet text.", ""],
      declineIndex: 2,
      timing: "WhenDigivolving",
      effectText: getCardDefinition("BT22-013")!.effectText,
    },
  });
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Don't use" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseOption", optionIndex: 2 });
});

describe("a color-scaled choice whose bullet has an optional By cost", () => {
  const colorClause = "Then, for every 2 of your Digimon and Tamers' colors, activate 1 effect below:";
  const battleBullet = "This Digimon may battle 1 of your opponent's Digimon.";
  const recoveryBullet = "By returning 5 cards from your opponent's trash to the bottom of the deck, ＜Recovery +1＞";
  const effectText = `[On Play] [When Digivolving] 1 of your Digimon may attack without suspending. ${colorClause}\n・${battleBullet}\n・${recoveryBullet}`;
  const renderMerciful = () =>
    renderDecision({
      decisionId: "merciful-color-activation",
      seat: 0,
      kind: "chooseOption",
      promptText: "Omnimon: Merciful Mode",
      sourceCardId: "EX13-077",
      options: {
        choices: ["Battle", "Recovery +1"],
        choiceClauses: [battleBullet, recoveryBullet],
        timing: "OnPlay",
        effectText,
        effectTextPart: effectText,
        effectTextEmphasis: colorClause,
      },
    });
  const trashCards = ["t1", "t2", "t3", "t4", "t5"];
  const renderRecoveryCost = (declinesCost: boolean) => {
    const onRespond = vi.fn<(response: unknown) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "merciful-recovery-cost",
            seat: 0,
            kind: "selectCards",
            promptText: "Omnimon: Merciful Mode",
            sourceCardId: "EX13-077",
            options: {
              candidateInstanceIds: trashCards,
              min: 5,
              max: 5,
              purpose: "cost",
              ...(declinesCost ? { declinesCost } : {}),
              timing: "OnPlay",
              effectText,
            },
          }}
          sourceCardId="EX13-077"
          candidates={trashCards.map((instanceId) => ({ instanceId, cardId: "BT1-009", sourceCount: 0 }))}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );
    return { onRespond };
  };

  it("emphasizes the color clause and offers no Don't use on the option chooser", () => {
    renderMerciful();
    expect(document.querySelector(".decision-overlay__effect-text strong")?.textContent).toBe(colorClause);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Don't use/ })).toBeNull();
  });

  it("declines the Recovery cost from its selection footer while the pick stays exact", () => {
    const { onRespond } = renderRecoveryCost(true);
    expect(screen.queryByRole("button", { name: "None" })).toBeNull();
    expect((screen.getByRole("button", { name: "Confirm targets" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Don't use" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: [] });
  });

  it("offers no Don't use on a mandatory cost selection", () => {
    renderRecoveryCost(false);
    expect(screen.queryByRole("button", { name: "Don't use" })).toBeNull();
  });

  it("shows which scaled activation is being chosen", () => {
    renderDecision({
      decisionId: "merciful-second-activation",
      seat: 0,
      kind: "chooseOption",
      promptText: "Omnimon: Merciful Mode",
      sourceCardId: "EX13-077",
      options: {
        choices: ["Recovery +1"],
        choiceClauses: [recoveryBullet],
        activation: { index: 2, total: 2 },
        effectText,
        effectTextPart: effectText,
        effectTextEmphasis: colorClause,
      },
    });
    expect(screen.getByText("Activation 2 of 2")).toBeTruthy();
  });

  it("omits the activation counter without a scaled activation", () => {
    renderMerciful();
    expect(screen.queryByText(/^Activation \d+ of \d+$/)).toBeNull();
  });
});

it.each(["Add 1 yellow card with the [Data] trait", "1 card with the [Witchelny] trait among them to the hand."])(
  "Discord 1556041043550408755: identifies the Candlemon selection category: %s",
  (effectTextPart) => {
    renderDecision({
      decisionId: "candlemon-reveal-category",
      seat: 0,
      kind: "selectCards",
      promptText: "Candlemon",
      sourceCardId: "BT18-030",
      options: { timing: "OnPlay", min: 1, max: 1, effectTextPart },
    });
    expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(effectTextPart);
    expect(screen.queryByText(/Return the rest to the bottom/)).toBeNull();
  },
);

it("uses a concise attack heading even when the engine supplies its forced-attack prompt", () => {
  renderDecision({
    decisionId: "forced-attack-heading",
    seat: 0,
    kind: "chooseTargets",
    promptText: "Choose the attack target for the forced attack.",
    options: { selectionContext: "attackTarget", candidateInstanceIds: ["player"], min: 1, max: 1 },
  });
  expect(screen.getByRole("heading", { name: "Attack" })).toBeTruthy();
  expect(screen.queryByText("Choose the attack target for the forced attack.")).toBeNull();
});

it.each([0, 1] as const)("GitHub #5347: seat %i sees P-220's separate optional deletion clause", (seat) => {
  const { onRespond } = renderDecision({
    decisionId: "p220-delete",
    seat,
    kind: "chooseTargets",
    promptText: "Millenniummon",
    sourceCardId: "P-220",
    options: {
      timing: "OnPlay",
      effectText:
        "[On Play] [When Digivolving] ＜De-Digivolve 2＞ 1 of your opponent's Digimon. Then, you may delete 1 Digimon.",
      effectTextPart: "Then, you may delete 1 Digimon.",
      purpose: "optionalTarget",
      targetFate: "delete",
      candidateInstanceIds: ["own", "opponent"],
      min: 0,
      max: 1,
    },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe("Then, you may delete 1 Digimon.");
  fireEvent.click(screen.getByRole("button", { name: "None" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: [] });
});

it("#60 visibly identifies the copy trashed from LadyDevimon's sources and sends its exact identity", () => {
  const onTogglePick = vi.fn<(instanceId: string) => void>();
  render(
    <I18nProvider>
      <DecisionOverlay
        request={{
          decisionId: "source-copy",
          seat: 0,
          kind: "selectCards",
          promptText: "Choose an Option",
          options: { candidateInstanceIds: ["old-shot", "source-shot"], min: 1, max: 1 },
        }}
        candidates={[
          { instanceId: "old-shot", cardId: "EX7-071", zone: "trash" },
          { instanceId: "source-shot", cardId: "EX7-071", zone: "trash", trashOriginCardId: "BT25-083" },
        ]}
        picks={[]}
        onTogglePick={onTogglePick}
        onRespond={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("button", { name: "Hurricane Screw Shot, copy 1 of 2" }).textContent).toContain(
    "copy 1 of 2",
  );
  expect(screen.getByRole("button", { name: /copy 2 of 2/ }).textContent).toContain("copy 2 of 2");
  expect(screen.getByText("Trashed from LadyDevimon’s sources")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Trashed from LadyDevimon’s sources/ }));
  expect(onTogglePick).toHaveBeenCalledWith("source-shot");
});

it.each([
  "By trashing your top security card",
  "You may play 1 purple or yellow Digimon card with 6000 DP or less from your hand or trash without paying the cost.",
])("keeps Mastemon's complete clause on the left and emphasizes its current step: %s", (effectTextEmphasis) => {
  const clause =
    "[When Digivolving] [When Attacking] [Once Per Turn] By trashing your top security card, you may play 1 purple or yellow Digimon card with 6000 DP or less from your hand or trash without paying the cost.";
  const { onRespond } = renderDecision({
    decisionId: "mastemon-step",
    seat: 0,
    kind: "optional",
    sourceCardId: "P-187",
    promptText: "Use this effect?",
    options: { timing: "WhenDigivolving", effectText: clause, effectTextPart: clause, effectTextEmphasis },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(clause);
  expect(document.querySelector(".decision-overlay__effect-text strong")?.textContent?.toLowerCase()).toBe(
    effectTextEmphasis.toLowerCase(),
  );
  expect(screen.getByRole("dialog").getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});

it.each(["before", "after"] as const)("shows the full staged Ryutaro effect with its %s passage in bold", (stage) => {
  const full = cardEffectClauseForTiming("EX11-056", "AllTurns")!;
  const boundary = full.indexOf(" After,");
  const passage = stage === "before" ? full.slice(0, boundary) : full.slice(boundary + 1);
  const { onRespond } = renderDecision({
    decisionId: `ryutaro-staged-${stage}`,
    seat: 0,
    kind: "optional",
    sourceCardId: "EX11-056",
    promptText: "Use this effect?",
    options: { timing: "AllTurns", effectText: full, effectTextPart: passage, effectTextEmphasis: passage },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(full);
  expect(document.querySelector(".decision-overlay__effect-text strong")?.textContent).toBe(passage);
  expect(screen.getByRole("dialog").getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(screen.getByRole("button", { name: "No, decline" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: false });
});

it.each([
  {
    kind: "chooseTargets" as const,
    effectTextEmphasis: "[When Digivolving] Delete up to 10000 DP total worth of your opponent's Digimon.",
    candidate: "target",
  },
  { kind: "selectCards" as const, effectTextEmphasis: "Then, this Digimon may attack.", candidate: "player" },
])("keeps Gallantmon's full effect and emphasizes its $kind step", ({ kind, effectTextEmphasis, candidate }) => {
  const effectText =
    "[When Digivolving] Delete up to 10000 DP total worth of your opponent's Digimon. Then, this Digimon may attack.";
  renderDecision({
    decisionId: "gallantmon-current-step",
    seat: 0,
    kind,
    sourceCardId: "AD1-008",
    promptText: "Gallantmon",
    options: {
      timing: "WhenDigivolving",
      effectText,
      effectTextPart: effectTextEmphasis,
      effectTextEmphasis,
      candidateInstanceIds: [candidate],
      min: 1,
      max: 1,
    },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(effectText);
  expect(document.querySelector(".decision-overlay__effect-step")?.textContent).toBe(effectTextEmphasis);
});

it.each([
  {
    timing: "WhenDigivolving",
    passage:
      "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] You may suspend 1 of your opponent's Digimon or Tamers.",
  },
  {
    timing: "WhenDigivolving",
    passage: "Then, 1 of their Digimon or Tamers can't unsuspend until their turn ends.",
  },
  {
    timing: "AllTurns",
    passage:
      "[All Turns] [Once Per Turn] When effects play or digivolve any Digimon, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
  },
  {
    timing: "AllTurns",
    passage: "Then, this Digimon may battle 1 of your opponent's Digimon.",
  },
])("highlights Callismon's current effect passage: $passage", ({ timing, passage }) => {
  const effectText = cardEffectClauseForTiming("BT25-058", timing)!;
  renderDecision({
    decisionId: "callismon-current-step",
    seat: 0,
    kind: "chooseTargets",
    sourceCardId: "BT25-058",
    promptText: "Callismon",
    options: {
      timing,
      effectText,
      effectTextPart: passage,
      effectTextEmphasis: passage,
      candidateInstanceIds: ["target"],
      min: 1,
      max: 1,
    },
  });
  expect(document.querySelector(".decision-overlay__effect-step")?.textContent).toBe(passage);
});

it.each([
  "by suspending this Tamer",
  "you may play 1 [Gabumon] if that Digimon has [Greymon] in its name or 1 [Agumon] if it has [Garurumon] in its name from your hand or trash without paying the cost.",
])("distinguishes Nokia's optional stages with the current printed passage: %s", (effectTextEmphasis) => {
  const clause = cardEffectClauseForTiming("EX13-067", "YourTurn")!;
  const { onRespond } = renderDecision({
    decisionId: "nokia-optional-stage",
    seat: 0,
    kind: "optional",
    sourceCardId: "EX13-067",
    promptText: "Use this effect?",
    options: {
      timing: "YourTurn",
      effectText: clause,
      effectTextPart: effectTextEmphasis,
      effectTextEmphasis,
    },
  });
  expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(clause);
  expect(document.querySelector(".decision-overlay__effect-text strong")?.textContent).toBe(effectTextEmphasis);
  fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});

it.each(["Then, by trashing your top security card", "1 of your Digimon may attack"])(
  "emphasizes Mistymon's current optional step: %s",
  (effectTextEmphasis) => {
    const clause =
      "[On Play] [When Digivolving] You may place 1 [Witchelny] text card from your hand as the bottom security card. Then, by trashing your top security card, 1 of your Digimon may attack.";
    renderDecision({
      decisionId: "mistymon-step",
      seat: 0,
      kind: "optional",
      sourceCardId: "EX13-033",
      promptText: "Use this effect?",
      options: { timing: "OnPlay", effectText: clause, effectTextPart: clause, effectTextEmphasis },
    });
    expect(document.querySelector(".decision-overlay__effect-text")?.textContent).toBe(clause);
    expect(document.querySelector(".decision-overlay__effect-text strong")?.textContent).toBe(effectTextEmphasis);
  },
);

it.each([true, false])(
  "Material Save explicitly activates or declines without a target selection, accepted=%s",
  (accepted) => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "material-save-activation",
            seat: 0,
            kind: "selectCards",
            promptText: "＜Material Save 4＞: place the specified digivolution cards under one of your Tamers?",
            sourceCardId: "BT11-019",
            options: {
              candidateInstanceIds: ["starmons"],
              visibleInstanceIds: ["starmons", "ballistamon", "zeiggreymon", "omnishoutmon"],
              min: 0,
              max: 1,
              selectionContext: "materialSaveActivation",
            },
          }}
          sourceCardId="BT11-019"
          candidates={[
            { instanceId: "starmons", cardId: "BT10-029", selectable: true },
            { instanceId: "ballistamon", cardId: "BT19-047", selectable: false },
            { instanceId: "zeiggreymon", cardId: "AD1-013", selectable: false },
            { instanceId: "omnishoutmon", cardId: "BT11-015", selectable: false },
          ]}
          picks={[]}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={onRespond}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Confirm targets" })).toBeNull();
    expect(screen.queryByRole("button", { name: "None" })).toBeNull();
    expect(screen.getByRole("img", { name: "Ballistamon" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "ZeigGreymon" })).toBeTruthy();
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: accepted ? "Yes, activate" : "No, decline" }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({
      kind: "selectCards",
      instanceIds: accepted ? ["starmons"] : [],
    });
  },
);
