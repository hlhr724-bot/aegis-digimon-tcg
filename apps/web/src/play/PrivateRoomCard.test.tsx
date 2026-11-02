// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import { PrivateRoomCard } from "@/play/PrivateRoomCard";

afterEach(() => cleanup());

describe("the private room card", () => {
  it("creates a room or joins one by its code", () => {
    const onCreateRoom = vi.fn<() => void>();
    const onJoinRoom = vi.fn<(code: string) => void>();
    render(
      <I18nProvider>
        <PrivateRoomCard onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Room" }));
    expect(onCreateRoom).toHaveBeenCalledOnce();

    const join = screen.getByRole("button", { name: "Join Room" }) as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Enter room code"), { target: { value: "ab12cd" } });
    fireEvent.click(join);
    expect(onJoinRoom).toHaveBeenCalledWith("AB12CD");
  });
});
