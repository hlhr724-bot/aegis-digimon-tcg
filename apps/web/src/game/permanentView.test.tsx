// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { PermanentView } from "./piece";
import { setFieldReferenceVisible } from "@/design/fieldReference/setFieldReferenceVisible";

afterEach(() => cleanup());

it.each([false, true])("shows ACE from the field's top card while suspended=%s", (isSuspended) => {
  const perm = opponentWithDpDown();
  perm.topCard = Object.assign(new CardInstance(), { cardId: "BT17-018", instanceId: "ace-top" });
  perm.currentDP = 15000;
  perm.isSuspended = isSuspended;
  const view = () => (
    <I18nProvider>
      <PermanentView perm={perm} onClick={() => undefined} />
    </I18nProvider>
  );
  const { container, rerender } = render(view());
  expect(container.querySelector(".game-permanent > .card-ace-badge")?.textContent).toBe("ACE");
  expect(container.querySelector(".game-permanent > .card-ace-badge")?.getAttribute("data-overflow")).toBe("5");
  perm.stack.push(perm.topCard);
  perm.topCard = Object.assign(new CardInstance(), { cardId: "EX2-073", instanceId: "ordinary-top" });
  rerender(view());
  expect(container.querySelector(".game-permanent > .card-ace-badge")).toBeNull();
});

it("keeps the host entrance when sources or its stripped top change, and remounts for an accepted evolution", () => {
  const perm = opponentWithDpDown();
  perm.stack.push(Object.assign(new CardInstance(), { cardId: "BT1-010", instanceId: "source" }));
  const renderCard = (burst?: Parameters<typeof PermanentView>[0]["burst"]) => (
    <I18nProvider>
      <PermanentView perm={perm} burst={burst} />
    </I18nProvider>
  );
  const { container, rerender } = render(renderCard());
  const entrance = container.querySelector(".game-card-enter");
  perm.topCard = perm.stack.pop()!;
  rerender(renderCard());
  expect(container.querySelector(".game-card-enter")).toBe(entrance);
  const evolution = {
    key: 2,
    permanentId: perm.permanentId,
    variant: "evolve" as const,
    color: "Blue" as const,
    inBreeding: false,
  };
  rerender(renderCard(evolution));
  const arrived = container.querySelector(".game-card-enter");
  expect(arrived).not.toBe(entrance);
  rerender(renderCard());
  expect(container.querySelector(".game-card-enter")).toBe(arrived);
});

it("keeps a breeding transfer quiet after handoff, but permits the next evolution's entrance", () => {
  const perm = opponentWithDpDown();
  const move = {
    key: 1,
    permanentId: perm.permanentId,
    variant: "play" as const,
    color: "Blue" as const,
    inBreeding: false,
    moveFromBreeding: true as const,
  };
  const { container, rerender } = render(
    <I18nProvider>
      <PermanentView perm={perm} pending burst={move} />
    </I18nProvider>,
  );
  expect(container.querySelector(".battle-burst, .game-card-dust")).toBeNull();
  rerender(
    <I18nProvider>
      <PermanentView perm={perm} />
    </I18nProvider>,
  );
  expect(container.querySelector(".game-card-enter--quiet")).toBeTruthy();
  perm.stack.push(Object.assign(new CardInstance(), { cardId: "BT1-010", instanceId: "new-source" }));
  rerender(
    <I18nProvider>
      <PermanentView perm={perm} />
    </I18nProvider>,
  );
  const entrance = container.querySelector(".game-card-enter");
  expect(entrance?.classList.contains("game-card-enter--quiet")).toBe(true);
  perm.topCard = perm.stack.pop()!;
  rerender(
    <I18nProvider>
      <PermanentView perm={perm} />
    </I18nProvider>,
  );
  expect(container.querySelector(".game-card-enter")).toBe(entrance);
  expect(entrance?.classList.contains("game-card-enter--quiet")).toBe(true);
  rerender(
    <I18nProvider>
      <PermanentView perm={perm} burst={{ ...move, key: 2, variant: "evolve", moveFromBreeding: undefined }} />
    </I18nProvider>,
  );
  expect(container.querySelector(".game-card-enter--quiet")).toBeNull();
  expect(container.querySelector(".game-card-enter")).not.toBe(entrance);
});

