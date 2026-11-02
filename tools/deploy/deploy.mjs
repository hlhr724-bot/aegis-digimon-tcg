import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync, cpSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describeSync, syncCardImages } from "./card-images.mjs";
import { describeRegionalSync, hasCwebp, syncRegionalCardImages } from "./regional-card-images.mjs";
import { FIXED_SLOTS, isDeploymentSlot, readManifest, validateManifest, assertEmptySlot } from "./shared.mjs";
import { API_MEMORY_MIB, REDIS_MEMORY_MIB, sampleHostCapacity, waitForHostCapacity } from "./resources.mjs";
import { retainArtifacts } from "./retention.mjs";
import { relocateSourceMaps } from "./sourcemaps.mjs";

// Reserve the new services' full limits plus headroom for builds and host services.
const OVERFLOW_REQUIRED_KIB = (3 * API_MEMORY_MIB + REDIS_MEMORY_MIB + 2048) * 1024;
const REGIONAL_IMAGE_BUDGET_MS = 5 * 60_000;

export function assertOverflowCapacity(meminfo, requiredKiB = OVERFLOW_REQUIRED_KIB) {
  const available = /^MemAvailable:\s+(\d+)\s+kB\s*$/m.exec(meminfo);
  if (!available || !Number.isSafeInteger(Number(available[1]))) {
    throw new Error("Host available memory is unverifiable; refusing deployment");
  }
  if (Number(available[1]) < requiredKiB) {
    throw new Error(
      `Deployment requires at least ${requiredKiB / 1024} MiB of available host memory; existing rooms retained`,
    );
  }
}

function run(program, args, { capture = false } = {}) {
  return new Promise((resolveResult, reject) => {
    const process = spawn(program, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "";
    if (capture) process.stdout.on("data", (bytes) => (output += bytes));
    // Captured Compose config and Docker arguments can contain secrets; never print them on failure.
    if (capture) process.stderr.resume();
    process.on("error", () => reject(new Error(`${program} could not start`)));
    process.on("close", (code) =>
      code === 0 ? resolveResult(output.trim()) : reject(new Error(`${program} failed (${code})`)),
    );
  });
}

function atomicJson(path, value, mode = 0o600) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode });
  renameSync(temporary, path);
}

function parseComposeProcessList(output) {
  const trimmed = output.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed.split("\n").map((line) => JSON.parse(line));
  }
}

export function buildSlotCompose({ slot, revision, apiEnvironment, network, state }) {
  if (!isDeploymentSlot(slot)) throw new Error("Invalid slot");
  const services = {
    redis: {
      image: "redis:7-alpine",
      restart: "unless-stopped",
      command: [
        "redis-server",
        "--save",
        "",
        "--appendonly",
        "yes",
        "--appendfsync",
        "everysec",
        "--maxmemory",
        "256mb",
        "--maxmemory-policy",
        "noeviction",
      ],
      cpus: 0.5,
      mem_limit: `${REDIS_MEMORY_MIB}m`,
      volumes: ["redis_data:/data"],
      networks: { default: { aliases: [`aegis-${slot}-redis`] } },
      healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: "5s", timeout: "3s", retries: 10 },
      logging: { driver: "json-file", options: { "max-size": "20m", "max-file": "3" } },
    },
  };
  for (const index of [1, 2, 3]) {
    services[`api${index}`] = {
      image: `aegis-api:${revision}`,
      restart: "unless-stopped",
      cpus: 1.25,
      mem_limit: `${API_MEMORY_MIB}m`,
      stop_grace_period: "60s",
      environment: Object.fromEntries(
        Object.entries({
          ...apiEnvironment,
          AEGIS_REVISION: revision,
          AEGIS_DEPLOYMENT_SLOT: slot,
          AEGIS_PROCESS_PATH: `api/${slot}/p${index}`,
          AEGIS_REDIS_URL: `redis://aegis-${slot}-redis:6379`,
          AEGIS_DEPLOYMENT_MANIFEST: "/deployment/manifest.json",
          AEGIS_DEPLOYMENT_START_DRAINING: "false",
          AEGIS_LOG_DIR: "/logs",
          AEGIS_LOG_MAX_BYTES: String(256 * 1024 * 1024),
          NODE_OPTIONS: "--max-old-space-size=1100 --report-on-fatalerror --report-directory=/logs",
        }).map(([key, value]) => [key, typeof value === "string" ? value.replaceAll("$", () => "$$") : value]),
      ),
      volumes: [`${state}/routing:/deployment:ro`, `${state}/logs:/logs`],
      depends_on: { redis: { condition: "service_healthy" } },
      networks: { default: { aliases: [`aegis-${slot}-api${index}`] } },
      healthcheck: {
        test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:2567/ready"],
        interval: "30s",
        timeout: "3s",
        retries: 3,
        start_period: "60s",
        start_interval: "2s",
      },
      logging: { driver: "json-file", options: { "max-size": "20m", "max-file": "3" } },
    };
  }
  return { services, networks: { default: { external: true, name: network } }, volumes: { redis_data: {} } };
}

