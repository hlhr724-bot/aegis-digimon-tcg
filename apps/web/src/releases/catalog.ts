import releases from "./releases.json";

export type ReleaseItem = { textKey: string; issue?: number };
export type Release = {
  version: string;
  releasedAt: string;
  summaryKey: string;
  features: ReleaseItem[];
  fixes: ReleaseItem[];
};

export function parseCatalog(value: unknown): Release[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("The release catalog is empty");
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) throw new Error("Invalid release entry");
    const release = candidate as Record<string, unknown>;
    if (!hasOnlyKeys(release, ["features", "fixes", "releasedAt", "summaryKey", "version"]))
      throw new Error("Unknown release fields");
    if (typeof release.version !== "string" || !/^\d+\.\d+\.\d+-beta$/.test(release.version))
      throw new Error("Invalid release version");
    if (seen.has(release.version)) throw new Error("Duplicate release version");
    if (index > 0 && compareVersions(value[index - 1], release.version) <= 0)
      throw new Error("Releases must be newest first");
    seen.add(release.version);
    if (
      typeof release.releasedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(release.releasedAt) ||
      new Date(`${release.releasedAt}T00:00:00Z`).toISOString().slice(0, 10) !== release.releasedAt
    )
      throw new Error("Invalid release date");
    if (typeof release.summaryKey !== "string" || !Array.isArray(release.features) || !Array.isArray(release.fixes))
      throw new Error("Invalid release content");
    for (const item of [...release.features, ...release.fixes]) validateItem(item);
    return release as Release;
  });
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function validateItem(value: unknown): asserts value is ReleaseItem {
  if (typeof value !== "object" || value === null) throw new Error("Invalid release item");
  const item = value as Record<string, unknown>;
  if (!hasOnlyKeys(item, item.issue === undefined ? ["textKey"] : ["issue", "textKey"]))
    throw new Error("Unknown release item fields");
  if (typeof item.textKey !== "string") throw new Error("Invalid release item translation key");
  if (item.issue !== undefined && (!Number.isInteger(item.issue) || Number(item.issue) <= 0))
    throw new Error("Invalid release issue");
}

function compareVersions(previous: unknown, current: string): number {
  if (
    typeof previous !== "object" ||
    previous === null ||
    typeof (previous as Record<string, unknown>).version !== "string"
  )
    throw new Error("Invalid previous release version");
  const previousVersion = (previous as { version: string }).version;
  const parts = (version: string): [number, number, number] => {
    const [major = 0, minor = 0, patch = 0] = version.replace("-beta", "").split(".").map(Number);
    return [major, minor, patch];
  };
  const left = parts(previousVersion);
  const right = parts(current);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const catalog = parseCatalog(releases);

export function allReleases(): readonly Release[] {
  return catalog;
}

export function currentRelease(): Release {
  const release = catalog[0];
  if (!release) throw new Error("The release catalog is empty");
  return release;
}

export function displayVersion(version: string): string {
  return `v${version.replace(/-beta$/, "-BETA")}`;
}
