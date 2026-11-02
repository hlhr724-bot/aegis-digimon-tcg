// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import { setEffectPromptPosition } from "../../effectPromptPosition";
import { DecisionOverlay } from "./DecisionOverlay";
import { sourceClearPlacement } from "./useSourceClearPlacement";

describe("sourceClearPlacement", () => {
  it("caps the prompt below a source card on the viewer's field", () => {
    expect(sourceClearPlacement({ source: { bottom: 244 }, viewportHeight: 844 })).toEqual({ space: 576 });
  });

  it("keeps the usual placement when the card sits too low for a readable clause", () => {
    expect(sourceClearPlacement({ source: { bottom: 484 }, viewportHeight: 844 })).toBeUndefined();
  });
});

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;
function viewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("phone activation prompt", () => {
  it.each(["LM-034", "ST1-02"])(
    "translates the printed effect using its provenance rather than the host %s",
    async (sourceCardId) => {
      render(
        <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
          <DecisionOverlay
            request={{
              decisionId: "translated-activation",
              seat: 0,
              kind: "optional",
              promptText: "Activate this effect?",
              options: { timing: "Main", effectTextCardId: "LM-034" },
            }}
            sourceCardId={sourceCardId}
            candidates={[]}
            picks={[]}
            onTogglePick={() => undefined}
            onRespond={() => undefined}
          />
        </I18nContext.Provider>,
      );
      await waitFor(() =>
        expect(screen.getByRole("dialog").querySelector(".decision-overlay__effect-text")?.textContent).toContain(
          "蓝色/红色数码宝贝卡牌",
        ),
      );
      expect(screen.getByRole("dialog").querySelector(".decision-overlay__effect-text")?.textContent).not.toContain(
        "内存值",
      );
    },
  );

  beforeEach(() => {
    viewport(390, 844);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("width < 768px"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    localStorage.setItem("aegis.locale", "en");
    setEffectPromptPosition("left");
  });
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    viewport(originalWidth, originalHeight);
  });

  it("stays clear of the permanent whose effect asks (P-240)", async () => {
    const source = document.createElement("div");
    source.dataset.drop = "perm-you";
    source.dataset.id = "source";
    source.getBoundingClientRect = () =>
      ({ top: 160, bottom: 244, left: 150, right: 210, width: 60, height: 84 }) as DOMRect;
    document.body.append(source);
    render(
      <I18nProvider>
        <DecisionOverlay
          request={{
            decisionId: "activation",
            seat: 0,
            kind: "optional",
            promptText: "Activate this effect?",
            sourcePermanentId: "source",
          }}
          candidates={[]}
          picks={[]}
          onTogglePick={() => undefined}
          onRespond={() => undefined}
        />
      </I18nProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const panel = screen.getByRole("dialog");
    expect(panel.dataset.sourceClear).toBe("below");
    expect(panel.style.getPropertyValue("--effect-prompt-source-space")).toBe("576px");
  });
});
