import { useState } from "react";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { PageHeader } from "@/design/PageHeader";
import { useTranslation } from "@/i18n/useTranslation";
import { CollectionBoosters } from "@/packOpening/boosterTab/CollectionBoosters";
import { CollectionCardLibrary } from "@/screens/CollectionCardLibrary";
import { CollectionTab } from "@/screens/CollectionTab";
import "@/screens/collection.css";

type CollectionParams = {
  tab?: CollectionTab;
  onTabChange?: (tab: CollectionTab) => void;
  onOpenBooster?: () => void;
};

export function Collection({ tab, onTabChange, onOpenBooster }: CollectionParams) {
  const { t } = useTranslation();
  const [localTab, setLocalTab] = useState<CollectionTab>(CollectionTab.CARDS.value);
  const activeTab = tab ?? localTab;
  const changeTab = onTabChange ?? setLocalTab;
  const tabs = Object.values(CollectionTab).map((entry) => ({ value: entry.value, label: t(entry.labelKey) }));

  return (
    <main className="aegis-page collection-page">
      <div className="aegis-page__wrap">
        <PageHeader
          title={t("nav.collection")}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={changeTab}
          actions={
            activeTab === CollectionTab.CARDS.value ? (
              <Button
                variant="secondary"
                size="sm"
                icon={Icons.Package}
                onClick={() => changeTab(CollectionTab.BOOSTERS.value)}
              >
                {t("redesign.collection.openBooster")}
              </Button>
            ) : undefined
          }
        />
        <div className="aegis-page__body">
          <CollectionCardLibrary hidden={activeTab !== CollectionTab.CARDS.value} />
          {activeTab === CollectionTab.BOOSTERS.value ? <CollectionBoosters onOpen={onOpenBooster} /> : null}
        </div>
      </div>
    </main>
  );
}
