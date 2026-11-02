// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeStack } from "./NoticeStack";
import { NOTICE_LIFETIME_MS } from "./notices";
import { I18nProvider } from "../i18n";
import { BoardInputLock, PermanentView } from "./piece";
import { PermanentDetailInspector, StackViewerOverlay } from "./overlay";
import { buildPermanentDetail } from "./permanentDetail";
import { SecurityClash } from "./SecurityClashView";
import {
  buildSecurityClashScene,
  buildSecurityDestructionScene,
  buildSecurityDockScene,
  buildSecurityRevealScene,
} from "./securityClash";
import { SecurityScenes } from "./screen/layout/SecurityScenes";
import { Side } from "./side";

afterEach(() => cleanup());

function card(instanceId: string, cardId: string): CardInstance {
  const instance = new CardInstance();
  instance.instanceId = instanceId;
  instance.cardId = cardId;
  return instance;
}

function permanent(): Permanent {
  const perm = new Permanent();
  perm.permanentId = "opponent-agumon";
  perm.controllerSeat = 1;
  perm.topCard = card("top", "BT1-010");
  perm.stack.push(card("source", "AD1-001"));
  perm.baseDP = 2000;
  perm.currentDP = 2000;
  return perm;
}

describe("security feedback", () => {
  it("removes the departing reveal while retaining its matching dock and clears both on close", () => {
    const identity = { key: 1, revealedCardId: "BT1-010", defenderSeat: 1 as const, viewerSeat: 0 as const };
    const reveal = { ...buildSecurityRevealScene(identity), departing: true };
    const dock = buildSecurityDockScene(identity);
    function scenes(showReveal: boolean, showDock: boolean) {
      return (
        <I18nProvider>
          <SecurityScenes
            securityBreak={null}
            securityClash={showReveal ? reveal : null}
            securityBranch={showDock ? dock : null}
            optionBranch={null}
            zoneShowcase={null}
            revealShowcase={null}
            compact={false}
          />
        </I18nProvider>
      );
    }
    const { rerender } = render(scenes(true, false));
    rerender(scenes(true, true));
    expect(screen.getByTestId("security-clash")).toBeTruthy();
    expect(screen.getByTestId("security-branch")).toBeTruthy();
    rerender(scenes(false, true));
    expect(screen.queryByTestId("security-clash")).toBeNull();
    expect(screen.getAllByTestId("security-branch")).toHaveLength(1);
    rerender(scenes(false, false));
    expect(screen.queryByTestId("security-clash")).toBeNull();
    expect(screen.queryByTestId("security-branch")).toBeNull();
  });

  it("summarizes a revealed security card without a blocking dialog", () => {
    render(
      <I18nProvider>
        <SecurityClash
          scene={buildSecurityClashScene({
            key: 1,
            revealedCardId: "BT1-010",
            resolution: "effect",
            defenderSeat: 1,
            viewerSeat: 0,
          })}
        />
      </I18nProvider>,
    );

    const scene = screen.getByRole("status");
    expect(scene.textContent).toContain("Security check");
    expect(scene.textContent).toContain("Agumon");
    expect(scene.textContent).toContain("Security effect triggers");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stages the attacker opposite the revealed card and compares their DP", () => {
    render(
      <I18nProvider>
        <SecurityClash
          scene={buildSecurityClashScene({
            key: 2,
            revealedCardId: "BT1-010",
            resolution: "battle",
            defenderSeat: 1,
            viewerSeat: 0,
            attacker: { seat: 0, cardId: "BT1-019" },
          })}
        />
      </I18nProvider>,
    );

    const scene = screen.getByTestId("security-clash");
    expect(scene.getAttribute("data-resolution")).toBe("battle");
    expect(scene.querySelector('[data-role="attacker"][data-side="you"]')).toBeTruthy();
    expect(scene.querySelector('[data-role="revealed"][data-side="opp"]')).toBeTruthy();
    expect(screen.getAllByText(/DP$/).length).toBe(2);
    expect(screen.getByText("VS")).toBeTruthy();
  });

  it("Discord 1556410279602946198: shows a pending check without promising a battle or a security effect", () => {
    render(
      <I18nProvider>
        <SecurityClash
          scene={buildSecurityRevealScene({
            key: 4,
            revealedCardId: "EX13-033",
            defenderSeat: 1,
            viewerSeat: 0,
            attacker: { seat: 0, cardId: "EX12-030" },
            securityCardDP: 7000,
            attackerDP: 7000,
          })}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Resolving security check")).toBeTruthy();
    expect(screen.queryByText("VS")).toBeNull();
  });

  it("Discord 1556410279602946198: an attacker removed by a field effect does not receive a battle verdict", () => {
    render(
      <I18nProvider>
        <SecurityClash
          scene={buildSecurityClashScene({
            key: 5,
            revealedCardId: "EX13-033",
            resolution: "trashed",
            defenderSeat: 1,
            viewerSeat: 0,
            attacker: { seat: 0, cardId: "EX12-030" },
          })}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Security card trashed")).toBeTruthy();
    expect(screen.queryByText("No effect, trashed")).toBeNull();
    expect(screen.queryByText("VS")).toBeNull();
    expect(screen.getByTestId("security-clash").querySelector(".battle-clash__flash")).toBeNull();
  });

  it("stages a destroyed security card alone with nothing printed around it", () => {
    render(
      <I18nProvider>
        <SecurityClash
          scene={buildSecurityDestructionScene({ key: 3, cardId: "BT1-010", trashedSeat: 1, viewerSeat: 0 })}
        />
      </I18nProvider>,
    );

    const scene = screen.getByTestId("security-clash");
    expect(scene.getAttribute("data-cause")).toBe("destruction");
    expect(scene.querySelector(".battle-clash__badge")).toBeNull();
    expect(scene.querySelector(".battle-clash__caption")).toBeNull();
    expect(scene.querySelector(".battle-clash__outcome")).toBeNull();
    expect(scene.textContent).toBe("");
    expect(scene.querySelectorAll(".game-card-shatter__shard")).toHaveLength(41);
    expect(scene.querySelector(".battle-clash__shatter")).toBeTruthy();
    expect(scene.getAttribute("aria-label")).toContain("Agumon");
  });

  it.each(["battle", "trashed"])("keeps a checked card whole before its %s disposal", (resolution) => {
    render(
      <I18nProvider>
        <SecurityClash
          scene={buildSecurityClashScene({
            key: 1,
            revealedCardId: "BT1-010",
            resolution,
            defenderSeat: 1,
            viewerSeat: 0,
            attacker: { seat: 0, cardId: "BT1-019" },
            battle:
              resolution === "battle"
                ? { attackerDP: 4000, securityCardDP: 2000, attackerDeleted: false, securityDigimonDeleted: true }
                : undefined,
          })}
        />
      </I18nProvider>,
    );
    const card = screen.getByTestId("security-clash").querySelector('[data-role="revealed"]');
    expect(card?.querySelector(".battle-clash__shatter")).toBeNull();
    expect(card?.querySelector("img")).toBeTruthy();
    if (resolution === "battle") expect(card?.querySelector(".game-claw")).toBeTruthy();
  });

  it("announces recovery without exposing a card identity", () => {
    render(
      <I18nProvider>
        <NoticeStack
          notice={{
            id: "n1",
            side: Side.Viewer,
            fromSecurity: false,
            createdAt: 0,
            body: { variant: "recovery", amount: 2 },
          }}
          remainingMs={NOTICE_LIFETIME_MS}
          onDismiss={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("status").textContent).toContain("Recovery +2");
    expect(screen.getByRole("status").textContent).toContain("Your security increased");
  });
});

describe("opponent permanent inspection", () => {
  it("does not show a floating card preview over a permanent", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn<typeof window.matchMedia>().mockReturnValue({
      matches: true,
      media: "",
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
    try {
      render(
        <I18nProvider>
          <PermanentView perm={permanent()} />
        </I18nProvider>,
      );

      fireEvent.mouseMove(screen.getByTitle("Agumon"), { clientX: 120, clientY: 120 });

      expect(screen.getAllByAltText("Agumon")).toHaveLength(1);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps the large preview inside the stack viewer", () => {
    render(
      <I18nProvider>
        <StackViewerOverlay
          title="Agumon"
          cards={[
            { cardId: "BT1-010", role: "top" },
            { cardId: "AD1-001", role: "stack" },
          ]}
          canAttack={false}
          onAttack={() => undefined}
          onClose={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Greymon/ }));

    const previews = screen.getAllByAltText("Greymon");
    expect(previews.some((image) => image.getAttribute("style")?.includes("width: 260px"))).toBe(true);
  });

  it("keeps drag interactions keyboard accessible with a pointer cursor and no hover details", () => {
    const onPointerDown = vi.fn<(event: React.PointerEvent) => void>();
    const onKeyboardActivate = vi.fn<() => void>();
    render(
      <I18nProvider>
        <PermanentView perm={permanent()} onPointerDown={onPointerDown} onKeyboardActivate={onKeyboardActivate} />
      </I18nProvider>,
    );

    const target = screen.getByRole("button", { name: /^Agumon, \(BT1-010\), Field reference #/ });
    expect(target.style.cursor).toBe("pointer");
    fireEvent.mouseEnter(target);
    fireEvent.focus(target);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(onKeyboardActivate).not.toHaveBeenCalled();
    fireEvent.keyDown(target, { key: "Enter" });
    expect(onKeyboardActivate).toHaveBeenCalledOnce();
    fireEvent.pointerDown(target);
    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it("shows the top effect and inherited effects in stack order", () => {
    render(
      <I18nProvider>
        <PermanentDetailInspector detail={buildPermanentDetail(permanent())} anchorX={100} anchorY={100} />
      </I18nProvider>,
    );

    const inspector = screen.getByRole("tooltip");
    expect(inspector.textContent).toContain("Agumon");
    expect(inspector.textContent).toContain("Reveal 5 cards from the top of your deck");
    expect(inspector.textContent).toContain("Greymon");
    expect(inspector.textContent).toContain("＜Raid＞");
  });

  it("shows granted text in the recipient's tooltip only while active", () => {
    const recipient = permanent();
    recipient.grantedEffectTexts.push("[End of Your Turn] Delete 1 of your Digimon.");
    const { rerender } = render(
      <I18nProvider>
        <PermanentDetailInspector detail={buildPermanentDetail(recipient)} anchorX={100} anchorY={100} />
      </I18nProvider>,
    );
    expect(screen.getByRole("region", { name: "Granted effects" }).textContent).toContain(
      "[End of Your Turn] Delete 1 of your Digimon.",
    );
    recipient.grantedEffectTexts.clear();
    rerender(
      <I18nProvider>
        <PermanentDetailInspector detail={buildPermanentDetail(recipient)} anchorX={100} anchorY={100} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("region", { name: "Granted effects" })).toBeNull();
  });
});

describe("board input lock", () => {
  it("covers its surface without drawing anything on it", () => {
    render(<BoardInputLock />);

    const lock = screen.getByTestId("board-input-lock");
    expect(lock.textContent).toBe("");
    expect(lock.getAttribute("aria-hidden")).toBe("true");
  });
});
