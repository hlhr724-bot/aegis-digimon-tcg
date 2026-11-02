import { isArenaNativeInputTarget } from "@/game/input/isArenaNativeInputTarget";
import { InputSurfaceEvent } from "@/design/InputSurfaceEvent";
import { isArenaTypingTarget } from "@/game/input/isArenaTypingTarget";
import { ArenaInputCommand } from "@/game/input/ArenaInputCommand";
import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";

const targetSelector = 'button, [role="button"], [href], input, select, textarea, summary, [tabindex="0"]';
const turnSelector = "[data-arena-turn]";
const suggestedSelector = "[data-arena-suggested]";
const boardCancelSelector = ".decision-board-return [data-arena-cancel], .board-prompt [data-arena-cancel]";
const surfaceSelector = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-arena-surface]';

type Params = {
  getRoot: () => HTMLElement | null;
  onCancel: () => void;
};

type RememberedTarget = {
  element: HTMLElement;
  identity: string | undefined;
  position: number;
};

function isVisible(element: HTMLElement) {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
}

function getIdentity(element: HTMLElement) {
  return element.dataset.handInstanceId ?? element.dataset.permanentId ?? element.dataset.arenaInputId;
}

function getLayer(element: HTMLElement): number[] {
  const parent = element.parentElement;
  const layers = parent ? getLayer(parent) : [];
  const style = getComputedStyle(element);
  const z = Number.parseInt(style.zIndex, 10);
  if (!Number.isNaN(z)) {
    layers.push(z);
  }
  return layers;
}

