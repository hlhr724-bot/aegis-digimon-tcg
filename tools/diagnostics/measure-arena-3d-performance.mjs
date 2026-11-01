#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

const requireWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium } = requireWeb("@playwright/test");

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:5173" },
    gl: { type: "string", default: "swiftshader" },
    scenario: { type: "string", default: "crowded" },
    seconds: { type: "string", default: "6" },
    color: { type: "string", default: "dark" },
    quality: { type: "string", default: "auto" },
    turns: { type: "string", default: "6" },
    cycles: { type: "string", default: "8" },
    reduced: { type: "boolean", default: false },
    device: { type: "string", default: "desktop" },
    throttle: { type: "string", default: "1" },
    "gpu-name": { type: "string" },
    cores: { type: "string" },
    memory: { type: "string" },
    output: { type: "string" },
    effect: { type: "string", default: "all" },
    repeat: { type: "string", default: "20" },
    capture: { type: "string" },
    seed: { type: "string" },
    board: { type: "string", default: "arena3d" },
  },
});

const GL_ARGS = {
  swiftshader: [],
  metal: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
};
const SCENARIOS = new Set([
  "crowded",
  "classic",
  "bot",
  "viewer",
  "mount",
  "mobile",
  "effects",
  "decision",
  "landing",
  "rotate",
]);
const BOARD_STYLES = new Set(["arena3d", "classic"]);
const BENCH_EFFECTS = [
  "delete",
  "wipe",
  "impact",
  "attack",
  "security",
  "security-chain",
  "evolve",
  "arrival",
  "arrival-burst",
];
const CAPTURE_OFFSETS = [0.12, 0.3, 0.55, 0.9];
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  "phone-landscape": { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  "phone-landscape-mouse": {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: false,
    hasTouch: false,
  },
  "phone-portrait": { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  "tablet-landscape": { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DEMO_EFFECTS = [
  { name: "turn start", item: "Preview turn start", repeatable: false },
  { name: "On Play activation", item: "Preview activation: On Play", repeatable: true },
  { name: "When Digivolving activation", item: "Preview activation: When Digivolving", repeatable: true },
  { name: "When Attacking activation", item: "Preview activation: When Attacking", repeatable: true },
  { name: "On Deletion activation", item: "Preview activation: On Deletion", repeatable: true },
  { name: "attack + security battle", item: "Security battle: your Digimon wins", repeatable: false },
];
const ADVANCE_BUTTONS =
  /^(keep hand|end turn|end breeding|pass|skip|decline|don't block|do not block|no block|confirm|continue|ok|dismiss notice)$/i;
const ZOOM_BUTTON = /^enlarge card$/i;
const seconds = Number(values.seconds);

if (!SCENARIOS.has(values.scenario)) {
  throw new Error(`--scenario must be one of ${[...SCENARIOS].join(", ")}`);
}
if (!BOARD_STYLES.has(values.board)) {
  throw new Error(`--board must be one of ${[...BOARD_STYLES].join(", ")}`);
}
if (!DEVICES[values.device]) {
  throw new Error(`--device must be one of ${Object.keys(DEVICES).join(", ")}`);
}
if (!GL_ARGS[values.gl]) {
  throw new Error(`--gl must be one of ${Object.keys(GL_ARGS).join(", ")}`);
}

function installProbes({ boardStyle, quality, gpuName, cores, memory, seed }) {
  if (seed !== undefined) {
    let state = seed >>> 0;
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  if (cores) {
    Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => cores, configurable: true });
  }
  if (memory) {
    Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => memory, configurable: true });
  }
  if (gpuName) {
    const UNMASKED_RENDERER = 0x9246;
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      const getParameter = Context?.prototype.getParameter;
      if (!getParameter) {
        continue;
      }
      Context.prototype.getParameter = function readParameter(name) {
        return name === UNMASKED_RENDERER ? gpuName : getParameter.call(this, name);
      };
    }
  }
  try {
    localStorage.setItem("aegis.board-style", boardStyle);
    localStorage.setItem("aegis.arena-3d-quality", quality);
  } catch {
    return;
  }
  const probe = {
    renderers: [],
    scenes: [],
    frames: [],
    longTasks: [],
    recording: false,
    tracking: false,
    counting: false,
    commits: 0,
    renders: {},
    seen: new WeakMap(),
    roots: [],
    knownRoots: new WeakSet(),
  };
  window.arenaPerfProbe = probe;
  const devtools = new EventTarget();
  devtools.addEventListener("observe", (event) => {
    const target = event.detail;
    if (target?.isWebGLRenderer) {
      probe.renderers.push(new WeakRef(target));
    }
    if (target?.isScene) {
      probe.scenes.push(new WeakRef(target));
    }
  });
  window.__THREE_DEVTOOLS__ = devtools;

  const componentTags = new Set([0, 1, 11, 15]);
  function readName(fiber) {
    const type = fiber.type;
    if (!type) {
      return undefined;
    }
    if (fiber.tag === 11) {
      return type.displayName || type.render?.displayName || type.render?.name;
    }
    return type.displayName || type.name;
  }
  function walkRoot(root, count) {
    const stack = [root.current];
    while (stack.length > 0) {
      const fiber = stack.pop();
      if (componentTags.has(fiber.tag)) {
        const previous = probe.seen.get(fiber);
        const rendered = !previous || previous.props !== fiber.memoizedProps || previous.state !== fiber.memoizedState;
        if (count && rendered) {
          const name = readName(fiber);
          if (name) {
            probe.renders[name] = (probe.renders[name] ?? 0) + 1;
          }
        }
        const record = { props: fiber.memoizedProps, state: fiber.memoizedState };
        probe.seen.set(fiber, record);
        if (fiber.alternate) {
          probe.seen.set(fiber.alternate, record);
        }
      }
      if (fiber.sibling) {
        stack.push(fiber.sibling);
      }
      if (fiber.child) {
        stack.push(fiber.child);
      }
    }
  }
  let rendererId = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) {
      rendererId += 1;
      this.renderers.set(rendererId, renderer);
      return rendererId;
    },
    checkDCE() {},
    setStrictMode() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_, root) {
      if (!probe.knownRoots.has(root)) {
        probe.knownRoots.add(root);
        probe.roots.push(new WeakRef(root));
      }
      if (!probe.tracking) {
        return;
      }
      if (probe.counting) {
        probe.commits += 1;
      }
      walkRoot(root, probe.counting);
    },
  };
  probe.primeRenders = () => {
    probe.seen = new WeakMap();
    for (const reference of probe.roots) {
      const root = reference.deref();
      if (root) {
        walkRoot(root, false);
      }
    }
  };
  probe.liveRenderers = () => probe.renderers.map((reference) => reference.deref()).filter(Boolean);
  probe.liveScenes = () => probe.scenes.map((reference) => reference.deref()).filter(Boolean);
  probe.renderedTicks = 0;
  probe.findArenaRenderer = () =>
    probe
      .liveRenderers()
      .find(
        (renderer) => !renderer.getContext().isContextLost() && renderer.domElement.closest(".arena-3d-scene") !== null,
      );
  probe.readRenderedFrames = () => probe.renderedTicks;
  probe.readTier = () => {
    const renderer = probe.findArenaRenderer();
    if (!renderer) {
      return undefined;
    }
    const scene = probe.liveScenes().find((candidate) => candidate.__r3f?.root?.getState?.().gl === renderer);
    let floorSegments;
    const textureWidths = new Set();
    scene?.traverse((object) => {
      const parameters = object.geometry?.parameters;
      if (object.isMesh && object.geometry.type === "PlaneGeometry" && parameters?.width === 90) {
        floorSegments = parameters.widthSegments;
      }
      for (const uniform of Object.values(object.material?.uniforms ?? {})) {
        const image = uniform?.value?.isTexture ? uniform.value.image : undefined;
        if (image?.width && image.height > image.width && image.width >= 256) {
          textureWidths.add(image.width);
        }
      }
    });
    return {
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
      antialias: renderer.getContext().getContextAttributes()?.antialias ?? false,
      floorSegments,
      textureWidths: [...textureWidths].sort((a, b) => a - b),
      createdRenderers: probe.renderers.length,
    };
  };
  probe.readPrograms = () => probe.findArenaRenderer()?.info.programs?.length ?? 0;
  let lastRenderFrame = -1;
  function sampleFrame(now) {
    if (probe.recording) {
      probe.frames.push(now);
    }
    const renderFrame = probe.findArenaRenderer()?.info.render.frame ?? -1;
    if (renderFrame !== lastRenderFrame) {
      probe.renderedTicks += 1;
      lastRenderFrame = renderFrame;
    }
    requestAnimationFrame(sampleFrame);
  }
  requestAnimationFrame(sampleFrame);
  try {
    new PerformanceObserver((list) => {
      if (!probe.recording) {
        return;
      }
      for (const entry of list.getEntries()) {
        probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    probe.longTaskUnsupported = true;
  }
}

function summarizeIntervals(timestamps) {
  const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]);
  const sorted = [...intervals].sort((a, b) => a - b);
  const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
  const span = (timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0);
  return {
    frames: intervals.length,
    medianMs: round(pick(0.5)),
    p95Ms: round(pick(0.95)),
    p99Ms: round(pick(0.99)),
    maxMs: round(sorted.at(-1) ?? 0),
    over20Ms: intervals.filter((interval) => interval > 20).length,
    over33Ms: intervals.filter((interval) => interval > 33.4).length,
    fps: span > 0 ? round((intervals.length * 1000) / span) : 0,
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readMetrics(result) {
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function measureTiming({ page, session, milliseconds, action }) {
  const before = readMetrics(await session.send("Performance.getMetrics"));
  const renderedBefore = await page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    probe.frames = [];
    probe.longTasks = [];
    probe.recording = true;
    return { rendered: probe.readRenderedFrames(), programs: probe.readPrograms() };
  });
  const startedAt = Date.now();
  if (action) {
    await action();
  }
  await sleep(Math.max(0, milliseconds - (Date.now() - startedAt)));
  const sample = await page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    probe.recording = false;
    return {
      frames: probe.frames,
      longTasks: probe.longTasks,
      rendered: probe.readRenderedFrames(),
      programs: probe.readPrograms(),
    };
  });
  const after = readMetrics(await session.send("Performance.getMetrics"));
  const elapsed = (Date.now() - startedAt) / 1000;
  const perSecond = (name) => round((after[name] - before[name]) / elapsed, 3);
  return {
    seconds: round(elapsed),
    rafIntervals: summarizeIntervals(sample.frames),
    renderedFramesPerSecond: round((sample.rendered - renderedBefore.rendered) / elapsed, 1),
    programsCompiled: sample.programs - renderedBefore.programs,
    longTasks: {
      count: sample.longTasks.length,
      totalMs: round(sample.longTasks.reduce((sum, task) => sum + task.duration, 0)),
      maxMs: round(Math.max(0, ...sample.longTasks.map((task) => task.duration))),
    },
    scriptMsPerSecond: round(perSecond("ScriptDuration") * 1000),
    taskMsPerSecond: round(perSecond("TaskDuration") * 1000),
    layoutMsPerSecond: round(perSecond("LayoutDuration") * 1000),
    recalcStyleMsPerSecond: round(perSecond("RecalcStyleDuration") * 1000),
    layoutsPerSecond: perSecond("LayoutCount"),
    styleRecalcsPerSecond: perSecond("RecalcStyleCount"),
    heapMegabytes: round(after.JSHeapUsedSize / 1048576, 1),
  };
}

