import { readFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";

type CpuSample = { atMs: number; usageUsec: number; periods: number; throttled: number; limitCores: number };

type Params = {
  spareCores: number;
  maxThrottledShare: number;
  minSampleWindowMs: number;
  maxSampleWindowMs: number;
  hostLoadPerCore: number;
  cgroupDirectory?: string;
  readFile?: (path: string) => string;
  hostCores?: () => number;
  hostLoad?: () => number;
  now?: () => number;
};

function statField(stat: string, field: string): number | undefined {
  const match = new RegExp(`^${field} (\\d+)$`, "m").exec(stat);
  return match === null ? undefined : Number(match[1]);
}

function limitCoresFrom(cpuMax: string, hostCores: number): number {
  const [quota, period] = cpuMax.trim().split(/\s+/);
  if (quota === "max" || quota === undefined || period === undefined) return hostCores;
  const cores = Number(quota) / Number(period);
  return Number.isFinite(cores) && cores > 0 ? Math.min(cores, hostCores) : hostCores;
}

export function createCgroupCpuBusyCheck({
  spareCores,
  maxThrottledShare,
  minSampleWindowMs,
  maxSampleWindowMs,
  hostLoadPerCore,
  cgroupDirectory = "/sys/fs/cgroup",
  readFile = (path) => readFileSync(path, "utf8"),
  hostCores = () => cpus().length,
  hostLoad = () => loadavg()[0]!,
  now = Date.now,
}: Params): () => boolean {
  let baseline: CpuSample | undefined;
  let lastVerdict = true;

  const sample = (): CpuSample | undefined => {
    try {
      const stat = readFile(`${cgroupDirectory}/cpu.stat`);
      const usageUsec = statField(stat, "usage_usec");
      if (usageUsec === undefined) return undefined;
      return {
        atMs: now(),
        usageUsec,
        periods: statField(stat, "nr_periods") ?? 0,
        throttled: statField(stat, "nr_throttled") ?? 0,
        limitCores: limitCoresFrom(readFile(`${cgroupDirectory}/cpu.max`), hostCores()),
      };
    } catch {
      return undefined;
    }
  };

  return () => {
    const current = sample();
    if (current === undefined) return hostLoad() > hostCores() * hostLoadPerCore;
    const previous = baseline;
    const elapsedMs = previous === undefined ? 0 : current.atMs - previous.atMs;
    if (previous !== undefined && elapsedMs < minSampleWindowMs) return lastVerdict;
    baseline = current;
    if (previous === undefined || elapsedMs > maxSampleWindowMs) {
      lastVerdict = true;
      return lastVerdict;
    }
    const usedCores = (current.usageUsec - previous.usageUsec) / (elapsedMs * 1000);
    const periods = current.periods - previous.periods;
    const throttledShare = periods <= 0 ? 0 : (current.throttled - previous.throttled) / periods;
    lastVerdict = current.limitCores - usedCores < spareCores || throttledShare > maxThrottledShare;
    return lastVerdict;
  };
}
