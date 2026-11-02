// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityPage } from "@/community/CommunityPage";
import { CommunitySection } from "@/community/CommunitySection";
import { I18nProvider } from "@/i18n/I18nProvider";

function renderPage({ metaAvailable }: { metaAvailable: boolean }) {
  const onSectionChange = vi.fn<(section: CommunitySection) => void>();
  render(
    <I18nProvider>
      <CommunityPage
        section={CommunitySection.DECKS.value}
        metaAvailable={metaAvailable}
        onSectionChange={onSectionChange}
      >
        <p>Body</p>
      </CommunityPage>
    </I18nProvider>,
  );
  return onSectionChange;
}

describe("CommunityPage", () => {
  afterEach(() => cleanup());

  it("shows the decks, meta and roadmap tabs and opens the chosen one", () => {
    const onSectionChange = renderPage({ metaAvailable: true });

    expect(screen.getByRole("heading", { level: 1, name: "Community" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Decks", "Meta", "Roadmap"]);
    expect(screen.getByRole("tab", { name: "Decks" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Meta" }));
    expect(onSectionChange).toHaveBeenCalledWith(CommunitySection.META.value);
  });

  it("hides the meta tab when ranked statistics are unavailable", () => {
    renderPage({ metaAvailable: false });

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Decks", "Roadmap"]);
  });
});
