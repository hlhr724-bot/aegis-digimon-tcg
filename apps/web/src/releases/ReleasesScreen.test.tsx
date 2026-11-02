// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { ReleasesScreen } from "./ReleasesScreen";

describe("release notes screen", () => {
  beforeEach(() => localStorage.clear());

  it("shows the current public beta without a GitHub release link", () => {
    render(
      <I18nProvider>
        <ReleasesScreen />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "What's new" })).toBeTruthy();
    expect(screen.getByText("v1.37.0-BETA")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /View details on GitHub/ })).toBeNull();
  });

  it("translates the release content through the app i18n", () => {
    localStorage.setItem("aegis:locale", "pt-BR");
    render(
      <I18nProvider>
        <ReleasesScreen />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "O que há de novo" })).toBeTruthy();
    expect(
      screen.getByText("Correções de jogabilidade, regras de cartas, decisões de Material Save e história."),
    ).toBeTruthy();
  });
});
