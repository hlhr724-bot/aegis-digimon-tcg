import { SUBMITTABLE_FEEDBACK_KINDS, type SubmittableFeedbackKind } from "#shared/feedback/types";

export function isSubmittableFeedbackKind(value: unknown): value is SubmittableFeedbackKind {
  return typeof value === "string" && SUBMITTABLE_FEEDBACK_KINDS.some((kind) => kind === value);
}
