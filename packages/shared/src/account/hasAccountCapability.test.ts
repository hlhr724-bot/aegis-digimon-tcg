import { describe, expect, it } from "vitest";
import { AccountRole } from "#shared/account/AccountRole";
import { hasAccountCapability } from "#shared/account/hasAccountCapability";
import { isAccountRole } from "#shared/account/isAccountRole";

describe("hasAccountCapability", () => {
  it("grants every capability to admins", () => {
    const roles = [AccountRole.ADMIN.value];
    expect(hasAccountCapability({ roles, capability: "canAdminister" })).toBe(true);
    expect(hasAccountCapability({ roles, capability: "canJudge" })).toBe(true);
    expect(hasAccountCapability({ roles, capability: "canOrganizeOfficialTournaments" })).toBe(true);
  });

  it("limits judges and organizers to their own capability", () => {
    const judge = [AccountRole.JUDGE.value];
    const organizer = [AccountRole.ORGANIZER.value];
    expect(hasAccountCapability({ roles: judge, capability: "canJudge" })).toBe(true);
    expect(hasAccountCapability({ roles: judge, capability: "canOrganizeOfficialTournaments" })).toBe(false);
    expect(hasAccountCapability({ roles: organizer, capability: "canOrganizeOfficialTournaments" })).toBe(true);
    expect(hasAccountCapability({ roles: organizer, capability: "canJudge" })).toBe(false);
  });

  it("grants nothing to accounts without roles", () => {
    expect(hasAccountCapability({ roles: [], capability: "canAdminister" })).toBe(false);
  });
});

describe("isAccountRole", () => {
  it("accepts only known role values", () => {
    expect(isAccountRole("judge")).toBe(true);
    expect(isAccountRole("constructor")).toBe(false);
    expect(isAccountRole(1)).toBe(false);
  });
});
