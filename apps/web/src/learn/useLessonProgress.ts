import { useEffect, useState } from "react";
import type { StoryProgress } from "@aegis/shared/story/StoryBattle";
import { request } from "@/account/client";
import { getStoryGuestToken } from "@/story/getStoryGuestToken";

type Params = { signedIn: boolean };

export type LessonProgress = { completed: readonly string[] | undefined };

export function useLessonProgress({ signedIn }: Params): LessonProgress {
  const [completed, setCompleted] = useState<readonly string[]>();
  useEffect(() => {
    let active = true;
    void request<StoryProgress>("/story/progress", { headers: { Authorization: `StoryGuest ${getStoryGuestToken()}` } })
      .then((value) => {
        if (active) {
          setCompleted(value.completed);
        }
      })
      .catch(() => {
        if (active) {
          setCompleted([]);
        }
      });
    return () => {
      active = false;
    };
  }, [signedIn]);
  return { completed };
}