export function fixedSlotRotation(activeSlot) {
  const activeIndex = FIXED_SLOTS.indexOf(activeSlot);
  const start = activeIndex < 0 ? 0 : (activeIndex + 1) % FIXED_SLOTS.length;
  return [...FIXED_SLOTS.slice(start), ...FIXED_SLOTS.slice(0, start)];
}

/** Compose config emits escaped dollars so its output can itself be reloaded. */
export function restoreComposeEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).map(([key, value]) => [
      key,
      typeof value === "string" ? value.replaceAll("$$", () => "$") : value,
    ]),
  );
}

export async function controller({
  action,
  source,
  envFile,
  state,
  revision,
  meminfoPath = "/host/meminfo",
  capacitySampler = sampleHostCapacity,
  dryRun = false,
}) {
  mkdirSync(state, { recursive: true, mode: 0o755 });
  for (const directory of ["routing", "releases", "assets", "logs"])
    mkdirSync(`${state}/${directory}`, { recursive: true, mode: 0o755 });
  mkdirSync(`${state}/slots`, { recursive: true, mode: 0o700 });
  const lock = `${state}/deploy.lock`;
  try {
    mkdirSync(lock);
  } catch {
    if (action === "maintenance") {
      console.log("Maintenance skipped: a deployment or another maintenance run owns the lock");
      return;
    }
    throw new Error("Another deploy is active, or its lock needs operator recovery; no services changed");
  }
  try {
    writeFileSync(
      `${lock}/owner.json`,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), action }),
    );
    const slotPath = (slot) => `${state}/slots/${slot}/compose.json`;
    const slotDirectory = (slot) => `${state}/slots/${slot}`;
    const compose = (slot, args, capture = false) =>
      run("docker", ["compose", "-p", `aegis-${slot}`, "-f", slotPath(slot), ...args], { capture });
    const admin = async (slot, index, path, method = "GET", body) => {
      const encodedBody = body === undefined ? undefined : Buffer.from(JSON.stringify(body)).toString("base64");
      const bodyExpression = encodedBody ? `Buffer.from('${encodedBody}','base64').toString()` : "undefined";
      const script = `const body=${bodyExpression};fetch('http://127.0.0.1:2567${path}', {method:'${method}',signal:AbortSignal.timeout(5000),headers:{authorization:'Bearer '+process.env.AEGIS_DEPLOYMENT_ADMIN_TOKEN,...(body?{'content-type':'application/json'}:{})},...(body?{body}:{})}).then(async r=>{if(!r.ok)throw Error('admin request rejected');console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))`;
      const raw = await compose(slot, ["exec", "-T", `api${index}`, "node", "-e", script], true);
      return JSON.parse(raw);
    };
    const statuses = (slot) => Promise.all([1, 2, 3].map((index) => admin(slot, index, "/deployment/status")));
    const setAccepting = (slot, accepting) =>
      Promise.all(
        [1, 2, 3].map((index) => admin(slot, index, `/deployment/${accepting ? "activate" : "drain"}`, "POST")),
      );
    const processStatuses = (slot, indexes) =>
      Promise.all(indexes.map((index) => admin(slot, index, "/deployment/status")));
    const setAcceptingProcesses = (slot, indexes, accepting) =>
      Promise.all(
        indexes.map((index) => admin(slot, index, `/deployment/${accepting ? "activate" : "drain"}`, "POST")),
      );
    const composeProcesses = async (slot) =>
      parseComposeProcessList(await compose(slot, ["ps", "--all", "--format", "json"], true));
    const getReferencedSlots = (manifest) =>
      new Set(manifest ? [manifest.active, ...manifest.draining].map(({ slot }) => slot) : []);
    const orphanSlots = (manifest) => {
      const directory = `${state}/slots`;
      if (!existsSync(directory)) return [];
      const referenced = getReferencedSlots(manifest);
      return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isDeploymentSlot(entry.name) && !referenced.has(entry.name))
        .map((entry) => entry.name)
        .sort();
    };
    const runningApiIndexes = (slot, processes) => {
      const byService = new Map();
      for (const process of processes) {
        const service = process.Service ?? process.service;
        const processState = String(process.State ?? process.state ?? "").toLowerCase();
        if (!service || !["redis", "api1", "api2", "api3"].includes(service) || byService.has(service)) {
          throw new Error(`${slot} has an unknown or duplicate Compose service; leaving it untouched`);
        }
        if (!["running", "created", "exited"].includes(processState)) {
          throw new Error(`${slot} has an unverifiable ${service} Compose state; leaving it untouched`);
        }
        byService.set(service, processState);
      }
      return [1, 2, 3].filter((index) => byService.get(`api${index}`) === "running");
    };
    const assertEmptyProcesses = (slot, processStatuses, expectedCount) => {
      if (
        processStatuses.length !== expectedCount ||
        processStatuses.some(
          (status) =>
            status.slot !== slot ||
            status.acceptingNewRooms !== false ||
            !Number.isInteger(status.activeRooms) ||
            status.activeRooms !== 0 ||
            !Number.isInteger(status.connectedClients) ||
            status.connectedClients !== 0,
        )
      ) {
        throw new Error(
          `${slot} still owns rooms/clients, accepts creation, or has unverifiable processes; leaving it running`,
        );
      }
    };
    const installedManifest = () => (existsSync(`${state}/routing/manifest.json`) ? readManifest(state) : undefined);
    const publish = (manifest) => {
      const withoutHandoff = { ...manifest };
      delete withoutHandoff.capabilities;
      atomicJson(`${state}/routing/manifest.json`, validateManifest(withoutHandoff), 0o644);
    };
    const composeConfig = async () =>
      JSON.parse(
        await run(
          "docker",
          ["compose", "--env-file", envFile, "-f", `${source}/docker-compose.prod.yml`, "config", "--format", "json"],
          { capture: true },
        ),
      );
    const checkCapacity = async (phase, needsGeneration = true) => {
      const requiredKiB = needsGeneration ? OVERFLOW_REQUIRED_KIB : 2048 * 1024;
      assertOverflowCapacity(readFileSync(meminfoPath, "utf8"), requiredKiB);
      await waitForHostCapacity({ state, phase, capacitySampler });
      // Host memory may change while waiting for CPU headroom.
      assertOverflowCapacity(readFileSync(meminfoPath, "utf8"), requiredKiB);
    };
    async function buildWebRelease(config, webRevision) {
      const apiEnvironment = restoreComposeEnvironment(config.services.api.environment);
      const publicVersion = existsSync(`${source}/package.json`)
        ? JSON.parse(readFileSync(`${source}/package.json`, "utf8")).version
        : apiEnvironment.AEGIS_PUBLIC_VERSION;
      await run("docker", [
        "build",
        "--label",
        `org.opencontainers.image.revision=${webRevision}`,
        "--build-arg",
        `VITE_AEGIS_API_URL=${apiEnvironment.AEGIS_API_URL.replace(/^http/, "ws")}`,
        "--build-arg",
        `VITE_AEGIS_REVISION=${webRevision}`,
        "--build-arg",
        `VITE_AEGIS_PUBLIC_VERSION=${publicVersion ?? "development"}`,
        "--build-arg",
        "VITE_AEGIS_DEPLOYMENT_MODE=slots",
        "--build-arg",
        `VITE_GOOGLE_CLIENT_ID=${config.services.web?.build?.args?.VITE_GOOGLE_CLIENT_ID ?? ""}`,
        "--build-arg",
        `VITE_TURNSTILE_SITE_KEY=${config.services.web?.build?.args?.VITE_TURNSTILE_SITE_KEY ?? ""}`,
        "-t",
        `aegis-static:${webRevision}`,
        "-f",
        `${source}/apps/web/Dockerfile`,
        source,
      ]);
      const release = `${state}/releases/${webRevision}`;
      mkdirSync(release, { recursive: true, mode: 0o755 });
      const extractor = await run("docker", ["create", `aegis-static:${webRevision}`], { capture: true });
      try {
        mkdirSync(`${release}/web`, { recursive: true, mode: 0o755 });
        await run("docker", ["cp", `${extractor}:/usr/share/caddy/.`, `${release}/web`]);
        if (!existsSync(`${release}/web/index.html`)) throw new Error("Static web extraction failed");
        const sourceMaps = relocateSourceMaps({
          webDirectory: `${release}/web`,
          destination: `${state}/sourcemaps/${webRevision}`,
        });
        console.log(`${sourceMaps} source maps kept outside the served release in sourcemaps/${webRevision}`);
        cpSync(`${release}/web/assets`, `${state}/assets`, { recursive: true });
      } finally {
        await run("docker", ["rm", extractor], { capture: true });
      }
      try {
        console.log(describeSync(await syncCardImages({ source, destination: `${state}/assets/card-images` })));
      } catch (error) {
        // A failed sync leaves new cards without art until the next run; it must not block a release.
        console.warn(`[aegis/deploy] card image sync failed: ${error.message}`);
      }
      try {
        if (await hasCwebp()) {
          const regional = await syncRegionalCardImages({
            source,
            destination: `${state}/assets/card-images`,
            deadline: Date.now() + REGIONAL_IMAGE_BUDGET_MS,
          });
          console.log(describeRegionalSync(regional));
        } else {
          console.warn("[aegis/deploy] regional card images skipped: cwebp is not installed");
        }
      } catch (error) {
        console.warn(`[aegis/deploy] regional card image sync failed: ${error.message}`);
      }
    }

    if (action === "deploy-web") {
      revision ??= await run("git", ["-c", `safe.directory=${source}`, "-C", source, "rev-parse", "HEAD"], {
        capture: true,
      });
      const manifest = readManifest(state);
      validateManifest({ ...manifest, webRevision: revision });
      if (manifest.webRevision === revision) {
        console.log(`Web revision ${revision} already active`);
        return;
      }
      await checkCapacity("before-build", false);
      await buildWebRelease(await composeConfig(), revision);
      await checkCapacity("before-start", false);
      publish({ ...manifest, webRevision: revision });
      console.log(`WEB ${revision}; API slot ${manifest.active.slot} unchanged`);
      return;
    }

    const adminTokenPath = `${state}/admin-token`;
    if (!existsSync(adminTokenPath)) throw new Error("Install the private admin-token before deployment");
    const adminToken = readFileSync(adminTokenPath, "utf8").trim();
    if (adminToken.length < 32) throw new Error("Deployment admin token must have at least 32 characters");
    async function cleanupSlot(slot) {
      const manifest = installedManifest();
      if (manifest?.active.slot === slot) throw new Error("Cannot remove the active slot");
      if (!existsSync(slotPath(slot))) return;
      await setAccepting(slot, false);
      assertEmptySlot(await statuses(slot), slot);
      // Every process is closed to creation, including internal creation, before the zero-room check.
      await compose(slot, ["down", "--volumes"]);
      rmSync(`${state}/slots/${slot}`, { recursive: true });
      if (manifest?.draining.some((entry) => entry.slot === slot)) {
        publish({ ...manifest, draining: manifest.draining.filter((entry) => entry.slot !== slot) });
      }
      console.log(`${slot}: empty slot removed; immutable web assets retained`);
    }
    async function inspectOrphanSlot(slot) {
      if (!existsSync(slotPath(slot))) {
        return { slot, state: "unverifiable", reason: "compose.json is missing; directory retained" };
      }
      try {
        const indexes = runningApiIndexes(slot, await composeProcesses(slot));
        const currentStatuses = await processStatuses(slot, indexes);
        assertEmptyProcesses(slot, currentStatuses, indexes.length);
        return { slot, state: "verified-empty", runningApiProcesses: indexes, statuses: currentStatuses };
      } catch (error) {
        return { slot, state: "not-proven-empty", error: error.message };
      }
    }
    async function cleanupOrphanSlot(slot) {
      const manifest = installedManifest();
      if (getReferencedSlots(manifest).has(slot)) throw new Error("Cannot clean a referenced slot as an orphan");
      if (!existsSync(slotDirectory(slot))) return;
      if (!existsSync(slotPath(slot))) throw new Error("compose.json is missing; refusing to remove unverifiable slot");

      const processes = await composeProcesses(slot);
      const indexes = runningApiIndexes(slot, processes);
      if (indexes.length === 3) {
        await cleanupSlot(slot);
        return;
      }

      // A failed `compose up` can leave only some API services created. Drain and verify every
      // running API process; absent/stopped services cannot own rooms, but unknown states fail closed.
      if (indexes.length > 0) {
        await setAcceptingProcesses(slot, indexes, false);
        assertEmptyProcesses(slot, await processStatuses(slot, indexes), indexes.length);
      }

      // Ensure no API process appeared while the partial slot was being inspected. A changed or
      // unknown inventory remains untouched for operator recovery.
      const confirmedIndexes = runningApiIndexes(slot, await composeProcesses(slot));
      if (confirmedIndexes.length !== indexes.length || confirmedIndexes.some((index) => !indexes.includes(index))) {
        throw new Error("Compose process inventory changed during orphan inspection; leaving it untouched");
      }
      const latestManifest = installedManifest();
      if (getReferencedSlots(latestManifest).has(slot)) throw new Error("Slot became referenced; refusing removal");
      await compose(slot, ["down", "--volumes"]);
      rmSync(slotDirectory(slot), { recursive: true });
      console.log(`${slot}: partial orphan removed after all running API processes were proven empty`);
    }
    if (action === "status") {
      const manifest = readManifest(state);
      console.log(
        JSON.stringify(
          {
            manifest,
            processes: await Promise.all(
              [manifest.active, ...manifest.draining].map(async ({ slot }) => ({
                slot,
                statuses: await statuses(slot).catch((error) => ({ error: error.message })),
              })),
            ),
            orphans: await Promise.all(orphanSlots(manifest).map(inspectOrphanSlot)),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (action === "cleanup" || action === "maintenance") {
      const pending = [];
      const manifest = readManifest(state);
      for (const { slot } of manifest.draining) {
        try {
          if (dryRun) {
            assertEmptySlot(await statuses(slot), slot);
            console.log(`${slot}: would remove verified-empty deployment`);
          } else await cleanupSlot(slot);
        } catch (error) {
          pending.push({ slot, error });
        }
      }
      for (const slot of orphanSlots(installedManifest() ?? manifest)) {
        try {
          if (dryRun) console.log(JSON.stringify(await inspectOrphanSlot(slot)));
          else await cleanupOrphanSlot(slot);
        } catch (error) {
          pending.push({ slot, error });
        }
      }
      if (pending.length > 0) {
        const details = pending.map(({ slot, error }) => `${slot}: ${error.message}`).join("; ");
        if (action === "cleanup") throw new Error(`Cleanup pending for ${details}`);
        console.log(`Maintenance retained deployments not proven empty: ${details}`);
      }
      if (action === "maintenance") await retainArtifacts({ state, manifest: readManifest(state), run, dryRun });
      return;
    }
    if (action === "rollback") {
      const manifest = readManifest(state);
      const previous = manifest.draining[0];
      if (!previous) throw new Error("No retained slot is available to roll back");
      await setAccepting(previous.slot, true);
      publish({
        version: 1,
        webRevision: previous.revision,
        active: previous,
        draining: [manifest.active, ...manifest.draining.slice(1)],
      });
      await setAccepting(manifest.active.slot, false);
      console.log(`Rolled back to ${previous.revision}; both versions' rooms retained`);
      return;
    }
    if (action !== "deploy") {
      throw new Error("Expected deploy, deploy-web, status, cleanup, maintenance, or rollback");
    }
    const before = installedManifest();
    revision ??= await run("git", ["-c", `safe.directory=${source}`, "-C", source, "rev-parse", "HEAD"], {
      capture: true,
    });
    if (before && before.active.revision === revision) {
      console.log(`Revision ${revision} already active; no running services recreated`);
      return;
    }
    for (const draining of before?.draining ?? []) {
      try {
        await cleanupSlot(draining.slot);
      } catch {
        // Busy or unverifiable draining slots stay online and routable.
      }
    }
    // Recover empty partial deployments, including additional generations, before allocating more.
    for (const orphan of orphanSlots(installedManifest())) {
      try {
        await cleanupOrphanSlot(orphan);
      } catch {
        // Busy or unverifiable orphan processes are retained as well.
      }
    }
    const current = installedManifest();
    const referencedSlots = new Set(current ? [current.active, ...current.draining].map(({ slot }) => slot) : []);
    let slot;
    for (const candidate of fixedSlotRotation(current?.active.slot)) {
      if (referencedSlots.has(candidate)) continue;
      if (existsSync(slotDirectory(candidate))) {
        try {
          await cleanupOrphanSlot(candidate);
        } catch {
          // Never reuse a busy, incomplete, or unverifiable orphan slot.
        }
      }
      if (!existsSync(slotDirectory(candidate))) {
        slot = candidate;
        break;
      }
    }
    if (!slot) {
      let meminfo;
      try {
        meminfo = readFileSync(meminfoPath, "utf8");
      } catch {
        throw new Error("Host available memory is unreadable; refusing an additional generation");
      }
      assertOverflowCapacity(meminfo);
      do {
        slot = `g-${randomBytes(6).toString("hex")}`;
      } while (referencedSlots.has(slot) || existsSync(slotDirectory(slot)));
      console.log(`Fixed slots remain occupied; allocating additional generation ${slot}`);
    }
    validateManifest({
      version: 1,
      webRevision: revision,
      active: { slot, revision },
      draining: current ? [current.active, ...current.draining] : [],
    });
    await checkCapacity("before-build");
    const config = await composeConfig();
    const apiEnvironment = restoreComposeEnvironment(config.services.api.environment);
    if (existsSync(`${source}/package.json`)) {
      apiEnvironment.AEGIS_PUBLIC_VERSION = JSON.parse(readFileSync(`${source}/package.json`, "utf8")).version;
    }
    apiEnvironment.AEGIS_DEPLOYMENT_ADMIN_TOKEN = adminToken;
    // Docker builds run serially; there is no build or recreation of active-slot services.
    console.log(`Building immutable revision ${revision} for ${slot}`);
    await run("docker", [
      "build",
      "--label",
      `org.opencontainers.image.revision=${revision}`,
      "-t",
      `aegis-api:${revision}`,
      "-f",
      `${source}/apps/api/Dockerfile`,
      source,
    ]);
    await buildWebRelease(config, revision);
    // Builds can take minutes; confirm every resource again before starting services.
    await checkCapacity("before-start");
    mkdirSync(`${state}/slots/${slot}`, { recursive: true, mode: 0o700 });
    atomicJson(
      slotPath(slot),
      buildSlotCompose({ slot, revision, apiEnvironment, network: config.networks.default.name, state }),
    );
    await compose(slot, ["up", "-d", "--wait", "--wait-timeout", "120"]);
    const ready = await statuses(slot);
    if (
      ready.some(
        (status) =>
          status.slot !== slot || status.revision !== revision || status.acceptingNewRooms || status.activeRooms !== 0,
      )
    ) {
      throw new Error("Idle slot admission, revision, or room verification failed; active slot untouched");
    }
    // Prove Redis-backed matchmaking is initialized, not merely PG readiness.
    for (const index of [1, 2, 3]) {
      await compose(
        slot,
        [
          "exec",
          "-T",
          "-w",
          "/app/apps/api",
          `api${index}`,
          "node",
          "-e",
          "import('@colyseus/redis-driver').then(async({RedisDriver})=>{const d=new RedisDriver(process.env.AEGIS_REDIS_URL);try{if(!Array.isArray(await d.query({})))throw Error('invalid listings')}finally{await d.shutdown()}}).catch(()=>process.exit(1))",
        ],
        true,
      );
    }
    await setAccepting(slot, true);
    try {
      if (current) await setAccepting(current.active.slot, false);
      publish({
        version: 1,
        webRevision: revision,
        active: { slot, revision },
        draining: current ? [current.active, ...current.draining] : [],
      });
    } catch (error) {
      // Restore the last published routing state if admission changes or publication fail.
      if (current) await setAccepting(current.active.slot, true).catch(() => undefined);
      await setAccepting(slot, false).catch(() => undefined);
      throw error;
    }
    const after = await statuses(slot);
    if (after.some((status) => !status.acceptingNewRooms))
      throw new Error("Published slot needs admission recovery; run status/rollback");
    console.log(`ACTIVE ${slot} ${revision}; existing rooms retained on ${current?.active.slot ?? "no previous slot"}`);
    // Cleanup is optional. A busy old slot must never fail the successful cutover or be killed.
    if (current) {
      for (const draining of [current.active, ...current.draining]) {
        try {
          await cleanupSlot(draining.slot);
        } catch {
          console.log(`${draining.slot}: cleanup pending; old processes remain running`);
        }
      }
    }
  } finally {
    rmSync(lock, { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action = "status", ...args] = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index < 0 ? fallback : args[index + 1];
  };
  const source = resolve(option("source", "/source"));
  controller({
    action,
    source,
    envFile: resolve(option("env-file", `${source}/.env`)),
    state: resolve(option("state", "/opt/aegis-rollout")),
    revision: option("revision"),
    meminfoPath: resolve(option("meminfo", "/host/meminfo")),
    dryRun: args.includes("--dry-run"),
  }).catch((error) => {
    console.error(`[aegis/deploy] ${error.message}`);
    process.exitCode = 1;
  });
}
