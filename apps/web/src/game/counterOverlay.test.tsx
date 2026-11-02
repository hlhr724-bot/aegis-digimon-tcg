// @vitest-environment jsdom
import {
  ANIMATION_SPEED_CHANNEL,
  CardInstance,
  CombatWindow,
  GameState,
  PlayerState,
  Permanent,
  Phase,
} from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState, type ComponentProps } from "react";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { I18nProvider } from "../i18n";
import { CounterOverlay } from "./overlay/combat/CounterOverlay";
import { BlockOverlay } from "./overlay/combat/BlockOverlay";
import { AllianceOverlay } from "./overlay/combat/AllianceOverlay";
import { EvoCostChoiceOverlay } from "./overlay/choice/EvoCostChoiceOverlay";
import { GameScreen } from "./GameScreen";
import type { AegisRoom } from "../net/client";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";

it("localizes a plain Blast step that asks for its host on the board", () => {
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <CounterOverlay
        eligibleCounters={[{ instanceId: "ace", effectKey: "blast-digivolve:host", description: "Blast Digivolve" }]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : "ST1-07")}
        selectedInstanceId="ace"
        onSelectInstance={vi.fn<(instanceId?: string) => void>()}
        handInstanceIds={["ace"]}
        onActivate={vi.fn<(instanceId: string, key: string) => void>()}
        onPass={vi.fn<() => void>()}
      />
    </I18nContext.Provider>,
  );
  expect(screen.getByText("突风进化")).toBeTruthy();
});

it.each([{ effectKey: `blast-dna-digivolve:${JSON.stringify(["host", "ace", "partner"])}`, label: "突风合步" }])(
  "localizes the counter route $label and activates its unchanged server key",
  ({ effectKey, label }) => {
    const onActivate = vi.fn<(instanceId: string, key: string) => void>();
    render(
      <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
        <CounterOverlay
          eligibleCounters={[{ instanceId: "ace", effectKey, description: "Blast Digivolve" }]}
          getCardId={(id) => (id === "ace" ? "EX10-023" : "ST1-07")}
          selectedInstanceId="ace"
          onSelectInstance={vi.fn<(instanceId?: string) => void>()}
          handInstanceIds={["ace", "partner"]}
          onActivate={onActivate}
          onPass={vi.fn<() => void>()}
        />
      </I18nContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
    expect(onActivate).toHaveBeenCalledWith("ace", effectKey);
  },
);

function CounterHarness(
  props: Omit<ComponentProps<typeof CounterOverlay>, "selectedInstanceId" | "onSelectInstance" | "handInstanceIds"> & {
    handInstanceIds?: string[];
  },
) {
  const [selectedInstanceId, onSelectInstance] = useState<string>();
  const sources = [...new Set(props.eligibleCounters.map((choice) => choice.instanceId))];
  return (
    <>
      {sources.map((instanceId) => (
        <button key={instanceId} type="button" onClick={() => onSelectInstance(instanceId)}>
          {`pick ${instanceId}`}
        </button>
      ))}
      <CounterOverlay
        {...props}
        handInstanceIds={props.handInstanceIds ?? ["ace"]}
        selectedInstanceId={selectedInstanceId}
        onSelectInstance={onSelectInstance}
      />
    </>
  );
}

function counterDialog() {
  const dialog = screen.getByRole("dialog", { name: "Counter timing" });
  expect(dialog.getAttribute("data-prompt-surface")).toBe("left");
  return within(dialog);
}

function counterSourceDialog() {
  const dialog = screen.getByRole("dialog", { name: "Counter timing" });
  expect(dialog.getAttribute("data-prompt-surface")).toBe("center");
  return within(dialog);
}

/** Stands in for tapping the card in the hand or on the board, where sources are picked. */
function pickSource(instanceId: string) {
  fireEvent.click(screen.getByRole("button", { name: `pick ${instanceId}` }));
}

function chooseHandAce() {
  pickSource("ace");
}

afterEach(cleanup);

function renderCombatGame(kind: "alliance" | "block" | "counter" = "alliance", mustBlock = false) {
  localStorage.clear();
  const state = new GameState();
  state.phase = Phase.Main;
  state.turnSeat = 0;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.sessionId = `session-${seat}`;
    state.players.push(player);
  }
  for (const [permanentId, cardId] of [
    ["attacker", "ST1-07"],
    ["ally", "ST1-09"],
    ["ineligible", "BT1-024"],
  ]) {
    const permanent = new Permanent();
    permanent.permanentId = permanentId!;
    permanent.controllerSeat = 0;
    permanent.topCard = new CardInstance();
    permanent.topCard.instanceId = `${permanentId}-top`;
    permanent.topCard.cardId = cardId!;
    permanent.baseDP = permanent.currentDP = 6000;
    state.players[0]!.battleArea.push(permanent);
  }
  state.combatWindow = new CombatWindow();
  state.combatWindow.kind = kind;
  state.combatWindow.mustBlock = mustBlock;
  state.combatWindow.attackerPermanentId = "attacker";
  state.combatWindow.seat = 0;
  state.combatWindow.permanentId = "attacker";
  state.combatWindow.eligiblePermanentIds.push("ally");
  state.combatWindow.eligibleCountersJson = JSON.stringify([
    { instanceId: "ally-top", effectKey: "first", description: "First counter" },
    { instanceId: "ineligible-top", effectKey: "second", description: "Second counter" },
  ]);
  const send = vi.fn<(type: string, payload: unknown) => void>();
  const room = {
    state,
    connection: { isOpen: true },
    send: (type: string, payload: unknown) => (type === ANIMATION_SPEED_CHANNEL ? undefined : send(type, payload)),
    onMessage: () => () => {},
  } as unknown as AegisRoom;
  const events: SequencedServerEvent[] = [];
  const game = () => (
    <I18nProvider>
      <GameScreen
        joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Red"
        onExit={() => undefined}
        demoConnection={{
          room,
          status: "connected",
          state,
          events: [...events],
          batches: [],
          decision: undefined,
          acknowledgeDecision: () => undefined,
          error: undefined,
          sessionId: "session-0",
          roomCode: "",
        }}
      />
    </I18nProvider>
  );
  const view = render(game());
  const refresh = () => view.rerender(game());
  const permanent = (id: string) =>
    view.container.querySelector<HTMLElement>(`[data-drop="perm-you"][data-id="${id}"]`)!;
  return { send, permanent, state, events, refresh };
}