it("inspects a field-selection candidate without activating its primary choice", () => {
  const choose = vi.fn<() => void>();
  const inspect = vi.fn<() => void>();
  render(
    <I18nProvider>
      <PermanentView perm={opponentWithDpDown()} candidate onClick={choose} onInspect={inspect} showInspect />
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: /read saberleomon/i }));
  expect(inspect).toHaveBeenCalledTimes(1);
  expect(choose).not.toHaveBeenCalled();
});

it("keeps a deletion target selectable without covering it with a Delete pill", () => {
  render(
    <I18nProvider>
      <PermanentView
        perm={opponentWithDpDown()}
        candidate
        fate={{ fate: "delete", labelKey: "game.fate.delete", glyph: "✕", tone: "danger" }}
        onClick={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );

  expect(screen.getByRole("button", { name: /SaberLeomon/i })).toBeTruthy();
  expect(screen.queryByText("Delete")).toBeNull();
});

it("shows printed and granted Security Attack modifiers in field badges", () => {
  const printed = new Permanent();
  printed.permanentId = "fighter";
  printed.topCard = Object.assign(new CardInstance(), { cardId: "AD1-024" });
  printed.keywords.push("SecurityAttack");
  printed.securityAttack = 2;
  printed.securityAttackModifier = 1;
  const reduced = new Permanent();
  reduced.permanentId = "reduced";
  reduced.topCard = Object.assign(new CardInstance(), { cardId: "ST2-03" });
  reduced.keywords.push("SecurityAttack");
  reduced.grantedKeywords.push("SecurityAttack");
  reduced.securityAttack = 0;
  reduced.securityAttackModifier = -3;
  render(
    <I18nProvider>
      <PermanentView perm={printed} />
      <PermanentView perm={reduced} />
    </I18nProvider>,
  );
  expect(screen.getByLabelText("Active keywords: Security Attack +1")).toBeTruthy();
  expect(screen.getByLabelText("Active keywords: Security Attack -3")).toBeTruthy();
  expect(screen.queryByText("Security Attack ×2")).toBeNull();
});

function opponentWithDpDown(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "opponent-target";
  permanent.controllerSeat = 1;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "opponent-target-top",
    cardId: "BT1-043",
  });
  permanent.baseDP = 16_000;
  permanent.currentDP = 10_000;
  return permanent;
}

function blackWarGreymonWithInheritedDpUp(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "black-war-greymon";
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "black-war-greymon-top",
    cardId: "BT5-069",
  });
  permanent.baseDP = 12_000;
  permanent.currentDP = 14_000;
  return permanent;
}

function memoryBoostWithDelay(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "blue-memory-boost";
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "blue-memory-boost-top",
    cardId: "P-036",
  });
  permanent.activatableEffectsJson = JSON.stringify([
    {
      instanceId: "blue-memory-boost-top",
      effectKey: "P-036/0",
      description: "[Main] <Delay> Gain 2 memory.",
    },
  ]);
  return permanent;
}

function herculesKabuterimonWithDigiBurst(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "hercules-kabuterimon";
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "hercules-kabuterimon-top",
    cardId: "ST4-13",
  });
  for (let index = 0; index < 5; index += 1) {
    permanent.stack.push(
      Object.assign(new CardInstance(), {
        instanceId: `hercules-source-${index}`,
        cardId: index === 4 ? "ST4-11" : "ST4-03",
      }),
    );
  }
  permanent.baseDP = 12_000;
  permanent.currentDP = 13_000;
  permanent.activatableEffectsJson = JSON.stringify([
    {
      instanceId: "hercules-kabuterimon-top",
      effectKey: "ST4-13/ir-27-0",
      description: "[Main] ＜DigiBurst＞ Trash, Suspend",
    },
  ]);
  return permanent;
}

