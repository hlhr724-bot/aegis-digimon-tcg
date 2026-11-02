import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Seat } from "@aegis/shared";
import type { TrainingWindow } from "../training/policy.js";

export interface SearchEdge {
  attempts: number;
  visits: number;
  reward: number;
  available: number;
}
export interface SearchNode {
  visits: number;
  edges: Map<string, SearchEdge>;
}
export interface SearchReport {
  requested: number;
  attempted: number;
  completed: number;
  invalid: number;
  nodes: number;
  leafEvaluations?: number;
  timeBudget?: { requestedMs: number; elapsedMs: number; exhausted: boolean };
  root: { action: number; visits: number; meanReward: number }[];
}

/** Legal offered intent is the action identity; decision sequence ids are incidental. */
export function actionKey(window: TrainingWindow, index: number): string {
  const intent = window.actions[index]!.intent;
  return JSON.stringify(intent.type === "respondDecision" ? { type: intent.type, response: intent.response } : intent);
}

export function informationKey(window: TrainingWindow): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        observation: window.observation,
        kind: window.kind,
        selected: window.selected,
        request: window.request === undefined ? undefined : { ...window.request, decisionId: undefined },
        combat: window.combat,
      }),
    )
    .digest("hex");
}

/** Single-observer information-set tree; the other seat follows a fixed rollout policy.
 * Each simulation must reconstruct and determinize a real engine state in its runner.
 */
export async function searchMcts(options: {
  root: TrainingWindow;
  seat: Seat;
  simulations: number;
  exploration?: number;
  maxDurationMs?: number;
  signal?: AbortSignal;
  rolloutChoose: (window: TrainingWindow) => number;
  rootPriors?: readonly number[];
  simulate: (
    choose: (window: TrainingWindow) => number,
    simulation: number,
  ) => Promise<{ reward: number; valid: boolean }>;
}): Promise<{ action: number; report: SearchReport }> {
  if (!Number.isSafeInteger(options.simulations) || options.simulations < 1 || options.simulations > 10000)
    throw new Error("MCTS simulations must be an integer from 1 to 10000");
  const exploration = options.exploration ?? Math.SQRT2;
  if (!Number.isFinite(exploration) || exploration < 0) throw new Error("Invalid UCT exploration constant");
  if (options.maxDurationMs !== undefined && (!Number.isFinite(options.maxDurationMs) || options.maxDurationMs <= 0)) {
    throw new Error("MCTS time budget must be positive and finite");
  }
  const started = performance.now();
  const timeExhausted = () =>
    options.maxDurationMs !== undefined && performance.now() - started >= options.maxDurationMs;
  const nodes = new Map<string, SearchNode>();
  const rootKey = informationKey(options.root);
  let completed = 0;
  let invalid = 0;
  let attempted = 0;
  for (let simulation = 0; simulation < options.simulations * 3 && completed < options.simulations; simulation++) {
    options.signal?.throwIfAborted();
    if (attempted > 0 && timeExhausted()) {
      break;
    }
    attempted++;
    const path: { node: SearchNode; edge: SearchEdge }[] = [];
    const visitedInformation = new Set<string>();
    let expanded = false;
    const choose = (window: TrainingWindow): number => {
      if (expanded) return options.rolloutChoose(window);
      const key = informationKey(window);
      if (visitedInformation.has(key)) {
        expanded = true;
        return options.rolloutChoose(window);
      }
      visitedInformation.add(key);
      let node = nodes.get(key);
      if (node === undefined) {
        node = { visits: 0, edges: new Map() };
        nodes.set(key, node);
      }
      let bestIndex = -1;
      let bestScore = -Infinity;
      const rootPrior = key === rootKey ? options.rootPriors : undefined;
      for (let index = 0; index < window.actions.length; index++) {
        const action = actionKey(window, index);
        let edge = node.edges.get(action);
        if (edge === undefined) {
          edge = { attempts: 0, visits: 0, reward: 0, available: 0 };
          node.edges.set(action, edge);
        }
        edge.available++;
        const score =
          rootPrior === undefined
            ? edge.attempts === 0
              ? Infinity
              : edge.reward / edge.attempts + exploration * Math.sqrt(Math.log(edge.available) / edge.attempts)
            : edge.attempts === 0
              ? exploration * (rootPrior[index] ?? 0) * Math.sqrt(node.visits + 1)
              : edge.reward / edge.attempts +
                (exploration * (rootPrior[index] ?? 0) * Math.sqrt(node.visits + 1)) / (1 + edge.attempts);
        if (bestIndex < 0 || score > bestScore) {
          bestIndex = index;
          bestScore = score;
        }
      }
      if (bestIndex < 0) throw new Error("MCTS window has no legal actions");
      const edge = node.edges.get(actionKey(window, bestIndex))!;
      expanded = edge.attempts === 0;
      path.push({ node, edge });
      return bestIndex;
    };
    const result = await options.simulate(choose, simulation);
    for (const { edge } of path) edge.attempts++;
    if (!result.valid || !Number.isFinite(result.reward) || result.reward < 0 || result.reward > 1) {
      invalid++;
      continue;
    }
    completed++;
    for (const { node, edge } of path) {
      node.visits++;
      edge.visits++;
      edge.reward += result.reward;
    }
  }
  options.signal?.throwIfAborted();
  const rootNode = nodes.get(rootKey);
  const root = options.root.actions
    .map((_, action) => {
      const edge = rootNode?.edges.get(actionKey(options.root, action));
      return {
        action,
        visits: edge?.visits ?? 0,
        meanReward: edge === undefined || edge.visits === 0 ? 0 : edge.reward / edge.visits,
      };
    })
    .sort(
      (left, right) => right.visits - left.visits || right.meanReward - left.meanReward || left.action - right.action,
    );
  if (completed === 0 || root[0]!.visits === 0) throw new Error("No valid MCTS rollouts reached the root");
  return {
    action: root[0]!.action,
    report: {
      requested: options.simulations,
      attempted,
      completed,
      invalid,
      nodes: nodes.size,
      root,
      ...(options.maxDurationMs === undefined
        ? {}
        : {
            timeBudget: {
              requestedMs: options.maxDurationMs,
              elapsedMs: performance.now() - started,
              exhausted: timeExhausted(),
            },
          }),
    },
  };
}