it("selects only server-offered Alliance allies on the field", () => {
  const { send, permanent } = renderCombatGame();
  expect(screen.queryByRole("dialog", { name: "Alliance window" })).toBeNull();
  expect(screen.getByRole("region", { name: "Alliance window" })).toBeTruthy();
  fireEvent.click(permanent("ally"));
  fireEvent.click(screen.getByRole("button", { name: /Use Alliance/i }));
  expect(send).toHaveBeenCalledWith("respondAlliance", { allyPermanentId: "ally", rollbackRevision: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});

it("passes Alliance without choosing a Digimon", () => {
  const { send } = renderCombatGame();
  fireEvent.click(screen.getByRole("button", { name: "Pass" }));
  expect(send).toHaveBeenCalledWith("respondAlliance", { allyPermanentId: undefined, rollbackRevision: 0 });
});

it("returns focus from board inspection to the unanswered evolution-cost choice", () => {
  const confirm = vi.fn<() => void>();
  const cancel = vi.fn<() => void>();
  render(
    <I18nProvider>
      <EvoCostChoiceOverlay
        evolvingCardId="ST1-07"
        baseCardId="BT1-010"
        memory={3}
        options={[{ type: "normal", label: "Red Lv.3", cost: 3 }]}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "View board" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Return to decision" }));
  fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Red Lv.3 · 3 memory, from 3 to 0" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
it("shows blocker artwork and statistics, and preserves mandatory blocking", () => {
  const block = vi.fn<(permanentId: string) => void>();
  const decline = vi.fn<() => void>();
  const props = {
    attackerCardId: "ST1-03",
    blockers: [{ permanentId: "blocker", cardId: "ST1-07", currentDP: 6000, sourceCount: 2 }],
    onBlock: block,
    onDecline: decline,
  };
  const view = render(
    <I18nProvider>
      <BlockOverlay {...props} />
    </I18nProvider>,
  );
  expect(screen.queryByText(/is attacking/)).toBeNull();
  expect(screen.getAllByRole("img")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /6,000 DP/ }));
  expect(block).toHaveBeenCalledWith("blocker");
  const buttons = screen.getAllByRole("button");
  fireEvent.click(buttons[1]!);
  expect(decline).toHaveBeenCalledOnce();
  view.rerender(
    <I18nProvider>
      <BlockOverlay {...props} mustBlock />
    </I18nProvider>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(2);
  block.mockClear();
  decline.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "View board" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
  expect(screen.getByRole("dialog", { name: "Block window" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Take the attack/ })).toBeNull();
  expect(block).not.toHaveBeenCalled();
  expect(decline).not.toHaveBeenCalled();
});
it("picks a hand Counter in the hand and then its exact Blast target in the central dialog", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterHarness
        eligibleCounters={[
          { instanceId: "ace", effectKey: "blast-digivolve:one", description: "Blast Digivolve" },
          { instanceId: "ace", effectKey: "blast-digivolve:two", description: "Blast Digivolve" },
          { instanceId: "other", effectKey: "blast-digivolve:one", description: "Blast Digivolve" },
        ]}
        handInstanceIds={["ace", "other"]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : id === "two" ? "ST1-09" : "ST1-07")}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  const picker = counterSourceDialog();
  expect(within(picker.getByRole("region", { name: "Hand" })).getAllByRole("button")).toHaveLength(2);
  expect(picker.queryByRole("region", { name: "Field" })).toBeNull();
  chooseHandAce();
  expect(activate).not.toHaveBeenCalled();
  const rail = within(screen.getByRole("region", { name: "Counter timing" }));
  expect(rail.getByText("Choose a Digimon below to Blast Digivolve.")).toBeTruthy();
  fireEvent.click(rail.getByRole("button", { name: "Change card" }));
  expect(counterSourceDialog().getByRole("region", { name: "Hand" })).toBeTruthy();
  fireEvent.click(counterSourceDialog().getByRole("button", { name: "Pass Counter" }));
  expect(pass).toHaveBeenCalledOnce();
});

it("asks for a lone Blast host on the board and cancels back to the hand", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  render(
    <I18nProvider>
      <CounterHarness
        eligibleCounters={[{ instanceId: "ace", effectKey: "blast-digivolve:one", description: "Blast Digivolve" }]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : "ST1-07")}
        onActivate={activate}
        onPass={() => undefined}
      />
    </I18nProvider>,
  );
  chooseHandAce();
  const rail = within(screen.getByRole("region", { name: "Counter timing" }));
  expect(rail.getByText("Choose a Digimon below to Blast Digivolve.")).toBeTruthy();
  fireEvent.click(rail.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Tap a card in your hand to use its [Counter].")).toBeTruthy();
  expect(activate).not.toHaveBeenCalled();
});

it("keeps same-name Blast hosts and DNA routes distinct while deduplicating identical hand partners", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const route = (host: string, partner: string) => `blast-dna-digivolve:${JSON.stringify([host, "ace", partner])}`;
  render(
    <I18nProvider>
      <CounterHarness
        eligibleCounters={[
          { instanceId: "ace", effectKey: route("ready", "partner-one"), description: "Blast DNA" },
          { instanceId: "ace", effectKey: route("ready", "partner-two"), description: "Blast DNA" },
          { instanceId: "ace", effectKey: route("resting", "partner-one"), description: "Blast DNA" },
        ]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : id.startsWith("partner") ? "ST1-09" : "ST1-07")}
        onActivate={activate}
        onPass={() => undefined}
      />
    </I18nProvider>,
  );
  chooseHandAce();
  const hosts = counterDialog().getAllByRole("button", { name: /Greymon Blast DNA/ });
  expect(hosts).toHaveLength(2);
  expect(hosts[0]!.textContent).toContain("1 / 2");
  expect(hosts[1]!.textContent).toContain("2 / 2");
  fireEvent.click(hosts[1]!);
  expect(activate).toHaveBeenCalledWith("ace", route("resting", "partner-one"));
});