function describeCallFrame(callFrame) {
  if (!callFrame.url) {
    return `native:${callFrame.functionName || "(anonymous)"}`;
  }
  return basename(new URL(callFrame.url, "http://local").pathname);
}

function aggregateProfile(profile, renderedFrames) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parents.set(child, node.id);
    }
  }
  const selfByFile = new Map();
  const inclusiveByFile = new Map();
  const selfByFunction = new Map();
  let total = 0;
  profile.samples.forEach((id, index) => {
    const delta = (profile.timeDeltas[index] ?? 0) / 1000;
    total += delta;
    const node = nodes.get(id);
    const file = describeCallFrame(node.callFrame);
    selfByFile.set(file, (selfByFile.get(file) ?? 0) + delta);
    const functionKey = `${node.callFrame.functionName || "(anonymous)"} ${file}:${node.callFrame.lineNumber + 1}`;
    selfByFunction.set(functionKey, (selfByFunction.get(functionKey) ?? 0) + delta);
    const files = new Set();
    for (let cursor = id; cursor !== undefined; cursor = parents.get(cursor)) {
      files.add(describeCallFrame(nodes.get(cursor).callFrame));
    }
    for (const entry of files) {
      inclusiveByFile.set(entry, (inclusiveByFile.get(entry) ?? 0) + delta);
    }
  });
  const profileSeconds = total / 1000;
  const frames = Math.max(1, renderedFrames);
  const rank = (map, limit) =>
    [...map]
      .filter(([key]) => !["native:(idle)", "native:(program)", "native:(root)"].includes(key))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, milliseconds]) => ({
        key,
        msPerSecond: round(milliseconds / profileSeconds),
        msPerRenderedFrame: round(milliseconds / frames, 3),
      }));
  return {
    seconds: round(profileSeconds),
    renderedFrames,
    idleShare: round((selfByFile.get("native:(idle)") ?? 0) / total, 3),
    topSelfFiles: rank(selfByFile, 25),
    topInclusiveFiles: rank(inclusiveByFile, 40),
    topSelfFunctions: rank(selfByFunction, 30),
  };
}

async function measureProfile({ page, session, milliseconds, action }) {
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 200 });
  const renderedBefore = await page.evaluate(() => window.arenaPerfProbe.readRenderedFrames());
  await session.send("Profiler.start");
  const startedAt = Date.now();
  if (action) {
    await action();
  }
  await sleep(Math.max(0, milliseconds - (Date.now() - startedAt)));
  const { profile } = await session.send("Profiler.stop");
  const renderedAfter = await page.evaluate(() => window.arenaPerfProbe.readRenderedFrames());
  await session.send("Profiler.disable");
  return aggregateProfile(profile, renderedAfter - renderedBefore);
}

async function measureLayoutTrace({ page, session, milliseconds }) {
  const events = [];
  const collect = (payload) => events.push(...payload.value);
  session.on("Tracing.dataCollected", collect);
  const complete = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
  await session.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });
  await page.waitForTimeout(milliseconds);
  await session.send("Tracing.end");
  await complete;
  session.off("Tracing.dataCollected", collect);
  const summary = {};
  const callers = new Map();
  for (const event of events) {
    if (!["Layout", "UpdateLayoutTree"].includes(event.name) || !["X", "B"].includes(event.ph)) {
      continue;
    }
    const stack = event.args?.beginData?.stackTrace ?? event.args?.data?.stackTrace;
    const entry = (summary[event.name] ??= { count: 0, forced: 0, totalMs: 0 });
    entry.count += 1;
    entry.totalMs += (event.dur ?? 0) / 1000;
    if (stack?.length) {
      entry.forced += 1;
      const top = stack[0];
      const key = `${event.name} <- ${top.functionName || "(anonymous)"} ${basename(top.url || "")}:${top.lineNumber + 1}`;
      callers.set(key, (callers.get(key) ?? 0) + 1);
    }
  }
  const perSecond = 1000 / milliseconds;
  return {
    seconds: milliseconds / 1000,
    events: Object.fromEntries(
      Object.entries(summary).map(([name, entry]) => [
        name,
        {
          perSecond: round(entry.count * perSecond),
          forcedPerSecond: round(entry.forced * perSecond),
          msPerSecond: round(entry.totalMs * perSecond),
        },
      ]),
    ),
    forcedCallers: [...callers]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([key, count]) => ({ key, perSecond: round(count * perSecond) })),
  };
}

async function measureRenders({ page, milliseconds, action }) {
  await page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    probe.primeRenders();
    probe.renders = {};
    probe.commits = 0;
    probe.tracking = true;
    probe.counting = true;
  });
  const startedAt = Date.now();
  if (action) {
    await action();
  }
  await sleep(Math.max(0, milliseconds - (Date.now() - startedAt)));
  const result = await page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    probe.tracking = false;
    probe.counting = false;
    return { commits: probe.commits, renders: probe.renders };
  });
  const elapsed = (Date.now() - startedAt) / 1000;
  const watched = [
    "BoardStage",
    "Arena3dField",
    "Arena3dPositionedRow",
    "Arena3dLayer",
    "Arena3dLayerScene",
    "Arena3dCanvas",
    "ArenaSceneContents",
    "ArenaPermanentMeshView",
    "ArenaZoneMesh",
    "ArenaSlotTiles",
    "ViewerBattleRow",
    "OpponentBattleRow",
    "GameScreen",
  ];
  return {
    seconds: round(elapsed),
    commitsPerSecond: round(result.commits / elapsed),
    watchedPerSecond: Object.fromEntries(watched.map((name) => [name, round((result.renders[name] ?? 0) / elapsed)])),
    topPerSecond: Object.entries(result.renders)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, perSecond: round(count / elapsed) })),
  };
}

