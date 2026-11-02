import { useEffect, useMemo, useState } from "react";
import { ArtRegion } from "@aegis/shared/cards/ArtRegion";
import { artRegionOf } from "@aegis/shared/cards/artRegionOf";
import { useTranslation } from "@/i18n/useTranslation";
import { dictionaryCache } from "@/i18n/dictionaryCache";
import { loadDictionary } from "@/i18n/loadDictionary";
import { translator } from "@/i18n/translator";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

type Params = { artId: string };

export function useCardFaceTranslation({ artId }: Params) {
  const { locale: interfaceLocale, setLocale } = useTranslation();
  const region = artRegionOf(artId);
  let locale: Locale = interfaceLocale;
  if (region?.value === ArtRegion.CHINESE.value) {
    locale = "zh-CN";
  } else if (region) {
    locale = region.value;
  }
  const [loaded, setLoaded] = useState<Locale>();
  useEffect(() => {
    let cancelled = false;
    void loadDictionary(locale)
      .then(() => {
        if (!cancelled) {
          setLoaded(locale);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locale]);
  return useMemo(
    () => ({
      locale,
      setLocale,
      t: translator(dictionaryCache.has(locale) ? locale : DEFAULT_LOCALE),
    }),
    [locale, setLocale, loaded],
  );
}