it("keeps distinct non-Blast counter effects reachable in the central dialog", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  render(
    <I18nProvider>
      <CounterHarness
        handInstanceIds={[]}
        eligibleCounters={[
          { instanceId: "source", effectKey: "first", description: "First counter" },
          { instanceId: "source", effectKey: "second", description: "Second counter" },
        ]}
        getCardId={() => "ST1-03"}
        onActivate={activate}
        onPass={() => undefined}
      />
    </I18nProvider>,
  );
  fireEvent.click(counterDialog().getByRole("button", { name: /First counter/ }));
  expect(activate).toHaveBeenCalledWith("source", "first");
  fireEvent.click(counterDialog().getByRole("button", { name: /Second counter/ }));
  expect(activate).toHaveBeenCalledWith("source", "second");
});

it("asks a lone field counter as a left yes/no prompt", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterHarness
        handInstanceIds={[]}
        eligibleCounters={[
          {
            instanceId: "kentaurosmon",
            effectKey: "EX13-036/counter",
            description: "Place 1 of each player's Digimon",
          },
        ]}
        getCardId={() => "EX13-036"}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  const rail = screen.getByRole("dialog", { name: "Counter timing" });
  expect(rail.getAttribute("data-prompt-surface")).toBe("left");
  expect(within(rail).getByRole("img", { name: "Kentaurosmon" })).toBeTruthy();
  expect(within(rail).queryByText(/Place 1 of each player's Digimon/)).toBeNull();
  fireEvent.click(within(rail).getByRole("button", { name: "Activate" }));
  expect(activate).toHaveBeenCalledWith("kentaurosmon", "EX13-036/counter");
  fireEvent.click(within(rail).getByRole("button", { name: "Pass Counter" }));
  expect(pass).toHaveBeenCalledOnce();
});

it("picks between identical field counters on the board and cancels back without passing", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterHarness
        handInstanceIds={[]}
        eligibleCounters={[
          { instanceId: "first-top", effectKey: "EX13-036/counter", description: "Kentaurosmon counter" },
          { instanceId: "second-top", effectKey: "EX13-036/counter", description: "Kentaurosmon counter" },
        ]}
        getCardId={() => "EX13-036"}
        fieldPermanentOf={(id) => id.replace("-top", "")}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  const fieldSources = () =>
    within(counterSourceDialog().getByRole("region", { name: "Field" })).getAllByRole("button");
  const activateButton = () => counterSourceDialog().getByRole("button", { name: "Activate" }) as HTMLButtonElement;
  expect(fieldSources()).toHaveLength(2);
  expect(activateButton().disabled).toBe(true);
  fireEvent.click(fieldSources()[1]!);
  expect(fieldSources()[1]!.getAttribute("aria-pressed")).toBe("true");
  expect(activate).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Counter timing" }), { key: "Escape" });
  expect(fieldSources()[1]!.getAttribute("aria-pressed")).toBe("false");
  expect(pass).not.toHaveBeenCalled();
  pickSource("first-top");
  fireEvent.click(activateButton());
  expect(activate).toHaveBeenCalledWith("first-top", "EX13-036/counter");
});