async function inspectScenes() {
  const probe = window.arenaPerfProbe;
  const waitForRenderedTick = async () => {
    const start = probe.renderedTicks;
    const deadline = performance.now() + 2000;
    while (probe.renderedTicks === start && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };
  const frameTotals = new Map();
  for (const renderer of probe.liveRenderers()) {
    if (renderer.getContext().isContextLost()) {
      continue;
    }
    renderer.info.autoReset = false;
  }
  await waitForRenderedTick();
  for (const renderer of probe.liveRenderers()) {
    renderer.info.reset();
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await waitForRenderedTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const renderer of probe.liveRenderers()) {
    frameTotals.set(renderer, {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
    });
    renderer.info.autoReset = true;
  }
  const multiply = (a, b) => {
    const out = new Array(16).fill(0);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) {
          sum += a[k * 4 + row] * b[column * 4 + k];
        }
        out[column * 4 + row] = sum;
      }
    }
    return out;
  };
  const measureCoverage = (matrix, box) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
          if (w <= 0.0001) {
            return 1;
          }
          const px = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w;
          const py = (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      }
    }
    const width = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
    const height = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
    return (width * height) / 4;
  };
  const describeGeometry = (geometry) => {
    const parameters = geometry.parameters ?? {};
    const size = [parameters.width, parameters.height, parameters.radius]
      .filter((value) => value !== undefined)
      .map((value) => Number(value).toFixed(2));
    return `${geometry.type}(${size.join("x")})`;
  };
  return probe
    .liveScenes()
    .filter((scene) => scene.__r3f?.root)
    .map((scene) => {
      const root = scene.__r3f?.root?.getState?.();
      const camera = root?.camera;
      const renderer = root?.gl;
      const viewProjection = camera
        ? multiply(camera.projectionMatrix.elements, camera.matrixWorldInverse.elements)
        : undefined;
      const textures = new Map();
      const materials = new Set();
      const geometries = new Set();
      const overdraw = new Map();
      let meshes = 0;
      let visibleMeshes = 0;
      let instancedMeshes = 0;
      let transparentCoverage = 0;
      const collectTexture = (value) => {
        if (value?.isTexture && !textures.has(value.uuid)) {
          const image = value.image ?? {};
          const bytes = (image.width ?? 0) * (image.height ?? 0) * 4 * (value.generateMipmaps ? 4 / 3 : 1);
          textures.set(value.uuid, bytes);
        }
      };
      scene.traverse((object) => {
        if (!object.isMesh && !object.isPoints) {
          return;
        }
        meshes += 1;
        let visible = true;
        for (let cursor = object; cursor; cursor = cursor.parent) {
          visible &&= cursor.visible;
        }
        if (!visible) {
          return;
        }
        visibleMeshes += 1;
        const material = object.material;
        materials.add(material);
        geometries.add(object.geometry);
        collectTexture(material.map);
        for (const uniform of Object.values(material.uniforms ?? {})) {
          collectTexture(uniform?.value);
        }
        if (object.isInstancedMesh) {
          instancedMeshes += 1;
        }
        if (object.isPoints) {
          return;
        }
        const blended = material.transparent || material.depthWrite === false || material.blending !== 1;
        if (!blended || !viewProjection) {
          return;
        }
        if (!object.geometry.boundingBox) {
          object.geometry.computeBoundingBox();
        }
        const base = multiply(viewProjection, object.matrixWorld.elements);
        let coverage = 0;
        const instances = object.isInstancedMesh ? object.count : 1;
        for (let index = 0; index < instances; index += 1) {
          const matrix = object.isInstancedMesh
            ? multiply(base, Array.from(object.instanceMatrix.array.slice(index * 16, index * 16 + 16)))
            : base;
          coverage += measureCoverage(matrix, object.geometry.boundingBox);
        }
        transparentCoverage += coverage;
        const key = `${describeGeometry(object.geometry)} ${material.type} order=${object.renderOrder}${object.isInstancedMesh ? " instanced" : ""}`;
        const entry = overdraw.get(key) ?? { meshes: 0, instances: 0, coverage: 0 };
        entry.meshes += 1;
        entry.instances += instances;
        entry.coverage += coverage;
        overdraw.set(key, entry);
      });
      const textureBytes = [...textures.values()].reduce((sum, bytes) => sum + bytes, 0);
      return {
        canvas: renderer
          ? {
              width: renderer.domElement.width,
              height: renderer.domElement.height,
              pixelRatio: renderer.getPixelRatio(),
              contextLost: renderer.getContext().isContextLost(),
            }
          : undefined,
        render: renderer
          ? {
              ...frameTotals.get(renderer),
              programs: renderer.info.programs?.length ?? 0,
              geometries: renderer.info.memory.geometries,
              textures: renderer.info.memory.textures,
            }
          : undefined,
        meshes,
        visibleMeshes,
        instancedMeshes,
        uniqueMaterials: materials.size,
        uniqueGeometries: geometries.size,
        uniqueTextures: textures.size,
        textureMegabytes: Math.round((textureBytes / 1048576) * 10) / 10,
        transparentCoverageScreens: Math.round(transparentCoverage * 100) / 100,
        overdraw: [...overdraw]
          .sort((a, b) => b[1].coverage - a[1].coverage)
          .slice(0, 14)
          .map(([key, entry]) => ({ key, ...entry, coverage: Math.round(entry.coverage * 100) / 100 })),
      };
    });
}

async function waitForArena(page) {
  await page.waitForSelector(".arena-3d-scene canvas", { timeout: 60000 });
  await page.waitForFunction(() => window.arenaPerfProbe.liveScenes().length > 0, null, { timeout: 30000 });
}

async function openDemoTool(page, item) {
  await page.getByRole("button", { name: "Demo tools" }).click();
  await page.getByRole("menuitem", { name: item }).click({ timeout: 5000 });
}

async function readDragTarget(page) {
  return page.evaluate(() => {
    const card = document.querySelector(".game-hand-card");
    const field =
      document.querySelector('.arena-3d-field [data-arena-3d-row="you"]') ??
      document.querySelector(".game-battle-row--you") ??
      document.querySelector(".game-field");
    if (!card || !field) {
      return undefined;
    }
    const from = card.getBoundingClientRect();
    const to = field.getBoundingClientRect();
    return {
      from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
      to: { x: to.left + to.width / 2, y: to.top + to.height / 2 },
    };
  });
}

async function dragOverField(page, milliseconds) {
  const target = await readDragTarget(page);
  if (!target) {
    return false;
  }
  await page.mouse.move(target.from.x, target.from.y);
  await page.mouse.down();
  const steps = Math.max(10, Math.round(milliseconds / 50));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const wobble = Math.sin(progress * Math.PI * 6) * 120;
    await page.mouse.move(
      target.from.x + (target.to.x - target.from.x) * Math.min(1, progress * 3) + wobble,
      target.from.y + (target.to.y - target.from.y) * Math.min(1, progress * 3),
    );
    await page.waitForTimeout(40);
  }
  await page.mouse.move(target.from.x, target.from.y);
  await page.mouse.up();
  return true;
}

async function collectScenes(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)))),
  );
  return page.evaluate(inspectScenes);
}

async function openDemo({ page, arena }) {
  await page.goto(new URL("/dev/arena?scenario=crowded", values.base).href);
  if (arena) {
    await waitForArena(page);
  } else {
    await page.waitForSelector(".game-board", { timeout: 60000 });
  }
  await page.waitForTimeout(8000);
}