function sistermonWithGrantedDecoy(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "sistermon-blanc";
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "sistermon-blanc-top",
    cardId: "ST12-12",
  });
  permanent.keywords.push("Decoy");
  permanent.grantedKeywords.push("Decoy");
  return permanent;
}

function suspendedExTyrannomon(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "ex-tyrannomon";
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "ex-tyrannomon-top",
    cardId: "EX3-060",
  });
  permanent.stack.push(
    Object.assign(new CardInstance(), {
      instanceId: "toy-agumon-source",
      cardId: "BT2-055",
    }),
  );
  permanent.baseDP = 9000;
  permanent.currentDP = 9000;
  permanent.isSuspended = true;
  permanent.grantedKeywords.push("Blocker");
  return permanent;
}

function permanentWithKeywords({ cardId, keywords }: { cardId: string; keywords: string[] }): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = `${cardId}-permanent`;
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: `${cardId}-top`,
    cardId,
  });
  permanent.grantedKeywords.push(...keywords);
  return permanent;
}

function darkdramonWithCyberdramonDpBonus(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "darkdramon-with-cyberdramon";
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), {
    instanceId: "darkdramon-top",
    cardId: "EX3-054",
  });
  permanent.stack.push(
    Object.assign(new CardInstance(), {
      instanceId: "cyberdramon-source",
      cardId: "EX3-050",
    }),
  );
  permanent.baseDP = 12_000;
  permanent.currentDP = 14_000;
  return permanent;
}

describe("PermanentView DP changes", () => {
  it("shows Cyberdramon's inherited +2000 DP on its Cyborg/D-Brigade carrier", () => {
    render(
      <I18nProvider>
        <PermanentView perm={darkdramonWithCyberdramonDpBonus()} onClick={vi.fn<() => void>()} />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /Darkdramon.*14,000 DP, DP \+2K/i })).toBeTruthy();
    expect(screen.getByText("14K")).toBeTruthy();
    expect(screen.getByTitle(/DP \+2K/)).toBeTruthy();
    expect(document.querySelector(".game-dp-delta-badge")).toBeNull();
    expect(screen.getByTitle(/DP \+2K/).closest('[data-dp-layout="stacked"]')).toBeTruthy();
  });

  it("Discord 1555271931203158056: shows a Sukamon-rewritten Machinedramon as Sukamon at 3K DP", () => {
    const permanent = new Permanent();
    permanent.permanentId = "machinedramon";
    permanent.controllerSeat = 1;
    permanent.topCard = Object.assign(new CardInstance(), { instanceId: "machinedramon-top", cardId: "EX1-073" });
    permanent.baseDP = 11_000;
    permanent.currentDP = 3000;
    permanent.originalNameOverride = "Sukamon";
    permanent.originalColorsOverride.push("White");
    permanent.originalDPOverride = 3000;
    render(
      <I18nProvider>
        <PermanentView perm={permanent} />
      </I18nProvider>,
    );

    expect(screen.getByText("Sukamon")).toBeTruthy();
    expect(screen.queryByText("Machinedramon")).toBeNull();
    expect(screen.getByText("3K")).toBeTruthy();
    expect(document.querySelector("[data-dp]")).toBeNull();
  });

  it("labels a DP reduction explicitly on the affected Digimon", () => {
    render(
      <I18nProvider>
        <PermanentView perm={opponentWithDpDown()} />
      </I18nProvider>,
    );

    expect(document.querySelector('[data-dp="down"][data-label="DP −6K"]')).toBeTruthy();
  });

  it("reveals the persistent DP-down badge only after the impact animation", () => {
    const permanent = opponentWithDpDown();
    const pulse = {
      permanentId: permanent.permanentId,
      kind: "debuff" as const,
      from: 10_000,
      to: 4_000,
      key: 1,
      emphasized: true,
    };
    const view = render(
      <I18nProvider>
        <PermanentView perm={permanent} dpBadgeSuppressed />
      </I18nProvider>,
    );

    expect(view.container.querySelector(".game-dp-pulse--emphasized")).toBeNull();
    expect(view.container.querySelector('[data-dp="down"]')).toBeNull();

    view.rerender(
      <I18nProvider>
        <PermanentView perm={permanent} dpPulse={pulse} dpBadgeSuppressed />
      </I18nProvider>,
    );
    expect(view.container.querySelector(".game-dp-pulse--emphasized")).toBeTruthy();
    expect(view.container.querySelector('[data-dp="down"]')).toBeNull();

    view.rerender(
      <I18nProvider>
        <PermanentView perm={permanent} />
      </I18nProvider>,
    );
    expect(view.container.querySelector('[data-dp="down"][data-label="DP −6K"]')).toBeTruthy();
  });

  it("renders BT5-068's inherited +2000 DP from the synchronized current DP", () => {
    render(
      <I18nProvider>
        <PermanentView perm={blackWarGreymonWithInheritedDpUp()} />
      </I18nProvider>,
    );

    expect(screen.getByTitle(/DP \+2K/)).toBeTruthy();
    expect(screen.getByText("14K")).toBeTruthy();
  });
});

