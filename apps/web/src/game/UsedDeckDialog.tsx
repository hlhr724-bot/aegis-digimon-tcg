import { useState } from "react";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { FamousDeckListDialog } from "@/screens/FamousDeckListDialog";
import { usedDeckListing } from "@/game/usedDeckListing";
import type { DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";

export function UsedDeckDialog({
  snapshot,
  opponent = false,
  onCopy,
  onClose,
}: {
  snapshot: UsedDeck;
  opponent?: boolean;
  onCopy?: (deck: DeckListing) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <FamousDeckListDialog
      deck={usedDeckListing({ snapshot })}
      collection={snapshot.community?.author.displayName ?? ""}
      eyebrow={t(opponent ? "overlay.opponentDeck" : "overlay.usedDeck")}
      active={false}
      copied={copied}
      onCopy={
        onCopy
          ? () => {
              onCopy(usedDeckListing({ snapshot }));
              setCopied(true);
            }
          : undefined
      }
      onClose={onClose}
    />
  );
}
