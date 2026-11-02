import { useProfileTrophiesShown } from "@/achievements/useProfileTrophiesShown";
import { setProfileTrophiesShown } from "@/achievements/setProfileTrophiesShown";
import { useTamerGrouping } from "@/design/tamerGrouping/useTamerGrouping";
import { setTamerGroupingEnabled } from "@/design/tamerGrouping/setTamerGroupingEnabled";
import { useCardImageLanguage } from "@/screens/cardLanguage/useCardImageLanguage";
import { setCardImageLanguage } from "@/screens/cardLanguage/setCardImageLanguage";
import { isCardImageLanguage } from "@aegis/shared/cards/isCardImageLanguage";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CUSTOM_CARD_SLEEVE_ID,
  DEFAULT_CARD_SLEEVE,
  DEFAULT_EGG_SLEEVE,
  getCardSleeveId,
  getEggSleeveId,
  setCardSleeveId,
  setEggSleeveId,
  subscribeCardSleeve,
} from "../design/sleeve";
import {
  sanitizeDeckBuilderPreferences,
  setDeckBuilderPreferences,
  useDeckBuilderPreferences,
} from "../screens/deckBuilderPreferences";
import { setAutoHatchEnabled, useAutoHatch } from "../game/autoHatch";
import { useTranslation } from "../i18n";
import { isLocale } from "@/i18n/isLocale";
import { accountApi, type AccountPreferences } from "./client";
import { setProfileStatsShown, useProfileStatsShown } from "./profileStats";
import { setFavoriteDeckIds } from "@/screens/favoriteDecks/setFavoriteDeckIds";
import { useFavoriteDeckIds } from "@/screens/favoriteDecks/useFavoriteDeckIds";
import { isSameDeckIdList } from "@/screens/favoriteDecks/isSameDeckIdList";

/**
 * Keeps the theme, language, sleeves, auto hatch, profile stats and deck builder layout in step with the signed-in account.
 * localStorage stays the instant source, so guests and the first render never wait on the network.
 * On sign-in the account's stored values win; keys the account lacks are backfilled from this device.
 */
export function usePreferencesSync({
  accountId,
  dark,
  setDark,
}: {
  accountId: string | undefined;
  dark: boolean;
  setDark: (dark: boolean) => void;
}): boolean {
  const { locale, setLocale } = useTranslation();
  const autoHatch = useAutoHatch();
  const groupIdenticalTamers = useTamerGrouping();
  const profileStats = useProfileStatsShown();
  const profileTrophies = useProfileTrophiesShown();
  const sleeve = useSyncExternalStore(subscribeCardSleeve, getCardSleeveId, () => DEFAULT_CARD_SLEEVE.id);
  const eggSleeve = useSyncExternalStore(subscribeCardSleeve, getEggSleeveId, () => DEFAULT_EGG_SLEEVE.id);
  const { deckShare, deckView, deckSort } = useDeckBuilderPreferences();
  const favoriteDeckIds = useFavoriteDeckIds();
  const cardImageLanguage = useCardImageLanguage();
  const [synced, setSynced] = useState<{ accountId: string; preferences: AccountPreferences }>();
  const stored = synced && synced.accountId === accountId ? synced.preferences : undefined;

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void accountApi
      .preferences()
      .then((preferences) => {
        if (cancelled) return;
        if (typeof preferences.darkMode === "boolean") setDark(preferences.darkMode);
        if (isCardImageLanguage(preferences.cardImageLanguage)) {
          setCardImageLanguage(preferences.cardImageLanguage);
        }
        if (isLocale(preferences.locale)) setLocale(preferences.locale);
        if (preferences.sleeve && getCardSleeveId() !== CUSTOM_CARD_SLEEVE_ID) setCardSleeveId(preferences.sleeve);
        if (preferences.eggSleeve && getEggSleeveId() !== CUSTOM_CARD_SLEEVE_ID) setEggSleeveId(preferences.eggSleeve);
        setDeckBuilderPreferences(sanitizeDeckBuilderPreferences(preferences));
        setAutoHatchEnabled(preferences.autoHatch === true);
        if (typeof preferences.groupIdenticalTamers === "boolean") {
          setTamerGroupingEnabled(preferences.groupIdenticalTamers);
        }
        setProfileStatsShown(preferences.profileStats !== false);
        setProfileTrophiesShown(preferences.profileTrophies !== false);
        if (preferences.favoriteDeckIds) {
          setFavoriteDeckIds(preferences.favoriteDeckIds);
        }
        setSynced({ accountId, preferences });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accountId, setDark, setLocale]);

  useEffect(() => {
    if (!accountId || !stored) return;
    const current: AccountPreferences = {
      ...(cardImageLanguage !== undefined && { cardImageLanguage }),
      ...(autoHatch || stored.autoHatch !== undefined ? { autoHatch } : {}),
      ...(!profileStats || stored.profileStats !== undefined ? { profileStats } : {}),
      ...(!profileTrophies || stored.profileTrophies !== undefined ? { profileTrophies } : {}),
      ...(!groupIdenticalTamers || stored.groupIdenticalTamers !== undefined ? { groupIdenticalTamers } : {}),
      darkMode: dark,
      locale,
      ...(sleeve !== CUSTOM_CARD_SLEEVE_ID && { sleeve }),
      // Unlike the older keys, the default egg sleeve is not backfilled, so existing accounts see no write.
      ...(eggSleeve !== CUSTOM_CARD_SLEEVE_ID &&
        (eggSleeve !== DEFAULT_EGG_SLEEVE.id || stored.eggSleeve !== undefined) && { eggSleeve }),
      deckShare,
      deckView,
      deckSort,
      ...((favoriteDeckIds.length > 0 || stored.favoriteDeckIds !== undefined) && {
        favoriteDeckIds: [...favoriteDeckIds],
      }),
    };
    const changes = Object.fromEntries(
      Object.entries(current).filter(
        ([key, value]) => !isStoredPreference({ stored, key: key as keyof AccountPreferences, value }),
      ),
    ) as AccountPreferences;
    if (Object.keys(changes).length === 0) return;
    void accountApi
      .updatePreferences(changes)
      .then((preferences) => setSynced({ accountId, preferences }))
      .catch(() => undefined);
  }, [
    accountId,
    stored,
    autoHatch,
    groupIdenticalTamers,
    profileStats,
    profileTrophies,
    dark,
    locale,
    sleeve,
    eggSleeve,
    deckShare,
    deckView,
    deckSort,
    favoriteDeckIds,
    cardImageLanguage,
  ]);
  return !accountId || stored !== undefined;
}

type StoredPreferenceParams = {
  stored: AccountPreferences;
  key: keyof AccountPreferences;
  value: unknown;
};

function isStoredPreference({ stored, key, value }: StoredPreferenceParams): boolean {
  const storedValue = stored[key];
  if (Array.isArray(storedValue) && Array.isArray(value)) {
    return isSameDeckIdList({ first: storedValue, second: value });
  }
  return storedValue === value;
}
