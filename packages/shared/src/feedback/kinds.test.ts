import { describe, expect, it } from "vitest";
import { isFeedbackKind } from "#shared/feedback/isFeedbackKind";
import { isSubmittableFeedbackKind } from "#shared/feedback/isSubmittableFeedbackKind";
import { FEEDBACK_KINDS, SUBMITTABLE_FEEDBACK_KINDS } from "#shared/feedback/types";

describe("feedback kinds", () => {
  it("names the three kinds players submit through the report form", () => {
    expect(SUBMITTABLE_FEEDBACK_KINDS).toEqual(["bug", "improvement", "other"]);
  });
  it("adds official tournament requests to the kinds admins triage", () => {
    expect(FEEDBACK_KINDS).toEqual(["bug", "improvement", "other", "official_tournament"]);
  });
  it("recognises a kind and nothing else", () => {
    expect(isFeedbackKind("bug")).toBe(true);
    expect(isFeedbackKind("official_tournament")).toBe(true);
    expect(isFeedbackKind("BUG")).toBe(false);
    expect(isFeedbackKind(undefined)).toBe(false);
  });
  it("keeps official tournament requests out of the report form", () => {
    expect(isSubmittableFeedbackKind("other")).toBe(true);
    expect(isSubmittableFeedbackKind("official_tournament")).toBe(false);
  });
});
