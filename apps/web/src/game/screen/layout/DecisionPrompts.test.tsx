// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CardInstance, Permanent, type DecisionResponse } from "@aegis/shared";
import { I18nProvider } from "../../../i18n";
import { DecisionPrompts } from "./DecisionPrompts";

afterEach(cleanup);

it.each([false, true])(
  "explains the second Tai & Matt activation during an attack on the board/dialog (%s)",
  (answerOnBoard) => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionPrompts
          decision={{
            decisionId: "dec-44",
            seat: 0,
            kind: "optional",
            promptText: "Attack with a Digimon",
            sourceCardId: "BT17-081",
            options: { selectionContext: "attackSource", timing: "EndOfYourTurn", promptKey: "attackAlreadyResolving" },
          }}
          answerOnBoard={answerOnBoard}
          permanents={[]}
          sourceCardId="BT17-081"
          candidates={[]}
          allowsPick={() => true}
          picks={[]}
          min={0}
          max={1}
          triggerDetails={[]}
          opponentSecurityCount={5}
          onTogglePick={() => {}}
          onRespond={onRespond}
          onOpenDialog={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Another attack cannot start while this attack is resolving.")).toBeTruthy();
    expect(screen.queryByText("Attack with a Digimon")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: answerOnBoard ? "Use" : "Yes, activate" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
    fireEvent.click(screen.getByRole("button", { name: answerOnBoard ? "Don't use" : "No, decline" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: false });
  },
);

it("reuses the Assembly material overlay for an effect-driven play", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nProvider>
      <DecisionPrompts
        decision={{
          decisionId: "assembly-decision",
          seat: 0,
          kind: "selectCards",
          promptText: "Wizardmon",
          sourceCardId: "BT26-067",
          options: {
            candidateInstanceIds: ["dobermon-trash"],
            visibleInstanceIds: ["dobermon-trash"],
            min: 0,
            max: 1,
            assemblyCardId: "BT26-073",
          },
        }}
        answerOnBoard={false}
        permanents={[]}
        sourceCardId="BT26-067"
        candidates={[{ instanceId: "dobermon-trash", cardId: "BT26-069", zone: "trash" }]}
        allowsPick={() => true}
        picks={[]}
        min={0}
        max={1}
        triggerDetails={[]}
        opponentSecurityCount={5}
        onTogglePick={() => {}}
        onRespond={onRespond}
        onOpenDialog={() => {}}
      />
    </I18nProvider>,
  );

  expect(screen.getByRole("dialog", { name: "＜Assembly＞ Aegiochusmon: Dark" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Dobermon (trash)" }));
  fireEvent.click(screen.getByRole("button", { name: /Assembly \(1 card/ }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["dobermon-trash"] });
});

it("reuses the DigiXros material overlay for an effect-driven play", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nProvider>
      <DecisionPrompts
        decision={{
          decisionId: "digixros-decision",
          seat: 0,
          kind: "selectCards",
          promptText: "Hakubamon",
          sourceCardId: "EX12-043",
          options: {
            candidateInstanceIds: ["kakamon-hand"],
            visibleInstanceIds: ["kakamon-hand"],
            min: 0,
            max: 1,
            digiXrosCardId: "EX12-015",
          },
        }}
        answerOnBoard={false}
        permanents={[]}
        sourceCardId="EX12-043"
        candidates={[{ instanceId: "kakamon-hand", cardId: "EX12-006", zone: "hand" }]}
        allowsPick={() => true}
        picks={[]}
        min={0}
        max={1}
        triggerDetails={[]}
        opponentSecurityCount={5}
        onTogglePick={() => {}}
        onRespond={onRespond}
        onOpenDialog={() => {}}
      />
    </I18nProvider>,
  );

  expect(screen.getByRole("dialog", { name: "＜DigiXros＞ Gokuumon" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Resolve effect" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Kakamon \(hand\)/ }));
  fireEvent.click(screen.getByRole("button", { name: /DigiXros \(1 card\)/ }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["kakamon-hand"] });
});

it("labels a player-only attack target as an attack target instead of a hand selection", () => {
  render(
    <I18nProvider>
      <DecisionPrompts
        decision={{
          decisionId: "attack-target-decision",
          seat: 0,
          kind: "chooseTargets",
          promptText: "Choose an attack target.",
          options: {
            candidateInstanceIds: ["player"],
            selectionContext: "attackTarget",
            min: 1,
            max: 1,
          },
        }}
        answerOnBoard
        permanents={[]}
        sourceCardId={undefined}
        candidates={[{ instanceId: "player" }]}
        allowsPick={() => true}
        picks={[]}
        min={1}
        max={1}
        triggerDetails={[]}
        opponentSecurityCount={5}
        onTogglePick={() => {}}
        onRespond={() => {}}
        onOpenDialog={() => {}}
      />
    </I18nProvider>,
  );

  expect(screen.getByRole("region", { name: "Attack target" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Hand selection" })).toBeNull();
});

it("Discord 1555307552223264829: names the attacker and its only target, and confirms with Attack", () => {
  const grademon = new Permanent();
  grademon.permanentId = "perm-16";
  const top = new CardInstance();
  top.cardId = "EX13-057";
  grademon.topCard = top;
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nProvider>
      <DecisionPrompts
        decision={{
          decisionId: "dec-52",
          seat: 0,
          kind: "selectCards",
          promptText: "Choose the attack target for the forced attack.",
          sourceCardId: "EX13-060",
          sourcePermanentId: "perm-16",
          options: { candidateInstanceIds: ["player"], selectionContext: "attackTarget", min: 1, max: 1 },
        }}
        answerOnBoard
        permanents={[grademon]}
        sourceCardId="EX13-060"
        candidates={[{ instanceId: "player" }]}
        allowsPick={() => true}
        picks={["player"]}
        min={1}
        max={1}
        triggerDetails={[]}
        opponentSecurityCount={5}
        onTogglePick={() => {}}
        onRespond={onRespond}
        onOpenDialog={() => {}}
      />
    </I18nProvider>,
  );

  expect(screen.getByText("Grademon attacks. The only target is your opponent's security.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Attack" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["player"] });
});

it("shows Taiki and the DigiXros instruction when selecting a material-zone Tamer", () => {
  const effectText = "＜DigiXros＞: Select Tamers to suspend to use additional DigiXros materials, or pass.";
  const { container } = render(
    <I18nProvider>
      <DecisionPrompts
        decision={{
          decisionId: "taiki-digixros",
          seat: 0,
          kind: "selectCards",
          promptText: "Taiki Kudo",
          sourceCardId: "BT10-087",
          options: { candidateInstanceIds: ["taiki"], min: 0, max: 1, effectText },
        }}
        answerOnBoard={true}
        permanents={[]}
        sourceCardId="BT10-087"
        candidates={[{ instanceId: "taiki", cardId: "BT10-087" }]}
        allowsPick={() => true}
        picks={[]}
        min={0}
        max={1}
        triggerDetails={[]}
        opponentSecurityCount={5}
        onTogglePick={() => {}}
        onRespond={() => {}}
        onOpenDialog={() => {}}
      />
    </I18nProvider>,
  );
  expect(screen.getByTestId("board-prompt").textContent).toContain(effectText);
  expect(container.querySelector('img[src*="BT10-087"]')).toBeTruthy();
  expect(container.querySelector('img[src*="P-224"]')).toBeNull();
});

it("asks for a source host on the board, filters its cards, and returns without answering", () => {
  const hosts = ["first", "second"].map((id) => {
    const host = new Permanent();
    host.permanentId = id;
    host.topCard = new CardInstance();
    host.topCard.cardId = "ST1-07";
    host.currentDP = 6000;
    return host;
  });
  const onChooseHost = vi.fn<(permanentId: string) => void>();
  const onChangeHost = vi.fn<() => void>();
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  const props = {
    decision: {
      decisionId: "source-host",
      seat: 0 as const,
      kind: "selectCards" as const,
      promptText: "Play 1 digivolution card.",
      options: { candidateInstanceIds: ["a", "b"], min: 0, max: 1 },
    },
    answerOnBoard: false,
    permanents: hosts,
    sourceCardId: undefined,
    candidates: [
      { instanceId: "a", cardId: "ST1-03", zone: "digivolutionCards" as const },
      { instanceId: "b", cardId: "ST1-09", zone: "digivolutionCards" as const },
    ],
    allowsPick: () => true,
    picks: [],
    min: 0,
    max: 1,
    triggerDetails: [],
    opponentSecurityCount: 5,
    onTogglePick: vi.fn<(instanceId: string) => void>(),
    onRespond,
    onOpenDialog: vi.fn<() => void>(),
    sourceHost: {
      picking: true,
      cardIds: undefined as ReadonlySet<string> | undefined,
      hostPermanentIds: ["first", "second"],
      onChooseHost,
      onChangeHost,
    },
  };
  const view = render(
    <I18nProvider>
      <DecisionPrompts {...props} />
    </I18nProvider>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: "Choose a Digimon" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Greymon/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View board" }));
  expect(screen.queryByRole("region", { name: "Choose a Digimon" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onRespond).toHaveBeenCalledExactlyOnceWith({ kind: "selectCards", instanceIds: [] });
  expect(onChooseHost).not.toHaveBeenCalled();
  onRespond.mockClear();
  view.rerender(
    <I18nProvider>
      <DecisionPrompts {...props} sourceHost={{ ...props.sourceHost, picking: false, cardIds: new Set(["b"]) }} />
    </I18nProvider>,
  );
  expect(screen.queryByRole("button", { name: /^Agumon/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^MetalGreymon/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /choose.*digimon|change.*digimon/i }));
  expect(onChangeHost).toHaveBeenCalledOnce();
  expect(onRespond).not.toHaveBeenCalled();
});

it("retains pending physical-source provenance through the shared gallery adapter", () => {
  const onTogglePick = vi.fn<(instanceId: string) => void>();
  render(
    <I18nProvider>
      <DecisionPrompts
        decision={{
          decisionId: "physical-copy",
          seat: 0,
          kind: "selectCards",
          promptText: "Choose",
          sourceCardId: "BT25-085",
          options: { candidateInstanceIds: ["old", "pending"], pendingEffectInstanceIds: ["pending"], min: 0, max: 1 },
        }}
        answerOnBoard={false}
        permanents={[]}
        sourceCardId="BT25-085"
        candidates={[
          { instanceId: "old", cardId: "EX7-071", zone: "trash" },
          { instanceId: "pending", cardId: "EX7-071", zone: "trash", pendingEffect: true },
        ]}
        allowsPick={() => true}
        picks={[]}
        min={0}
        max={1}
        triggerDetails={[]}
        opponentSecurityCount={3}
        onTogglePick={onTogglePick}
        onRespond={() => {}}
        onOpenDialog={() => {}}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Pending effect")).toBeTruthy();
  expect(screen.getByText("copy 1 of 2")).toBeTruthy();
  expect(screen.getByText("copy 2 of 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Hurricane Screw Shot, Pending effect, copy 2 of 2/ }));
  expect(onTogglePick).toHaveBeenCalledWith("pending");
});

const stagedClause =
  "[On Play] You may return 1 [TS] trait Option card from your trash to the hand. If this effect didn't return, ＜Draw 1＞.";
const activePassage = "You may return 1 [TS] trait Option card from your trash to the hand.";

it.each(["chooseTargets", "selectCards", "optional"] as const)(
  "preserves the full printed effect and highlights its active step on the board: %s",
  (kind) => {
    const { container } = render(
      <I18nProvider>
        <DecisionPrompts
          decision={{
            decisionId: "staged-effect",
            promptText: "Resolve this effect",
            seat: 0,
            kind,
            sourceCardId: "BT25-091",
            options: {
              timing: "OnPlay",
              effectText: stagedClause,
              effectTextPart: activePassage,
              effectTextEmphasis: activePassage,
            },
          }}
          answerOnBoard
          permanents={[]}
          sourceCardId="BT25-091"
          candidates={[]}
          allowsPick={() => true}
          picks={[]}
          min={0}
          max={1}
          triggerDetails={[]}
          opponentSecurityCount={5}
          onTogglePick={() => {}}
          onRespond={() => {}}
          onOpenDialog={() => {}}
        />
      </I18nProvider>,
    );
    expect(container.querySelector(".board-prompt__clause")?.textContent).toBe(stagedClause);
    expect(container.querySelector("strong.decision-overlay__effect-step")?.textContent).toBe(activePassage);
  },
);

it.each([true, false])("confirms both DNA materials together on board/dialog (%s)", (answerOnBoard) => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  function renderPair(picks: string[]) {
    return (
      <I18nProvider>
        <DecisionPrompts
          decision={{
            decisionId: "dna-pair",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose DNA materials",
            options: {
              min: 2,
              max: 2,
              candidateInstanceIds: ["alpha-one", "alpha-two", "ouryu"],
              allowedTargetCombinations: [
                ["alpha-one", "ouryu"],
                ["alpha-two", "ouryu"],
              ],
            },
          }}
          answerOnBoard={answerOnBoard}
          permanents={[]}
          sourceCardId="BT27-103"
          candidates={[
            { instanceId: "alpha-one", cardId: "BT6-111", zone: "battle" },
            { instanceId: "alpha-two", cardId: "BT13-075", zone: "battle" },
            { instanceId: "ouryu", cardId: "BT8-069", zone: "battle" },
          ]}
          allowsPick={() => true}
          picks={picks}
          min={2}
          max={2}
          triggerDetails={[]}
          opponentSecurityCount={5}
          onTogglePick={() => {}}
          onRespond={onRespond}
          onOpenDialog={() => {}}
        />
      </I18nProvider>
    );
  }
  const view = render(renderPair(["alpha-one"]));
  function getConfirm() {
    return screen.getByRole("button", { name: /confirm targets/i }) as HTMLButtonElement;
  }
  expect(getConfirm().disabled).toBe(true);
  view.rerender(renderPair(["alpha-one", "alpha-two"]));
  expect(getConfirm().disabled).toBe(true);
  view.rerender(renderPair(["ouryu", "alpha-two"]));
  expect(getConfirm().disabled).toBe(false);
  fireEvent.click(getConfirm());
  expect(onRespond).toHaveBeenCalledExactlyOnceWith({ kind: "chooseTargets", instanceIds: ["ouryu", "alpha-two"] });
});

it.each([
  [true, 0],
  [true, 2],
  [false, 0],
  [false, 2],
] as const)(
  "routes server-authorized activation cancellation through the board and dialog (%s, min %s)",
  (answerOnBoard, min) => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    render(
      <I18nProvider>
        <DecisionPrompts
          decision={{
            decisionId: "tentative-field-targets",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose two targets",
            options: {
              min,
              max: 2,
              candidateInstanceIds: ["first", "second"],
              canCancelActivation: true,
              allowedTargetCombinations: [["second", "first"]],
            },
          }}
          answerOnBoard={answerOnBoard}
          permanents={[]}
          sourceCardId="BT25-029"
          candidates={[
            { instanceId: "first", cardId: "ST1-03", zone: "opponentBattle" },
            { instanceId: "second", cardId: "ST1-03", zone: "opponentBattle" },
          ]}
          allowsPick={() => true}
          picks={["first"]}
          min={min}
          max={2}
          triggerDetails={[]}
          opponentSecurityCount={1}
          onTogglePick={() => {}}
          onRespond={onRespond}
          onOpenDialog={() => {}}
        />
      </I18nProvider>,
    );
    expect((screen.getByRole("button", { name: "Confirm targets" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel effect" }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({ kind: "chooseTargets", instanceIds: [] });
  },
);

it.each([false, undefined])(
  "keeps a mandatory field selection uncancellable without the server capability (%s)",
  (canCancelActivation) => {
    render(
      <I18nProvider>
        <DecisionPrompts
          decision={{
            decisionId: "mandatory-field-targets",
            seat: 0,
            kind: "chooseTargets",
            promptText: "Choose one target",
            options: { min: 1, max: 1, candidateInstanceIds: ["first"], canCancelActivation },
          }}
          answerOnBoard
          permanents={[]}
          sourceCardId="BT25-029"
          candidates={[{ instanceId: "first", cardId: "ST1-03", zone: "opponentBattle" }]}
          allowsPick={() => true}
          picks={[]}
          min={1}
          max={1}
          triggerDetails={[]}
          opponentSecurityCount={1}
          onTogglePick={() => {}}
          onRespond={() => {}}
          onOpenDialog={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Cancel effect" })).toBeNull();
    expect(screen.queryByRole("button", { name: /pass|no selection/i })).toBeNull();
  },
);