describe("PermanentView resolved keywords", () => {
  it("shows a surviving ExTyrannomon blocker sideways and labels it as suspended", () => {
    render(
      <I18nProvider>
        <PermanentView perm={suspendedExTyrannomon()} onClick={vi.fn<() => void>()} />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /ExTyrannomon.*Suspended/i })).toBeTruthy();
    const card = screen.getByTitle("ExTyrannomon");
    expect(card.dataset.state).toBe("suspended");
    const suspendedStyle = card.closest<HTMLElement>("[data-suspended]")?.style;
    expect(suspendedStyle?.marginInlineStart).toContain("24px");
    expect(suspendedStyle?.marginInlineEnd).toBe("24px");
    expect(card.style.rotate).toBe("90deg");
    expect(screen.getByText("Blocker")).toBeTruthy();
  });

  it("shows Sealsdramon's Jamming and the newly played D-Brigade's granted Rush independently", () => {
    render(
      <I18nProvider>
        <>
          <PermanentView perm={permanentWithKeywords({ cardId: "EX3-049", keywords: ["Jamming"] })} />
          <PermanentView perm={permanentWithKeywords({ cardId: "EX3-046", keywords: ["Rush"] })} />
        </>
      </I18nProvider>,
    );

    expect(screen.getByLabelText("Active keywords: Jamming")).toBeTruthy();
    expect(screen.getByLabelText("Active keywords: Rush")).toBeTruthy();
    expect(screen.getByText("Jamming")).toBeTruthy();
    expect(screen.getByText("Rush")).toBeTruthy();
  });

  it("shows ST12-12's dynamically granted Decoy directly on the board", () => {
    render(
      <I18nProvider>
        <PermanentView perm={sistermonWithGrantedDecoy()} />
      </I18nProvider>,
    );

    expect(screen.getByText("Decoy")).toBeTruthy();
    expect(screen.getByLabelText("Active keywords: Decoy")).toBeTruthy();
  });

  it("shows the granted keywords that fit on one line and summarizes the remainder", () => {
    const permanent = sistermonWithGrantedDecoy();
    permanent.grantedKeywords.push("Blocker", "Reboot", "Jamming");
    render(
      <I18nProvider>
        <PermanentView perm={permanent} />
      </I18nProvider>,
    );

    expect(screen.getByText("Decoy")).toBeTruthy();
    expect(screen.queryByText("Blocker")).toBeNull();
    expect(screen.queryByText("Reboot")).toBeNull();
    expect(screen.queryByText("Jamming")).toBeNull();
    fireEvent.click(screen.getByText("+3"));
    expect(screen.getByRole("tooltip").textContent).toContain("Blocker · Reboot · Jamming");
  });
});

describe("PermanentView activatable effects", () => {
  // The activation control itself lives in the card action menu
  // (cardActionSheet.test.tsx); the card only shows the permanent's own state.
  it("carries no effect control on the card", () => {
    render(
      <I18nProvider>
        <PermanentView perm={memoryBoostWithDelay()} onClick={vi.fn<() => void>()} />
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: /activate effect/i })).toBeNull();
    expect(screen.queryByText("Main")).toBeNull();
  });

  it("surfaces HerculesKabuterimon's synchronized source count and DP", () => {
    render(
      <I18nProvider>
        <PermanentView perm={herculesKabuterimonWithDigiBurst()} />
      </I18nProvider>,
    );

    expect(screen.getByText("×5")).toBeTruthy();
    expect(screen.getByText("13K")).toBeTruthy();
    expect(screen.getByTitle(/DP \+1K/)).toBeTruthy();
  });
});

