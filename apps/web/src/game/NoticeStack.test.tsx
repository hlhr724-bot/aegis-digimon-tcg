// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { CardOpenerProvider } from "./cardLinks";
import { NoticeStack } from "./NoticeStack";
import { NOTICE_LIFETIME_MS, type MatchNotice } from "./notices";
import { Side } from "./side";

afterEach(cleanup);

it.each([
  {
    cardId: "AD1-011",
    timing: "WhenWouldLeaveBattleArea",
    isInherited: true,
    expected: "＜分裂＞：可以不支付费用登场指定的进化源卡牌。",
    description: "＜Partition＞: you may play the specified digivolution cards without paying their costs.",
    effectTextPart: undefined,
  },
  {
    cardId: "BT16-025",
    timing: "WhenWouldLeaveBattleArea",
    isInherited: true,
    expected: "＜分裂＞：可以不支付费用登场指定的进化源卡牌。",
    description: "＜Partition＞: you may play the specified digivolution cards without paying their costs.",
    effectTextPart: undefined,
  },
  {
    cardId: "BT16-025",
    timing: "WhenWouldLeaveBattleArea",
    expected: "＜分裂＞：可以不支付费用登场指定的进化源卡牌。",
    description: "＜Partition＞: you may play the specified digivolution cards without paying their costs.",
    effectTextPart: undefined,
  },
  {
    cardId: "BT10-008",
    timing: "OnPlay",
    expected: "3张卡牌",
    description: undefined,
    effectTextPart: "Add 1 Digimon card",
  },
  { cardId: "BT3-093", timing: "OnPlay", expected: "1张蓝色", description: undefined, effectTextPart: "Add 1 blue" },
  { cardId: "EX6-025", timing: "OnPlay", expected: "沙悟兽", description: undefined, effectTextPart: "[Sagomon]" },
  { cardId: "EX13-077", timing: "OnPlay", expected: "每有2种颜色", description: undefined, effectTextPart: undefined },
  {
    cardId: "AD1-008",
    timing: "WhenDigivolving",
    expected: "[进化时] ＜进击＞",
    description: "[When Digivolving] ＜Blitz＞",
    effectTextPart: undefined,
  },
  {
    cardId: "AD1-003",
    timing: "OnPlay",
    expected: "6000",
    description: undefined,
    effectTextPart: "Then, you may delete 1 of your opponent's Digimon with 6000 DP or less.",
  },
])("renders translated notice context for $cardId", async ({ expected, ...body }) => {
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <NoticeStack
        notice={notice({ body: { variant: "effect", ...body } })}
        remainingMs={NOTICE_LIFETIME_MS}
        onDismiss={() => undefined}
      />
    </I18nContext.Provider>,
  );
  const getClause = () => document.querySelector(".match-notice__text");
  await waitFor(() => expect(getClause()?.textContent).toContain(expected));
  expect(getClause()?.textContent).not.toMatch(/When Digivolving|On Play|Then,|for every/);
  expect(getClause()?.querySelector(".card-effect-text")?.getAttribute("data-translation-status")).toBe("complete");
});

function notice(overrides: Partial<MatchNotice> = {}): MatchNotice {
  return {
    id: "n1",
    side: Side.Viewer,
    fromSecurity: false,
    body: { variant: "effect", cardId: "BT1-010", timing: "OnPlay", description: "Draw 1 card." },
    createdAt: 0,
    ...overrides,
  };
}

function renderNotice(
  shown: MatchNotice = notice(),
  props: Partial<Parameters<typeof NoticeStack>[0]> = {},
  onDismiss: (id: string) => void = () => undefined,
) {
  return render(
    <I18nProvider>
      <NoticeStack notice={shown} remainingMs={NOTICE_LIFETIME_MS} onDismiss={onDismiss} {...props} />
    </I18nProvider>,
  );
}

