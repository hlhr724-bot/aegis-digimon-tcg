import type { ReactNode } from "react";
import { Panel, SectionHeading } from "../design/surfaces";
import { useTranslation } from "../i18n";
import { allReleases, displayVersion, type Release, type ReleaseItem } from "./catalog";
import { translateReleaseMessage } from "@/releases/translateReleaseMessage";
import "./releases.css";

export function ReleasesScreen() {
  const { t } = useTranslation();
  const [latest, ...earlier] = allReleases();

  return (
    <main className="releases-page">
      <div className="aegis-page-sheet aegis-page-sheet--padded">
        <header className="releases-page__head">
          <span className="aegis-eyebrow">{t("releases.eyebrow")}</span>
          <h1>{t("releases.title")}</h1>
          <p>{t("releases.subtitle")}</p>
        </header>
        <div className="releases-list">
          {latest ? (
            <Panel as="article" className="release release--latest">
              <ReleaseEntry release={latest} current />
            </Panel>
          ) : null}
          {earlier.map((release) => (
            <article key={release.version} className="release release--archived">
              <ReleaseEntry release={release} />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function ReleaseEntry({ release, current = false }: { release: Release; current?: boolean }) {
  const { locale, t } = useTranslation();

  return (
    <>
      <header className="release__head">
        <h2 className="release__version">{displayVersion(release.version)}</h2>
        {current ? <span className="release__current">{t("releases.current")}</span> : null}
        <time dateTime={release.releasedAt}>
          {new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
            new Date(`${release.releasedAt}T00:00:00Z`),
          )}
        </time>
      </header>
      <p className="release__summary">{translateReleaseMessage({ key: release.summaryKey, locale })}</p>
      {release.features.length ? <ReleaseSection title={t("releases.features")} items={release.features} /> : null}
      {release.fixes.length ? <ReleaseSection title={t("releases.fixes")} items={release.fixes} /> : null}
    </>
  );
}

function ReleaseSection({ title, items }: { title: ReactNode; items: ReleaseItem[] }) {
  const { locale } = useTranslation();
  return (
    <section className="release__section">
      <SectionHeading title={title} level={3} />
      <ul>
        {items.map((item) => (
          <li key={`${item.textKey}:${item.issue ?? "none"}`}>
            <p>{translateReleaseMessage({ key: item.textKey, locale })}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
