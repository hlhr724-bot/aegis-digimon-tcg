import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mediaRules, readStylesheet } from "./style/stylesheetSource";

const gameCss = readStylesheet("game.css");
const fieldDecisionRailCss = readFileSync(new URL("./overlay/fieldDecisionRail.css", import.meta.url), "utf8");

/**
 * The overlays live one component per file under ./overlay, so a component's own
 * file is its whole body — no slicing a shared source string between two
 * `export function` markers, which is what this had to do when they shared one.
 */
const overlaySources = new Map<string, string>();
for (const group of ["", "combat/", "choice/", "viewer/", "match/"]) {
  const directory = new URL(`./overlay/${group}`, import.meta.url);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name !== "index.ts")
      overlaySources.set(entry.name, readFileSync(new URL(entry.name, directory), "utf8"));
  }
}
const overlaysSource = [...overlaySources.values()].join("\n");

/** One overlay component's source, by component name. */
function overlaySource(name: string): string {
  const source = overlaySources.get(`${name}.tsx`);
  if (source === undefined) throw new Error(`no overlay component file for ${name}`);
  return source;
}
/** Every source file of a folder and its subfolders, barrels excluded. */
function folderSources(folder: string): string[] {
  return readdirSync(new URL(folder, import.meta.url), {
    withFileTypes: true,
  }).flatMap((entry) =>
    entry.isDirectory()
      ? folderSources(`${folder}${entry.name}/`)
      : entry.name === "index.ts"
        ? []
        : [readFileSync(new URL(`${folder}${entry.name}`, import.meta.url), "utf8")],
  );
}
/** The screen's hooks, model, layout, queries and shared types all sit under ./screen. */
const gameScreenSource = [
  readFileSync(new URL("./GameScreen.tsx", import.meta.url), "utf8"),
  ...folderSources("./screen/"),
].join("\n");
/** The board pieces live one per file under ./piece, so the hand's gesture and
 *  overflow chrome is spread across the component, its hook and its layout maths. */