describe("NoticeStack", () => {
  it.each([
    ["AD1-009", "退化3"],
    ["AD1-012", "Lv.数值最低"],
    ["AD1-025", "卡组最下方"],
  ])("shows the resolving Assembly card effect rather than an adjacent paragraph for %s", async (cardId, expected) => {
    render(
      <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
        <NoticeStack
          notice={notice({ body: { variant: "effect", cardId, timing: "OnPlay" } })}
          remainingMs={NOTICE_LIFETIME_MS}
          onDismiss={() => undefined}
        />
      </I18nContext.Provider>,
    );
    const getText = () => screen.getByTestId("match-notice").querySelector(".match-notice__text")?.textContent;
    await waitFor(() => expect(getText()).toContain(expected));
    expect(getText()).not.toContain("[组装");
  });

  it("translates the resolving Main clause from a complete Chinese option-card entry", async () => {
    render(
      <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
        <NoticeStack
          notice={notice({ body: { variant: "effect", cardId: "LM-034", timing: "Main" } })}
          remainingMs={NOTICE_LIFETIME_MS}
          onDismiss={() => undefined}
        />
      </I18nContext.Provider>,
    );
    const shown = screen.getByTestId("match-notice");
    await waitFor(() =>
      expect(shown.querySelector(".match-notice__text")?.textContent).toContain("蓝色/红色数码宝贝卡牌"),
    );
    const text = shown.querySelector(".match-notice__text")!.textContent;
    expect(text).toContain("此后，将此卡牌置于战斗区。");
    expect(text).not.toContain("Reveal");
    expect(text).not.toContain("延迟");
    expect(text).not.toContain("内存值");
    expect(shown.querySelector('mark[data-kind="timing"]')?.textContent).toBe("[主要]");
  });

  it.each(["OnPlay", "WhenDigivolving"])(
    "translates TigerVespamon's security placement clause for %s",
    async (timing) => {
      render(
        <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
          <NoticeStack
            notice={notice({
              body: {
                variant: "effect",
                cardId: "BT23-045",
                timing,
                description:
                  "By placing 1 [Royal Base] or [Zaxon] trait Digimon card from your hand or trash face up as the bottom security card, return 1 of your opponent's Digimon with as much or less DP as this Digimon to the hand.",
              },
            })}
            remainingMs={NOTICE_LIFETIME_MS}
            onDismiss={() => undefined}
          />
        </I18nContext.Provider>,
      );
      const shown = screen.getByTestId("match-notice");
      const getText = () => shown.querySelector(".match-notice__text")?.textContent;
      await waitFor(() => expect(getText()).toContain("正面朝上置于安防区最下方"));
      expect(getText()).toContain("将对方1只DP不高于此数码宝贝DP的数码宝贝放回到其手牌中。");
      expect(getText()).not.toContain("By placing");
    },
  );

  it("shows the resolving clause under its printed timing label", () => {
    renderNotice(
      notice({
        body: {
          variant: "effect",
          cardId: "BT26-059",
          timing: "OnPlay",
          description: "Trash 1, then play a Titan with cost reduced by 7.",
        },
      }),
    );
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("On Play");
    expect(shown.textContent).toContain("This effect can't play [Plutomon].");
  });

  it("slices the attacking clause when the engine names the timing by its enum key", () => {
    // BT24-016 prints a [Hand] [Main] clause before its [When Digivolving] [When Attacking]
    // one; the engine announces the attack as "OnUseAttack" with an internal description.
    renderNotice(
      notice({
        body: {
          variant: "effect",
          cardId: "BT24-016",
          timing: "OnUseAttack",
          description: "[WhenAttacking] Security manipulation, Security manipulation",
        },
      }),
    );
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("When Attacking");
    expect(shown.textContent).toContain("Your opponent places 1 card from their hand as the bottom security card.");
    expect(shown.textContent).not.toContain("[Hand]");
  });

  it("replaces mixed security action summaries with the printed attacking clause", () => {
    renderNotice(
      notice({
        body: {
          variant: "effect",
          cardId: "BT24-016",
          timing: "OnUseAttack",
          description: "[WhenAttacking] SecurityManipulation, Trash 1 of opponent's top security card(s)",
        },
      }),
    );
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("Your opponent places 1 card from their hand as the bottom security card.");
    expect(shown.textContent).not.toContain("SecurityManipulation");
    expect(shown.textContent).not.toContain("card(s)");
  });

  it("marks whose moment it is, so the slot it sits in can be read at a glance", () => {
    renderNotice(notice({ side: Side.Opponent }));
    expect(screen.getByTestId("match-notice").getAttribute("data-side")).toBe("opp");
  });

  it("erodes its border over exactly the time the queue is holding it for", () => {
    const { container } = renderNotice(notice(), { remainingMs: 1234 });
    expect((container.querySelector(".match-notice__erode") as HTMLElement).style.animationDuration).toBe("1234ms");
  });

  it("pauses the eroding border while a decision holds the clock", () => {
    renderNotice(notice(), { held: true });
    expect(screen.getByTestId("match-notice-stack").getAttribute("data-held")).toBe("true");
  });

  it("always prints the clause, on every layout", () => {
    // It is the one thing on the notice the player cannot read off the board, and the
    // phone's slot now shows one moment at a time, so there is room for it.
    renderNotice(
      notice({
        body: {
          variant: "effect",
          cardId: "BT26-059",
          timing: "OnPlay",
          description: "Trash 1, then play a Titan with cost reduced by 7.",
        },
      }),
    );
    expect(screen.getByTestId("match-notice").textContent).toContain("This effect can't play [Plutomon].");
    expect(screen.queryByRole("button", { name: /effect text$/ })).toBeNull();
  });

  it("keeps Engage's complete keyword explanation in the text toast", () => {
    renderNotice(
      notice({
        body: {
          variant: "effect",
          cardId: "BT26-016",
          timing: "EndOfYourTurn",
          description: "＜Engage＞: at the end of this turn, this Digimon may attack.",
        },
      }),
    );

    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("＜Engage＞: at the end of this turn, this Digimon may attack.");
  });

  it("names a recovery without exposing the card behind it", () => {
    renderNotice(notice({ body: { variant: "recovery", amount: 2 } }));
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("Recovery +2");
    expect(shown.querySelector("img")).toBeNull();
  });

  it("marks a refused action apart from the rest", () => {
    renderNotice(notice({ body: { variant: "rejection", reason: "Not enough memory." } }));
    const shown = screen.getByTestId("match-notice");
    expect(shown.getAttribute("data-variant")).toBe("rejection");
    expect(shown.textContent).toContain("Not enough memory.");
  });

  it("tells the viewer how much time is left on their clock", () => {
    renderNotice(notice({ body: { variant: "timeWarning", seconds: 60 } }));
    expect(screen.getByTestId("match-notice").getAttribute("data-variant")).toBe("timeWarning");
    expect(screen.getByTestId("match-notice").textContent).toContain("1 minute left");
    cleanup();

    renderNotice(notice({ body: { variant: "timeWarning", seconds: 30 } }));
    expect(screen.getByTestId("match-notice").textContent).toContain("30 seconds left");
  });

  it("names the card behind an effect and opens it", () => {
    const opened: string[] = [];
    render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={(cardId) => opened.push(cardId)}>
          <NoticeStack notice={notice()} remainingMs={NOTICE_LIFETIME_MS} onDismiss={() => undefined} />
        </CardOpenerProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Agumon (BT1-010)" }));
    expect(opened).toEqual(["BT1-010"]);
  });

  it("keeps the name plain when there is nowhere to open a card", () => {
    renderNotice();
    expect(screen.getByTestId("match-notice").textContent).toContain("Agumon");
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
  });

  it("names a card the definitions do not know without showing its id", () => {
    renderNotice(
      notice({ body: { variant: "effect", cardId: "ZZ9-999", timing: "OnPlay", description: "Draw 1 card." } }),
    );
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("Card");
    expect(shown.textContent).not.toContain("ZZ9-999");
  });

  it("shows DigiXros materials and marks the notice with the mechanic tone", () => {
    renderNotice(
      notice({
        body: {
          variant: "keyword",
          keyword: "digiXros",
          cardId: "BT10-066",
          materialCardIds: ["BT10-049", "BT10-060"],
        },
      }),
    );
    const shown = screen.getByTestId("match-notice");
    expect(shown.dataset.keyword).toBe("digiXros");
    expect(screen.getByLabelText("DigiXros materials").children).toHaveLength(2);
  });

  it("shows Guard's full text without saved-it copy or a repeated card name", () => {
    renderNotice(notice({ body: { variant: "keyword", keyword: "guard", cardId: "EX12-008" } }));
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain("＜Guard＞");
    expect(shown.textContent).not.toContain("saved it");
    expect(shown.textContent).not.toContain("ToyAgumon");
    expect(shown.textContent).toContain(
      "By deleting this Digimon, prevent your other Digimon from leaving the battle area by an opponent's effect.",
    );
  });

  it.each([
    "digiXros",
    "cannotAttack",
    "cannotBlock",
    "scapegoat",
    "decoy",
    "guard",
    "fragment",
    "armorPurge",
  ] as const)("shows the %s keyword without repeating the card name next to its art", (keyword) => {
    renderNotice(notice({ body: { variant: "keyword", keyword, cardId: "EX12-008" } }));
    expect(screen.getByTestId("match-notice").textContent).not.toContain("ToyAgumon");
  });

  it.each([
    ["scapegoat", "by deleting 1 of your other Digimon"],
    ["decoy", "by deleting this Digimon"],
    ["fragment", "required number of this Digimon's digivolution cards"],
    ["armorPurge", "by trashing its top card"],
  ] as const)("shows the full %s prevention text", (keyword, expected) => {
    renderNotice(notice({ body: { variant: "keyword", keyword, cardId: "EX12-008" } }));
    const shown = screen.getByTestId("match-notice");
    expect(shown.textContent).toContain(expected);
    expect(shown.textContent).not.toContain("saved it");
  });

  it("advances to the next moment through its close button", () => {
    const onDismiss = vi.fn<(id: string) => void>();
    renderNotice(notice(), {}, onDismiss);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(onDismiss).toHaveBeenCalledWith("n1");
  });
});

