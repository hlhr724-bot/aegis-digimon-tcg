import { describe, expect, it } from "vitest";
import { allReleases, currentRelease, displayVersion, parseCatalog } from "@/releases/catalog";
import { LOCALES } from "@/i18n/locales";
import messages from "@/releases/messages.json";
import { translateReleaseMessage } from "@/releases/translateReleaseMessage";

describe("release catalog", () => {
  it("exposes the latest beta as the current release", () => {
    expect(currentRelease().version).toBe("1.46.0-beta");
    expect(displayVersion(currentRelease().version)).toBe("v1.46.0-BETA");
    expect(allReleases()).toHaveLength(122);
  });

  it.each(LOCALES)("resolves every release message in %s", (locale) => {
    for (const release of allReleases()) {
      const keys = [
        release.summaryKey,
        ...release.features.map((item) => item.textKey),
        ...release.fixes.map((item) => item.textKey),
      ];
      for (const key of keys) {
        const message: Record<string, string> = messages[key as keyof typeof messages];
        // Italian release notes start at v1.19.0; older ones keep their English text.
        expect(translateReleaseMessage({ key, locale })).toBe(message[locale] ?? message.en);
      }
    }
  });

  it("translates the v1.19.0 notes into Italian", () => {
    expect(translateReleaseMessage({ key: "releases.1.19.0-beta.feature.hatch", locale: "it" })).toBe(
      messages["releases.1.19.0-beta.feature.hatch"].it,
    );
  });

  it("rejects malformed bundled release data", () => {
    expect(() =>
      parseCatalog([
        {
          version: "wrong",
          releasedAt: "2026-09-21",
          summaryKey: "releases.invalid.summary",
          features: [],
          fixes: [],
        },
      ]),
    ).toThrow("Invalid release version");
  });

  it("rejects malformed items and release ordering", () => {
    const release = {
      version: "1.0.1-beta",
      releasedAt: "2026-09-21",
      summaryKey: "releases.test.summary",
      features: [],
      fixes: [{ textKey: "releases.test.fix", issue: 0 }],
    };
    expect(() => parseCatalog([release])).toThrow("Invalid release issue");
    expect(() =>
      parseCatalog([
        { ...release, fixes: [] },
        { ...release, version: "1.1.0-beta", fixes: [] },
      ]),
    ).toThrow("Releases must be newest first");
  });
});
