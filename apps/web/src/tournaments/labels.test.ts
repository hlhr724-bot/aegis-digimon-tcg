import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { reasonKey } from "@/tournaments/labels";

describe("tournament rejection messages", () => {
  it.each(["check_in_window_inverted", "window_timestamp_invalid", "401", "403", "404", "429"])(
    "translates %s for players",
    (code) => {
      const key = reasonKey(code);
      expect(key).toBeDefined();
      expect(en[key as keyof typeof en]).toEqual(expect.any(String));
    },
  );

  it("leaves an unrecognized code to the generic message", () => {
    expect(reasonKey("500")).toBeUndefined();
    expect(reasonKey("brand_new_reason")).toBeUndefined();
  });
});
