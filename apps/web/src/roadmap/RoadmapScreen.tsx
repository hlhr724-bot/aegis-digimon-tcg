import { CommunityPage } from "@/community/CommunityPage";
import { CommunitySection } from "@/community/CommunitySection";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { RoadmapBoard } from "@/roadmap/RoadmapBoard";
import { RoadmapItemPage } from "@/roadmap/RoadmapItemPage";

type RoadmapScreenParams = {
  itemId?: number;
  signedIn: boolean;
  isAdmin: boolean;
  metaAvailable: boolean;
  onSignIn: () => void;
  onOpen: (id?: number) => void;
  onSectionChange: (section: CommunitySection) => void;
  onSuggest: () => void;
};

export function RoadmapScreen({
  itemId,
  signedIn,
  isAdmin,
  metaAvailable,
  onSignIn,
  onOpen,
  onSectionChange,
  onSuggest,
}: RoadmapScreenParams) {
  const { t } = useTranslation();
  const suggest = (
    <Button variant="secondary" size="sm" icon={Icons.Lightbulb} onClick={onSuggest}>
      {t("roadmap.suggest")}
    </Button>
  );
  return (
    <CommunityPage
      section={CommunitySection.ROADMAP.value}
      metaAvailable={metaAvailable}
      onSectionChange={onSectionChange}
      actions={suggest}
    >
      {itemId === undefined ? (
        <RoadmapBoard signedIn={signedIn} onSignIn={onSignIn} onOpen={onOpen} />
      ) : (
        <RoadmapItemPage
          key={itemId}
          id={itemId}
          signedIn={signedIn}
          isAdmin={isAdmin}
          onSignIn={onSignIn}
          onBack={() => onOpen()}
        />
      )}
    </CommunityPage>
  );
}
