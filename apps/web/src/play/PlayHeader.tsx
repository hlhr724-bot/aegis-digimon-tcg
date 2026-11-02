import type { Screen } from "@/design/primitives";
import { PageHeader, type PageTab } from "@/design/PageHeader";
import { useTranslation } from "@/i18n/useTranslation";
import { PlayTab } from "@/play/PlayTab";
import "@/play/playPage.css";

type PlayHeaderParams = {
  activeTab: PlayTab;
  rankedEnabled: boolean;
  liveMatchCount?: number;
  onNav: (screen: Screen) => void;
};

export function PlayHeader({ activeTab, rankedEnabled, liveMatchCount, onNav }: PlayHeaderParams) {
  const { t } = useTranslation();
  const entries = Object.values(PlayTab).filter((entry) => rankedEnabled || entry.value !== PlayTab.RANKED.value);
  const tabs: PageTab<PlayTab>[] = entries.map((entry) => ({
    value: entry.value,
    label: t(entry.labelKey),
    badge:
      entry.value === PlayTab.ROOMS.value && liveMatchCount !== undefined && liveMatchCount > 0
        ? liveMatchCount
        : undefined,
  }));
  return (
    <PageHeader
      title={t("nav.play")}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(value) => {
        const target = entries.find((entry) => entry.value === value);
        if (target && value !== activeTab) {
          onNav(target.screen);
        }
      }}
    />
  );
}
