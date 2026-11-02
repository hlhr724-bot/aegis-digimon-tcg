import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runWithMemoryLimit } from "./runWithMemoryLimit.mjs";

const require = createRequire(import.meta.url);
const compiler = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
const [limit, ...args] = process.argv.slice(2);
process.exitCode = await runWithMemoryLimit({
  command: process.execPath,
  args: [compiler, ...args],
  memoryLimitMiB: Number(limit),
});
