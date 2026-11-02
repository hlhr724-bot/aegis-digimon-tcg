// @vitest-environment jsdom
import appHtml from "../index.html?raw";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { installTranslationCompatibility } from "./translationCompatibility";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(["Atacar", "攻擊"])(
  "updates live labels after translation to %s and inserts before the replaced Text",
  async (translatedLabel) => {
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = installTranslationCompatibility(container);
    const root = createRoot(container);
    function View({ label, before }: { label: string; before?: boolean }) {
      return (
        <button>
          {before && <span>Before</span>}
          {label}
          <span>1</span>
        </button>
      );
    }
    try {
      await act(async () => root.render(<View label="Attack" />));
      const button = container.querySelector("button")!;
      const text = button.firstChild!;
      const translated = document.createElement("font");
      translated.style.verticalAlign = "inherit";
      translated.textContent = translatedLabel;
      text.before(translated);
      text.remove();
      await act(async () => root.render(<View label="End turn" before />));
      expect(button.textContent).toBe("BeforeEnd turn1");
    } finally {
      await act(async () => root.unmount());
      dispose();
      container.remove();
    }
  },
);

it("#4943 keeps React removals and insertions working after browser translation replaces text", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = installTranslationCompatibility(container);
  const root = createRoot(container);
  function View({ show }: { show: boolean }) {
    return (
      <button>
        {show && "Attack"}
        <span>1</span>
      </button>
    );
  }
  try {
    await act(async () => root.render(<View show />));
    const button = container.querySelector("button")!;
    const text = button.firstChild!;
    const translated = document.createElement("font");
    translated.style.verticalAlign = "inherit";
    translated.textContent = "Atacar";
    text.before(translated);
    text.remove();
    await Promise.resolve();
    await act(async () => root.render(<View show={false} />));
    expect(container.querySelector("button")!.textContent).toBe("1");
    await act(async () => root.render(<View show />));
    expect(container.querySelector("button")!.textContent).toBe("Attack1");
  } finally {
    await act(async () => root.unmount());
    dispose();
    container.remove();
  }
});

it("preserves errors for ordinary invalid DOM removals", () => {
  const container = document.createElement("div");
  const dispose = installTranslationCompatibility(container);
  try {
    expect(() => container.removeChild(document.createTextNode("missing"))).toThrow(/not a child/i);
  } finally {
    dispose();
  }
});

it("does not mistake an existing translated neighbor for a replaced Text", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const translated = document.createElement("font");
  translated.style.verticalAlign = "inherit";
  translated.textContent = "Keep";
  const ordinary = document.createTextNode("Remove");
  container.append(translated, ordinary);
  const dispose = installTranslationCompatibility(container);
  try {
    container.removeChild(ordinary);
    await Promise.resolve();
    expect(() => container.removeChild(ordinary)).toThrow(/not a child/i);
    expect(container.textContent).toBe("Keep");
  } finally {
    dispose();
    container.remove();
  }
});

it("allows browser translation to Traditional Chinese on the application document", () => {
  const document = new DOMParser().parseFromString(appHtml, "text/html");
  expect(document.documentElement.getAttribute("translate")).not.toBe("no");
  expect(document.documentElement.classList.contains("notranslate")).toBe(false);
  expect(document.querySelector('meta[name="google"][content="notranslate"]')).toBeNull();
});

it.each([true, false])("removes a translated label inserted after detachment with update=%s", async (update) => {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = installTranslationCompatibility(container);
  const root = createRoot(container);
  function View({ show, label = "Digivolve" }: { show: boolean; label?: string }) {
    return (
      <span>
        <svg />
        {show && label}
      </span>
    );
  }
  try {
    await act(async () => root.render(<View show />));
    const parent = container.querySelector("span")!;
    const text = parent.lastChild!;
    const translated = document.createElement("font");
    translated.style.verticalAlign = "inherit";
    translated.textContent = "진화";
    text.remove();
    parent.append(translated);
    await Promise.resolve();
    if (update) {
      await act(async () => root.render(<View show label="Choose a card" />));
    }
    expect(parent.textContent).toBe(update ? "Choose a card" : "진화");
    await act(async () => root.render(<View show={false} />));
    expect(parent.querySelector("font")).toBeNull();
    expect(parent.querySelector("svg")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    dispose();
    container.remove();
  }
});

it("keeps React updates working when a translator swaps a Text node for another Text node", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = installTranslationCompatibility(container);
  const root = createRoot(container);
  function View({ label, show = true }: { label: string; show?: boolean }) {
    return (
      <header>
        <span>
          <svg />
          {show && label}
          <b>1</b>
        </span>
      </header>
    );
  }
  try {
    await act(async () => root.render(<View label="Your turn" />));
    const parent = container.querySelector("span")!;
    const text = parent.childNodes[1]!;
    parent.replaceChild(document.createTextNode("당신의 차례"), text);
    await Promise.resolve();
    await act(async () => root.render(<View label="Opponent's turn" />));
    expect(parent.textContent).toBe("Opponent's turn1");
    await act(async () => root.render(<View label="Opponent's turn" show={false} />));
    expect(parent.textContent).toBe("1");
    await act(async () => root.render(<View label="Digivolve" />));
    expect(parent.textContent).toBe("Digivolve1");
  } finally {
    await act(async () => root.unmount());
    dispose();
    container.remove();
  }
});

it("keeps React insertions working when a translator merges several Text nodes into one", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = installTranslationCompatibility(container);
  const root = createRoot(container);
  function View({ turn, prefix }: { turn: number; prefix?: boolean }) {
    return (
      <span>
        {prefix && <i>!</i>}
        Turn {turn}
      </span>
    );
  }
  try {
    await act(async () => root.render(<View turn={3} />));
    const parent = container.querySelector("span")!;
    parent.replaceChildren(document.createTextNode("턴 3"));
    await Promise.resolve();
    await act(async () => root.render(<View turn={4} prefix />));
    expect(parent.querySelector("i")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    dispose();
    container.remove();
  }
});

it("inserts at the vacated position when a translator removes a Text node without a replacement", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = installTranslationCompatibility(container);
  const root = createRoot(container);
  function View({ badge }: { badge?: boolean }) {
    return (
      <span>
        <i>A</i>
        {badge && <b>B</b>}
        {"Level 3"}
        <u>C</u>
      </span>
    );
  }
  try {
    await act(async () => root.render(<View />));
    const parent = container.querySelector("span")!;
    parent.childNodes[1]!.remove();
    await Promise.resolve();
    await act(async () => root.render(<View badge />));
    expect([...parent.children].map((child) => child.tagName)).toEqual(["I", "B", "U"]);
  } finally {
    await act(async () => root.unmount());
    dispose();
    container.remove();
  }
});
