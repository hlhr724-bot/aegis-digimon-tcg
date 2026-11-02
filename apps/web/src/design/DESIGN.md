# Aegis interface design contract

This is the design intent for the Aegis web client. `tokens.css` holds the
compiled values, and the card inks live in `theme.ts` (`COLORS`). Keep all
three aligned.

## Character

Aegis is a calm, precise card table. The color comes from the cards. The
**bits backdrop** (`PixelBackdrop`) is the brand: mirrored 4×4 pixel glyphs in
the seven card inks, falling behind every screen except the match. Everything
else stays quiet so the bits and the cards carry the personality.

Hierarchy comes from type, spacing, and grouping before containers or effects.
Every element earns its place through navigation, grouping, state, or feedback.
Avoid nested cards, ornamental gradients, glow outside card rims, and icons that
repeat nearby text.

## Three rules

1. **Bits live in the margins.** The backdrop is full strength in the gutters
   and fades to 15% across the content column. Running text never sits on bare
   bits: it sits on the page sheet (`.aegis-page-sheet`) or on `--ds-paper`
   inside the faded column.
2. **One interface hue.** `--ds-accent` (Aegis magenta by default) is the only color for
   action and selection. Card inks mean card color and nothing else. Status uses
   `--ds-success`, `--ds-warning`, and `--ds-danger`, always with a word or icon.
3. **Colored frames, paper holds.** The `--ds-ink` band (top nav, mobile bar, beta
   notice, stat strip, match dialogs) is navy by default in both modes. Content sits on
   `--ds-paper` and `--ds-sheet`, which follow the theme.

## Tokens

| Role      | Tokens                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------- |
| Ground    | `paper` (page and page sheet), `sheet` (panels, cards, dialogs), `fill` (inputs, pressed rows) |
| Lines     | `line` (hairlines), `line-strong` (control borders, 3:1)                                       |
| Text      | `text`, `text-2`, `text-3`, `text-off` (disabled only)                                         |
| Accent    | `accent`, `accent-strong` (hover/pressed), `on-accent`, `accent-soft`, `focus`, `focus-ring`   |
| Navy band | `ink`, `ink-raised`, `on-ink`, `on-ink-2`, `ink-accent`                                        |
| Status    | `success`, `warning`, `danger`, each with `-soft`; `on-status` for labels on a solid fill      |
| Card rims | `rim-attention`, `rim-ready`, `rim-threat`                                                     |

All tokens carry the `--ds-` prefix. Derive tints with `color-mix()` instead of
adding tokens: a status border is the status color at 40%, and a rim glow is
the rim at 35–45%. Navy surfaces that are navy in both themes restate the
dark values locally (see `dialogsAndNarration.css`).

Text meets 4.5:1 on `paper`, `sheet`, and `fill` in both themes; large text,
control borders, focus, and meaningful icons meet 3:1.

### Player palettes

The header theme button and Settings → Appearance open the same theme chooser.
`interfaceTheme.ts` saves a device-local Digimon preset or custom palette and
applies its semantic tokens before the first render. The existing light/dark
store remains responsible for mode; presets adapt to both modes, and custom
colors are stored separately for each. `interfaceThemeColors.ts` derives text,
hover, focus, and chrome colors with contrast adjustment. When custom page and
panel colors conflict, the panel moves toward the page to retain readable text.
Selecting Aegis clears all palette overrides and uses the stylesheet values.
The unified picker also retains the classic board palettes. On first load it
reads `aegis.arenaPalette` when the new preference is absent; classic palettes
keep their existing board color pairs and also theme the site interface. The old arena store
API delegates to the new theme store, and writes retain the old key for older
tabs. New themes and custom palettes use the themed board colors. Match panels
read a separate `--ds-game-*` ramp derived for their panel background. Status
hues retain their meaning while their shades adapt for readability.
Card inks, gameplay status hues, and board-side palettes keep their meanings.

## Typography

Tektur (`--ds-font-display`) sets anything authored: the hero, titles, section
headings, nav, button labels, and eyebrows. Titles and labels are uppercase,
and labels use `--ds-tracking-label`. Inter (`--ds-font-body`) sets every
sentence. Fira Code (`--ds-font-mono`) sets memory, DP, costs, counts, and logs,
always with tabular figures. A region shows at most three levels.