async function runDemo({ page, session, report, arena }) {
  await openDemo({ page, arena });
  const milliseconds = seconds * 1000;
  report.idle = await measureTiming({ page, session, milliseconds });
  report.idleProfile = await measureProfile({ page, session, milliseconds });
  report.idleLayout = await measureLayoutTrace({ page, session, milliseconds: 3000 });
  report.idleRenders = await measureRenders({ page, milliseconds });
  if (arena) {
    report.scenes = await collectScenes(page);
  }
  report.effects = [];
  for (const effect of DEMO_EFFECTS) {
    await openDemo({ page, arena });
    const trigger = () => openDemoTool(page, effect.item).catch(() => page.keyboard.press("Escape"));
    const [cold, coldProfile] = await Promise.all([
      measureTiming({ page, session, milliseconds: 3600, action: trigger }),
      measureProfile({ page, session, milliseconds: 3600 }),
    ]);
    const [warm, warmProfile] = effect.repeatable
      ? await Promise.all([
          measureTiming({ page, session, milliseconds: 3600, action: trigger }),
          measureProfile({ page, session, milliseconds: 3600 }),
        ])
      : [undefined, undefined];
    report.effects.push({
      name: effect.name,
      cold,
      coldTopInclusive: coldProfile.topInclusiveFiles.slice(0, 14),
      coldTopSelf: coldProfile.topSelfFunctions.slice(0, 10),
      warm,
      warmTopInclusive: warmProfile?.topInclusiveFiles.slice(0, 24),
    });
  }
  await openDemo({ page, arena });
  report.effectsRenders = await measureRenders({
    page,
    milliseconds: 3600,
    action: () => openDemoTool(page, "Preview activation: On Play"),
  });
  report.drag = await measureTiming({ page, session, milliseconds: 3000, action: () => dragOverField(page, 2600) });
  report.dragProfile = await measureProfile({
    page,
    session,
    milliseconds: 3000,
    action: () => dragOverField(page, 2600),
  });
  report.dragRenders = await measureRenders({ page, milliseconds: 3000, action: () => dragOverField(page, 2600) });
}

