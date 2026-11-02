// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/design/PageHeader";

afterEach(() => cleanup());

describe("the page header", () => {
  it("names the page and switches between its tabs", () => {
    const onTabChange = vi.fn<(value: "match" | "ranked") => void>();
    render(
      <PageHeader
        title="Play"
        tabs={[
          { value: "match", label: "Match" },
          { value: "ranked", label: "Ranked" },
        ]}
        activeTab="match"
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole("heading", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Match" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Ranked" }));
    expect(onTabChange).toHaveBeenCalledWith("ranked");
  });
});
