type Params = {
  root: HTMLElement;
  isOwnStyleWrite: (target: Node, previousStyle: string | null) => boolean;
  isLayoutTarget: (target: Node) => boolean;
};

export type ArenaDomWatch = {
  consumeChanges: () => boolean;
  consumeLayoutChanges: () => boolean;
  disconnect: () => void;
};

const WATCHED_ATTRIBUTES = [
  "class",
  "style",
  "data-attackable",
  "data-card-back",
  "data-drag-intent",
  "data-permanent-id",
  "data-selected",
  "data-source-permanent-id",
  "data-state",
  "height",
  "width",
  "x",
  "y",
];

export function createArenaDomWatch({ root, isOwnStyleWrite, isLayoutTarget }: Params): ArenaDomWatch {
  let changed = true;
  let layoutChanged = true;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (changed && layoutChanged) {
        return;
      }
      const ownWrite =
        record.type === "attributes" &&
        record.attributeName === "style" &&
        isOwnStyleWrite(record.target, record.oldValue);
      if (ownWrite) {
        continue;
      }
      changed = true;
      layoutChanged ||= isLayoutTarget(record.target);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });
  return {
    consumeChanges() {
      const value = changed;
      changed = false;
      return value;
    },
    consumeLayoutChanges() {
      const value = layoutChanged;
      layoutChanged = false;
      return value;
    },
    disconnect() {
      observer.disconnect();
    },
  };
}
