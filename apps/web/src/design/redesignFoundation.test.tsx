// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { en } from "../i18n/en";
import { ptBR } from "../i18n/pt-BR";
import { COLORS } from "./theme";
import {
  ARENA_PALETTE_IDS,
  arenaPaletteById,
  arenaPaletteStyle,
  getArenaPaletteId,
  setArenaPaletteId,
  useArenaPalette,
} from "./arenaPalette";
import {
  BATTLEFIELDS,
  getBattlefieldId,
  getCustomBattlefieldSrc,
  setBattlefieldId,
  setCustomBattlefield,
} from "./battlefield";
import { FieldLayout, getFieldLayout, setFieldLayout } from "@/design/fieldLayout";
import { ArenaLookSettings } from "./ArenaLookSettings";
import { BattleLanes, setBattleLanes } from "./battleLanes";
import { InfoNote, Panel, SectionHeading, StatStrip } from "./surfaces";
import { AegisLogo } from "./AegisLogo";

describe("arena palette store", () => {
  beforeEach(() => setArenaPaletteId("aegis"));

  it("returns the four side hues as custom properties", () => {
    const style = arenaPaletteStyle(arenaPaletteById("green-purple")) as Record<string, string>;
    expect(style["--arena-player"]).toBe(COLORS.Green.base);
    expect(style["--arena-player-2"]).toBe("var(--ds-rim-ready)");
    expect(style["--arena-opponent"]).toBe(COLORS.Purple.base);
    expect(style["--arena-opponent-2"]).toBe(COLORS.Purple.edge);
  });

  it("uses each deck's main color, falling back to Red vs Blue", () => {
    expect(arenaPaletteById("deck-colors").player[0]).toBe(COLORS.Red.base);
    expect(arenaPaletteById("deck-colors").opponent[0]).toBe(COLORS.Blue.base);
    const decks = arenaPaletteById("deck-colors", { player: "Green", opponent: "Black" });
    expect(decks.player).toEqual([COLORS.Green.base, COLORS.Green.edge]);
    expect(decks.opponent).toEqual([COLORS.Black.base, COLORS.Black.edge]);
  });

  it("persists the choice and notifies subscribers", () => {
    const { result } = renderHook(() => useArenaPalette());
    act(() => setArenaPaletteId("gold-black"));
    expect(result.current.id).toBe("gold-black");
    expect(getArenaPaletteId()).toBe("gold-black");
    expect(localStorage.getItem("aegis.arenaPalette")).toBe("gold-black");
  });

  it("ignores unknown ids", () => {
    setArenaPaletteId("neon" as never);
    expect(getArenaPaletteId()).toBe("aegis");
  });
});

describe("arena battlefields", () => {
  it("ships the generated battlefields with portrait art", () => {
    for (const id of [
      "digital-island",
      "egg-village",
      "data-sea",
      "server-canyon",
      "dark-network",
      "data-plaza",
      "panorama-plains",
      "jungle-cove",
      "pipe-lake",
      "cyber-hub",
      "wire-woods",
    ]) {
      const field = BATTLEFIELDS.find((candidate) => candidate.id === id);
      expect(field?.src).toBe(`/battlefield/aegis-arena-${id}.jpg`);
      expect(field?.portraitSrc).toBe(`/battlefield/aegis-arena-${id}-portrait.jpg`);
      expect(field?.scrim).toBeTruthy();
    }
  });
});

describe("redesign i18n scaffold", () => {
  it("merges the foundation strings into both locales", () => {
    const keys = Object.keys(en).filter((key) => key.startsWith("redesign.foundation."));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(ptBR[key as keyof typeof ptBR]).toBeTruthy();
    for (const id of ARENA_PALETTE_IDS) expect(en).toHaveProperty(`redesign.foundation.arena.palette.${id}`);
  });
});

describe("ArenaLookSettings", () => {
  afterEach(() => cleanup());

  it("shows the current palette preview and changes the battlefield through native radios", () => {
    setArenaPaletteId("aegis");
    setBattlefieldId("classic");
    render(
      <I18nProvider>
        <ArenaLookSettings />
      </I18nProvider>,
    );

    expect(screen.getByRole("img", { name: en["redesign.foundation.arena.preview"] })).toBeTruthy();
    expect(screen.queryByRole("group", { name: en["redesign.foundation.arena.boardColors"] })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: en["redesign.foundation.battlefield.data-sea"] }));
    expect(getBattlefieldId()).toBe("data-sea");
    expect(
      (screen.getByRole("radio", { name: en["redesign.foundation.battlefield.data-sea"] }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByRole("button", { name: en["settings.playmatUpload"] })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: en["redesign.foundation.battlefield.random"] }));
    expect(getBattlefieldId()).toBe("random");
    expect(screen.getByText(en["redesign.foundation.arena.randomNote"])).toBeTruthy();
  });

  it("keeps an uploaded battlefield replaceable without removing it first", () => {
    setCustomBattlefield("data:image/webp;base64,AAAA");
    render(
      <I18nProvider>
        <ArenaLookSettings />
      </I18nProvider>,
    );

    expect(screen.getByRole("radio", { name: en["settings.playmatCustom"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: en["redesign.foundation.arena.replaceImage"] })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en["settings.playmatRemove"] }));
    expect(getCustomBattlefieldSrc()).toBeUndefined();
    expect(screen.getByRole("button", { name: en["settings.playmatUpload"] })).toBeTruthy();
  });

  it.each([BattleLanes.One, BattleLanes.Two])(
    "applies two battle rows over a classic layout with saved %s lanes",
    (lanes) => {
      setFieldLayout(FieldLayout.Classic);
      setBattleLanes(lanes);
      render(
        <I18nProvider>
          <ArenaLookSettings />
        </I18nProvider>,
      );
      fireEvent.click(screen.getByRole("radio", { name: en["redesign.foundation.arena.lanes.two"] }));
      expect(getFieldLayout()).toBe(FieldLayout.Organized);
    },
  );

  it("draws the preview with the chosen number of lanes per side", () => {
    setBattleLanes(BattleLanes.Two);
    render(
      <I18nProvider>
        <ArenaLookSettings />
      </I18nProvider>,
    );
    const preview = screen.getByRole("img", { name: en["redesign.foundation.arena.preview"] });
    const lanes = () => preview.querySelectorAll(".aegis-arena-look__lane").length;

    expect(lanes()).toBe(4);
    fireEvent.click(screen.getByRole("radio", { name: en["redesign.foundation.arena.lanes.one"] }));
    expect(lanes()).toBe(2);
  });
});

describe("surfaces", () => {
  afterEach(() => cleanup());

  it("renders the panel as a region named by its section heading", () => {
    const { container, rerender } = render(
      <Panel aria-labelledby="hero-title">
        <SectionHeading id="hero-title" title="Decks" />
      </Panel>,
    );
    expect(screen.getByRole("region", { name: "Decks" })).toBeTruthy();

    rerender(<Panel as="div" />);
    expect(container.querySelector("div.aegis-hero-panel")).toBeTruthy();
  });

  it("pairs each stat label with its value", () => {
    render(<StatStrip stats={[{ label: "Wins", value: 12 }]} />);
    const term = screen.getByText("Wins");
    expect(term.tagName).toBe("DT");
    expect(term.nextElementSibling?.textContent).toBe("12");
  });

  it("renders an info note and the logo wordmark", () => {
    render(
      <>
        <InfoNote>Decks stay on this device.</InfoNote>
        <AegisLogo />
      </>,
    );
    expect(screen.getByText("Decks stay on this device.")).toBeTruthy();
    expect(screen.getByText("AEGIS")).toBeTruthy();
  });
});