const boardPiecesSource = readdirSync(new URL("./piece/", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name !== "index.ts")
  .map((entry) => readFileSync(new URL(`./piece/${entry.name}`, import.meta.url), "utf8"))
  .join("\n");
/** The phone block: narrow, or short and on its side. */
const portraitRules = mediaRules(gameCss, "(width < 600px), (height < 520px) and (orientation: landscape)");
/** The landscape-phone block, which re-lays the board for a short viewport. */
const landscapeRules = mediaRules(
  gameCss,
  "(width < 600px) and (orientation: landscape), (height < 520px) and (orientation: landscape)",
);
/** Where the sidebar stops being a column and becomes a strip along the bottom. */
const stripRules = mediaRules(gameCss, "(width < 960px)");
/** Phone portrait only: the floating stacks and the board-mode sheet. */
const phonePortraitRules = mediaRules(gameCss, "(width < 600px) and (orientation: portrait)");
/** Narrow width at any orientation — a landscape phone is ~844px wide, so it is not this. */
const narrowWidthRules = mediaRules(gameCss, "(width < 600px)");
/** Portrait phones and small tablets whose dialogs cannot sustain the desktop two-column chooser. */
const compactDialogRules = mediaRules(gameCss, "(width < 768px)");
/** Pointer widths, which keep the full-size fanned hand. */
const pointerWidthRules = mediaRules(gameCss, "(width >= 960px)");

describe("mobile portrait match layout", () => {
  it("keeps the match inside the viewport and limits scrolling to cards", () => {
    expect(portraitRules).toBeDefined();
    expect(portraitRules).toMatch(/\.game-layout \{[^}]*overflow:\s*hidden/);
    expect(portraitRules).toMatch(/\.game-board \{[^}]*min-height:\s*0/);
    expect(portraitRules).toMatch(/\.game-field \{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(portraitRules).toMatch(/\.game-battle-zones \{[^}]*overflow:\s*hidden/);
    expect(portraitRules).toMatch(
      /\.game-battle-zones > div:last-child \{[^}]*overflow-x:\s*auto[^}]*scroll-snap-type/,
    );
    expect(portraitRules).toMatch(/\[data-testid="hand"\] \{[^}]*overflow-x:\s*auto[^}]*scroll-snap-type/);
    expect(portraitRules).toMatch(/\.game-sidebar \{[^}]*overflow:\s*hidden/);
    expect(portraitRules).toMatch(
      /\.game-action-bar--contextual \{[^}]*position:\s*fixed[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*auto/,
    );
    expect(portraitRules).not.toMatch(/\.game-field \{[^}]*height:\s*660px/);
    expect(portraitRules).not.toMatch(/min-height:\s*250px/);
  });

  it("stacks the board into rows instead of sizing regions by hand", () => {
    // The board, the field and the player dock are each a grid whose rows/columns
    // absorb the viewport, so no region needs a hardcoded pixel height.
    expect(portraitRules).toMatch(/\.game-board \{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
    expect(portraitRules).toMatch(/\.game-field \{[^}]*grid-template-columns:[^}]*minmax\(0, 1fr\)/);
    expect(portraitRules).toMatch(/\.game-player-dock \{[^}]*grid-template-rows:\s*auto auto[^}]*overflow:\s*hidden/);
    expect(portraitRules).toMatch(
      /\.game-battle-zones \{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/,
    );
  });

  it("hides the sidebar panels that do not belong on a phone", () => {
    // The log, the memory readout and the phase list are all reachable elsewhere on
    // mobile; only the action buttons (2nd child) survive.
    expect(portraitRules).toMatch(
      /\.game-sidebar > div:first-child,\s*\.game-sidebar > div:nth-child\(3\),\s*\.game-sidebar > div:last-child \{\s*display:\s*none/,
    );
    // The idle bar only repeats the viewer's own name and hand count.
    expect(portraitRules).toMatch(/\.game-action-bar--idle \{\s*display:\s*none/);
  });

  it("sizes board pieces for real instead of scaling them with transforms", () => {
    // A `transform: scale()` shrinks what is painted but not the layout box, so the
    // piles and permanents used to overflow their rails and get clipped. Compact
    // sizes now come from the `compact` prop in boardPieces.tsx.
    expect(portraitRules).not.toMatch(/transform:\s*scale\(/);
    // The full memory gauge is ~950px wide; the compact one must flex to the column.
    expect(portraitRules).not.toMatch(/\.game-memory-gauge \{[^}]*width:\s*max-content/);
  });

  it("lets a sideways swipe scroll the hand instead of dragging a card", () => {
    // `touch-action: none` on the cards left the browser unable to pan the row they
    // sit in, so the hand could not be scrolled. `pan-x` hands sideways swipes to
    // the scroller and leaves steeper drags (play / attack) to the pointer handlers.
    expect(portraitRules).not.toMatch(/touch-action:\s*none/);
    expect(portraitRules).toMatch(/\[data-testid="hand"\] > div \{[^}]*touch-action:\s*pan-x/);
    expect(portraitRules).toMatch(/\.game-battle-zones > div:last-child > div \{[^}]*touch-action:\s*pan-x/);
  });

  it("lays the hand out as whole cards a finger can hit", () => {
    // The row scrolls, so burying a card under its neighbour bought no room and
    // left the overlapped edge selecting the wrong card.
    expect(portraitRules).not.toMatch(/\[data-testid="hand"\] > div \{[^}]*margin-left:\s*-/);
    expect(portraitRules).toMatch(/\[data-testid="hand"\] > div \{[^}]*margin-left:\s*var\(--game-hand-gap\)/);
  });

  it("gives field cards and hand cards a touch sheet", () => {
    // Hand cards and field cards share one sheet, so a tapped card reads the same
    // wherever it lives. Nothing may resurrect the old centred preview.
    expect(portraitRules).not.toMatch(/hand-card-preview/);
    expect(portraitRules).toMatch(/\.card-action-sheet \{[^}]*position:\s*fixed[^}]*align-items:\s*end/);
    expect(portraitRules).toMatch(/\.card-action-sheet__actions > button \{[^}]*min-height:\s*44px/);
  });

  it("keeps a sheet action's icon at full width beside a wrapping label", () => {
    // The labels may give up width to wrap; the leading ⚡ or icon may not.
    expect(portraitRules).toMatch(
      /\.card-action-sheet__actions > button > :is\(svg, \[aria-hidden="true"\]\) \{[^}]*flex-shrink:\s*0/,
    );
  });

  it("turns every centred match dialog into a bottom sheet", () => {
    expect(portraitRules).toMatch(
      /\.game-modal,[\s\S]*?\.aegis-dialog-layer:has\(\.game-modal__panel\) \{[^}]*position:\s*fixed[^}]*align-items:\s*flex-end/,
    );
    expect(portraitRules).toMatch(/\.game-modal__panel \{[^}]*width:\s*100%[^}]*max-width:\s*none/);
    // A bare panel brings no scrim, so it pins itself to the viewport bottom.
    expect(portraitRules).toMatch(/\.game-modal__panel--bare \{[^}]*position:\s*fixed[^}]*bottom:\s*0/);
    // Flex rows default to min-width:auto, which is what pushed the confirm
    // dialog past the right edge instead of wrapping its text.
    expect(portraitRules).toMatch(/\.game-modal__panel > div \{\s*min-width:\s*0/);
  });

  it("keeps target-selection dialogs inside the viewport with only their candidates scrolling", () => {
    expect(overlaysSource).toMatch(/decision-overlay--selection/);
    expect(gameCss).toMatch(
      /\.decision-overlay--selection \{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*max-height:\s*min\(calc\(100dvh - 7\.5rem - var\(--ds-space-6\)\), calc\(100% - 7rem\)\)[^}]*overflow:\s*hidden/,
    );
    expect(gameCss).toMatch(
      /\.decision-overlay--selection \.decision-overlay__selection \{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/,
    );
    expect(gameCss).toMatch(
      /\.decision-overlay--selection \.decision-overlay__footer \{[^}]*position:\s*static[^}]*bottom:\s*auto[^}]*flex:\s*none[^}]*margin-bottom:\s*0[^}]*padding-bottom:\s*0/,
    );
  });

  it("declares the board metrics where the portalled overlays can read them", () => {
    // The rail and the other match overlays portal into #aegis-stage, a sibling of
    // the layout: a metric scoped to .game-layout is undefined there, and the
    // rail's `bottom: calc(var(--game-hand-h) …)` fell back to `auto` — the stage
    // clipped away the pending decision's only exit.
    expect(portraitRules).toMatch(/:root \{[^}]*--game-hand-h:\s*calc\(var\(--hand-card-width\)/);
    expect(phonePortraitRules).toMatch(/:root \{[^}]*--game-rail:\s*4rem/);
    expect(gameCss).not.toMatch(/\.game-layout \{[^}]*--game-(rail|hand-h|sidebar-h)/);
    expect(gameCss).not.toMatch(/\.game-layout \{[^}]*--hand-card-width/);
  });

  it("keeps the contextual action bar under the whole dialog tier", () => {
    // On the toast tier the bar held its band at the bottom of the screen while a
    // bottom sheet was open there, and painted over the sheet's own action row.
    expect(portraitRules).toMatch(/\.game-action-bar--contextual \{[^}]*z-index:\s*calc\(var\(--ds-z-dialog\) - 6\)/);
    expect(landscapeRules).toMatch(/\.game-action-bar--contextual \{[^}]*z-index:\s*calc\(var\(--ds-z-dialog\) - 6\)/);
    expect(gameCss).not.toMatch(/\.game-action-bar--contextual \{[^}]*var\(--ds-z-toast\)/);
  });

  it("keeps the pending-decision return control below the mobile opponent bar", () => {
    expect(gameCss).toMatch(
      /\.decision-board-return \{[^}]*position:\s*fixed[^}]*z-index:\s*calc\(var\(--ds-z-toast\) - 1\)[^}]*env\(safe-area-inset-top/,
    );
    // A bottom control can sit underneath iOS browser chrome. The document-body
    // portal is anchored below the opponent row and explicitly clears bottom.
    expect(portraitRules).toMatch(
      /\.decision-board-return \{[^}]*top:\s*calc\(env\(safe-area-inset-top,[^}]*bottom:\s*auto/,
    );
    expect(portraitRules).toMatch(
      /\.decision-board-return > button:not\(\.decision-board-return__move-handle\) \{[^}]*min-height:\s*44px/,
    );
  });

  it("spends the decision sheet on the targets, not on its header", () => {
    // The header is one line — no gradient panel, no full-width row for the board
    // pill — so the card grid and the confirm button keep the screen.
    expect(portraitRules).toMatch(/\.decision-overlay__header \{[^}]*align-items:\s*center[^}]*flex-wrap:\s*nowrap/);
    expect(portraitRules).toMatch(/\.decision-overlay__heading \{[^}]*padding:\s*0[^}]*background:\s*none/);
    expect(portraitRules).toMatch(/\.decision-overlay__title \{[^}]*font-size:\s*1\.0625rem/);
    // The pill shares the header line but still answers to the touch floor.
    expect(portraitRules).toMatch(
      /\.decision-overlay__view-board \{[^}]*width:\s*auto[^}]*min-height:\s*44px[^}]*border-radius:\s*999px/,
    );
  });

  it("gives the target row a gutter so the sheet edge never slices a card", () => {
    // The sheet clips past its padding box and each tile carries chrome outside its
    // own edges (the order badge sits 6px past the corner), so the row pads itself
    // and centres safely — plain centring would strand the first card of a row that
    // scrolls sideways.
    expect(portraitRules).toMatch(/\.decision-overlay__grid \{[^}]*justify-content:\s*safe center[^}]*padding:\s*8px/);
  });

  it("lets the effect text flow whole instead of hiding its tail in a scroll box", () => {
    // The wording the choice hinges on always reads in full at a denser size; the
    // sheet's own scroll is the only scroll.
    expect(portraitRules).toMatch(
      /\.decision-overlay__effect-text \{[^}]*font-size:\s*calc\(0\.6875rem \* var\(--ds-text-scale\)\)/,
    );
    expect(portraitRules).not.toMatch(/\.decision-overlay__effect-text \{[^}]*max-height/);
  });

  it("shrinks the board-mode decision rail so the phone board stays readable", () => {
    // The rail is the only way to answer a board-mode decision, so its actions must
    // never be pushed off: it takes a fraction of the width, shows the printed
    // clause whole, and only the rail itself scrolls when it outgrows the screen.
    expect(portraitRules).toMatch(/\.board-prompt \{[^}]*width:\s*min\(15rem, 46vw\)/);
    expect(gameCss).not.toMatch(/\.board-prompt__clause \{[^}]*max-height/);
    expect(gameCss).toMatch(/\.board-prompt \{[^}]*overflow-y:\s*auto/);
    // The opponent pill clears the phone opponent bar instead of painting over it.
    expect(portraitRules).toMatch(/\.board-opponent-pill \{[^}]*top:\s*3\.5rem/);
  });
});

