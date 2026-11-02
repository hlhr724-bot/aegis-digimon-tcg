import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args[0] !== "open" || !args[1] || args.slice(2).some((arg) => arg !== "--no-open" && arg !== "--lab")) {
  console.error("Usage: pnpm scenario open <behavior-name|fixture.ts> [--no-open] [--lab]");
  process.exit(1);
}
if (Number(process.versions.node.split(".")[0]) !== 26) {
  console.error("Use Node 26, as specified in package.json, to run local scenarios.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Local scenarios are unavailable in production.");
  process.exit(1);
}

// Rebuild the real room runtime: fixture runs must not silently use stale API code.
for (const command of [
  ["--filter", "@aegis/shared", "build"],
  [
    "--filter",
    "@aegis/api",
    "exec",
    "node",
    "../../tools/typescript/runTsc.mjs",
    "1536",
    "-p",
    "tsconfig.dev.json",
    "--noCheck",
    "--singleThreaded",
  ],
  [
    "--filter",
    "@aegis/api",
    "exec",
    "tsx",
    "--tsconfig",
    "../web/e2e/tsconfig.json",
    "../web/e2e/scenario-cli.ts",
    ...args,
  ],
]) {
  const grouped = process.platform !== "win32";
  const child = spawn("pnpm", command, {
    cwd: root,
    stdio: "inherit",
    detached: grouped,
    env: { ...process.env, GOMEMLIMIT: "512MiB", GOGC: "50" },
  });
  const forward = (signal) => {
    if (!child.pid || child.exitCode !== null) return;
    try {
      if (grouped) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const interrupt = () => forward("SIGINT");
  const terminate = () => forward("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  let status;
  try {
    status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(code ?? (signal ? 130 : 1)));
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
  if (status !== 0) process.exit(status);
}