it("opens a centered dialog that lists every Counter source with its effect and confirms the picked one", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterOverlayWithSelection
        handInstanceIds={["ace-one", "ace-two"]}
        eligibleCounters={[
          { instanceId: "ace-one", effectKey: "blast-digivolve:andromon", description: "Blast Digivolve" },
          { instanceId: "ace-two", effectKey: "blast-digivolve:andromon", description: "Blast Digivolve" },
          { instanceId: "andromon-top", effectKey: "EX12-055/counter", description: "Andromon counter" },
        ]}
        getCardId={(id) => (id.startsWith("ace") ? "EX10-023" : id === "andromon-top" ? "EX12-055" : "ST1-07")}
        fieldPermanentOf={(id) => (id === "andromon-top" ? "andromon" : undefined)}
        attack={{ attackerCardId: "ST1-07", attackerDp: 12000 }}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  const picker = counterSourceDialog();
  expect(picker.getByText("Greymon (12,000 DP) is attacking you.")).toBeTruthy();
  const hand = within(picker.getByRole("region", { name: "Hand" }));
  expect(hand.getAllByRole("button")).toHaveLength(1);
  expect(hand.getByText("×2")).toBeTruthy();
  const field = within(picker.getByRole("region", { name: "Field" }));
  expect(field.getByText("Counter")).toBeTruthy();
  expect(hand.getByText("Blast Ace")).toBeTruthy();
  expect((picker.getByRole("button", { name: "Activate" }) as HTMLButtonElement).disabled).toBe(true);
  const footer = picker.getByRole("button", { name: "Activate" }).parentElement!;
  expect([...footer.querySelectorAll("button")].map((button) => button.textContent?.trim())).toEqual([
    "View board",
    "Pass Counter",
    "Activate",
  ]);
  fireEvent.click(field.getByRole("button", { name: "Andromon · on field" }));
  expect(activate).not.toHaveBeenCalled();
  fireEvent.click(counterSourceDialog().getByRole("button", { name: "Activate" }));
  expect(activate).toHaveBeenCalledWith("andromon-top", "EX12-055/counter");
  fireEvent.click(
    within(counterSourceDialog().getByRole("region", { name: "Hand" })).getByRole("button", { name: /in hand/ }),
  );
  expect(screen.getByRole("region", { name: "Counter timing" })).toBeTruthy();
  expect(pass).not.toHaveBeenCalled();
});

