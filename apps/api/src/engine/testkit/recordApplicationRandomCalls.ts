import { fileURLToPath } from "node:url";
import { vi } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const helperFile = fileURLToPath(import.meta.url);

function isApplicationFrame(frame: string): boolean {
  return frame.includes(workspaceRoot) && !frame.includes("/node_modules/") && !frame.includes(helperFile);
}

export function recordApplicationRandomCalls(): { stacks: string[]; restore: () => void } {
  const ambientRandom = Math.random;
  const stacks: string[] = [];
  const random = vi.spyOn(Math, "random").mockImplementation(() => {
    const stack = new Error().stack ?? "";
    if (stack.split("\n").slice(1).some(isApplicationFrame)) stacks.push(stack);
    return ambientRandom();
  });
  return { stacks, restore: () => random.mockRestore() };
}