## Space, shape, depth

Spacing uses a 4px base (`--ds-space-1` to `--ds-space-12`). Use 8–12px inside a
group and 32–48px between groups, and never space every block evenly. Radii stay
small like the pixels: 4, 6, and 8px, with `--ds-radius-lg` as the largest. The
page sheet uses `--ds-shadow-raise`, the only resting shadow. Popovers use
`--ds-shadow-overlay`, and dialogs use `--ds-shadow-dialog` over `--ds-scrim`.

## Responsive composition

One React application at every width. Width changes composition, density, and
disclosure, never the business flow. Breakpoints: narrow under 600, medium
600–959, compact 960–1279, wide from 1280. Below 600 the page sheet goes
full-bleed and navigation moves to a bottom bar. Everything works from 320px, in
landscape phone, at 200% zoom, and with long Portuguese strings. Changing width
never resets the screen, draft, filter, selection, or server decision.

## Components and states

Shared primitives own their visual grammar; feature code supplies meaning and
callbacks. Prefer native HTML over invented ARIA. Every control has default,
hover, pressed, focus-visible, disabled, and pending states. Touch targets are
44px (`--ds-touch-target`) and never below 24px. Surfaces that load data cover
loading, empty, error, populated, and edge states. Errors say what happened and
what to do next, and keep the player's input.

## Match board

Priorities, in order: the current phase and required decision; the selected
object and legal target; zones and memory; frequent actions; counts and logs.
Narrow layouts move secondary information into sheets. Animation never changes
game state; it only confirms state from the server.

## Motion

Press feedback takes `--ds-motion-instant`, hover and state changes take
`--ds-motion-fast`, and dialogs and sheets take `--ds-motion-base`. Under reduced
motion, remove translation, scale, particles, and drift, and keep static cues.

### Reduced-motion setting

Players choose **Animations** in Settings: follow the device (default), always
animate, or reduce motion. The store in `design/motion/motionPreference.ts`
resolves that choice and writes `data-motion="full"` or `data-motion="reduced"`
on `<html>`. In system mode, the store follows the device setting live.

- **CSS:** keep writing `@media (prefers-reduced-motion: reduce)` and
  `@media (prefers-reduced-motion: no-preference)`. A PostCSS plugin
  (`apps/web/dev/motionPreferenceSelectors.ts`) rewrites these blocks at build
  time into selectors scoped to the `data-motion` attribute. It wraps the scope in
  `:where()`, so specificity and cascade order stay the same. Unit tests that read
  raw stylesheets still see the original media queries.
- **CSS limits:** the plugin refuses motion queries that use commas, `not`, or
  `only`, and queries nested inside a rule. Split or move them to the top level.
- **TypeScript:** never call `matchMedia` for reduced motion. Use
  `motionPreference.isReduced()` for one-off checks, `motionPreference.useReduced()`
  in components, and `motionPreference.subscribe()` to react when motion changes.

The backdrop is the one product-owner exception to "no indefinite decorative
motion". It runs at 10 fps behind all content, never takes pointer events, stops
while the tab is hidden, and never runs under reduced motion. Do not extend it
to any other surface.

## Accessibility

DOM order follows meaning. Icon-only buttons have names. Dialogs and sheets
manage focus, Escape, and focus return; required server decisions cannot be
dismissed by accident. Decorative effects are hidden from assistive technology.
Information is never carried by card color or animation alone.

## Anti-patterns

- Rendering desktop and mobile copies of a screen and hiding one with CSS.
- Branching product routing on `window.innerWidth`.
- Hardcoding repeated colors, spacing, radii, shadows, or motion in TSX.
- Adding a token for a tint that `color-mix()` can derive.
- Using card inks as interface status, or the accent as a card color.
- Putting text directly on full-strength bits.
- Moving legality or authoritative game behavior into the client.

Theme names reference [Digimon Adventure](https://www.toei-animation-usa.com/digimon.html),
[Cyber Sleuth](https://en.bandainamcoent.eu/digimon/digimon-story-cyber-sleuth),
and [Next Order](https://en.bandainamcoent.eu/digimon/digimon-world-next-order).
The palettes are authored interpretations, rather than official color specifications.
