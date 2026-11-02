import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { motionPreferenceSelectors } from "./motionPreferenceSelectors";

const plugin = motionPreferenceSelectors({ attribute: "data-motion", reducedValue: "reduced", fullValue: "full" });

function transform(css: string): string {
  return postcss([plugin]).process(css, { from: undefined }).css.replace(/\s+/g, " ").trim();
}

describe("motion preference selectors", () => {
  it("scopes reduced-motion rules to the reduced attribute without raising specificity", () => {
    expect(transform("@media (prefers-reduced-motion: reduce) { .card, .pile > span { animation: none; } }")).toBe(
      ':where(:root[data-motion="reduced"]) .card, :where(:root[data-motion="reduced"]) .pile > span { animation: none; }',
    );
  });

  it("scopes no-preference rules to the full attribute", () => {
    expect(transform("@media (prefers-reduced-motion: no-preference) { .coach { transition: opacity 1s; } }")).toBe(
      ':where(:root[data-motion="full"]) .coach { transition: opacity 1s; }',
    );
  });

  it("keeps the other media features", () => {
    expect(
      transform(
        "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) { .card:hover { scale: 1.1; } }",
      ),
    ).toBe(
      '@media (hover: hover) and (pointer: fine) { :where(:root[data-motion="full"]) .card:hover { scale: 1.1; } }',
    );
  });

  it("attaches the attribute to selectors that already target the root", () => {
    expect(transform("@media (prefers-reduced-motion: reduce) { :root, html.dark body { --speed: 0s; } }")).toBe(
      ':root:where([data-motion="reduced"]), html:where([data-motion="reduced"]).dark body { --speed: 0s; }',
    );
  });

  it("leaves keyframes and nested rules alone", () => {
    expect(
      transform(
        "@media (prefers-reduced-motion: reduce) { @keyframes calm { from { opacity: 0; } } .card { & .face { opacity: 1; } } }",
      ),
    ).toBe(
      '@keyframes calm { from { opacity: 0; } } :where(:root[data-motion="reduced"]) .card { & .face { opacity: 1; } }',
    );
  });

  it("leaves unrelated media queries alone", () => {
    expect(transform("@media (width < 600px) { .card { width: 40px; } }")).toBe(
      "@media (width < 600px) { .card { width: 40px; } }",
    );
  });

  it.each([
    ["@media (prefers-reduced-motion: reduce), (width < 600px) { .card { opacity: 1; } }", "Split this media query"],
    ["@media not (prefers-reduced-motion: reduce) { .card { opacity: 1; } }", "Split this media query"],
    ["@media (prefers-reduced-motion) { .card { opacity: 1; } }", "Write the motion feature"],
    [".card { @media (prefers-reduced-motion: reduce) { opacity: 1; } }", "Move this motion-preference media query"],
  ])("refuses a query it cannot translate: %s", (css, message) => {
    expect(() => transform(css)).toThrow(message);
  });
});