it("highlights the printed timing markers in Plutomon's effect notice", () => {
  renderNotice(
    notice({
      side: Side.Opponent,
      body: { variant: "effect", cardId: "BT26-059", timing: "AllTurns", description: "whenHandTrashed" },
    }),
  );
  const shown = screen.getByTestId("match-notice");
  expect(Array.from(shown.querySelectorAll("mark")).map((mark) => mark.textContent)).toEqual([
    "[All Turns]",
    "[Once Per Turn]",
  ]);
  expect(shown.textContent).toContain(
    "When hands are trashed from, you may delete all of your opponent's lowest level Digimon.",
  );
});

describe("NoticeStack stack strip", () => {
  it("says which card trashed the top of your Digimon", () => {
    renderNotice(
      notice({
        body: { variant: "stackStrip", reason: "trashTop", cardId: "EX13-035", sourceCardId: "BT25-025" },
      }),
    );
    expect(screen.getByText("Top card trashed")).toBeTruthy();
    expect(
      screen.getByText("Aegiochusmon: Blue (BT25-025) trashed your KingEtemon (EX13-035) from the top of its Digimon"),
    ).toBeTruthy();
  });

  it("names the opponent's card when the stripped permanent is theirs", () => {
    renderNotice(
      notice({
        side: Side.Opponent,
        body: { variant: "stackStrip", reason: "trashTop", cardId: "EX13-035", sourceCardId: "BT25-025" },
      }),
    );
    expect(screen.getByText("Top card trashed")).toBeTruthy();
    expect(
      screen.getByText(
        "Aegiochusmon: Blue (BT25-025) trashed the opponent's KingEtemon (EX13-035) from the top of its Digimon",
      ),
    ).toBeTruthy();
  });

  it("draws an inherited clause with its own card's printing, not the host's top card", () => {
    renderNotice(
      notice({
        body: {
          variant: "effect",
          cardId: "EX9-018",
          artId: "EX9-018_P1",
          timing: "EndOfYourTurn",
          description: "[End of Your Turn] [Once Per Turn] 1 of your Digimon unsuspends.",
          isInherited: true,
        },
      }),
    );
    const art = screen.getByTestId("match-notice").querySelector("img");
    expect(art?.getAttribute("src")).toContain("EX9-018_P1");
    expect(art?.getAttribute("src")).not.toContain("EX13-063");
  });
});