describe("summoning sickness ring", () => {
  function freshlyPlayed(summoningSick: boolean): Permanent {
    const permanent = new Permanent();
    permanent.permanentId = "fresh";
    permanent.controllerSeat = 0;
    permanent.topCard = Object.assign(new CardInstance(), { instanceId: "fresh-top", cardId: "BT1-043" });
    permanent.baseDP = 16_000;
    permanent.currentDP = 16_000;
    permanent.summoningSick = summoningSick;
    return permanent;
  }

  it("orbits stars over a permanent the server says cannot attack yet", () => {
    const { container } = render(
      <I18nProvider>
        <PermanentView perm={freshlyPlayed(true)} onClick={vi.fn<() => void>()} />
      </I18nProvider>,
    );

    const stars = container.querySelectorAll(".game-summoning-ring i");
    expect(stars).toHaveLength(6);
    // Each star rests at its own point on the ellipse, so a stopped orbit is still a ring.
    expect((stars[3] as HTMLElement).style.getPropertyValue("--star-index")).toBe("3");
    expect(screen.getByRole("button", { name: /Can't attack yet/i })).toBeTruthy();
  });

  it("shows nothing once the server clears the flag", () => {
    const { container } = render(
      <I18nProvider>
        <PermanentView perm={freshlyPlayed(false)} onClick={vi.fn<() => void>()} />
      </I18nProvider>,
    );

    expect(container.querySelector(".game-summoning-ring")).toBeNull();
  });
});

it("raises an opponent's Plutomon during effect activation and returns it afterward", () => {
  const permanent = opponentWithDpDown();
  permanent.topCard.cardId = "BT26-059";
  const { container, rerender } = render(
    <I18nProvider>
      <PermanentView perm={permanent} effectSource />
    </I18nProvider>,
  );
  const card = container.querySelector<HTMLElement>(".game-permanent--effect-source")!;
  expect(card.style.transform).toBe("translateY(-6px)");
  rerender(
    <I18nProvider>
      <PermanentView perm={permanent} />
    </I18nProvider>,
  );
  expect(card.style.transform).toBe("none");
});

describe("PermanentView forced attack", () => {
  it("marks a Digimon a granted clause forces to attack, quoting the clause and its card (Discord bug 1557482157012680795)", () => {
    const permanent = new Permanent();
    permanent.permanentId = "monodramon";
    permanent.controllerSeat = 1;
    permanent.topCard = Object.assign(new CardInstance(), { instanceId: "monodramon-top", cardId: "BT1-009" });
    permanent.baseDP = 3000;
    permanent.currentDP = 3000;
    permanent.attacksAtStartOfMainPhase = true;
    permanent.forcedAttackGrantsJson = JSON.stringify([
      { clause: "[Start of Your Main Phase] This Digimon attacks.", sourceCardId: "ST15-16" },
    ]);
    render(
      <I18nProvider>
        <PermanentView perm={permanent} onClick={vi.fn<() => void>()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTitle("Must attack"));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("[Start of Your Main Phase] This Digimon attacks.");
    expect(tooltip.textContent).toContain("Trident Arm");
  });
});

it.each(["BT1-043", undefined])(
  "keeps a face-down field card interactive without showing its identity (%s)",
  (cardId) => {
    const permanent = opponentWithDpDown();
    permanent.topCard.faceUp = false;
    permanent.topCard.cardId = cardId as string;
    const onClick = vi.fn<() => void>();
    const { container } = render(
      <I18nProvider>
        <PermanentView perm={permanent} onClick={onClick} drop={{ "data-drop": "hidden-target" }} />
      </I18nProvider>,
    );
    const target = screen.getByRole("button", { name: /Face down/ });
    expect(target.getAttribute("data-drop")).toBe("hidden-target");
    expect(container.querySelector('[title="MetalGarurumon"]')).toBeNull();
    expect(container.textContent).not.toContain("BT1-043");
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledOnce();
  },
);

it("shows all manually selected visual statuses together on the field", () => {
  const permanent = opponentWithDpDown();
  permanent.manualStatuses.push("sick", "taunt", "immune");
  const { container } = render(
    <I18nProvider>
      <PermanentView perm={permanent} onClick={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  expect(container.querySelectorAll(".game-keyword-badges")).toHaveLength(1);
  expect(container.querySelector(".game-keyword-badges")?.getAttribute("aria-label")).toContain("Sick, Taunt, Immune");
  expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Sick");
  expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Immune");
});

it("shares keyword overflow and hints with manual statuses and free-text markers", () => {
  const permanent = opponentWithDpDown();
  permanent.manualStatuses.push("sick", "immune");
  permanent.manualMarker = "Custom reminder";
  permanent.grantedKeywords.push("Rush");
  permanent.stack.push(Object.assign(new CardInstance(), { cardId: "BT1-010", instanceId: "source" }));
  const { container } = render(
    <I18nProvider>
      <PermanentView perm={permanent} width={400} />
    </I18nProvider>,
  );
  const row = container.querySelector(".game-keyword-badges")!;
  expect(row.getAttribute("aria-label")).toBe("Active keywords: Rush, Sick, Immune, Custom reminder");
  expect(row.querySelectorAll(".game-keyword-badge")).toHaveLength(4);
  expect(row.textContent).toContain("+1");
  expect(container.querySelector(".game-source-badge")).toBeTruthy();
  expect(container.querySelector(".manual-permanent-statuses, .game-permanent-manual-marker")).toBeNull();
  fireEvent.click(row.querySelector(".game-keyword-badge--more")!);
  expect(screen.getByRole("tooltip").textContent).toContain("Custom reminder");
});

it("shows the projected Security Attack bonus for five Tamers sharing four distinct colors", () => {
  const permanent = new Permanent();
  permanent.permanentId = "four-color-tamer-bonus";
  permanent.topCard = Object.assign(new CardInstance(), { cardId: "AD1-004" });
  permanent.currentDP = 16_000;
  permanent.securityAttack = 2;
  permanent.securityAttackModifier = 1;
  permanent.keywords.push("Rush", "Blocker", "Raid", "SecurityAttack", "Reboot");
  permanent.grantedKeywords.push("Rush", "Blocker", "Raid", "SecurityAttack", "Reboot");
  render(
    <I18nProvider>
      <PermanentView perm={permanent} />
    </I18nProvider>,
  );
  expect(screen.getByLabelText(/Active keywords:.*Security Attack \+1/)).toBeTruthy();
  expect(screen.queryByLabelText(/Active keywords:.*Security Attack \+2/)).toBeNull();
});

it("hides field references from the card name by default and keeps them accessible", () => {
  const perm = opponentWithDpDown();
  perm.permanentId = "perm-18";
  render(
    <I18nProvider>
      <PermanentView perm={perm} onClick={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  expect(screen.queryByText("#18")).toBeNull();
  expect(screen.getByRole("button", { name: /Field reference #18/ })).toBeTruthy();
});

it("prefixes the card name with the first field reference and keeps every reference accessible", () => {
  setFieldReferenceVisible(true);
  const perm = opponentWithDpDown();
  perm.permanentId = "perm-18";
  render(
    <I18nProvider>
      <PermanentView perm={perm} copies={2} fieldReferenceIds={["perm-18", "perm-25"]} onClick={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  expect(screen.getByText("#18 +1")).toBeTruthy();
  expect(screen.queryByText("#18, #25")).toBeNull();
  expect(screen.getByRole("button", { name: /Field reference #18, #25/ })).toBeTruthy();
  expect(screen.getByRole("button").getAttribute("data-permanent-id")).toBe("perm-18");
  setFieldReferenceVisible(false);
});
