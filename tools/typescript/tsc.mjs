import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runBoundedTsc } from "./runBoundedTsc.mjs";

const profiles = {
  api: { maxRssMiB: 1536, heapMiB: 768 },
  web: { maxRssMiB: 1536, heapMiB: 512 },
  small: { maxRssMiB: 768, heapMiB: 384 },
};

try {
  const [profile, ...args] = process.argv.slice(2);
  const limits = profiles[profile];
  if (!limits) {
    throw new Error("Choose compiler memory profile api, web or small");
  }
  const require = createRequire(join(process.cwd(), "package.json"));
  const compiler = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
  process.exitCode = await runBoundedTsc({
    command: process.execPath,
    args: [compiler, ...args],
    cwd: process.cwd(),
    ...limits,
  });
} catch (error) {
  console.error(`[tsc] ${error.message}`);
  process.exitCode = 1;
}
