import { useCallback, useState } from "react";
import type { CommunityDeck } from "@aegis/shared/decks/community";
import { communityApi } from "@/community/client";
import { CommunityPage } from "@/community/CommunityPage";
import { CommunitySection } from "@/community/CommunitySection";
import { SuccessToast } from "@/design/SuccessToast";
import { useTranslation } from "@/i18n/useTranslation";
import { CommunityBrowse } from "@/screens/community/CommunityBrowse";
import { CommunityDeckPage } from "@/screens/community/CommunityDeckPage";
import { CommunityMeta } from "@/screens/community/CommunityMeta";
import "@/screens/community/community.css";

type CommunityScreenParams = {
  deckId: string | undefined;
  section: CommunitySection;
  metaAvailable: boolean | undefined;
  signedIn: boolean;
  accountId: string | undefined;
  isAdmin: boolean;
  onOpenDeck: (id: string) => void;
  onBack: () => void;
  onSectionChange: (section: CommunitySection) => void;
  onOpenRanked: () => void;
  onPlay: (deck: CommunityDeck) => void;
  onCopy: (deck: CommunityDeck) => void;
};

export function CommunityScreen({
  deckId,
  section,
  metaAvailable,
  signedIn,
  accountId,
  isAdmin,
  onOpenDeck,
  onBack,
  onSectionChange,
  onOpenRanked,
  onPlay,
  onCopy,
}: CommunityScreenParams) {
  const { t } = useTranslation();
  const [toast, setToast] = useState<string>();
  const dismissToast = useCallback(() => setToast(undefined), []);
  const activeSection = getActiveSection({ deckId, section, metaAvailable });

  const copy = (deck: CommunityDeck) => {
    onCopy(deck);
    setToast(t("community.copied", { name: deck.name }));
  };
  return (
    <CommunityPage section={activeSection} metaAvailable={metaAvailable === true} onSectionChange={onSectionChange}>
      <CommunityContent
        deckId={deckId}
        section={section}
        metaAvailable={metaAvailable}
        signedIn={signedIn}
        accountId={accountId}
        isAdmin={isAdmin}
        onOpenDeck={onOpenDeck}
        onBack={onBack}
        onOpenRanked={onOpenRanked}
        onPlay={onPlay}
        onCopy={copy}
        onNotice={setToast}
      />
      {toast ? <SuccessToast message={toast} onDismiss={dismissToast} /> : null}
    </CommunityPage>
  );
}

type CommunityContentParams = Omit<CommunityScreenParams, "onSectionChange"> & {
  onNotice: (message: string) => void;
};

function CommunityContent({
  deckId,
  section,
  metaAvailable,
  signedIn,
  accountId,
  isAdmin,
  onOpenDeck,
  onBack,
  onOpenRanked,
  onPlay,
  onCopy,
  onNotice,
}: CommunityContentParams) {
  const { t } = useTranslation();
  if (deckId) {
    return (
      <CommunityDeckPage
        deckId={deckId}
        signedIn={signedIn}
        accountId={accountId}
        isAdmin={isAdmin}
        onBack={onBack}
        onPlay={onPlay}
        onCopy={onCopy}
        onNotice={onNotice}
      />
    );
  }
  if (section === CommunitySection.META.value && metaAvailable === true) {
    return <CommunityMeta onOpenRanked={onOpenRanked} />;
  }
  if (section === CommunitySection.META.value && metaAvailable === undefined) {
    return <p role="status">{t("common.loading")}</p>;
  }
  const withDeck = (action: (deck: CommunityDeck) => void) => (id: string) => {
    communityApi
      .deck(id)
      .then(action)
      .catch(() => onOpenDeck(id));
  };
  return (
    <CommunityBrowse
      signedIn={signedIn}
      accountId={accountId}
      onOpenDeck={onOpenDeck}
      onPlay={withDeck(onPlay)}
      onCopy={withDeck(onCopy)}
    />
  );
}

type GetActiveSectionParams = {
  deckId: string | undefined;
  section: CommunitySection;
  metaAvailable: boolean | undefined;
};

function getActiveSection({ deckId, section, metaAvailable }: GetActiveSectionParams): CommunitySection {
  if (!deckId && section === CommunitySection.META.value && metaAvailable === true) {
    return CommunitySection.META.value;
  }
  return CommunitySection.DECKS.value;
}
