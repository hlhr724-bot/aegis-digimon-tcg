export function scheduleIdleTask(task: () => void, timeoutMs: number): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: timeoutMs });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 0);
  return () => clearTimeout(handle);
}
