/* Paints a deck as a single PNG: a title bar, then each section as a row-wrapped
   strip of card art with copy counts. Card art is fetched cross-origin, so the
   canvas stays exportable; a card whose art never loads gets a text placeholder. */

import { cardImageUrls, getCardDefinition } from "@aegis/shared";
import type { DeckListing } from "../game/decks";
import type { Translate } from "../i18n";
import { deckSections, type DeckSection } from "./deckSections";

const COLUMNS = 10;
const SECTION_MAX_COLUMNS = 5;
const CARD_WIDTH = 150;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.4);
const CARD_GAP = 12;
const PAGE_PADDING = 48;
const HEADER_HEIGHT = 120;
const SECTION_TITLE_HEIGHT = 44;
const SECTION_GAP = 28;
const SECTION_ROW_GAP = 36;
const FONT_FAMILY = "'Inter Variable', 'Segoe UI', Helvetica, Arial, sans-serif";
const BACKGROUND = "#0f172a";
const FOREGROUND = "#f8fafc";
const MUTED = "#94a3b8";
const PLACEHOLDER = "#1e293b";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image failed: ${url}`));
    image.src = url;
  });
}

async function loadFirstAvailable(urls: readonly string[]): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch {
      continue;
    }
  }
  return null;
}

interface SectionBlock {
  section: DeckSection;
  columns: number;
  x: number;
  y: number;
  height: number;
}

function blockWidth(columns: number): number {
  return columns * CARD_WIDTH + (columns - 1) * CARD_GAP;
}

/* Sections flow left to right like the dialog, each as a compact block of at most
   SECTION_MAX_COLUMNS cards per row, wrapping to a new line when the page is full. */
function layoutSections(sections: DeckSection[], pageWidth: number): { blocks: SectionBlock[]; height: number } {
  const blocks: SectionBlock[] = [];
  let x = 0;
  let y = 0;
  let lineHeight = 0;
  for (const section of sections) {
    const columns = Math.min(section.entries.length, SECTION_MAX_COLUMNS);
    const rows = Math.ceil(section.entries.length / columns);
    const width = blockWidth(columns);
    const height = SECTION_TITLE_HEIGHT + rows * (CARD_HEIGHT + CARD_GAP) - CARD_GAP;
    if (x > 0 && x + width > pageWidth) {
      x = 0;
      y += lineHeight + SECTION_ROW_GAP;
      lineHeight = 0;
    }
    blocks.push({ section, columns, x, y, height });
    x += width + CARD_GAP * 2 + SECTION_GAP;
    lineHeight = Math.max(lineHeight, height);
  }
  return { blocks, height: y + lineHeight };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function drawPlaceholder(context: CanvasRenderingContext2D, cardId: string, x: number, y: number) {
  context.fillStyle = PLACEHOLDER;
  roundedRect(context, x, y, CARD_WIDTH, CARD_HEIGHT, 10);
  context.fill();
  context.fillStyle = FOREGROUND;
  context.textAlign = "center";
  context.font = `700 13px ${FONT_FAMILY}`;
  const name = getCardDefinition(cardId)?.nameEn ?? cardId;
  context.fillText(name, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 - 8, CARD_WIDTH - 16);
  context.fillStyle = MUTED;
  context.font = `12px ${FONT_FAMILY}`;
  context.fillText(cardId, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 + 14, CARD_WIDTH - 16);
  context.textAlign = "left";
}

function drawCount(context: CanvasRenderingContext2D, count: number, x: number, y: number) {
  const label = `×${count}`;
  context.font = `800 16px ${FONT_FAMILY}`;
  const width = Math.ceil(context.measureText(label).width) + 16;
  const height = 26;
  const badgeX = x + CARD_WIDTH - width - 6;
  const badgeY = y + CARD_HEIGHT - height - 6;
  context.fillStyle = "rgba(15, 23, 42, 0.92)";
  roundedRect(context, badgeX, badgeY, width, height, 8);
  context.fill();
  context.fillStyle = FOREGROUND;
  context.textBaseline = "middle";
  context.fillText(label, badgeX + 8, badgeY + height / 2 + 1);
  context.textBaseline = "alphabetic";
}

export async function renderDeckImage({
  deck,
  t,
  subtitle,
}: {
  deck: DeckListing;
  t: Translate;
  subtitle?: string;
}): Promise<Blob> {
  const sections = deckSections(deck, t);
  const pageWidth = blockWidth(COLUMNS);
  const { blocks, height: bodyHeight } = layoutSections(sections, pageWidth);
  const width = PAGE_PADDING * 2 + pageWidth;
  const height = PAGE_PADDING * 2 + HEADER_HEIGHT + bodyHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");

  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  context.fillStyle = FOREGROUND;
  context.font = `800 40px ${FONT_FAMILY}`;
  context.fillText(deck.name, PAGE_PADDING, PAGE_PADDING + 44, width - PAGE_PADDING * 2);
  context.fillStyle = MUTED;
  context.font = `500 18px ${FONT_FAMILY}`;
  const meta = t("lobby.famousDeckCards", {
    main: deck.mainDeck.length,
    egg: deck.eggDeck.length,
  });
  context.fillText(subtitle ? `${subtitle} · ${meta}` : meta, PAGE_PADDING, PAGE_PADDING + 78);

  const uniqueCardIds = [...new Set(sections.flatMap((section) => section.entries.map((entry) => entry.cardId)))];
  const images = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    uniqueCardIds.map(async (cardId) => images.set(cardId, await loadFirstAvailable(cardImageUrls(cardId)))),
  );

  const bodyTop = PAGE_PADDING + HEADER_HEIGHT;
  for (const { section, columns, x: blockX, y: blockY } of blocks) {
    const left = PAGE_PADDING + blockX;
    const top = bodyTop + blockY;
    context.fillStyle = MUTED;
    context.font = `700 15px ${FONT_FAMILY}`;
    context.fillText(section.label.toUpperCase(), left, top + 18);
    const gridTop = top + SECTION_TITLE_HEIGHT;
    section.entries.forEach(({ cardId, count }, index) => {
      const x = left + (index % columns) * (CARD_WIDTH + CARD_GAP);
      const y = gridTop + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP);
      const image = images.get(cardId);
      if (image) {
        context.save();
        roundedRect(context, x, y, CARD_WIDTH, CARD_HEIGHT, 10);
        context.clip();
        context.drawImage(image, x, y, CARD_WIDTH, CARD_HEIGHT);
        context.restore();
      } else {
        drawPlaceholder(context, cardId, x, y);
      }
      drawCount(context, count, x, y);
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))), "image/png");
  });
}

function fileNameFor(deck: DeckListing): string {
  const slug = deck.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "deck"}.png`;
}

export async function downloadDeckImage(options: {
  deck: DeckListing;
  t: Translate;
  subtitle?: string;
}): Promise<void> {
  const blob = await renderDeckImage(options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileNameFor(options.deck);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Firefox and Safari start the download after click() returns; revoking now can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
