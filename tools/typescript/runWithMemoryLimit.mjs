import { runBoundedTsc } from "./runBoundedTsc.mjs";

export async function runWithMemoryLimit({
  command,
  args,
  memoryLimitMiB,
  env = process.env,
  stderr = process.stderr,
}) {
  if (!Number.isInteger(memoryLimitMiB) || memoryLimitMiB < 32) {
    throw new Error("The compiler RSS limit must be an integer of at least 32 MiB.");
  }
  return runBoundedTsc({
    command,
    args,
    maxRssMiB: memoryLimitMiB,
    heapMiB: Math.min(512, Math.floor(memoryLimitMiB / 2)),
    env,
    log: (message) => stderr.write(`${message}\n`),
  });
}
