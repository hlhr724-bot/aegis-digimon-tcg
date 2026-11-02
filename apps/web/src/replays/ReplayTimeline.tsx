import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ShieldMinus } from "lucide-react";
import type { MatchReplay } from "@aegis/shared/replays";
import type { Seat } from "@aegis/shared/schema/enums";
import { useTranslation } from "@/i18n/useTranslation";
import { buildReplayTimelineEvents } from "@/replays/buildReplayTimelineEvents";
import type { ReplayTimelineEvent } from "@/replays/ReplayTimelineEvent";
import { ReplayTimelineEventKind } from "@/replays/ReplayTimelineEventKind";

type Props = {
  replay: MatchReplay;
  logLines: readonly (string | undefined)[];
  index: number;
  onSeek: (index: number) => void;
  onJump: (index: number) => void;
};
type Segment = { event: ReplayTimelineEvent; start: number; end: number };
type Group = { position: number; events: ReplayTimelineEvent[] };
type GroupParams = { events: ReplayTimelineEvent[]; last: number; width: number };
type SegmentParams = { events: ReplayTimelineEvent[]; last: number };

const seats = [0, 1] as const satisfies readonly Seat[];

function buildSegments({ events, last }: SegmentParams): Segment[] {
  const turns = events.filter((event) => event.kind === ReplayTimelineEventKind.TURN.value);
  return turns.map((event, position) => ({
    event,
    start: event.index,
    end: turns[position + 1]?.index ?? last,
  }));
}

function groupNearbyEvents({ events, last, width }: GroupParams): Group[] {
  const groups: Group[] = [];
  for (const event of events) {
    const position = event.index / last;
    const previous = groups.at(-1);
    if (previous && (position - previous.position) * width < 24) {
      previous.events.push(event);
    } else {
      groups.push({ position, events: [event] });
    }
  }
  return groups;
}