it.each([
  "[When Digivolving] Delete up to 10000 DP total worth of your opponent's Digimon. Then, this Digimon may attack.",
  "[When Digivolving] [When Attacking] [Once Per Turn] Delete 1 of your opponent's lowest DP Digimon.",
  "[When Digivolving] ＜Blitz＞",
])("keeps Gallantmon's separate pending effects distinct: %s", (description) => {
  renderNotice(notice({ body: { variant: "effect", cardId: "AD1-008", timing: "WhenDigivolving", description } }));
  expect(document.querySelector(".match-notice__text")?.textContent).toBe(description);
});

it("renders a manual signal through the standard effect toast and opens the source card", () => {
  const onOpenCard = vi.fn<(cardId: string, artId?: string) => void>();
  const shown = notice({
    body: { variant: "effect", cardId: "BT1-010", manualSignalText: "First signals an effect · Effect target: Second" },
  });
  render(
    <I18nProvider>
      <CardOpenerProvider onOpenCard={onOpenCard}>
        <NoticeStack notice={shown} remainingMs={NOTICE_LIFETIME_MS} onDismiss={() => undefined} />
      </CardOpenerProvider>
    </I18nProvider>,
  );
  expect(screen.getByTestId("match-notice").getAttribute("data-variant")).toBe("effect");
  expect(screen.getByText("First signals an effect · Effect target: Second")).toBeTruthy();
  expect(screen.getByText("Effect signal")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open Agumon (BT1-010)" }));
  expect(onOpenCard).toHaveBeenCalledWith("BT1-010", undefined);
});
