import { useEffect, useState } from "react";
import { CanvasTexture, SRGBColorSpace, TextureLoader, type Texture } from "three";
import type { PackCard } from "@/packOpening/PackCard";
import { cardImageUrls } from "@aegis/shared/cards/images";

import { getPackCardKey } from "@/packOpening/getPackCardKey";
import { CARD_DIMENSIONS } from "@/packOpening/scene/cardDimensions";

const loader = new TextureLoader().setCrossOrigin("anonymous");

async function loadFirstTexture(urls: readonly string[]): Promise<Texture | undefined> {
  for (const url of urls) {
    try {
      const texture = await loader.loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    } catch {
      continue;
    }
  }
  return undefined;
}

function buildPlaceholderTexture(card: PackCard): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_DIMENSIONS.widthMillimeters * 4;
  canvas.height = CARD_DIMENSIONS.heightMillimeters * 4;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0d2238";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#5ff0ff";
    context.lineWidth = 6;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.fillStyle = "#e9fbff";
    context.textAlign = "center";
    context.font = "bold 22px sans-serif";
    context.fillText(card.nameEn, canvas.width / 2, canvas.height / 2, canvas.width - 32);
    context.font = "18px sans-serif";
    context.fillText(card.cardId, canvas.width / 2, canvas.height / 2 + 30);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function useCardTextures(cards: readonly PackCard[]): Map<string, Texture> {
  const [textures, setTextures] = useState(() => new Map<string, Texture>());

  useEffect(() => {
    let cancelled = false;
    setTextures(new Map());
    const loaded = new Set<Texture>();
    for (const card of new Map(cards.map((entry) => [getPackCardKey(entry), entry])).values()) {
      const urls = cardImageUrls(card.cardId, card.artId);
      void loadFirstTexture(card.artId ? urls.slice(0, 2) : urls).then((texture) => {
        if (cancelled) {
          texture?.dispose();
          return;
        }
        const resolved = texture ?? buildPlaceholderTexture(card);
        loaded.add(resolved);
        if (!cancelled) {
          setTextures((current) => new Map(current).set(getPackCardKey(card), resolved));
        }
      });
    }
    return () => {
      cancelled = true;
      for (const texture of loaded) {
        texture.dispose();
      }
    };
  }, [cards]);

  return textures;
}
