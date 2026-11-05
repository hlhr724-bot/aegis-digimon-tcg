export type OrderedDeferral = (task: () => void) => void;

export function createOrderedDeferral(): OrderedDeferral {
  const pending: (() => void)[] = [];
  let scheduled = false;
  return (task) => {
    pending.push(task);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      for (const next of pending.splice(0)) next();
    }, 0);
  };
}
