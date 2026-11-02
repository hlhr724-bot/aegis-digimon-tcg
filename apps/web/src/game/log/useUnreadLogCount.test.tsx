import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import type { LogEntry, LogKind } from "@/game/log/LogEntry";
import { useUnreadLogCount } from "@/game/log/useUnreadLogCount";

type EntryParams = { index: number; kind: LogKind };

function buildEntry({ index, kind }: EntryParams): LogEntry {
  return { id: `log-${index}`, text: `line ${index}`, kind, turnCount: 1, turnSeat: 0, phase: Phase.Main };
}

function buildEntries(kinds: readonly LogKind[]): LogEntry[] {
  return kinds.map((kind, index) => buildEntry({ index, kind }));
}

type HookProps = { entries: readonly LogEntry[]; open: boolean };

function renderUnread(initialProps: HookProps) {
  return renderHook((props: HookProps) => useUnreadLogCount(props), { initialProps });
}

afterEach(cleanup);

describe("unread match log count", () => {
  it("counts opponent and system entries that arrive while the log is closed", () => {
    const hook = renderUnread({ entries: [], open: false });
    hook.rerender({ entries: buildEntries(["opp", "sys", "opp"]), open: false });

    expect(hook.result.current).toBe(3);
  });

  it("does not count the viewer's own actions", () => {
    const hook = renderUnread({ entries: [], open: false });
    hook.rerender({ entries: buildEntries(["you", "opp", "you"]), open: false });

    expect(hook.result.current).toBe(1);
  });

  it("does not count the history that was already there when the board mounted", () => {
    const hook = renderUnread({ entries: buildEntries(["opp", "opp"]), open: false });

    expect(hook.result.current).toBe(0);
  });

  it("clears when the log opens and stays clear for entries read while it is open", () => {
    const hook = renderUnread({ entries: [], open: false });
    hook.rerender({ entries: buildEntries(["opp"]), open: false });
    hook.rerender({ entries: buildEntries(["opp"]), open: true });

    expect(hook.result.current).toBe(0);

    hook.rerender({ entries: buildEntries(["opp", "opp"]), open: true });
    hook.rerender({ entries: buildEntries(["opp", "opp"]), open: false });

    expect(hook.result.current).toBe(0);

    hook.rerender({ entries: buildEntries(["opp", "opp", "sys"]), open: false });

    expect(hook.result.current).toBe(1);
  });

  it("counts only entries added after a rollback shortens the log", () => {
    const hook = renderUnread({ entries: buildEntries(["opp", "opp", "opp", "opp"]), open: false });
    hook.rerender({ entries: buildEntries(["opp", "opp"]), open: false });

    expect(hook.result.current).toBe(0);

    hook.rerender({ entries: buildEntries(["opp", "opp", "opp"]), open: false });

    expect(hook.result.current).toBe(1);
  });
});