function compareLayers(a: HTMLElement, b: HTMLElement) {
  const left = getLayer(a);
  const right = getLayer(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) {
      return difference;
    }
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function getTargets(scope: HTMLElement) {
  return Array.from(scope.querySelectorAll<HTMLElement>(targetSelector)).filter((element) => {
    if (
      element.tabIndex < 0 ||
      element.matches(":disabled") ||
      element.closest('[aria-disabled="true"]') ||
      !isVisible(element)
    ) {
      return false;
    }
    const outer = element.parentElement?.closest('[role="button"]');
    return !outer || !scope.contains(outer);
  });
}

export function createArenaInputController({ getRoot, onCancel }: Params) {
  const memories = new Map<string, RememberedTarget>();
  const surfaces: { element: HTMLElement; origin: HTMLElement | null }[] = [];
  let focused: HTMLElement | undefined;
  let lastRegion: string = ArenaInputRegion.HAND.value;
  let active = false;
  let activating = false;
  let suggestions = new Set<HTMLElement>();
  const forwardedEvents = new WeakSet<Event>();

  function getScope() {
    return Array.from(document.querySelectorAll<HTMLElement>(surfaceSelector))
      .filter(isVisible)
      .sort(compareLayers)
      .at(-1);
  }

  function getAvailable() {
    const root = getRoot();
    if (!root) {
      return { scope: undefined, targets: [] as HTMLElement[] };
    }
    const scope = getScope();
    if (scope) {
      return { scope, targets: getTargets(scope) };
    }
    const layout = root.closest<HTMLElement>(".game-layout") ?? root;
    const targets = getTargets(layout);
    for (const rail of document.querySelectorAll<HTMLElement>(
      ".board-prompt, .decision-board-return, .effect-confirm",
    )) {
      if (!layout.contains(rail) && isVisible(rail)) {
        targets.push(...getTargets(rail));
      }
    }
    return { scope, targets };
  }

  function getRegion(element: HTMLElement) {
    return element.closest<HTMLElement>("[data-arena-region]")?.dataset.arenaRegion ?? ArenaInputRegion.CONTROLS.value;
  }

  function focusTarget(element: HTMLElement, targets: HTMLElement[]) {
    focused?.removeAttribute("data-arena-focused");
    focused = element;
    element.setAttribute("data-arena-focused", "true");
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (!getScope()) {
      lastRegion = getRegion(element);
      const regionTargets = targets.filter((target) => getRegion(target) === lastRegion);
      memories.set(lastRegion, { element, identity: getIdentity(element), position: regionTargets.indexOf(element) });
    }
  }

  function findRemembered(targets: HTMLElement[], region: string) {
    const candidates = targets.filter((element) => getRegion(element) === region);
    const memory = memories.get(region);
    if (!memory) {
      return candidates[0];
    }
    return (
      candidates.find(
        (element) => element === memory.element || (memory.identity && getIdentity(element) === memory.identity),
      ) ?? candidates[Math.min(memory.position, candidates.length - 1)]
    );
  }

  function refresh() {
    if (!active) {
      return;
    }
    if (isArenaTypingTarget(document.activeElement) || isArenaNativeInputTarget(document.activeElement)) {
      return;
    }
    const { scope, targets } = getAvailable();
    const previous = surfaces.at(-1);
    if (scope && previous?.element !== scope) {
      const existing = surfaces.findIndex((entry) => entry.element === scope);
      if (existing >= 0) {
        const closed = surfaces.splice(existing + 1);
        const origin = closed[0]?.origin;
        if (origin && targets.includes(origin)) {
          focusTarget(origin, targets);
          return;
        }
      } else {
        surfaces.push({ element: scope, origin: focused ?? (document.activeElement as HTMLElement | null) });
      }
    } else if (!scope && previous) {
      const origin = surfaces[0]?.origin;
      surfaces.length = 0;
      if (origin && targets.includes(origin)) {
        focusTarget(origin, targets);
        return;
      }
    }
    const current = document.activeElement;
    const currentIsTarget = current instanceof HTMLElement && targets.includes(current);
    const suggested = scope ? [] : targets.filter((target) => target.matches(suggestedSelector));
    const fresh = suggested.find((target) => !suggestions.has(target));
    suggestions = new Set(suggested);
    if (fresh && fresh !== focused && !(activating && currentIsTarget)) {
      focusTarget(fresh, targets);
      return true;
    }
    if (current instanceof HTMLElement && currentIsTarget) {
      if (focused !== current) {
        focusTarget(current, targets);
      }
      return;
    }
    const fallback = findRemembered(targets, lastRegion) ?? targets[0];
    if (fallback) {
      focusTarget(fallback, targets);
    }
  }

  function forwardKey(element: HTMLElement, key: string) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    forwardedEvents.add(event);
    element.dispatchEvent(event);
  }

  function handle(command: ArenaInputCommand) {
    if (isArenaNativeInputTarget(document.activeElement)) {
      return;
    }
    activating = !active;
    active = true;
    const jumped = refresh();
    activating = false;
    if (jumped) {
      return;
    }
    const { scope, targets } = getAvailable();
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (current?.dataset.arenaReordering) {
      if (command === ArenaInputCommand.CANCEL.value) {
        forwardKey(current, "Escape");
      } else if (command === ArenaInputCommand.CONFIRM.value) {
        current.click();
      } else if (command === ArenaInputCommand.UP.value || command === ArenaInputCommand.DOWN.value) {
        forwardKey(current, command === ArenaInputCommand.UP.value ? "ArrowUp" : "ArrowDown");
      }
      return;
    }
    if (command === ArenaInputCommand.CANCEL.value) {
      const boundary =
        scope ??
        Array.from(document.querySelectorAll<HTMLElement>(".decision-board-return, .board-prompt"))
          .filter(isVisible)
          .at(-1);
      const cancellation = new Event(InputSurfaceEvent.CANCEL.value, { cancelable: true });
      boundary?.dispatchEvent(cancellation);
      if (cancellation.defaultPrevented) {
        return;
      }
      const cancel = scope?.querySelector<HTMLElement>("[data-arena-cancel]");
      if (cancel && isVisible(cancel) && !cancel.matches(":disabled")) {
        cancel.click();
      } else if (!scope) {
        const back = document.querySelector<HTMLElement>(boardCancelSelector);
        if (back && isVisible(back)) {
          back.click();
        } else {
          onCancel();
        }
      }
      return;
    }
    if (command === ArenaInputCommand.CONFIRM.value) {
      if (current && targets.includes(current)) {
        current.click();
      }
      return;
    }
    if (command === ArenaInputCommand.INSPECT.value) {
      const inspect = current?.querySelector<HTMLElement>("[data-arena-inspect]");
      if (inspect) {
        inspect.click();
      } else if (current?.dataset.inspectable) {
        current.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      } else if (current?.dataset.handInstanceId) {
        current.click();
      }
      return;
    }
    if (command === ArenaInputCommand.TURN.value) {
      const turn = scope ? undefined : targets.find((target) => target.matches(turnSelector));
      if (turn) {
        focusTarget(turn, targets);
      }
      return;
    }
    if (command === ArenaInputCommand.SCROLL_UP.value || command === ArenaInputCommand.SCROLL_DOWN.value) {
      const direction = command === ArenaInputCommand.SCROLL_UP.value ? -1 : 1;
      const candidates = [current, ...(scope ? Array.from(scope.querySelectorAll<HTMLElement>("*")) : [])];
      const scrollable = candidates.find(
        (element) =>
          element &&
          isVisible(element) &&
          element.scrollHeight > element.clientHeight &&
          /auto|scroll/.test(getComputedStyle(element).overflowY),
      );
      scrollable?.scrollBy?.({ top: direction * Math.max(80, scrollable.clientHeight * 0.7), behavior: "instant" });
      return;
    }
    if (command === ArenaInputCommand.NEXT_REGION.value || command === ArenaInputCommand.PREVIOUS_REGION.value) {
      if (scope) {
        return;
      }
      const regions = Object.values(ArenaInputRegion)
        .map((entry) => entry.value)
        .filter((region) => targets.some((target) => getRegion(target) === region));
      const index = regions.findIndex((region) => region === (current ? getRegion(current) : lastRegion));
      const delta = command === ArenaInputCommand.NEXT_REGION.value ? 1 : -1;
      const region = regions[(index + delta + regions.length) % regions.length];
      const next = region && findRemembered(targets, region);
      if (next) {
        focusTarget(next, targets);
      }
      return;
    }
    if (!current || !targets.includes(current)) {
      return;
    }
    const candidates = scope ? targets : targets.filter((target) => getRegion(target) === getRegion(current));
    const bounds = current.getBoundingClientRect();
    const horizontal = command === ArenaInputCommand.LEFT.value || command === ArenaInputCommand.RIGHT.value;
    const sign = command === ArenaInputCommand.LEFT.value || command === ArenaInputCommand.UP.value ? -1 : 1;
    const originX = bounds.left + bounds.width / 2;
    const originY = bounds.top + bounds.height / 2;
    const ranked = candidates
      .filter((candidate) => candidate !== current)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - originX;
        const dy = rect.top + rect.height / 2 - originY;
        const primary = (horizontal ? dx : dy) * sign;
        const secondary = Math.abs(horizontal ? dy : dx);
        return { element, primary, score: Math.hypot(dx, dy) + secondary * 2 };
      })
      .filter((candidate) => candidate.primary > 1)
      .sort((a, b) => a.score - b.score);
    const next = ranked[0]?.element;
    if (next) {
      focusTarget(next, targets);
    }
  }

  function deactivate() {
    active = false;
    suggestions.clear();
    focused?.removeAttribute("data-arena-focused");
  }

  function isForwarded(event: Event) {
    return forwardedEvents.has(event);
  }

  function getHints() {
    const scope = getScope();
    const current = document.activeElement;
    return {
      inSurface: !!scope,
      canCancel: scope
        ? scope.hasAttribute("data-arena-cancelable") || !!scope.querySelector("[data-arena-cancel]")
        : Array.from(
            document.querySelectorAll<HTMLElement>(`${boardCancelSelector}, .board-prompt[data-arena-cancelable]`),
          ).some(isVisible),
      canInspect:
        current instanceof HTMLElement &&
        (!!current.dataset.inspectable ||
          !!current.dataset.handInstanceId ||
          !!current.querySelector("[data-arena-inspect]")),
      reordering: current instanceof HTMLElement && !!current.dataset.arenaReordering,
    };
  }

  function hasTargets() {
    return getAvailable().targets.length > 0;
  }

  function getPrompts() {
    if (!active) {
      return [];
    }
    const { scope, targets } = getAvailable();
    const cancels = scope
      ? Array.from(scope.querySelectorAll<HTMLElement>("[data-arena-cancel]"))
      : Array.from(document.querySelectorAll<HTMLElement>(boardCancelSelector));
    const prompts: { element: HTMLElement; command: ArenaInputCommand }[] = cancels
      .filter((element) => isVisible(element) && !element.matches(":disabled"))
      .slice(0, 1)
      .map((element) => ({ element, command: ArenaInputCommand.CANCEL.value }));
    const turn = scope ? undefined : targets.find((target) => target.matches(turnSelector));
    if (turn && turn !== focused) {
      prompts.push({ element: turn, command: ArenaInputCommand.TURN.value });
    }
    if (focused?.isConnected && targets.includes(focused) && !prompts.some((prompt) => prompt.element === focused)) {
      prompts.push({ element: focused, command: ArenaInputCommand.CONFIRM.value });
      if (getHints().canInspect) {
        prompts.push({ element: focused, command: ArenaInputCommand.INSPECT.value });
      }
    }
    return prompts;
  }

  return { handle, refresh, deactivate, isForwarded, hasTargets, getHints, getPrompts };
}
