import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import { cardImageUrls } from "@aegis/shared/cards/images";
import { TokenArtPicker } from "@/design/tokenArt/TokenArtPicker";
import { tokenArtStore } from "@/design/tokenArt/tokenArtStore";
import { I18nProvider } from "@/i18n/I18nProvider";
import { CardFull, CardMini } from "@/design/cards";
import { CardArt } from "@/game/overlay/CardArt";
import * as battlefield from "@/design/battlefield";

const token = tokenDefinitions[0]!;
const other = tokenDefinitions[1]!;
const firstImage = "data:image/webp;base64,Zmlyc3Q=";
const nextImage = "data:image/webp;base64,bmV4dA==";

function renderPicker() {
  render(
    <I18nProvider>
      <TokenArtPicker />
    </I18nProvider>,
  );
  return within(screen.getByRole("group", { name: token.nameEn }));
}

function uploadImage(group: ReturnType<typeof within>, file = new File(["image"], "token.png", { type: "image/png" })) {
  fireEvent.change(group.getByLabelText(`Upload image: ${token.nameEn}`), { target: { files: [file] } });
}

beforeEach(() => {
  for (const definition of tokenDefinitions) {
    tokenArtStore.set({ cardId: definition.cardId });
  }
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("custom token artwork", () => {
  it("uploads, replaces and removes an image independently for each token", async () => {
    const convert = vi.spyOn(battlefield, "toStorableDataUrl").mockResolvedValue(firstImage);
    const group = renderPicker();
    expect(screen.queryByRole("group", { name: "SelfDeleteFamiliar Token" })).toBeNull();
    uploadImage(group);
    await waitFor(() => expect(group.getByRole("img").getAttribute("src")).toBe(firstImage));
    expect(localStorage.getItem(`aegis.tokenArt.${token.cardId}`)).toBe(firstImage);
    expect(tokenArtStore.get(other.cardId)).toBeUndefined();
    convert.mockResolvedValue(nextImage);
    uploadImage(group);
    await waitFor(() => expect(group.getByRole("img").getAttribute("src")).toBe(nextImage));
    fireEvent.click(group.getByRole("button", { name: "Remove your image" }));
    expect(group.getByRole("img").getAttribute("src")).toBe(cardImageUrls(token.cardId)[0]);
    expect(localStorage.getItem(`aegis.tokenArt.${token.cardId}`)).toBeNull();
  });

  it("rejects a non-image file without attempting conversion", () => {
    const convert = vi.spyOn(battlefield, "toStorableDataUrl");
    const group = renderPicker();
    uploadImage(group, new File(["text"], "file.txt", { type: "text/plain" }));
    expect(group.getByRole("alert").textContent).toBe("Choose an image file.");
    expect(convert).not.toHaveBeenCalled();
  });

  it("preserves the previous art when decoding or storage fails", async () => {
    tokenArtStore.set({ cardId: token.cardId, dataUrl: firstImage });
    const convert = vi.spyOn(battlefield, "toStorableDataUrl").mockRejectedValue(new Error("decode"));
    const group = renderPicker();
    uploadImage(group);
    await waitFor(() => expect(group.getByRole("alert")).toBeTruthy());
    expect(tokenArtStore.get(token.cardId)).toBe(firstImage);
    convert.mockResolvedValue(nextImage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    uploadImage(group);
    await waitFor(() => expect(group.getByRole("alert")).toBeTruthy());
    expect(group.getByRole("img").getAttribute("src")).toBe(firstImage);
    expect(localStorage.getItem(`aegis.tokenArt.${token.cardId}`)).toBe(firstImage);
  });

  it("updates mounted field, full-card and overlay art and falls back to official art", () => {
    const { container } = render(
      <>
        <CardFull cardId={token.cardId} />
        <CardMini cardId={token.cardId} />
        <CardArt cardId={token.cardId} width={100} />
        <CardArt cardId="BT1-010" width={100} />
      </>,
    );
    act(() => tokenArtStore.set({ cardId: token.cardId, dataUrl: firstImage }));
    expect(container.querySelectorAll(`img[src="${firstImage}"]`)).toHaveLength(3);
    const images = [...container.querySelectorAll(`img[src="${firstImage}"]`)];
    for (const image of images) {
      fireEvent.error(image);
    }
    expect(container.querySelectorAll(`img[src="${cardImageUrls(token.cardId)[0]}"]`)).toHaveLength(3);
    act(() => tokenArtStore.set({ cardId: token.cardId, dataUrl: nextImage }));
    expect(container.querySelectorAll(`img[src="${nextImage}"]`)).toHaveLength(3);
    expect(container.querySelector(`img[src="${cardImageUrls("BT1-010")[0]}"]`)).toBeTruthy();
    act(() => tokenArtStore.set({ cardId: token.cardId }));
    expect(container.querySelectorAll(`img[src="${cardImageUrls(token.cardId)[0]}"]`)).toHaveLength(3);
  });
  it("restores saved token art on reload and ignores invalid stored sources", async () => {
    tokenArtStore.set({ cardId: token.cardId, dataUrl: firstImage });
    localStorage.setItem(`aegis.tokenArt.${other.cardId}`, "https://example.com/image.png");
    vi.resetModules();
    const restored = await import("@/design/tokenArt/tokenArtStore");
    expect(restored.tokenArtStore.get(token.cardId)).toBe(firstImage);
    expect(restored.tokenArtStore.get(other.cardId)).toBeUndefined();
    expect(() => restored.tokenArtStore.set({ cardId: "BT1-010", dataUrl: firstImage })).toThrow("Unknown token");
    expect(() => restored.tokenArtStore.set({ cardId: token.cardId, dataUrl: "data:text/html;base64,Zm9v" })).toThrow(
      "Invalid token image",
    );
  });
});