describe("keyword save prompt answers fit a phone", () => {
  // "Sim, descartar segurança" and "Não, deixe ser deletado" overflowed a side-by-side
  // row. The prompt now uses the board rail, whose answers stack one per line.
  it("uses the board rail and leads with the accepting answer", () => {
    const body = overlaySource("KeywordSavePrompt");
    expect(body).toMatch(/<BoardPromptRail[^>]*variant="prompt"/);
    expect(body).not.toMatch(/game-actions-row/);
    expect(body.indexOf('t("overlay.use")')).toBeGreaterThan(-1);
    expect(body.indexOf('t("overlay.notUse")')).toBeGreaterThan(-1);
    expect(body.indexOf('t("overlay.use")')).toBeLessThan(body.indexOf('t("overlay.notUse")'));
  });
});

describe("choice rows lead with the affirmative action", () => {
  // The affirmative action leads the DOM, so it also leads the tab order. A row
  // reverses to put it on the right; stacked, DOM order already reads top-down.
  it("reverses horizontal rows so the leading action sits on the right", () => {
    expect(gameCss).toMatch(/\.game-actions-row \{[^}]*flex-direction:\s*row-reverse/);
    expect(gameCss).toMatch(/\.mulligan-actions \{[^}]*flex-direction:\s*row-reverse/);
  });

  it.each([
    ["ActionConfirmationOverlay", "{confirmLabel}", "common.cancel"],
    ["GameOverOverlay", "overlay.findRematch", "overlay.mainMenu"],
    ["MulliganOverlay", "overlay.keep", "overlay.mulligan"],
  ])("%s lists its confirming action before %s", (name, confirming, trailing) => {
    const body = overlaySource(name);
    expect(body).toMatch(/className="(game-actions-row|mulligan-actions)"/);
    expect(body.indexOf(confirming)).toBeGreaterThan(-1);
    expect(body.indexOf(confirming)).toBeLessThan(body.indexOf(trailing));
  });
});

