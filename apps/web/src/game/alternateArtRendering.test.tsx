// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardInstance, Permanent, getCardArts } from "@aegis/shared";
import { CardFull, CardMini } from "../design/cards";
import { I18nProvider } from "../i18n";
import { CardActionMenu, StackViewerOverlay, TrashViewerOverlay } from "./overlay";
import { CardZoomOverlay } from "./overlay/viewer/CardZoomOverlay";
import { buildPermanentDetail } from "./permanentDetail";

const cardId = "BT1-010";
const artId = getCardArts(cardId)[1]!.artId;
afterEach(cleanup);

it("shows readable English card effects beside a Japanese printing", () => {
  render(
    <I18nProvider>
      <CardZoomOverlay cardId="BT1-010" artId="BT1-010-J" onClose={() => undefined} />
    </I18nProvider>,
  );

  const dialog = screen.getByRole("dialog", { name: "Agumon" });
  expect(within(dialog).getByAltText("Agumon").getAttribute("src")).toContain("BT1-010-J.webp");
  fireEvent.click(within(dialog).getByRole("button", { name: "Show card text" }));
  expect(dialog.textContent).toContain("Reveal 5 cards from the top of your deck");
});

it("keeps different images for the same canonical card and resets failed image state when switching art", () => {
  const { rerender } = render(<CardFull cardId={cardId} artId={artId} zoomOnHover={false} />);
  const image = screen.getByAltText("Agumon");
  expect(image.getAttribute("src")).toContain(`${artId}.webp`);
  fireEvent.error(image);
  expect(image.getAttribute("src")).toContain(`${artId}-Sample.webp`);
  rerender(<CardFull cardId={cardId} zoomOnHover={false} />);
  expect(screen.getByAltText("Agumon").getAttribute("src")).toContain(`${cardId}.webp`);
  rerender(<CardMini cardId={cardId} artId={artId} faceDown />);
  expect(screen.queryByAltText("Agumon")).toBeNull();
  expect(document.querySelector(`img[src*="${artId}"]`)).toBeNull();
});

it("projects each physical printing independently into the permanent inspector", () => {
  const permanent = new Permanent();
  permanent.topCard = new CardInstance();
  permanent.topCard.cardId = cardId;
  permanent.topCard.artId = artId;
  const source = new CardInstance();
  source.cardId = cardId;
  source.artId = cardId;
  permanent.stack.push(source);
  const detail = buildPermanentDetail(permanent);
  expect(detail.artId).toBe(artId);
  expect(detail.cards.map((card) => card.artId)).toEqual([artId, cardId]);
});

const noop = () => undefined;
const cards = [
  { cardId, artId: cardId, role: "top" as const },
  { cardId, artId, role: "stack" as const },
];
describe("physical copy previews", () => {
  it("zooms the chosen source printing even when the top has the same card ID", () => {
    render(
      <I18nProvider>
        <CardActionMenu
          x={0}
          y={0}
          sheet
          cardId={cardId}
          artId={cardId}
          stackCards={cards}
          canAttack={false}
          onAttack={noop}
          onViewStack={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    const alternate = document.querySelector(`img[src*="${artId}.webp"]`)!;
    fireEvent.click(alternate.closest("button")!);
    const zoom = document.querySelector(".card-zoom")!;
    expect(
      within(zoom as HTMLElement)
        .getByAltText("Agumon")
        .getAttribute("src"),
    ).toContain(`${artId}.webp`);
  });
  it("zooms each stack copy's own art on the mobile sheet", () => {
    render(
      <I18nProvider>
        <StackViewerOverlay cards={cards} title="Stack" sheet canAttack={false} onAttack={noop} onClose={noop} />
      </I18nProvider>,
    );
    fireEvent.click(document.querySelector(`img[src*="${artId}.webp"]`)!.closest("button")!);
    expect(document.querySelector(".card-zoom img")?.getAttribute("src")).toContain(`${artId}.webp`);
  });
  it("keeps reversed trash order aligned with its art, including duplicate card IDs", () => {
    render(
      <I18nProvider>
        <TrashViewerOverlay cardIds={[cardId, cardId]} artIds={[cardId, artId]} title="Trash" sheet onClose={noop} />
      </I18nProvider>,
    );
    const images = screen.getAllByAltText("Agumon");
    expect(images[0]!.getAttribute("src")).toContain(`${artId}.webp`);
    expect(images[1]!.getAttribute("src")).toContain(`${cardId}.webp`);
    fireEvent.click(images[0]!.closest("button")!);
    expect(document.querySelector(".card-zoom img")?.getAttribute("src")).toContain(`${artId}.webp`);
  });
});