export function ReplayTimeline({ replay, logLines, index: committedIndex, onSeek, onJump }: Props) {
  const { t } = useTranslation();
  const [scrubIndex, setScrubIndex] = useState<number>();
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrubTarget = useRef<number | undefined>(undefined);
  const index = scrubIndex ?? committedIndex;
  const root = useRef<HTMLDivElement>(null);
  const scale = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [width, setWidth] = useState(200);
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const popupId = useId();
  const positionId = useId();
  const last = Math.max(1, replay.frames.length - 1);
  const events = useMemo(() => buildReplayTimelineEvents({ replay }), [replay]);
  const segments = useMemo(() => buildSegments({ events, last }), [events, last]);
  const lanes = useMemo(
    () =>
      seats.map((seat) =>
        groupNearbyEvents({
          events: events.filter(
            (event) => event.kind === ReplayTimelineEventKind.SECURITY.value && event.seat === seat,
          ),
          last,
          width,
        }),
      ),
    [events, last, width],
  );

  const selected = lanes.flat().find((group) => group.events[0]!.index === selectedIndex);

  useEffect(() => {
    const element = scale.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const current = root.current?.querySelector<HTMLButtonElement>(".replay-timeline__events button[aria-current]");
    const first = root.current?.querySelector<HTMLButtonElement>(".replay-timeline__events button");
    (current ?? first)?.focus();
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setSelectedIndex(undefined);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [selected]);

  useEffect(() => () => clearTimeout(scrubTimer.current), []);

  function flushScrub() {
    clearTimeout(scrubTimer.current);
    scrubTimer.current = undefined;
    if (scrubTarget.current !== undefined) {
      onSeek(scrubTarget.current);
    }
  }

  function scrubTo(target: number) {
    setScrubIndex(target);
    scrubTarget.current = target;
    clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(flushScrub, 150);
  }

  function endScrub() {
    if (scrubIndex === undefined) {
      return;
    }
    flushScrub();
    scrubTarget.current = undefined;
    setScrubIndex(undefined);
  }

  function getEventLabel(event: ReplayTimelineEvent) {
    const definition = Object.values(ReplayTimelineEventKind).find((entry) => entry.value === event.kind)!;
    return t(definition.label, {
      name: replay.players[event.seat],
      turn: event.turn,
      amount: event.amount,
      action: event.index + 1,
    });
  }

  function describeEvent(event: ReplayTimelineEvent) {
    return logLines.slice(event.index, event.index + 4).find(Boolean);
  }

  function seekToEvent(event: ReplayTimelineEvent) {
    onJump(event.index);
    setSelectedIndex(undefined);
    trigger.current?.focus();
  }

  function renderLane(seat: Seat) {
    return (
      <div className="replay-timeline__lane" data-seat={seat}>
        {lanes[seat]!.map((group) => {
          const first = group.events[0]!;
          const grouped = group.events.length > 1;
          const amount = group.events.reduce((total, event) => total + event.amount, 0);
          const label = grouped
            ? t("replay.timeline.group", { count: group.events.length, action: first.index + 1 })
            : getEventLabel(first);
          return (
            <button
              key={first.index}
              type="button"
              className="replay-timeline__marker"
              style={{ left: `${group.position * 100}%` }}
              title={label}
              aria-label={label}
              aria-current={group.events.some((event) => event.index === index) ? "step" : undefined}
              aria-expanded={selected === group}
              aria-controls={selected === group ? popupId : undefined}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                onJump(first.index);
                setSelectedIndex((current) => (current === first.index ? undefined : first.index));
              }}
            >
              <ShieldMinus size={14} aria-hidden="true" />
              {amount > 1 ? <small>{amount}</small> : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={root}
      className="replay-timeline"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex(undefined);
          trigger.current?.focus();
        }
      }}
    >
      <label htmlFor={positionId}>{t("replay.action", { current: index + 1, total: replay.frames.length })}</label>
      <ul className="replay-timeline__legend" aria-hidden="true">
        {seats.map((seat) => (
          <li key={seat} data-seat={seat}>
            {replay.players[seat]}
          </li>
        ))}
        <li>
          <ShieldMinus size={12} />
          {t("replay.timeline.securityShort")}
        </li>
      </ul>
      <div ref={scale} className="replay-timeline__scale" role="group" aria-label={t("replay.timeline.events")}>
        {renderLane(0)}
        <div className="replay-timeline__bar">
          {segments.map(({ event, start, end }) => {
            const label = getEventLabel(event);
            const span = (end - start) / last;
            return (
              <button
                key={start}
                type="button"
                className="replay-timeline__turn"
                data-seat={event.seat}
                data-played={start <= index || undefined}
                style={{ left: `${(start / last) * 100}%`, width: `${span * 100}%` }}
                title={label}
                aria-label={label}
                aria-current={start <= index && (index < end || end === last) ? "step" : undefined}
                onClick={() => {
                  setSelectedIndex(undefined);
                  onJump(start);
                }}
              >
                {span * width >= 18 ? event.turn : null}
              </button>
            );
          })}
          <input
            id={positionId}
            type="range"
            min={0}
            max={replay.frames.length - 1}
            value={index}
            aria-label={t("replay.position")}
            onPointerDown={() => setScrubIndex(committedIndex)}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
            onLostPointerCapture={endScrub}
            onBlur={endScrub}
            onChange={(event) => {
              setSelectedIndex(undefined);
              const target = Number(event.target.value);
              if (scrubIndex === undefined) {
                onSeek(target);
              } else {
                scrubTo(target);
              }
            }}
          />
        </div>
        {renderLane(1)}
      </div>
      {selected ? (
        <div id={popupId} className="replay-timeline__events" role="group" aria-label={t("replay.timeline.events")}>
          {selected.events.map((event) => (
            <div className="replay-timeline__event" key={`${event.index}-${event.kind}-${event.seat}`}>
              <strong>{getEventLabel(event)}</strong>
              <span>{[`${t("replay.turn")} ${event.turn}`, describeEvent(event)].filter(Boolean).join(" · ")}</span>
              <button
                type="button"
                aria-current={event.index === index ? "step" : undefined}
                onClick={() => seekToEvent(event)}
              >
                {t("replay.timeline.seek", { action: event.index + 1 })}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
