// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { AccountRole } from "@aegis/shared/account/AccountRole";
import { Alert, Avatar, Badge, Dialog, Field, Switch, TopNav, type Screen } from "./primitives";

describe("design primitives", () => {
  afterEach(() => cleanup());

  it("associates a field with its label and validation message", () => {
    render(<Field label="Room code" name="roomCode" error="Use at least four characters" />);

    const input = screen.getByRole("textbox", { name: "Room code" });
    const message = screen.getByText("Use at least four characters");

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("exposes switch state and toggles through a native button", () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    render(<Switch checked={false} label="Sound" onChange={onChange} />);

    const toggle = screen.getByRole("switch", { name: "Sound" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("exposes semantic tones without inline palette values", () => {
    render(
      <>
        <Badge tone="success">Legal</Badge>
        <Alert tone="danger" title="Invalid deck">
          Fix the restricted cards.
        </Alert>
      </>,
    );

    expect(screen.getByText("Legal").getAttribute("data-tone")).toBe("success");
    expect(screen.getByRole("alert").getAttribute("data-tone")).toBe("danger");
  });

  it("moves focus into dialogs and closes them with Escape", () => {
    const onClose = vi.fn<() => void>();
    render(
      <Dialog labelledBy="test-dialog-title" onClose={onClose}>
        <h2 id="test-dialog-title">Choose a card</h2>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Choose a card" });
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns focus to the pressed trigger when the browser did not focus it", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <div tabIndex={-1} data-testid="region" />
          <button type="button" onClick={() => setOpen(true)}>
            Change sleeves
          </button>
          {open ? (
            <Dialog labelledBy="sleeve-dialog-title" onClose={() => setOpen(false)}>
              <h2 id="sleeve-dialog-title">Sleeves</h2>
            </Dialog>
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Change sleeves" });
    screen.getByTestId("region").focus();
    // Safari presses and clicks the button without focusing it.
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Sleeves" }), { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("falls back from a Digimon portrait to the provider avatar and then initials", () => {
    const { container } = render(
      <Avatar name="Tai Kamiya" avatarId="tyrannomon" avatarUrl="https://example.com/provider.png" />,
    );

    const digimonImage = container.querySelector("img");
    expect(digimonImage?.getAttribute("src")).toBe("/avatars/digimon-world-1/tyrannomon.png");
    fireEvent.error(digimonImage!);

    const providerImage = container.querySelector("img");
    expect(providerImage?.getAttribute("src")).toBe("https://example.com/provider.png");
    fireEvent.error(providerImage!);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("TK")).toBeTruthy();
  });

  it("routes the tournaments tab and the portrait to their destinations", () => {
    const onNav = vi.fn<(screen: Screen) => void>();
    const onOpenPlayerMenu = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TopNav
          screen="home"
          onNav={onNav}
          onOpenPlayerMenu={onOpenPlayerMenu}
          player={{ name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Tournaments" })[0]!);
    expect(onNav).toHaveBeenCalledWith("tournaments");

    fireEvent.click(screen.getAllByRole("button", { name: "Open the player menu" })[0]!);
    expect(onOpenPlayerMenu).toHaveBeenCalled();
  });

  it("marks the portrait with the player's highest account role", () => {
    const { container } = render(
      <I18nProvider>
        <TopNav
          screen="home"
          onNav={vi.fn<(screen: Screen) => void>()}
          role={AccountRole.JUDGE}
          player={{ name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" }}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("button", { name: "Open the player menu (Judge)" })).toHaveLength(2);
    expect(container.querySelectorAll('.account-role-badge[data-role="judge"]')).toHaveLength(2);
  });

  it("explains the account role in a tooltip on the portrait", async () => {
    render(
      <I18nProvider>
        <TopNav
          screen="home"
          onNav={vi.fn<(screen: Screen) => void>()}
          role={AccountRole.ORGANIZER}
          player={{ name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" }}
        />
      </I18nProvider>,
    );

    fireEvent.focus(screen.getAllByRole("button", { name: "Open the player menu (Official organizer)" })[0]!);

    expect((await screen.findByRole("tooltip")).textContent).toContain("Creates official tournaments and circuits.");
  });

  it("gives tournaments their own tab and keeps Community active on the roadmap", () => {
    const { rerender } = render(
      <I18nProvider>
        <TopNav
          screen="tournaments"
          onNav={vi.fn<(screen: Screen) => void>()}
          player={{ name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" }}
        />
      </I18nProvider>,
    );

    const tournaments = screen.getAllByRole("button", { name: "Tournaments" });
    expect(tournaments).toHaveLength(2);
    tournaments.forEach((button) => expect(button.getAttribute("aria-current")).toBe("page"));

    rerender(
      <I18nProvider>
        <TopNav
          screen="roadmap"
          onNav={vi.fn<(screen: Screen) => void>()}
          player={{ name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" }}
        />
      </I18nProvider>,
    );

    const community = screen.getAllByRole("button", { name: "Community" });
    expect(community).toHaveLength(2);
    community.forEach((button) => expect(button.getAttribute("aria-current")).toBe("page"));
  });

  it("offers a guest a way in and drops it once they are signed in", () => {
    const player = { name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" as const };
    const onNav = vi.fn<(screen: Screen) => void>();
    const { rerender } = render(
      <I18nProvider>
        <TopNav screen="home" onNav={onNav} player={player} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]!);
    expect(onNav).toHaveBeenCalledWith("login");

    rerender(
      <I18nProvider>
        <TopNav screen="home" onNav={onNav} player={player} signedIn />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  // Both bars carry it: the desktop header and the phone header, where it is icon-only.
  it("opens the feedback dialog from the header on every layout", () => {
    const onSendFeedback = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TopNav
          screen="home"
          onNav={vi.fn<(screen: Screen) => void>()}
          onSendFeedback={onSendFeedback}
          player={{ name: "Tai Kamiya", color: "Blue", shards: 0, avatarId: "tyrannomon" }}
        />
      </I18nProvider>,
    );

    const buttons = screen.getAllByRole("button", { name: "Send feedback" });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => fireEvent.click(button));
    expect(onSendFeedback).toHaveBeenCalledTimes(2);
  });
});