describe("large material rows put confirmation on the right", () => {
  it("lists secondary exits before the DigiXros confirmation", () => {
    const body = overlaySource("DigiXrosMaterialOverlay");
    expect(body.indexOf('t("common.cancel")')).toBeGreaterThan(-1);
    expect(body.indexOf('t("common.cancel")')).toBeLessThan(body.indexOf('t("overlay.xrosConfirmOne")'));
    const promptCss = readFileSync(new URL("./overlay/effectPromptLayout.css", import.meta.url), "utf8");
    expect(promptCss).toMatch(/\.material-prompt__footer\s+\.game-actions-row \{\s*flex-direction:\s*row/);
  });
});

describe("match overlays opt into the mobile sheet", () => {
  // Every dialog-style overlay on the match screen must carry the shared classes,
  // otherwise it keeps its desktop centring on a phone and overflows the viewport.
  // GameOverOverlay is deliberately absent: it is no longer a dialog on top of
  // the board but the full-screen result splash, which owns the whole viewport
  // and scrolls itself (asserted below) rather than sitting in a sheet.
  // The stack viewer renders through two panels: the touch sheet and the desktop
  // dialog. It is the dialog that has to carry the tag.
  const OVERLAYS = [
    "StackViewerDialog",
    "TrashViewerOverlay",
    "DigiXrosMaterialOverlay",
    "ActionConfirmationOverlay",
    "DecisionOverlay",
  ];

  it.each(OVERLAYS)("%s tags a panel", (name) => {
    expect(overlaySource(name)).toContain("game-modal__panel");
  });
});

describe("the result splash owns the whole screen", () => {
  // It replaces the board rather than covering it, so on a phone it has to lay
  // its own contents out and scroll them instead of relying on the sheet rules.
  it("fills the viewport and scrolls its own contents", () => {
    const rules = gameCss.slice(gameCss.indexOf(".game-result {"));
    expect(rules).toMatch(/\.game-result \{[^}]*position:\s*absolute/);
    expect(rules).toMatch(/\.game-result \{[^}]*inset:\s*0/);
    expect(rules).toMatch(/\.game-result \{[^}]*overflow:\s*auto/);
  });

  it("sizes the one big word against the viewport", () => {
    expect(gameCss).toMatch(/\.game-result__title \{[^}]*font-size:\s*clamp\(/);
  });

  it("stacks result actions on narrow or short viewports", () => {
    expect(gameCss).toMatch(/@media \(width < 600px\), \(height < 520px\)/);
    expect(gameCss).toMatch(/\.game-result \.game-actions-row \{[^}]*grid-template-columns:\s*1fr/);
    expect(gameCss).toMatch(/\.game-result \.game-actions-row > \.aegis-button \{[^}]*min-width:\s*0/);
    expect(gameCss).toMatch(/\.game-result \{[^}]*overflow-x:\s*hidden/);
  });

  it("keeps result content inside its panel when browser text is enlarged", () => {
    expect(gameCss).toMatch(/\.game-result__panel \{[^}]*container-type:\s*inline-size/);
    expect(gameCss).toMatch(/\.game-result__title \{[^}]*font-size:\s*clamp\([^)]*cqi/);
    expect(gameCss).toMatch(/\.game-result \.game-actions-row \{[^}]*grid-template-columns:\s*repeat\(/);
    expect(gameCss).toMatch(/\.game-result__stats \{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)/);
    expect(gameCss).toMatch(/\.game-result__stat \{[^}]*min-width:\s*0/);
  });
});

describe("the sidebar strip", () => {
  it("lays the footer buttons side by side", () => {
    // Stacked, the report and the surrender buttons are taller than the strip itself.
    expect(stripRules).toBeDefined();
    expect(stripRules).toMatch(/\.game-sidebar__footer \{[^}]*flex-direction:\s*row/);
  });
});

describe("the phone rules win the cascade", () => {
  // Narrow-viewport blocks share their base rules' specificity, so they only win
  // by coming later in the file. They used to sit in the middle of it, and every
  // base rule written below silently defeated its own phone override — the
  // end-turn orb, for one, kept its 5.4rem desktop diameter on a phone.
  const responsiveStart = gameCss.indexOf("@media (width < 1240px)");

  it("keeps every width-based block after the last base rule", () => {
    expect(responsiveStart).toBeGreaterThan(-1);
    const base = gameCss.slice(0, responsiveStart);
    const afterResponsive = gameCss.slice(responsiveStart);
    // Only media blocks (and the trailing reduced-motion one) may follow.
    expect(afterResponsive.replace(/@media[^{]*\{[\s\S]*/, "")).not.toMatch(/^\s*\.[\w-]+[^{]*\{/m);
    expect(base).toMatch(/\.game-end-turn-orb \{/);
  });

  it("shrinks the end-turn orb on a phone", () => {
    expect(portraitRules).toMatch(/\.game-end-turn-orb \{[^}]*width:\s*3\.4rem/);
  });
});

describe("nothing on the phone board is clipped by its neighbour", () => {
  it("floors the hand dock so the action strip cannot squeeze it", () => {
    expect(portraitRules).toMatch(/\.game-hand-dock \{[^}]*min-height:\s*calc\(var\(--game-hand-h\)/);
    expect(portraitRules).toMatch(/--game-hand-h:\s*calc\(var\(--hand-card-width\)/);
  });

  it("drops the action strip while it holds no action", () => {
    expect(portraitRules).toMatch(
      /\.game-sidebar > div:nth-child\(2\):not\(:has\(button\)\) \{\s*display:\s*none !important/,
    );
  });

  it("sizes the bottom action strip by the button it holds", () => {
    // At 3.25rem the row left a 36px content box for a control the touch rules
    // floor at 44px, and the sidebar's own clip took the missing 8px off the
    // bottom of the breeding step's only action.
    expect(phonePortraitRules).toMatch(
      /\.game-sidebar > div:nth-child\(2\) \{[^}]*height:\s*auto[^}]*min-height:\s*calc\(44px/,
    );
  });

  it("fits the security shields inside their rail", () => {
    // The rail is 3.5rem wide; the desktop shield is 4.1rem and hung off both
    // screen edges with a slice of the chevron cut away.
    expect(portraitRules).toMatch(/\.game-security-shield \{[^}]*width:\s*3rem/);
  });

  it("caps the action sheet's card by height", () => {
    // The card is a button, and the old rule still aimed at a `div`: nothing
    // capped it and the sheet ran off the bottom of the screen.
    expect(portraitRules).toMatch(
      /\.card-action-sheet__body > \.card-action-sheet__zoom \{[^}]*height:\s*min\(30dvh, 12rem\)/,
    );
    expect(portraitRules).not.toMatch(/\.card-action-sheet__body > div:first-child \{/);
  });

  it("lays the stack viewer out as one vertical sheet with wrapping card grids", () => {
    // The desktop dialog put the state block and every role side by side, so on a
    // phone the sources ran off the right edge behind a horizontal scrollbar.
    expect(portraitRules).toMatch(/\.stack-sheet \.card-action-sheet__panel \{[^}]*max-height:\s*85dvh/);
    expect(portraitRules).toMatch(/\.stack-sheet__groups \{[^}]*display:\s*grid/);
    expect(portraitRules).toMatch(
      /\.stack-sheet__grid \{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(4\.5rem, 1fr\)\)/,
    );
    expect(portraitRules).not.toMatch(/\.stack-sheet__grid \{[^}]*overflow-x:\s*auto/);
    // The active card is a medium tap target, not a full-width blow-up.
    expect(portraitRules).toMatch(
      /\.stack-sheet \.card-action-sheet__body \{[^}]*grid-template-columns:\s*minmax\(0, 40%\)/,
    );
    expect(portraitRules).toMatch(/\.stack-sheet \.stack-viewer-state__restrictions,[\s\S]{0,80}flex-wrap:\s*wrap/);
    expect(overlaysSource).toMatch(/className="card-action-sheet stack-sheet"/);
  });

  it("leaves the digivolve cost chooser's placement to the board prompt rail", () => {
    // It renders as a `.board-prompt`, so the rail's rules dock it: the left rail on a
    // desktop and the bottom sheet on a phone. Geometry of its own would fight them.
    const placement = /\.evo-cost-prompt\s*\{[^}]*\b(position|top|bottom|left|right|transform|translate)\s*:/;
    expect(gameCss).not.toMatch(placement);
    expect(portraitRules).not.toMatch(placement);
    // The costs keep a full row of their own where the sheet lays its actions side by side.
    expect(gameCss).toMatch(/\.evo-cost-prompt__options,[^{]*\{[^}]*flex:\s*1 1 100%/);
  });

  it("spans the reveal panel across the screen", () => {
    expect(portraitRules).toMatch(/\.narration-slot \{[^}]*width:\s*auto/);
  });
});

describe("floating chrome keeps clear of the hand and the memory band", () => {
  // A narration slot spans the width on a phone in portrait, so it anchors to its
  // own screen edge and grows toward the middle, uncapped, showing its content whole.
  it("lets a narration slot show whole from its own edge", () => {
    expect(phonePortraitRules).toBeDefined();
    // No cap on a corner slot or on the notice text: every cap tried here
    // (7rem, then a dvh split) decapitated a notice's clause or a revealed
    // card's art while screen space sat empty next to it. Nothing may
    // reintroduce one.
    expect(phonePortraitRules).not.toMatch(/\.narration-slot\[data-slot="narration-[^"]+"\] \{[^}]*max-height/);
    expect(gameCss).not.toMatch(/\.match-notice__text \{[^}]*max-height/);
    // The viewer's corner clears the egg deck and the raising slot, which the
    // tablet block's 9rem sat on: a moment takes the tap meant for either.
    expect(phonePortraitRules).toMatch(/\.narration-slot\[data-slot="narration-text"\] \{[^}]*bottom:\s*calc\(17rem/);
    expect(gameCss).toMatch(/\.narration-slot\[data-slot="narration-text"\] \{[^}]*bottom:\s*calc\(11rem/);
  });

  it("drops the opponent's moment and the attack call-out below the phone feed", () => {
    // The feed starts at 6.75rem and is 3.25rem tall in portrait, so the base
    // 9.5rem put both of them underneath it: the player never read who attacked.
    expect(phonePortraitRules).toMatch(/\.narration-slot\[data-slot="narration-cards"\] \{[^}]*top:\s*calc\(10\.5rem/);
    expect(phonePortraitRules).toMatch(/\.attack-announcement \{[^}]*top:\s*calc\(10\.5rem/);
  });

  it("gives the phone's single narration band a place of its own", () => {
    // GameScreen folds both sides into one centred slot on a portrait phone; the
    // band pins below the header and spans the width.
    expect(gameScreenSource).toMatch(/const collapseNotices = narrowGameLayout && !landscapePhone;/);
    expect(gameScreenSource).toMatch(/compact=\{collapseNotices\}/);
    expect(narrowWidthRules).toMatch(/\.narration-slot\[data-slot="narration"\] \{[^}]*top:\s*calc\(3\.5rem/);
    // The clause is shown whole here too: no clamp may cut it on any layout.
    expect(narrowWidthRules).not.toMatch(/\.match-notice__text \{/);
    expect(gameCss).not.toMatch(/\.match-notice__text \{[^}]*line-clamp/);
  });

  it("gives both dismiss buttons a finger-sized target", () => {
    // Each is the only early way out of a notice or a reveal panel, and the chip
    // itself has to stay small — the target rides behind it instead.
    expect(phonePortraitRules).toMatch(/\.match-notice__close::after \{[^}]*width:\s*44px[^}]*height:\s*44px/);
    expect(phonePortraitRules).toMatch(/\.side-panel__close::after \{[^}]*width:\s*44px[^}]*height:\s*44px/);
    // The notice's chip sits at the top edge of a stack that clips to its band, so
    // its target grows inward from that corner rather than around the chip.
    expect(phonePortraitRules).not.toMatch(/\.match-notice__close::after \{[^}]*translate:/);
  });

  it("clears the full-size fanned hand at pointer widths", () => {
    // The 132px hand fans ~75px taller than the compact one; at 11rem the viewer's
    // panels and notices sat on top of it on a 900px-tall laptop.
    expect(pointerWidthRules).toBeDefined();
    expect(pointerWidthRules).toMatch(/\.narration-slot\[data-slot="narration-text"\] \{[^}]*bottom:\s*calc\(13rem/);
  });

  it("moves the opponent's moment and the attack call-out off the landscape band", () => {
    // The memory band crosses the middle of a 390px-tall screen, which is where
    // 9.5rem put both of them.
    expect(landscapeRules).toMatch(/\.narration-slot\[data-slot="narration-cards"\] \{[^}]*top:\s*calc\(3\.25rem/);
    expect(landscapeRules).toMatch(/\.attack-announcement \{[^}]*top:\s*calc\(3\.25rem[^}]*translate:\s*none/);
  });
});

describe("an animation ends with the thing it is drawn on", () => {
  it("runs the shield's burst on the shatter's clock", () => {
    // The burst is unmounted with the break phase, which is a fraction of the
    // generic card-landing burst: on that clock it was cut a third of the way
    // through and popped away at its brightest. The fallback tracks
    // TIMINGS.shieldBreak, like the shard rule above it.
    expect(gameCss).toMatch(
      /\.game-security-shield__burst \.battle-burst__ring \{\s*animation-duration:\s*var\(--t-shield-break, 250ms\)/,
    );
  });
});

describe("the drag intent label reads the pointer, not the viewport", () => {
  it("asks the pointer media query rather than guessing from the width", () => {
    // A touchscreen laptop is wide, so a width breakpoint would leave the label
    // under the finger on exactly the devices that need it lifted.
    expect(gameScreenSource).toMatch(/COARSE_POINTER_QUERY/);
    expect(gameScreenSource).toMatch(/top:\s*y - dragIntentLabelOffsetPx\(coarsePointer\)/);
  });
});

describe("the portrait phone spends its height on the cards, not on empty rows", () => {
  it("hands the recovered height to bigger hand cards", () => {
    // The 21vw card was 83px wide and hard to read; the rows above pay for it.
    expect(phonePortraitRules).toMatch(/--hand-card-width:\s*clamp\(5\.5rem, 25vw, 7rem\)/);
  });

  it("gives the hand dock one row of its own so the cards cannot be cut off", () => {
    // The hand's bottom ~15% sat below the dock, where the board's overflow
    // clipped it and the action strip painted over it.
    expect(phonePortraitRules).toMatch(
      /\.game-hand-dock \{[^}]*grid-template-rows:\s*minmax\(var\(--game-hand-h\), auto\)[^}]*align-content:\s*center/,
    );
    // A classic sideways scrollbar takes its height out of the row's content box,
    // so a row pinned to the card's height clips the card tops by the bar.
    expect(phonePortraitRules).toMatch(
      /\[data-testid="hand"\] \{[^}]*height:\s*auto !important[^}]*min-height:\s*var\(--game-hand-h\)/,
    );
    // The desktop fan's negative margin hangs the row past the dock it sits in.
    expect(phonePortraitRules).toMatch(/\.game-player-dock \[data-testid="hand"\] \{\s*margin:\s*0 !important/);
  });

  it("drops the rotated breeding caption and keeps the band one row", () => {
    expect(phonePortraitRules).toMatch(/\.game-breeding-dock > div:first-child \{\s*display:\s*none/);
    expect(phonePortraitRules).toMatch(/\.game-breeding-dock \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});

describe("nothing on the portrait phone board paints past the screen edge", () => {
  it("widens the rail to hold the pile's depth and the slot beside it", () => {
    // Six depth layers reach ~16px down-right of the pile's own 42px box, and
    // the opponent's raising slot read as cut off against the right edge.
    expect(phonePortraitRules).toMatch(/--game-rail:\s*4rem/);
    expect(phonePortraitRules).toMatch(/\.game-pile__layer:nth-child\(n \+ 4\) \{\s*display:\s*none/);
  });

  it("floors the pile buttons at a finger's width", () => {
    // The pile is the 42px compact card wide and nothing more, which is under the
    // touch minimum on the horizontal axis; the 4rem rail has the room to spare.
    expect(phonePortraitRules).toMatch(/:has\(> \.game-pile\)[^}]*\{[^}]*min-width:\s*44px/);
  });

  it("keeps the pile's depth layers off its caption", () => {
    // The layers are drawn 2.6px further down-right each and hang out of the
    // pile's box; being positioned they paint over what follows them in flow, and
    // the compact 2px gap put the caption's letters right there.
    expect(phonePortraitRules).toMatch(/\.game-pile \+ span \{[^}]*margin-top:\s*6px/);
  });

  it("keeps the end-turn orb inside the memory band", () => {
    // The overhang rides the divider on a desktop board. Here the band is barely
    // taller than the orb, and the half-rem below it was the slice of the circle
    // the player saw cut off.
    expect(phonePortraitRules).toMatch(/\.game-end-turn-orb \{\s*margin:\s*0 0\.25rem/);
  });

  it("gives the memory band the whole screen, on one line", () => {
    // Between the two rails the band had 262px of a 393px screen and the phase
    // pill took a third of that, which left the 21 chips 3px wide each. It bleeds
    // over the rails instead, and the orb rides the same line as the gauge —
    // the phone block's `display: block` dropped it onto a second one.
    expect(phonePortraitRules).toMatch(
      /\.game-battle-zones \{[^}]*overflow:\s*clip[^}]*overflow-clip-margin:\s*var\(--game-rail\)/,
    );
    expect(phonePortraitRules).toMatch(
      /\.game-battle-zones > div:nth-child\(2\) \{[^}]*display:\s*flex[^}]*margin-inline:\s*calc\(var\(--game-rail\) \* -1\)/,
    );
    expect(phonePortraitRules).toMatch(/\.game-memory-gauge__phase \{\s*display:\s*none/);
    expect(phonePortraitRules).toMatch(/\.game-memory-gauge \{[^}]*padding:\s*0 !important/);
  });

  it("pulls the card sparkles inside the card they belong to", () => {
    expect(phonePortraitRules).toMatch(/\.game-card-sparkles \{\s*inset:\s*-18% 0 45%/);
    expect(phonePortraitRules).toMatch(/\.game-card-sparkle \{\s*translate:\s*-50% 0/);
  });
});

describe("the mulligan sheet keeps the opening hand next to its copy", () => {
  it("stops the card grid centring itself in the track it sits in", () => {
    expect(phonePortraitRules).toMatch(/\.mulligan-cards \{\s*align-content:\s*start/);
  });
});

describe("the viewer's own moves on a phone", () => {
  it("puts the match log control on the header row with the bug and surrender ones", () => {
    expect(portraitRules).toMatch(
      /\.game-opponent-bar \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto auto auto/,
    );
    expect(portraitRules).toMatch(
      /\.game-mobile-surrender,\s*\.game-mobile-share,\s*\.game-mobile-log,\s*\.game-mobile-bug \{/,
    );
    expect(gameScreenSource).toMatch(/className="game-mobile-log"[\s\S]*?onClick=\{onOpenLog\}/);
    expect(gameScreenSource).toMatch(/onOpenLog=\{\(\) => overlays\.setHistoryOpen\(true\)\}/);
    expect(gameScreenSource).not.toMatch(/game-log-strip/);
    expect(portraitRules).not.toMatch(/game-log-strip/);
  });
});

describe("one narration band on a phone in portrait", () => {
  it("folds the viewer's and the opponent's moments into a single top slot", () => {
    expect(narrowWidthRules).toMatch(
      /\.narration-slot\[data-slot="narration"\] \{[^}]*top:\s*calc\(3\.5rem[^}]*bottom:\s*auto/,
    );
    // Every active item grows to fit its full text and cards.
    expect(narrowWidthRules).toMatch(/\.narration-slot\[data-slot="narration"\] \{[^}]*overflow:\s*visible/);
    expect(narrowWidthRules).not.toMatch(/\.narration-slot\[data-slot="narration"\] \{[^}]*overflow:\s*hidden/);
    expect(gameCss).toMatch(/\.side-panel \{[^}]*flex-shrink:\s*0/);
    // One slot is a hook input, not a second layout: the queue itself puts both
    // sides in the same slot on a phone.
    expect(gameScreenSource).toMatch(/collapseNarration: collapseNotices/);
    expect(gameScreenSource).toMatch(/<NarrationStack[\s\S]*?compact=\{collapseNotices\}/);
  });
});

describe("the board-mode rail becomes a bottom sheet on a phone in portrait", () => {
  it("anchors the prompt above the hand instead of over the field", () => {
    expect(phonePortraitRules).toMatch(
      /\.board-prompt \{[^}]*top:\s*auto[^}]*bottom:\s*calc\(var\(--game-hand-h\)[^}]*translate:\s*none/,
    );
    // The rail's own entrance slides sideways from a vertical centring it no
    // longer has, so the sheet brings its own.
    expect(phonePortraitRules).toMatch(/\.board-prompt \{[^}]*animation-name:\s*battle-board-sheet-in/);
    expect(gameCss).toMatch(/@keyframes battle-board-sheet-in \{/);
    // The pending decision's only exit outranks anything transient.
    expect(phonePortraitRules).toMatch(/\.board-prompt \{[^}]*z-index:\s*calc\(var\(--ds-z-dialog\) - 3\)/);
    expect(phonePortraitRules).toMatch(/\.board-prompt__actions > button \{[^}]*min-height:\s*52px/);
  });

  it("dims the board under the sheet and keeps toast contents fully visible", () => {
    expect(phonePortraitRules).toMatch(
      /\.board-prompt-scrim \{[^}]*inset:\s*0 0 calc\(var\(--game-hand-h\)[^}]*pointer-events:\s*none/,
    );
    expect(phonePortraitRules).toMatch(
      /\.narration-slot\[data-slot="narration"\] \{[^}]*max-height:\s*none[^}]*overflow:\s*visible/,
    );
    expect(gameCss).toMatch(/\[data-held\] \.match-notice__erode \{[^}]*animation-play-state:\s*paused/);
  });

  it("is dressed like the card action sheets: edge to edge, rounded on top, with a grip and no back control", () => {
    expect(phonePortraitRules).toMatch(/\.board-prompt \{[^}]*right:\s*0;[^}]*left:\s*0;/);
    expect(phonePortraitRules).toMatch(
      /\.board-prompt \{[^}]*border-radius:\s*var\(--ds-radius-lg\) var\(--ds-radius-lg\) 0 0/,
    );
    expect(phonePortraitRules).toMatch(/\.board-prompt__grip \{[^}]*display:\s*block/);
    expect(phonePortraitRules).toMatch(/\.board-prompt__back \{[^}]*display:\s*none/);
    expect(gameCss).toMatch(/\n\.board-prompt__grip,\n\.board-prompt-scrim \{[^}]*display:\s*none/);
  });

  it("drops a yes/no prompt over the hand and keeps a hand selection above it", () => {
    // The hand is what a selection picks from, so the hand-anchored rules stay the
    // default; only a prompt answered with its own buttons may cover the hand.
    expect(phonePortraitRules).toMatch(
      /\.board-prompt\[data-variant="prompt"\] \{[^}]*bottom:\s*0;[^}]*padding-bottom:[^}]*safe-area-inset-bottom/,
    );
    expect(phonePortraitRules).toMatch(/\.board-prompt-scrim\[data-variant="prompt"\] \{[^}]*inset:\s*0;/);
    expect(phonePortraitRules).not.toMatch(/\.board-prompt\[data-variant="selection"\]/);
  });

  it("leaves the landscape phone with the left rail it was tuned for", () => {
    expect(landscapeRules).not.toMatch(/\.board-prompt \{/);
  });
});

describe("field selection rail", () => {
  it("keeps its actions visible beside the prompt instead of below overflowing content", () => {
    expect(fieldDecisionRailCss).toMatch(
      /\.board-prompt\[data-variant="field-selection"\] \{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(12rem, 0\.62fr\)[^}]*width:\s*min\(620px/,
    );
    expect(fieldDecisionRailCss).toMatch(/"heading heading"\s*"body actions"\s*"detail actions"/);
    expect(fieldDecisionRailCss).toMatch(
      /\.board-prompt\[data-variant="field-selection"\] \.board-prompt__actions \{[^}]*grid-area:\s*actions[^}]*justify-content:\s*flex-start[^}]*flex-direction:\s*column[^}]*margin-top:\s*0/,
    );
  });
});

describe("the trigger chooser is one readable column on a phone in portrait", () => {
  it("keeps the actions visible while only the effect list scrolls", () => {
    expect(gameCss).toMatch(
      /\.decision-overlay--trigger-chooser \{[^}]*display:\s*flex[^}]*max-height:\s*min\(calc\(100dvh - 7rem\), calc\(100% - 7rem\)\)[^}]*overflow:\s*hidden/,
    );
    expect(gameCss).toMatch(
      /\.decision-overlay--trigger-chooser \.trigger-chooser \{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/,
    );
    expect(gameCss).toMatch(/\.trigger-chooser__footer \{[^}]*flex:\s*none[^}]*flex-wrap:\s*wrap/);
    expect(gameCss).toMatch(
      /\.trigger-chooser__layout \{[^}]*flex-direction:\s*column[^}]*flex-wrap:\s*nowrap !important/,
    );
    expect(gameCss).toMatch(/\.trigger-chooser__option \{[^}]*flex:\s*none/);
  });

  it("stacks the pending effects instead of splitting the width between them", () => {
    expect(phonePortraitRules).toMatch(/\.trigger-chooser \{[^}]*grid-template-columns:\s*1fr/);
    expect(phonePortraitRules).toMatch(/\.trigger-chooser__option \{[^}]*min-width:\s*0/);
  });

  it("also contains every effect at small-tablet portrait widths", () => {
    expect(compactDialogRules).toMatch(
      /\.decision-overlay--trigger-chooser \.trigger-chooser \{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*overflow-x:\s*hidden/,
    );
    expect(compactDialogRules).toMatch(/\.trigger-chooser__option \{[^}]*width:\s*100%[^}]*min-width:\s*0/);
  });

  it("shrinks the art to a thumbnail so the printed clause keeps the width", () => {
    expect(phonePortraitRules).toMatch(/\.trigger-chooser__card > div \{[^}]*width:\s*64px/);
    expect(phonePortraitRules).toMatch(/\.trigger-chooser__meta \{[^}]*max-width:\s*100%/);
  });

  it("defaults to a contained column and only adds columns when the viewport proves it has room", () => {
    expect(gameCss).toMatch(
      /\n\.trigger-chooser \{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*width:\s*100%[^}]*min-width:\s*0/,
    );
    expect(mediaRules(gameCss, "(width >= 900px)")).toMatch(
      /\.trigger-chooser \{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(gameCss).toMatch(/\n\.trigger-chooser__option \{[^}]*flex-direction:\s*column/);
  });
});

describe("a board-mode hand selection is answered by the finger that makes it", () => {
  it("takes the pick from the pointer instead of the click a touch may never send", () => {
    // The hand is a `pan-x` scroll-snap row on a phone, so the browser may turn a
    // tap into a scroll or retarget the trailing click at the row. Reading the
    // pointer is how every other tap on this screen is resolved (pressGesture.ts).
    expect(boardPiecesSource).toMatch(/onPointerUp:\s*selection \? \(e\) => finishPick\(/);
    expect(boardPiecesSource).toMatch(/onPointerCancel:\s*selection\s*\?/);
    expect(boardPiecesSource).toMatch(/pressGesture\(\{ dx: event\.clientX - press\.x/);
    // The click trailing that same gesture must not toggle the card back, while a
    // click that is the only signal (keyboard, assistive) still picks.
    expect(boardPiecesSource).toMatch(/if \(pointerPicked\.current === entry\.instanceId\)/);
  });

  it("keeps the row pannable while it is a selection surface", () => {
    // Nothing is dragged out of a hand answering a decision, so `touch-action: none`
    // would only cost the row the sideways swipe that reaches the buried cards.
    expect(boardPiecesSource).toMatch(/cursor: pickable \? "pointer" : "default", touchAction: "pan-x"/);
  });

  it("still refuses to start a drag out of a hand that is picking", () => {
    // A pick that became a play would answer the decision by putting the card on
    // the board — the one thing the selection must not do.
    expect(boardPiecesSource).toMatch(/: \(e\) => startDrag\(i, e\),/);
    expect(boardPiecesSource).not.toMatch(/selection \? \(e\) => startDrag/);
  });
});

describe("centre-stage cards are sized by the viewport", () => {
  it("scales the zone showcase by width on a phone and by height in landscape", () => {
    expect(portraitRules).toMatch(/\.battle-showcase__art > div \{[^}]*width:\s*min\(190px, 46vw\)/);
    expect(landscapeRules).toMatch(/\.battle-showcase__art > div \{[^}]*height:\s*min\(58dvh, 266px\)/);
  });

  it("drives the security branch's lift from a property the short blocks retune", () => {
    // 8rem above the middle of a 390px board puts the card's top edge off screen.
    expect(gameCss).toMatch(/\.battle-security-branch \{[^}]*--security-branch-lift:\s*8rem/);
    expect(gameCss).toMatch(/@keyframes battle-security-branch-in \{[^}]*var\(--security-branch-lift\)/);
    expect(gameCss).not.toMatch(/translate:\s*[^;]*calc\(-50% - 8rem\)/);
    expect(landscapeRules).toMatch(/\.battle-security-branch \{[^}]*--security-branch-lift:\s*2\.5rem/);
    expect(landscapeRules).toMatch(/\.battle-security-branch__frame > div,[^{]*\{[^}]*width:\s*92px/);
  });
});

describe("the mulligan's three actions fit the row they are given", () => {
  it("wraps the peek button onto its own line at narrow widths only", () => {
    expect(narrowWidthRules).toBeDefined();
    expect(narrowWidthRules).toMatch(/\.mulligan-actions \{\s*flex-wrap:\s*wrap/);
    expect(narrowWidthRules).toMatch(/\.mulligan-actions > button:last-child \{\s*flex-basis:\s*100%/);
    // A landscape phone is ~844px wide and fits all three; wrapping there would
    // cost the 390px-tall sheet a whole button row for nothing.
    expect(landscapeRules).not.toMatch(/\.mulligan-actions \{/);
  });
});

describe("landscape phone match layout", () => {
  // A phone on its side is ~800px wide and ~390px tall. Keyed on width alone it
  // landed in the tablet layout: the fanned hand ate the screen, the board fell
  // off the bottom and the action strip collapsed to nothing.
  it("keys the phone layout on the short viewport as well as the narrow one", () => {
    expect(gameCss).toMatch(/@media \(width < 600px\), \(height < 520px\) and \(orientation: landscape\) \{/);
    expect(gameScreenSource).toMatch(
      /NARROW_LAYOUT_QUERY = "\(width < 600px\), \(height < 520px\) and \(orientation: landscape\)"/,
    );
  });

  it("gives the strip a column of its own beside the board", () => {
    expect(landscapeRules).toBeDefined();
    expect(landscapeRules).toMatch(/\.game-layout \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
    expect(landscapeRules).toMatch(/\.game-sidebar > div:nth-child\(2\) \{[^}]*width:\s*9rem/);
    // Same collapse as portrait: no action, no column.
    expect(landscapeRules).toMatch(
      /\.game-sidebar > div:nth-child\(2\):not\(:has\(button\)\) \{\s*display:\s*none !important/,
    );
  });

  it("puts the breeding area beside the hand instead of above it", () => {
    // Stacked, the two bands leave the battle rows nothing on a 390px screen.
    expect(landscapeRules).toMatch(/\.game-player-dock \{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/);
    expect(landscapeRules).toMatch(/\.game-breeding-dock > div:first-child \{\s*display:\s*none/);
  });

  it("keeps the memory band a single row", () => {
    // Stacked, the end-turn orb drops below the gauge and costs the battle rows
    // another 30px they do not have.
    expect(landscapeRules).toMatch(/\.game-battle-zones > div:nth-child\(2\) \{[^}]*display:\s*flex/);
  });

  it("lays the rail piles two to a row", () => {
    expect(landscapeRules).toMatch(/\.game-pile-column > div \{[^}]*flex-direction:\s*row !important/);
  });

  it("compacts the decision dialog instead of letting it swallow the board", () => {
    // Portrait's sheet is a badge, a display-size heading and a column of
    // full-width buttons — around 250px of a 390px screen.
    expect(landscapeRules).toMatch(/\.game-modal__panel > \.aegis-badge \{\s*display:\s*none !important/);
    expect(landscapeRules).toMatch(/\.game-modal__panel > h2 \{[^}]*font-size:\s*var\(--ds-text-lg\)/);
    // The affirmative action still ends up on the right, like every choice row.
    expect(landscapeRules).toMatch(
      /\.game-modal__panel > div:last-child:not\(\[class\]\) \{[^}]*flex-direction:\s*row-reverse/,
    );
  });

  it("keeps the result dialog's own buttons on screen", () => {
    expect(landscapeRules).toMatch(/\.game-over-dialog > div:first-child \{\s*display:\s*none !important/);
    expect(landscapeRules).toMatch(/\.game-over-dialog > h1 \{[^}]*font-size:\s*var\(--ds-text-2xl\)/);
  });

  it("keeps the turn orb a finger wide and its label inside the circle", () => {
    // 3rem is 48px, the least that holds "Opponent's" on one line. The extra
    // overhang keeps the band exactly as tall as it was, so the two battle rows
    // lose nothing to the bigger target.
    expect(landscapeRules).toMatch(
      /\.game-end-turn-orb \{[^}]*width:\s*3rem[^}]*margin:\s*-0\.5rem[^}]*padding:\s*0;[^}]*letter-spacing:\s*-0\.02em/,
    );
  });

  it("caps both narration columns to the screen and lets them scroll", () => {
    // Three queued moments are ~360px tall: uncapped, the clause column ran out
    // through the top edge and the card column off the bottom.
    for (const slot of ["narration-text", "narration-cards"]) {
      expect(landscapeRules).toMatch(
        new RegExp(`\\.narration-slot\\[data-slot="${slot}"\\] \\{[^}]*max-height:\\s*calc\\(\\s*100dvh`),
      );
    }
    expect(landscapeRules).toMatch(
      /\.narration-slot\[data-slot="narration-text"\],\s*\.narration-slot\[data-slot="narration-cards"\] \{[^}]*overflow-y:\s*auto/,
    );
  });

  it("names an explicit card width for the battle rows", () => {
    // Even the compact Digimon (106px) is taller than a row here.
    expect(gameScreenSource).toMatch(/const LANDSCAPE_PHONE_PERMANENT_WIDTH = \d+;/);
    expect(gameScreenSource).toMatch(/: landscapePhone\s*\?[^:]*:\s*LANDSCAPE_PHONE_PERMANENT_WIDTH/);
    expect(gameScreenSource).toMatch(/width:\s*arenaPermanentWidth,/);
  });
});

describe("the phone hand strip during a board-mode selection", () => {
  it("keeps the battlefield geometry unchanged when selection opens", () => {
    expect(gameCss).toMatch(/\.game-hand \{[^}]*margin-bottom:\s*-1\.7rem/);
    expect(gameCss).not.toMatch(/\.game-hand\.game-hand--selecting \{[^}]*margin-bottom/);
  });

  it("separates the cards so two selection rings cannot merge", () => {
    expect(portraitRules).toBeDefined();
    expect(portraitRules).toMatch(/\[data-testid="hand"\] \{[^}]*--game-hand-gap:\s*16px/);
    expect(portraitRules).toMatch(
      /\.game-player-dock \[data-testid="hand"\] > div \{[^}]*margin-left:\s*var\(--game-hand-gap\) !important/,
    );
    // Answering a decision spends even more air: every ring is on screen at once.
    expect(portraitRules).toMatch(/\[data-testid="hand"\]\.game-hand--selecting \{\s*--game-hand-gap:\s*22px/);
  });

  it("tells an eligible card from a picked one by colour, not by brightness", () => {
    // One rim-and-glow language: eligible keeps the cyan "you may act" rim, only
    // the chosen card turns gold, and the extra weight goes into lift and glow
    // spread rather than into a thicker ring that would collide in the strip.
    expect(portraitRules).toMatch(
      /\.game-hand-card--pickable \{[^}]*var\(--ds-rim-ready\)[^}]*color-mix\(in srgb, var\(--ds-rim-ready\) 45%/,
    );
    expect(portraitRules).toMatch(
      /\.game-hand-card--picked \{[^}]*var\(--ds-rim-attention\)[^}]*color-mix\(in srgb, var\(--ds-rim-attention\) 40%/,
    );
    expect(portraitRules).toMatch(/\.game-hand-card--picked \{[^}]*scale:\s*1\.03/);
    // The strip clips its own overflow, so the row reserves the room the lift, the
    // scale and the pick badge need above the cards.
    expect(portraitRules).toMatch(/--game-hand-lift:\s*10px/);
    expect(portraitRules).toMatch(/--game-hand-h:[^;]*var\(--game-hand-lift\)/);
    expect(portraitRules).toMatch(/\[data-testid="hand"\] \{[^}]*padding:\s*var\(--game-hand-lift\)[^}]*!important/);
    // Darkened and slightly smaller rather than greyed out and faded away.
    expect(portraitRules).toMatch(/\.game-hand-card--unpickable \{\s*opacity:\s*0\.8/);
    expect(gameCss).toMatch(/\.game-hand-card--unpickable > \* \{\s*filter:\s*brightness\(0\.55\)/);
    // The same three states exist outside the phone block, so the pointer layout
    // reads the selection the same way.
    expect(gameCss).toMatch(/\.game-hand-card--pickable \{[^}]*var\(--ds-rim-ready\)/);
  });

  it("keeps the pick-order badge inside the card the strip clips", () => {
    // The strip hides its own overflow to keep the scrollbar off the board, so a
    // badge hung over the card's top edge was cut in half.
    expect(portraitRules).toMatch(/\.game-hand-card__pick-badge \{\s*top:\s*0\.15rem;\s*right:\s*0\.15rem/);
  });

  it("hangs the scroll cues over the ends of the strip", () => {
    // `display: contents` everywhere else: the pointer fan must not gain a box.
    expect(gameCss).toMatch(/\.game-hand-scroller \{\s*display:\s*contents/);
    expect(portraitRules).toMatch(/\.game-hand-scroller \{[^}]*display:\s*block[^}]*position:\s*relative/);
    expect(gameCss).toMatch(/\.game-hand-scroll-cue \{[^}]*position:\s*absolute[^}]*top:\s*50%/);
    expect(gameCss).toMatch(/\.game-hand-scroll-cue--start \{\s*left:\s*0/);
    expect(gameCss).toMatch(/\.game-hand-scroll-cue--end \{\s*right:\s*0/);
  });

  it("mounts the cues on either layout only where cards are hidden", () => {
    expect(boardPiecesSource).toMatch(/useMediaQuery\(TOUCH_LAYOUT_QUERY\)/);
    expect(boardPiecesSource).toMatch(/overflow\.start \?/);
    expect(boardPiecesSource).toMatch(/overflow\.end \?/);
    // Scrolling and resizing both change the answer, so both are watched.
    expect(boardPiecesSource).toMatch(/addEventListener\("scroll", measure/);
    expect(boardPiecesSource).toMatch(/new ResizeObserver\(measure\)/);
  });
});

describe("the draw cue on a phone", () => {
  // The cue hook's flights, steps and scenes live one concern per file under ./match.
  const useMatchCuesSource = [
    readFileSync(new URL("./useMatchCues.ts", import.meta.url), "utf8"),
    ...["", "steps/", "present/", "narration/"].flatMap((group) =>
      readdirSync(new URL(`./match/${group}`, import.meta.url), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile() && entry.name !== "index.ts")
        .map((entry) => readFileSync(new URL(`./match/${group}${entry.name}`, import.meta.url), "utf8")),
    ),
  ].join("\n");
  const reducedMotionRules = gameCss.match(/@media \(prefers-reduced-motion: reduce\) \{(?<rules>[\s\S]*)$/)?.groups
    ?.rules;

  it("flies a hand-card-sized back instead of a 30px one", () => {
    expect(portraitRules).toMatch(
      /\.game-draw-flight \{[^}]*--draw-flight-w:\s*var\(--hand-card-width\)[^}]*--draw-flight-h:\s*calc\(var\(--hand-card-width\) \* 1\.4\)/,
    );
    // The starburst opens where the card landed, so it grows with it.
    expect(portraitRules).toMatch(/\.game-draw-burst \{[^}]*--draw-flight-w:\s*var\(--hand-card-width\)/);
    expect(portraitRules).toMatch(/\.game-draw-flight \{[^}]*box-shadow:[^}]*var\(--battle-cyan\)/);
  });

  it("centres the card back on the pile with its own margins, at any size", () => {
    // The board hands over a raw centre point now, so a resized card back cannot
    // launch or land off the pile it belongs to.
    expect(gameCss).toMatch(
      /\.game-draw-flight \{[^}]*margin-top:\s*calc\(var\(--draw-flight-h\) \/ -2\)[^}]*margin-left:\s*calc\(var\(--draw-flight-w\) \/ -2\)/,
    );
    expect(gameCss).toMatch(/\.game-draw-burst \{[^}]*margin-top:\s*calc\(var\(--draw-flight-h\) \/ -2\)/);
    expect(useMatchCuesSource).not.toMatch(/DRAW_FLIGHT_WIDTH/);
  });

  it("gives the trip its longer touch duration from the queue, not from CSS alone", () => {
    // A CSS-only override would outlive the timeout that unmounts the card back.
    expect(useMatchCuesSource).toMatch(/isTouchLayout\(\) \? TIMINGS\.drawFlightTouch : TIMINGS\.drawFlight/);
    expect(useMatchCuesSource).toMatch(/await context\.wait\(duration\)/);
    expect(gameScreenSource).toMatch(/"--t-draw-flight": `\$\{flight\.duration\}ms`/);
    expect(portraitRules).not.toMatch(/\.game-draw-flight \{[^}]*animation-duration/);
  });

  it("keeps an accent ring on the card that landed in the strip", () => {
    // On its own pseudo-element: --playable / --pickable / --picked each own the
    // card's box-shadow, and the class stays for as long as the card is in hand.
    expect(portraitRules).toMatch(
      /\.game-hand-card--drawn::after \{[^}]*animation:\s*battle-hand-draw-ring var\(--t-hand-draw-ring, 900ms\)/,
    );
    expect(portraitRules).not.toMatch(/\.game-hand-card--drawn \{/);
  });

  it("still stands down for reduced motion", () => {
    expect(reducedMotionRules).toMatch(/\.game-draw-flight \{\s*display:\s*none/);
    expect(reducedMotionRules).toMatch(/\.game-hand-card--drawn::after \{\s*display:\s*none/);
  });
});
