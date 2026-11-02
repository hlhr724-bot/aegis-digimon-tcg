import type { ReactNode } from "react";
import { CommunitySection } from "@/community/CommunitySection";
import { PageHeader, type PageTab } from "@/design/PageHeader";
import { useTranslation } from "@/i18n/useTranslation";
import "@/community/communityPage.css";

type CommunityPageParams = {
  section: CommunitySection;
  metaAvailable: boolean;
  onSectionChange: (section: CommunitySection) => void;
  actions?: ReactNode;
  children: ReactNode;
};

export function CommunityPage({ section, metaAvailable, onSectionChange, actions, children }: CommunityPageParams) {
  const { t } = useTranslation();
  const tabs: PageTab<CommunitySection>[] = [
    { value: CommunitySection.DECKS.value, label: t("roadmap.hub.decks") },
    ...(metaAvailable ? [{ value: CommunitySection.META.value, label: t("community.meta.tab") }] : []),
    { value: CommunitySection.ROADMAP.value, label: t("roadmap.hub.roadmap") },
  ];
  return (
    <main className="aegis-page community-hub">
      <div className="aegis-page__wrap">
        <PageHeader
          title={t("nav.community")}
          actions={actions}
          tabs={tabs}
          activeTab={section}
          onTabChange={onSectionChange}
          tabsLabel={t("roadmap.hub.label")}
        />
        <div className="aegis-page__body">{children}</div>
      </div>
    </main>
  );
}
