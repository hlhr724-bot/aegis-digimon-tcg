import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";

export type BoardStyleEntry = (typeof BoardStyle)[keyof typeof BoardStyle];

export function findBoardStyleEntry(value: unknown): BoardStyleEntry | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return Object.values(BoardStyle).find((entry) => entry.value === value);
}