function CounterOverlayWithSelection(
  props: Omit<ComponentProps<typeof CounterOverlay>, "selectedInstanceId" | "onSelectInstance">,
) {
  const [selectedInstanceId, onSelectInstance] = useState<string>();
  return <CounterOverlay {...props} selectedInstanceId={selectedInstanceId} onSelectInstance={onSelectInstance} />;
}

it.each([false, true])("offers explicit server-authorized blockers and preserves Collision (%s)", (mustBlock) => {
  const { send } = renderCombatGame("block", mustBlock);
  const rail = screen.getByRole("dialog", { name: "Block window" });
  const decline = within(rail).queryByRole("button", { name: /take the attack/i });
  expect(Boolean(decline)).toBe(!mustBlock);
  fireEvent.click(within(rail).getByRole("button", { name: /MetalGreymon/ }));
  expect(send).toHaveBeenCalledWith("declareBlock", { blockerPermanentId: "ally", rollbackRevision: 0 });
});

it("routes a field Counter picked in the source dialog to the exact GameScreen intent", () => {
  const { send } = renderCombatGame("counter");
  const picker = counterSourceDialog();
  fireEvent.click(picker.getByRole("button", { name: /MetalTyrannomon · on field/ }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(counterSourceDialog().getByRole("button", { name: "Activate" }));
  expect(send).toHaveBeenCalledWith("respondCounter", {
    sourceInstanceId: "ineligible-top",
    effectKey: "second",
    rollbackRevision: 0,
  });
});

it("puts the lone take-attack action on the left when no server-authorized blocker remains", () => {
  const decline = vi.fn<() => void>();
  render(
    <I18nProvider>
      <BlockOverlay blockers={[]} mustBlock onBlock={vi.fn<(id: string) => void>()} onDecline={decline} />
    </I18nProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Block window" });
  expect(dialog.getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(within(dialog).getByRole("button", { name: /take the attack/i }));
  expect(decline).toHaveBeenCalledOnce();
});

it("passes an empty Alliance window once without rendering a modal", () => {
  const pass = vi.fn<() => void>();
  const view = render(
    <I18nProvider>
      <AllianceOverlay allies={[]} onPass={pass} />
    </I18nProvider>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("region")).toBeNull();
  expect(pass).toHaveBeenCalledOnce();
  view.rerender(
    <I18nProvider>
      <AllianceOverlay allies={[]} onPass={pass} />
    </I18nProvider>,
  );
  expect(pass).toHaveBeenCalledOnce();
});

it("keeps the lone Counter pass action on the left when no legal route remains", () => {
  const pass = vi.fn<() => void>();
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  render(
    <I18nProvider>
      <CounterHarness eligibleCounters={[]} getCardId={() => undefined} onActivate={activate} onPass={pass} />
    </I18nProvider>,
  );
  expect(screen.queryByRole("region", { name: "Counter timing" })).toBeNull();
  const rail = screen.getByRole("dialog", { name: "Counter timing" });
  expect(rail.getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(within(rail).getByRole("button", { name: "Pass Counter" }));
  expect(pass).toHaveBeenCalledOnce();
  expect(activate).not.toHaveBeenCalled();
});

it.each([0, 1])("allows each Alliance ally with %s opposing security cards", (securityCount) => {
  const { send, permanent, state, events, refresh } = renderCombatGame();
  state.players[1]!.securityCount = securityCount;
  fireEvent.click(permanent("ally"));
  fireEvent.click(screen.getByRole("button", { name: /Use Alliance/i }));
  state.players[0]!.battleArea[1]!.isSuspended = true;
  state.combatWindow!.eligiblePermanentIds.splice(0, 1, "ineligible");
  events.push(
    { kind: "allianceResolved", permanentId: "attacker", seq: 1, batch: "attack", stateVersion: 1 },
    {
      kind: "alliancePrompt",
      permanentId: "attacker",
      eligibleAllyIds: ["ineligible"],
      seq: 2,
      batch: "attack",
      stateVersion: 2,
    },
  );
  state.stateVersion = 3;
  refresh();
  fireEvent.click(permanent("ineligible"));
  fireEvent.click(screen.getByRole("button", { name: /Use Alliance/i }));
  expect(send.mock.calls.filter(([type]) => type === "respondAlliance")).toEqual([
    ["respondAlliance", { allyPermanentId: "ally", rollbackRevision: 0 }],
    ["respondAlliance", { allyPermanentId: "ineligible", rollbackRevision: 0 }],
  ]);
});
