import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MatchReplay } from "@aegis/shared";
import { useTranslation } from "../i18n";
import { Button } from "../design/primitives";
import { readReplay, ReplayFileError, type ReplayFileErrorCode } from "./files";
import { ReplayPlayer } from "./ReplayPlayer";
import "./replays.css";

class ReplayRenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Full-screen playback. A replay the player cannot render falls back to a message instead of a blank page. */
type ReplayViewerProps = { replay: MatchReplay; onClose: () => void; initialIndex?: number; shareId?: string };

export function ReplayViewer({ replay, onClose, initialIndex, shareId }: ReplayViewerProps) {
  const { t } = useTranslation();
  return (
    <ReplayRenderBoundary
      key={replay.id}
      fallback={
        <div className="replay-import">
          <p role="alert">{t("replay.error.invalid")}</p>
          <Button onClick={onClose}>{t("replay.openAnother")}</Button>
        </div>
      }
    >
      <ReplayPlayer replay={replay} onClose={onClose} initialIndex={initialIndex} shareId={shareId} />
    </ReplayRenderBoundary>
  );
}

/** Reads a local or downloaded replay file; only the latest request wins when several overlap. */
export function useReplayFile(onViewingChange?: (viewing: boolean) => void) {
  const [replay, setReplay] = useState<MatchReplay>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ReplayFileErrorCode>();
  const pending = useRef(0);
  useEffect(() => {
    onViewingChange?.(replay !== undefined);
    return () => onViewingChange?.(false);
  }, [replay, onViewingChange]);
  const open = useCallback(async (file: Blob | undefined) => {
    if (!file) return;
    const generation = ++pending.current;
    setLoading(true);
    setError(undefined);
    try {
      const parsed = await readReplay(file);
      if (pending.current === generation) setReplay(parsed);
    } catch (cause) {
      if (pending.current === generation) setError(cause instanceof ReplayFileError ? cause.code : "invalid");
    } finally {
      if (pending.current === generation) setLoading(false);
    }
  }, []);
  const close = useCallback(() => {
    setReplay(undefined);
    setError(undefined);
  }, []);
  return { replay, setReplay, loading, error, open, close };
}
