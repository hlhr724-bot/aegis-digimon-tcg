import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckGuide } from "@/screens/community/DeckGuide";
import { hoverZoomPreference } from "@/design/hoverZoomPreference";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  hoverZoomPreference.setEnabled(false);
});

describe("reading a deck guide", () => {
  it("renders formatting and catalog cards as collection links", () => {
    render(<DeckGuide guide={"## Opening\n- **Play** BT1-009\n- BT99-999\n\n<script>alert(1)</script>"} />);
    expect(screen.getByRole("heading", { name: "Opening" }).tagName).toBe("H3");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Play").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: /BT1-009.*Monodramon/ }).getAttribute("href")).toBe(
      "/collection?q=BT1-009",
    );
    expect(screen.getByText("BT99-999").querySelector("a")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });
  it("shows no artwork on hover while hover zoom is off", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    render(<DeckGuide guide="BT1-009" />);
    fireEvent.mouseMove(screen.getByRole("link"), { clientX: 100, clientY: 100 });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows artwork on hover and clears it on leave", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    hoverZoomPreference.setEnabled(true);
    render(<DeckGuide guide="BT1-009" />);
    const link = screen.getByRole("link");
    fireEvent.mouseMove(link, { clientX: 100, clientY: 100 });
    expect(screen.getByRole("img", { name: "Monodramon" })).toBeTruthy();
    fireEvent.mouseLeave(link);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