async function clickFirstEnabled(buttons) {
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if ((await button.isVisible().catch(() => false)) && (await button.isEnabled().catch(() => false))) {
      await button.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function clickAdvance(page) {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  const optOut = dialog.getByRole("checkbox", { name: /don't ask again/i });
  if (await optOut.isVisible().catch(() => false)) {
    await optOut.check({ timeout: 1000 }).catch(() => {});
  }
  if (await clickFirstEnabled(dialog.getByRole("button", { name: ADVANCE_BUTTONS }))) {
    return true;
  }
  return clickFirstEnabled(page.getByRole("button", { name: ADVANCE_BUTTONS }));
}

async function startBotMatch(page) {
  await page.goto(values.base);
  for (const name of [/^play now$/i, /practice vs ai/i, /^play vs bot$/i]) {
    await page
      .getByRole("button", { name })
      .or(page.getByRole("link", { name }))
      .or(page.getByText(name))
      .filter({ visible: true })
      .first()
      .click({ timeout: 20000 });
    await page.waitForTimeout(1500);
  }
  await page.getByRole("button", { name: /keep hand/i }).click({ timeout: 60000 });
}

async function runBot({ page, session, report }) {
  await startBotMatch(page);
  await waitForArena(page);
  await page.waitForTimeout(4000);
  report.idle = await measureTiming({ page, session, milliseconds: seconds * 1000 });
  report.scenes = await collectScenes(page);
  const turns = Number(values.turns);
  const windows = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const timing = await measureTiming({
      page,
      session,
      milliseconds: 15000,
      action: async () => {
        const deadline = Date.now() + 14000;
        while (Date.now() < deadline) {
          await clickAdvance(page);
          await page.waitForTimeout(700);
        }
      },
    });
    windows.push(timing);
    if (values.output) {
      await page.screenshot({ path: `${values.output}.turn-${turn}.png` });
    }
  }
  report.match = windows;
  report.matchProfile = await measureProfile({
    page,
    session,
    milliseconds: 12000,
    action: async () => {
      const deadline = Date.now() + 11000;
      while (Date.now() < deadline) {
        await clickAdvance(page);
        await page.waitForTimeout(700);
      }
    },
  });
  report.lateScenes = await collectScenes(page);
}

async function runViewer({ page, session, report }) {
  await page.goto(new URL("/dev/arena?scenario=crowded", values.base).href);
  await waitForArena(page);
  await page.waitForTimeout(4000);
  const opponentCard = page.locator('.game-field [data-arena-3d-row="opp"] .game-permanent').first();
  await opponentCard.click({ timeout: 10000, force: true });
  await page.getByRole("button", { name: ZOOM_BUTTON }).first().click({ timeout: 10000 });
  await page.waitForSelector('.card-zoom-art[data-viewer="3d"] canvas', { state: "attached", timeout: 30000 });
  await page.waitForTimeout(3000);
  const milliseconds = seconds * 1000;
  report.viewerIdle = await measureTiming({ page, session, milliseconds });
  report.viewerProfile = await measureProfile({ page, session, milliseconds });
  report.scenes = await collectScenes(page);
  const box = await page
    .locator(".card-zoom-art")
    .first()
    .boundingBox()
    .catch(() => null);
  report.viewerHover = await measureTiming({
    page,
    session,
    milliseconds: 3000,
    action: async () => {
      if (!box) {
        return;
      }
      for (let step = 0; step < 50; step += 1) {
        await page.mouse.move(box.x + box.width * (0.2 + 0.6 * ((step % 10) / 10)), box.y + box.height / 2);
        await page.waitForTimeout(50);
      }
    },
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  await session.send("HeapProfiler.collectGarbage");
  report.afterClose = await page.evaluate(() => ({
    viewerCanvases: document.querySelectorAll(".card-zoom-art canvas").length,
    liveRenderers: window.arenaPerfProbe.liveRenderers().length,
    liveContexts: window.arenaPerfProbe.liveRenderers().filter((renderer) => !renderer.getContext().isContextLost())
      .length,
  }));
}

async function runMount({ page, session, report }) {
  await page.goto(new URL("/dev/arena?scenario=crowded", values.base).href);
  await waitForArena(page);
  await page.waitForTimeout(4000);
  const cycles = Number(values.cycles);
  const samples = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const style of ["classic", "arena3d"]) {
      await page.evaluate(async (next) => {
        const module = await import("/src/game/arena3d/boardStyle/boardStylePreference.ts");
        module.boardStylePreference.setStyle(next);
      }, style);
      await page.waitForTimeout(1800);
    }
    await session.send("HeapProfiler.collectGarbage");
    const heap = await session.send("Runtime.getHeapUsage");
    samples.push(
      await page.evaluate((usedSize) => {
        const probe = window.arenaPerfProbe;
        const renderers = probe.liveRenderers();
        return {
          canvases: document.querySelectorAll(".arena-3d-scene canvas").length,
          createdRenderers: probe.renderers.length,
          liveRenderers: renderers.length,
          liveContexts: renderers.filter((renderer) => !renderer.getContext().isContextLost()).length,
          liveScenes: probe.liveScenes().length,
          heapMegabytes: Math.round(usedSize / 104857.6) / 10,
          memory: renderers
            .filter((renderer) => !renderer.getContext().isContextLost())
            .map((renderer) => renderer.info.memory),
        };
      }, heap.usedSize),
    );
  }
  report.mountCycles = samples;
}

async function forceRenderEveryFrame(page, milliseconds) {
  await page.evaluate(async (duration) => {
    const probe = window.arenaPerfProbe;
    const renderer = probe.findArenaRenderer();
    const scene = probe.liveScenes().find((candidate) => candidate.__r3f?.root?.getState?.().gl === renderer);
    const invalidate = scene?.__r3f?.root?.getState?.().invalidate;
    const endsAt = performance.now() + duration;
    await new Promise((resolve) => {
      const tick = (now) => {
        invalidate?.();
        if (now < endsAt) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }, milliseconds);
}

async function readTier(page) {
  return page.evaluate(() => window.arenaPerfProbe.readTier());
}

async function measureResizeStorm(page) {
  const device = DEVICES[values.device];
  await page.evaluate(() => {
    const renderer = window.arenaPerfProbe.findArenaRenderer();
    const probe = window.arenaPerfProbe;
    probe.setSizeCalls = 0;
    probe.bufferSizes = new Set();
    if (renderer && !renderer.__countedSetSize) {
      const setSize = renderer.setSize.bind(renderer);
      renderer.setSize = (...args) => {
        probe.setSizeCalls += 1;
        setSize(...args);
        probe.bufferSizes.add(`${renderer.domElement.width}x${renderer.domElement.height}`);
      };
      renderer.__countedSetSize = true;
    }
  });
  const { width, height } = device.viewport;
  const events = 30;
  for (let index = 0; index < events; index += 1) {
    const shrink = index % 2 === 0 ? 24 + (index % 5) * 6 : 0;
    await page.setViewportSize({ width: width - shrink, height: height - Math.round(shrink / 2) });
  }
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(1500);
  return page.evaluate(
    (count) => ({
      resizeEvents: count,
      rendererSetSizeCalls: window.arenaPerfProbe.setSizeCalls,
      distinctDrawingBuffers: window.arenaPerfProbe.bufferSizes.size,
      createdRenderers: window.arenaPerfProbe.renderers.length,
    }),
    events + 1,
  );
}

async function runMobile({ page, session, report }) {
  await page.goto(new URL("/dev/arena?scenario=crowded&board=arena3d", values.base).href);
  await waitForArena(page);
  const tiers = [];
  const startedAt = Date.now();
  report.calibration = await measureTiming({
    page,
    session,
    milliseconds: 16000,
    action: async () => {
      while (Date.now() - startedAt < 15500) {
        tiers.push({ second: round((Date.now() - startedAt) / 1000, 1), ...(await readTier(page)) });
        await page.waitForTimeout(1000);
      }
    },
  });
  report.tiers = tiers.filter(
    (tier, index) =>
      index === 0 || JSON.stringify({ ...tier, second: 0 }) !== JSON.stringify({ ...tiers[index - 1], second: 0 }),
  );
  const milliseconds = seconds * 1000;
  report.idle = await measureTiming({ page, session, milliseconds });
  report.idleProfile = (await measureProfile({ page, session, milliseconds })).topInclusiveFiles.slice(0, 12);
  report.scenes = await collectScenes(page);
  report.busy = await measureTiming({
    page,
    session,
    milliseconds: 4000,
    action: () => forceRenderEveryFrame(page, 3800),
  });
  report.finalTier = await readTier(page);
  report.resizeStorm = await measureResizeStorm(page);
}

async function installEffectBench() {
  const probe = window.arenaPerfProbe;
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const sceneRenderer = [...hook.renderers.values()].find(
    (renderer) => renderer.rendererPackageName === "@react-three/fiber",
  );
  const sceneSource = await fetch("/src/game/arena3d/field/Arena3dScene.tsx").then((response) => response.text());
  const moduleUrl = sceneSource.match(/from "([^"]*@react-three_fiber\.js[^"]*)"/)?.[1];
  if (!sceneRenderer?.overrideProps || !moduleUrl) {
    throw new Error("The effect bench needs the development build of @react-three/fiber.");
  }
  const fiberModule = await import(moduleUrl);
  const readName = (node) => node.type?.displayName || node.type?.name;
  const findFiber = (name) => {
    for (const reference of probe.roots) {
      const root = reference.deref();
      if (!root?.current) {
        continue;
      }
      const stack = [root.current];
      while (stack.length > 0) {
        const node = stack.pop();
        if (typeof node.type === "function" && readName(node) === name) {
          return node;
        }
        if (node.sibling) {
          stack.push(node.sibling);
        }
        if (node.child) {
          stack.push(node.child);
        }
      }
    }
    return undefined;
  };
  const readState = () => {
    const renderer = probe.findArenaRenderer();
    return probe
      .liveScenes()
      .find((candidate) => candidate.__r3f?.root?.getState?.().gl === renderer)
      ?.__r3f.root.getState();
  };
  const bench = { frames: [], recording: false, serial: 0, timers: [] };
  let frameStart = 0;
  let lastFrame = -1;
  fiberModule.addEffect(() => {
    frameStart = performance.now();
  });
  fiberModule.addAfterEffect(() => {
    const frame = probe.findArenaRenderer()?.info.render.frame ?? -1;
    if (frame === lastFrame) {
      return;
    }
    lastFrame = frame;
    if (bench.recording) {
      bench.frames.push(performance.now() - frameStart);
    }
  });
  const board = () => document.querySelector(".game-board");
  const center = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const proxies = (side) => [
    ...document.querySelectorAll(`.game-field [data-arena-3d-row="${side}"] .game-permanent[data-permanent-id]`),
  ];
  const security = (side) => board().querySelector(`.game-security-shield--${side}`);
  const colors = () =>
    findFiber("ArenaSceneContents")?.memoizedProps.colors ?? { player: "#ff6a3d", opponent: "#3da5ff" };
  const sideColor = (side) => (side === "you" ? colors().player : colors().opponent);
  const permanents = () => {
    const props = findFiber("Arena3dLayerScene")?.memoizedProps;
    return new Map(
      [...(props?.viewerBattleArea ?? []), ...(props?.opponentBattleArea ?? [])].map((permanent) => [
        permanent.permanentId,
        permanent,
      ]),
    );
  };
  const pickProxies = (count) => [...proxies("opp"), ...proxies("you")].slice(0, count);
  const sideOf = (element) => element.closest("[data-arena-3d-row]").getAttribute("data-arena-3d-row");
  const idOf = (element) => element.getAttribute("data-permanent-id");
  const nextKey = (kind) => {
    bench.serial += 1;
    return `bench-${kind}:${bench.serial}`;
  };
  const override = (name, prop, value) => {
    const node = findFiber(name);
    if (node) {
      sceneRenderer.overrideProps(node, [prop], value);
    }
  };
  const emitPulses = (pulses) => {
    override("ArenaPulseLayer", "pulses", pulses);
    override("ArenaMotionDirector", "pulses", pulses);
  };
  const emitDeletes = (elements) => {
    const boardRect = board().getBoundingClientRect();
    const known = permanents();
    const bursts = [];
    const pulses = [];
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const point = center(element);
      const permanent = known.get(idOf(element));
      bench.serial += 1;
      bursts.push({
        key: 900000 + bench.serial,
        x: rect.left - boardRect.left,
        y: rect.top - boardRect.top,
        face: {
          x: point.x - boardRect.left,
          y: point.y - boardRect.top,
          width: rect.width,
          height: rect.height,
          angle: 0,
        },
        cardId: permanent?.topCard?.cardId ?? "BT1-010",
        artId: permanent?.topCard?.artId,
      });
      pulses.push({
        key: nextKey("delete"),
        kind: "delete",
        color: sideColor(sideOf(element)),
        side: sideOf(element),
        screenPoint: point,
      });
    }
    override("ArenaCardDepartures", "deleteBursts", bursts);
    emitPulses(pulses);
  };
  const attackSecurity = (attacker) => ({
    key: nextKey("attack"),
    kind: "attack",
    color: sideColor("you"),
    side: "you",
    screenPoint: center(attacker),
    targetPoint: center(security("opp")),
    permanentId: idOf(attacker),
  });
  const securityHit = () => ({
    key: nextKey("security"),
    kind: "security",
    color: sideColor("you"),
    side: "opp",
    screenPoint: center(security("opp")),
  });
  const land = (elements) => {
    const pulses = [];
    for (const element of elements) {
      const marker = document.createElement("div");
      marker.className = "game-card-landing";
      element.append(marker);
      bench.timers.push(setTimeout(() => marker.remove(), 900));
      pulses.push({
        key: nextKey("summon"),
        kind: "summon",
        color: sideColor(sideOf(element)),
        side: sideOf(element),
        screenPoint: center(element),
        permanentId: idOf(element),
      });
    }
    emitPulses(pulses);
  };
  const plans = {
    delete: () => [{ at: 0, run: () => emitDeletes(pickProxies(1)) }],
    wipe: () => [{ at: 0, run: () => emitDeletes(pickProxies(6)) }],
    impact: () => [
      {
        at: 0,
        run: () => {
          const target = proxies("opp")[0];
          emitPulses([
            {
              key: nextKey("impact"),
              kind: "impact",
              color: sideColor("you"),
              side: "opp",
              screenPoint: center(target),
              permanentId: idOf(target),
            },
          ]);
        },
      },
    ],
    attack: () => [
      {
        at: 0,
        run: () => {
          const attacker = proxies("you")[0];
          const defender = proxies("opp")[0];
          emitPulses([
            {
              key: nextKey("clash"),
              kind: "attack",
              color: sideColor("you"),
              side: "you",
              screenPoint: center(attacker),
              targetPoint: center(defender),
              permanentId: idOf(attacker),
              targetPermanentId: idOf(defender),
            },
          ]);
        },
      },
    ],
    security: () => [
      { at: 0, run: () => emitPulses([attackSecurity(proxies("you")[0])]) },
      { at: 600, run: () => emitPulses([securityHit()]) },
    ],
    "security-chain": () =>
      [0, 1, 2, 3].flatMap((index) => [
        { at: index * 1100, run: () => emitPulses([attackSecurity(proxies("you")[index % proxies("you").length])]) },
        { at: index * 1100 + 600, run: () => emitPulses([securityHit()]) },
      ]),
    evolve: () => [
      {
        at: 0,
        run: () => {
          const target = proxies("you")[0];
          emitPulses([
            {
              key: nextKey("evolve"),
              kind: "evolve",
              color: sideColor("you"),
              side: "you",
              screenPoint: center(target),
              permanentId: idOf(target),
            },
          ]);
        },
      },
    ],
    arrival: () => [{ at: 0, run: () => land(proxies("you").slice(0, 1)) }],
    "arrival-burst": () => [{ at: 0, run: () => land(proxies("you").slice(0, 5)) }],
  };
  const summarize = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
    const roundTo = (value) => Math.round(value * 100) / 100;
    return {
      frames: sorted.length,
      medianMs: roundTo(pick(0.5)),
      p95Ms: roundTo(pick(0.95)),
      maxMs: roundTo(sorted.at(-1) ?? 0),
      totalMs: roundTo(sorted.reduce((sum, value) => sum + value, 0)),
      over8Ms: sorted.filter((value) => value > 8).length,
      over16Ms: sorted.filter((value) => value > 16.7).length,
    };
  };
  window.arenaEffectBench = {
    plan(name) {
      const steps = plans[name]();
      return steps.at(-1).at;
    },
    trigger(name) {
      for (const step of plans[name]()) {
        if (step.at === 0) {
          step.run();
        } else {
          bench.timers.push(setTimeout(step.run, step.at));
        }
      }
    },
    record() {
      bench.frames = [];
      bench.recording = true;
    },
    collect() {
      bench.recording = false;
      return summarize(bench.frames);
    },
    memory() {
      const renderer = probe.findArenaRenderer();
      return {
        geometries: renderer?.info.memory.geometries,
        textures: renderer?.info.memory.textures,
        programs: renderer?.info.programs?.length,
      };
    },
    freeze(time) {
      const state = readState();
      state.clock.autoStart = false;
      state.clock.running = false;
      state.clock.elapsedTime = time;
      state.invalidate();
    },
    setTime(time) {
      const state = readState();
      state.clock.elapsedTime = time;
      state.invalidate();
    },
  };
}

async function waitForRenderedFrames(page, count) {
  await page.evaluate(async (frames) => {
    const probe = window.arenaPerfProbe;
    const target = probe.renderedTicks + frames;
    const deadline = performance.now() + 4000;
    while (probe.renderedTicks < target && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

async function measureGc({ session, milliseconds }) {
  const events = [];
  const collect = (payload) => events.push(...payload.value);
  session.on("Tracing.dataCollected", collect);
  const complete = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
  await session.send("Tracing.start", {
    categories: "devtools.timeline,v8,disabled-by-default-v8.gc",
    transferMode: "ReportEvents",
  });
  await sleep(milliseconds);
  await session.send("Tracing.end");
  await complete;
  session.off("Tracing.dataCollected", collect);
  const summary = { MinorGC: { count: 0, totalMs: 0, maxMs: 0 }, MajorGC: { count: 0, totalMs: 0, maxMs: 0 } };
  for (const event of events) {
    const entry = summary[event.name];
    if (!entry || event.ph !== "X") {
      continue;
    }
    const duration = (event.dur ?? 0) / 1000;
    entry.count += 1;
    entry.totalMs = round(entry.totalMs + duration);
    entry.maxMs = round(Math.max(entry.maxMs, duration));
  }
  return summary;
}

async function readHeapAfterGc(session) {
  await session.send("HeapProfiler.collectGarbage");
  const heap = await session.send("Runtime.getHeapUsage");
  return round(heap.usedSize / 1048576, 2);
}

async function openEffectBench(page) {
  await page.goto(new URL("/dev/arena?scenario=crowded&board=arena3d", values.base).href);
  await waitForArena(page);
  await page.waitForFunction(
    () =>
      ["you", "opp"].every(
        (side) =>
          document.querySelectorAll(`.game-field [data-arena-3d-row="${side}"] .game-permanent[data-permanent-id]`)
            .length >= 3,
      ),
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(8000);
  await page.evaluate(installEffectBench);
}

function selectEffects() {
  if (values.effect === "all") {
    return BENCH_EFFECTS;
  }
  const names = values.effect.split(",");
  for (const name of names) {
    if (!BENCH_EFFECTS.includes(name)) {
      throw new Error(`--effect must be "all" or a list of ${BENCH_EFFECTS.join(", ")}`);
    }
  }
  return names;
}

function summarizeProfile(profile) {
  const pick = (pattern) =>
    profile.topInclusiveFiles
      .filter((entry) => pattern.test(entry.key))
      .map(({ key, msPerRenderedFrame }) => ({
        key,
        msPerRenderedFrame,
      }));
  return {
    renderedFrames: profile.renderedFrames,
    sceneFiles: pick(/^(Arena|arena|useArena|three|@react-three|createArena|collectArena|applyArena)/),
    topSelfFunctions: profile.topSelfFunctions.slice(0, 8),
  };
}

async function measureEffect({ page, session, name }) {
  const lastStepMs = await page.evaluate((effect) => window.arenaEffectBench.plan(effect), name);
  const span = lastStepMs + 2200;
  const trigger = () => page.evaluate((effect) => window.arenaEffectBench.trigger(effect), name);
  const memoryBefore = await page.evaluate(() => window.arenaEffectBench.memory());
  const heapBefore = await readHeapAfterGc(session);
  await page.evaluate(() => window.arenaEffectBench.record());
  const [cold, coldProfile, coldGc] = await Promise.all([
    measureTiming({ page, session, milliseconds: span, action: trigger }),
    measureProfile({ page, session, milliseconds: span }),
    measureGc({ session, milliseconds: span }),
  ]);
  const coldFrames = await page.evaluate(() => window.arenaEffectBench.collect());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.arenaEffectBench.record());
  const [warm, warmGc] = await Promise.all([
    measureTiming({ page, session, milliseconds: span, action: trigger }),
    measureGc({ session, milliseconds: span }),
  ]);
  const warmFrames = await page.evaluate(() => window.arenaEffectBench.collect());
  await page.waitForTimeout(500);
  const peakDelay = name === "security-chain" ? lastStepMs + 250 : 250;
  await trigger();
  await page.waitForTimeout(peakDelay);
  const peak = (await collectScenes(page)).find((scene) => scene.canvas && !scene.canvas.contextLost);
  await page.waitForTimeout(span);
  const repeat = Number(values.repeat);
  const memoryAfterFirst = await page.evaluate(() => window.arenaEffectBench.memory());
  for (let cycle = 0; cycle < repeat; cycle += 1) {
    await trigger();
    await page.waitForTimeout(lastStepMs + 1700);
  }
  await page.waitForTimeout(1500);
  const heapAfter = await readHeapAfterGc(session);
  const memoryAfter = await page.evaluate(() => window.arenaEffectBench.memory());
  return {
    name,
    cold: {
      frames: coldFrames,
      programsCompiled: cold.programsCompiled,
      rafIntervals: cold.rafIntervals,
      longTasks: cold.longTasks,
      scriptMsPerSecond: cold.scriptMsPerSecond,
      gc: coldGc,
      profile: summarizeProfile(coldProfile),
    },
    warm: {
      frames: warmFrames,
      programsCompiled: warm.programsCompiled,
      rafIntervals: warm.rafIntervals,
      longTasks: warm.longTasks,
      scriptMsPerSecond: warm.scriptMsPerSecond,
      gc: warmGc,
    },
    peak: peak
      ? {
          calls: peak.render?.calls,
          triangles: peak.render?.triangles,
          visibleMeshes: peak.visibleMeshes,
          transparentCoverageScreens: peak.transparentCoverageScreens,
          overdraw: peak.overdraw.slice(0, 6),
        }
      : undefined,
    memory: {
      before: memoryBefore,
      afterFirstCycles: memoryAfterFirst,
      afterRepeats: memoryAfter,
      repeats: repeat,
      heapMegabytesBefore: heapBefore,
      heapMegabytesAfter: heapAfter,
    },
  };
}

async function captureEffects({ page, effects }) {
  await mkdir(values.capture, { recursive: true });
  const captures = [];
  for (const [index, name] of effects.entries()) {
    const base = 1000 + index * 100;
    await page.evaluate((time) => window.arenaEffectBench.freeze(time), base);
    await waitForRenderedFrames(page, 3);
    const lastStepMs = await page.evaluate((effect) => window.arenaEffectBench.plan(effect), name);
    await page.evaluate((effect) => window.arenaEffectBench.trigger(effect), name);
    await waitForRenderedFrames(page, 4);
    await page.waitForTimeout(lastStepMs + 400);
    for (const offset of CAPTURE_OFFSETS) {
      await page.evaluate((time) => window.arenaEffectBench.setTime(time), base + offset);
      await waitForRenderedFrames(page, 3);
      const path = `${values.capture}/${name}-${offset.toFixed(2)}.png`;
      await page.screenshot({ path });
      captures.push(path);
    }
  }
  return captures;
}

async function runEffects({ page, session, report }) {
  const effects = selectEffects();
  if (values.capture) {
    await openEffectBench(page);
    report.captures = await captureEffects({ page, effects });
    return;
  }
  report.effects = [];
  for (const name of effects) {
    await openEffectBench(page);
    report.effects.push(await measureEffect({ page, session, name }));
  }
}

async function installFrameBracket() {
  if (window.arenaFrameBracket) {
    return;
  }
  const probe = window.arenaPerfProbe;
  const sceneSource = await fetch("/src/game/arena3d/field/Arena3dScene.tsx").then((response) => response.text());
  const fiberUrl = sceneSource.match(/from "([^"]*@react-three_fiber\.js[^"]*)"/)?.[1];
  const threeUrl = sceneSource.match(/from "([^"]*\/three\.js[^"]*)"/)?.[1];
  const fiberModule = await import(fiberUrl);
  const threeModule = await import(threeUrl);
  const bracket = { frames: [], recording: false, targetResizes: 0, targetDisposals: 0 };
  let frameStart = 0;
  let lastFrame = -1;
  fiberModule.addEffect(() => {
    frameStart = performance.now();
  });
  fiberModule.addAfterEffect(() => {
    const frame = probe.findArenaRenderer()?.info.render.frame ?? -1;
    if (frame === lastFrame) {
      return;
    }
    lastFrame = frame;
    if (bracket.recording) {
      bracket.frames.push(performance.now() - frameStart);
    }
  });
  const target = threeModule.WebGLRenderTarget.prototype;
  const setSize = target.setSize;
  target.setSize = function countedSetSize(...args) {
    if (this.width !== args[0] || this.height !== args[1]) {
      bracket.targetResizes += 1;
    }
    return setSize.apply(this, args);
  };
  const dispose = target.dispose;
  target.dispose = function countedDispose(...args) {
    bracket.targetDisposals += 1;
    return dispose.apply(this, args);
  };
  bracket.record = () => {
    bracket.frames = [];
    bracket.recording = true;
  };
  bracket.collect = () => {
    bracket.recording = false;
    const sorted = [...bracket.frames].sort((a, b) => a - b);
    const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
    const roundTo = (value) => Math.round(value * 1000) / 1000;
    return {
      frames: sorted.length,
      medianMs: roundTo(pick(0.5)),
      p95Ms: roundTo(pick(0.95)),
      maxMs: roundTo(sorted.at(-1) ?? 0),
    };
  };
  window.arenaFrameBracket = bracket;
}

function installEmptyFrameBracket() {
  window.arenaFrameBracket = {
    record() {},
    collect() {
      return undefined;
    },
  };
}

async function measureWithBracket({ page, session, milliseconds, action }) {
  await page.evaluate(() => window.arenaFrameBracket.record());
  const timing = await measureTiming({ page, session, milliseconds, action });
  const sceneScriptPerFrame = await page.evaluate(() => window.arenaFrameBracket.collect());
  return { ...timing, sceneScriptPerFrame };
}

async function setArenaPaused(page, paused) {
  await page.evaluate(async (pause) => {
    const module = await import("/src/game/overlay/viewer/cardZoomPresence.ts");
    if (pause && !window.arenaPerfPause) {
      window.arenaPerfPause = module.cardZoomPresence.register();
    }
    if (!pause && window.arenaPerfPause) {
      window.arenaPerfPause();
      window.arenaPerfPause = undefined;
    }
  }, paused);
}

async function openSteadyBoard({ page, arena }) {
  await page.goto(new URL(`/dev/arena?scenario=crowded&board=${arena ? "arena3d" : "classic"}`, values.base).href);
  if (!arena) {
    await page.waitForSelector(".game-board", { timeout: 60000 });
    await page.waitForTimeout(8000);
    await page.evaluate(installEmptyFrameBracket);
    return;
  }
  await waitForArena(page);
  await page.waitForFunction(
    () => document.querySelectorAll(".game-field [data-arena-3d-row] .game-permanent[data-permanent-id]").length >= 6,
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(8000);
  await page.evaluate(installFrameBracket);
}

async function runDecision({ page, session, report, arena }) {
  await openSteadyBoard({ page, arena });
  report.tier = arena ? await readTier(page) : undefined;
  report.idle = await measureWithBracket({ page, session, milliseconds: 5000 });
  await openDemoTool(page, "Select cards from hand and trash");
  await page.waitForTimeout(1500);
  report.linkedCues = await page.evaluate(() => document.querySelectorAll(".game-permanent--effect-linked").length);
  report.rounds = [];
  for (let pass = 0; pass < 3; pass += 1) {
    for (const paused of arena ? [false, true] : [false]) {
      await setArenaPaused(page, paused);
      await page.waitForTimeout(600);
      const timing = await measureWithBracket({ page, session, milliseconds: seconds * 1000 });
      report.rounds.push({
        round: pass,
        arenaPaused: paused,
        renderedFps: timing.renderedFramesPerSecond,
        rafFps: timing.rafIntervals.fps,
        taskMsPerSecond: timing.taskMsPerSecond,
        scriptMsPerSecond: timing.scriptMsPerSecond,
        recalcStyleMsPerSecond: timing.recalcStyleMsPerSecond,
        longTasks: timing.longTasks.count,
        sceneScriptMedianMs: timing.sceneScriptPerFrame?.medianMs,
      });
    }
  }
  await setArenaPaused(page, false);
}

async function traceArenaFrames({ session, milliseconds, action }) {
  const events = [];
  const collect = (payload) => events.push(...payload.value);
  session.on("Tracing.dataCollected", collect);
  const complete = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
  await session.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });
  await action();
  await sleep(milliseconds);
  await session.send("Tracing.end");
  await complete;
  session.off("Tracing.dataCollected", collect);
  const frames = events.filter((event) => event.name === "FireAnimationFrame" && event.ph === "X");
  const isInFrame = (event) => frames.some((frame) => event.ts >= frame.ts && event.ts <= frame.ts + (frame.dur ?? 0));
  const styles = events.filter((event) => event.name === "UpdateLayoutTree" && event.ph === "X");
  const layouts = events.filter((event) => event.name === "Layout" && event.ph === "X");
  const sum = (list) =>
    round(
      list.reduce((total, event) => total + (event.dur ?? 0) / 1000, 0),
      3,
    );
  const max = (list) => round(Math.max(0, ...list.map((event) => (event.dur ?? 0) / 1000)), 3);
  return {
    styleTotalMs: sum(styles),
    styleMaxMs: max(styles),
    styleInsideFrameMs: sum(styles.filter(isInFrame)),
    layoutTotalMs: sum(layouts),
    layoutInsideFrameMs: sum(layouts.filter(isInFrame)),
    maxAnimationFrameMs: max(frames),
  };
}

async function runLanding({ page, session, report }) {
  await openEffectBench(page);
  await page.evaluate(installFrameBracket);
  report.rounds = [];
  for (let pass = 0; pass < 4; pass += 1) {
    for (const paused of [false, true]) {
      await setArenaPaused(page, paused);
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.arenaFrameBracket.record());
      const trace = await traceArenaFrames({
        session,
        milliseconds: 1500,
        action: () =>
          page.evaluate(() => {
            const proxy = document.querySelector(
              '.game-field [data-arena-3d-row="you"] .game-permanent[data-permanent-id]',
            );
            const marker = document.createElement("div");
            marker.className = "game-card-landing";
            proxy.append(marker);
            setTimeout(() => marker.remove(), 900);
          }),
      });
      const frames = await page.evaluate(() => window.arenaFrameBracket.collect());
      report.rounds.push({
        round: pass,
        arenaPaused: paused,
        ...trace,
        sceneMaxMs: frames.maxMs,
        sceneMedianMs: frames.medianMs,
        sceneFrames: frames.frames,
      });
    }
  }
  await setArenaPaused(page, false);
}

async function readAlignment(page) {
  return page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    const renderer = probe.findArenaRenderer();
    const scene = probe.liveScenes().find((candidate) => candidate.__r3f?.root?.getState?.().gl === renderer);
    const camera = scene?.__r3f?.root?.getState?.().camera;
    const proxies = {};
    for (const element of document.querySelectorAll(
      ".game-field [data-arena-3d-row] .game-permanent[data-permanent-id], .arena-3d-field .game-pile, .arena-3d-field .game-security-shield",
    )) {
      const rect = element.getBoundingClientRect();
      const slot = element.closest("[class*='game-utility-slot--']");
      const slotName = slot
        ? [...slot.classList].find((name) => name.startsWith("game-utility-slot--"))
        : element.className;
      const key = element.getAttribute("data-permanent-id") ?? `${element.className.split(" ")[0]}@${slotName}`;
      proxies[key] = [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 10) / 10);
    }
    camera?.updateMatrixWorld();
    return {
      layout: document.querySelector(".arena-3d-field")?.getAttribute("data-arena-layout"),
      drawingBuffer: renderer ? [renderer.domElement.width, renderer.domElement.height] : undefined,
      cameraPosition: camera ? camera.position.toArray().map((value) => Math.round(value * 1000) / 1000) : undefined,
      cameraProjection: camera
        ? Array.from(camera.projectionMatrix.elements).map((value) => Math.round(value * 1000) / 1000)
        : undefined,
      proxies,
    };
  });
}

function compareAlignment(after, fresh) {
  let maxDelta = 0;
  let worst;
  let missing = 0;
  for (const [key, rect] of Object.entries(fresh.proxies)) {
    const other = after.proxies[key];
    if (!other) {
      missing += 1;
      continue;
    }
    const delta = Math.max(...rect.map((value, index) => Math.abs(value - other[index])));
    if (delta > maxDelta) {
      maxDelta = delta;
      worst = key;
    }
  }
  const maxDifference = (a = [0], b = []) =>
    Math.max(...a.map((value, index) => Math.abs(value - (b[index] ?? value))));
  return {
    layoutMatch: after.layout === fresh.layout,
    layout: after.layout,
    drawingBufferMatch: JSON.stringify(after.drawingBuffer) === JSON.stringify(fresh.drawingBuffer),
    drawingBuffer: after.drawingBuffer,
    proxies: Object.keys(fresh.proxies).length,
    missing,
    maxProxyDeltaPx: round(maxDelta, 1),
    worst,
    cameraProjectionDelta: round(maxDifference(fresh.cameraProjection, after.cameraProjection), 3),
    cameraPositionDelta: round(maxDifference(fresh.cameraPosition, after.cameraPosition), 3),
  };
}

async function installResizeCounters(page) {
  await page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    const renderer = probe.findArenaRenderer();
    probe.setSizeCalls = 0;
    probe.bufferSizes = new Set();
    if (renderer && !renderer.__countedSetSize) {
      const setSize = renderer.setSize.bind(renderer);
      renderer.setSize = (...args) => {
        probe.setSizeCalls += 1;
        setSize(...args);
        probe.bufferSizes.add(`${renderer.domElement.width}x${renderer.domElement.height}`);
      };
      renderer.__countedSetSize = true;
    }
    window.arenaFrameBracket.targetResizes = 0;
    window.arenaFrameBracket.targetDisposals = 0;
  });
}

async function readResizeCounters(page) {
  return page.evaluate(() => {
    const probe = window.arenaPerfProbe;
    return {
      rendererSetSizeCalls: probe.setSizeCalls,
      distinctDrawingBuffers: [...probe.bufferSizes],
      renderTargetResizes: window.arenaFrameBracket.targetResizes,
      renderTargetDisposals: window.arenaFrameBracket.targetDisposals,
      createdRenderers: probe.renderers.length,
      liveContexts: probe.liveRenderers().filter((candidate) => !candidate.getContext().isContextLost()).length,
    };
  });
}

async function readFreshAlignment({ context, probeArgs, viewport }) {
  const freshPage = await context.newPage();
  await freshPage.addInitScript(installProbes, probeArgs);
  await freshPage.setViewportSize(viewport);
  await openSteadyBoard({ page: freshPage, arena: true });
  const alignment = await readAlignment(freshPage);
  await freshPage.close();
  return alignment;
}

async function runRotate({ page, session, report, context, probeArgs }) {
  const portrait = { width: 390, height: 844 };
  const landscape = { width: 844, height: 390 };
  await page.setViewportSize(portrait);
  await openSteadyBoard({ page, arena: true });
  report.tier = await readTier(page);
  report.storms = [];
  for (const [name, gapMs, rotations] of [
    ["settled rotations (700 ms apart)", 700, 6],
    ["fast rotations (60 ms apart)", 60, 12],
  ]) {
    await installResizeCounters(page);
    const timing = await measureTiming({
      page,
      session,
      milliseconds: rotations * gapMs + 2500,
      action: async () => {
        for (let index = 0; index < rotations; index += 1) {
          await page.setViewportSize(index % 2 === 0 ? landscape : portrait);
          await page.waitForTimeout(gapMs);
        }
        await page.setViewportSize(portrait);
      },
    });
    await page.waitForTimeout(1500);
    const counters = await readResizeCounters(page);
    report.storms.push({
      name,
      rotations,
      ...counters,
      setSizeCallsPerRotation: round(counters.rendererSetSizeCalls / rotations, 2),
      longTasks: timing.longTasks,
      taskMsPerSecond: timing.taskMsPerSecond,
    });
  }
  const afterPortrait = await readAlignment(page);
  await page.setViewportSize(landscape);
  await page.waitForTimeout(2500);
  const afterLandscape = await readAlignment(page);
  report.alignment = {
    portraitAfterStorms: compareAlignment(
      afterPortrait,
      await readFreshAlignment({ context, probeArgs, viewport: portrait }),
    ),
    landscapeAfterRotation: compareAlignment(
      afterLandscape,
      await readFreshAlignment({ context, probeArgs, viewport: landscape }),
    ),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: GL_ARGS[values.gl] });
  const report = { options: values, consoleErrors: [], startedAt: new Date().toISOString() };
  try {
    const context = await browser.newContext({
      ...DEVICES[values.device],
      locale: "en-US",
      colorScheme: values.color,
      reducedMotion: values.reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const arena = values.scenario !== "classic" && values.board !== "classic";
    const probeArgs = {
      boardStyle: arena ? "arena3d" : "classic",
      quality: values.quality,
      gpuName: values["gpu-name"],
      cores: values.cores ? Number(values.cores) : undefined,
      memory: values.memory ? Number(values.memory) : undefined,
      seed: values.seed ? Number(values.seed) : undefined,
    };
    await page.addInitScript(installProbes, probeArgs);
    page.on("console", (message) => {
      const text = message.text();
      if ((message.type() === "error" || text.includes("NaN")) && !text.includes("GPU stall")) {
        report.consoleErrors.push(text.slice(0, 2000));
      }
    });
    page.on("pageerror", (error) => report.consoleErrors.push(`pageerror: ${error.message}`));
    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    if (Number(values.throttle) > 1) {
      await session.send("Emulation.setCPUThrottlingRate", { rate: Number(values.throttle) });
    }
    report.signals = await page.evaluate(() => ({
      coarsePointer: matchMedia("(pointer: coarse)").matches,
      devicePixelRatio,
      screen: [screen.width, screen.height],
    }));
    if (values.scenario === "decision") {
      await runDecision({ page, session, report, arena });
    } else if (values.scenario === "landing") {
      await runLanding({ page, session, report });
    } else if (values.scenario === "rotate") {
      await runRotate({ page, session, report, context, probeArgs });
    } else if (values.scenario === "mobile") {
      await runMobile({ page, session, report });
    } else if (values.scenario === "effects") {
      await runEffects({ page, session, report });
    } else if (values.scenario === "crowded" || values.scenario === "classic") {
      await runDemo({ page, session, report, arena });
    } else if (values.scenario === "bot") {
      await runBot({ page, session, report });
    } else if (values.scenario === "viewer") {
      await runViewer({ page, session, report });
    } else {
      await runMount({ page, session, report });
    }
    report.renderer = await page.evaluate(() => {
      const probeContext = document.createElement("canvas").getContext("webgl2");
      const debug = probeContext?.getExtension("WEBGL_debug_renderer_info");
      return debug ? probeContext.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    report.createdRenderers = await page.evaluate(() => window.arenaPerfProbe.renderers.length);
    report.qualityTier = await page.evaluate(() => {
      const canvas = document.querySelector(".arena-3d-scene canvas");
      return canvas ? { width: canvas.width, clientWidth: canvas.clientWidth } : undefined;
    });
  } finally {
    await browser.close();
  }
  const json = JSON.stringify(report, null, 2);
  if (values.output) {
    await mkdir(new URL(".", `file://${values.output}`), { recursive: true });
    await writeFile(values.output, json);
  }
  process.stdout.write(`${json}\n`);
}

await main();
