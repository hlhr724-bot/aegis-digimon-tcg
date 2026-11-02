import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { constants } from "node:os";

const executeFile = promisify(execFile);
const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };

async function getProcesses() {
  if (process.platform === "win32") {
    const { stdout } = await executeFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress",
      ],
      { timeout: 2000, maxBuffer: 4 * 1024 ** 2 },
    );
    const entries = JSON.parse(stdout);
    return [entries].flat().map((entry) => {
      const pid = Number(entry.ProcessId);
      const parent = Number(entry.ParentProcessId);
      const rss = Number(entry.WorkingSetSize);
      if (![pid, parent, rss].every(Number.isFinite)) {
        throw new Error("Unable to measure compiler memory");
      }
      return { pid, parent, rss };
    });
  }
  const { stdout } = await executeFile("ps", ["-axo", "pid=,ppid=,rss="], { timeout: 2000, maxBuffer: 4 * 1024 ** 2 });
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [pid, parent, rss] = line.trim().split(/\s+/).map(Number);
      if (![pid, parent, rss].every(Number.isFinite)) {
        throw new Error("Unable to measure compiler memory");
      }
      return { pid, parent, rss: rss * 1024 };
    });
}

function getTreeRss({ entries, pid }) {
  const ownPids = new Set([pid]);
  let previousSize = 0;
  while (previousSize !== ownPids.size) {
    previousSize = ownPids.size;
    for (const entry of entries) {
      if (ownPids.has(entry.parent)) {
        ownPids.add(entry.pid);
      }
    }
  }
  return entries.reduce((sum, entry) => sum + (ownPids.has(entry.pid) ? entry.rss : 0), 0);
}

export async function runBoundedTsc({
  command,
  args,
  cwd,
  maxRssMiB,
  heapMiB,
  env = process.env,
  log = console.error,
}) {
  if (
    !Number.isInteger(maxRssMiB) ||
    maxRssMiB < 1 ||
    maxRssMiB > 2048 ||
    !Number.isInteger(heapMiB) ||
    heapMiB < 1 ||
    heapMiB >= maxRssMiB
  ) {
    throw new Error("Compiler RSS limit must be 1–2048 MiB and exceed its positive integer heap target");
  }
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    stdio: "inherit",
    env: { ...env, GOMEMLIMIT: `${heapMiB}MiB`, GOMAXPROCS: "2" },
  });
  let peakBytes = 0;
  let exitOverride;
  let monitorTimer;
  let killTimer;
  let finished = false;
  let stopping = false;

  function sendSignal(signal) {
    if (!child.pid) {
      return;
    }
    if (process.platform === "win32") {
      execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => {});
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") {
        log(`[tsc] Unable to stop compiler: ${error.message}`);
      }
    }
  }

  function stopCompiler({ code, reason, signal = "SIGTERM" }) {
    if (finished || stopping) {
      return;
    }
    stopping = true;
    exitOverride = code;
    if (reason) {
      log(`[tsc] ${reason}`);
    }
    sendSignal(signal);
    killTimer = setTimeout(() => sendSignal("SIGKILL"), 1000);
  }

  async function monitorCompiler() {
    try {
      const entries = await getProcesses();
      if (finished || stopping) {
        return;
      }
      const rss = getTreeRss({ entries, pid: child.pid });
      peakBytes = Math.max(peakBytes, rss);
      if (rss > maxRssMiB * 1024 ** 2) {
        stopCompiler({
          code: 137,
          reason: `RSS ${Math.ceil(rss / 1024 ** 2)} MiB exceeded ${maxRssMiB} MiB; stopping compiler`,
        });
        return;
      }
      monitorTimer = setTimeout(monitorCompiler, 250);
    } catch (error) {
      stopCompiler({ code: 1, reason: `Memory monitoring failed: ${error.message}` });
    }
  }

  const handlers = Object.fromEntries(
    Object.entries(signalExitCodes).map(([signal, code]) => [signal, () => stopCompiler({ code, signal })]),
  );
  for (const [signal, handler] of Object.entries(handlers)) {
    process.on(signal, handler);
  }
  log(`[tsc] RSS limit ${maxRssMiB} MiB, Go heap target ${heapMiB} MiB, GOMAXPROCS=2`);
  void monitorCompiler();
  return new Promise((resolve, reject) => {
    function finish() {
      finished = true;
      clearTimeout(monitorTimer);
      clearTimeout(killTimer);
      for (const [signal, handler] of Object.entries(handlers)) {
        process.off(signal, handler);
      }
      log(`[tsc] Peak sampled RSS ${Math.ceil(peakBytes / 1024 ** 2)} MiB / ${maxRssMiB} MiB`);
    }
    child.once("error", (error) => {
      finish();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (stopping && process.platform !== "win32") {
        sendSignal("SIGKILL");
      }
      finish();
      resolve(exitOverride ?? code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 1));
    });
  });
}
