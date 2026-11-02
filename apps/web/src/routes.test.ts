import { describe, expect, it } from "vitest";
import { pathForRoute, routeFromPathname } from "./routes";

describe("application routes", () => {
  it.each([
    ["/", { screen: "home" }],
    ["/login", { screen: "login" }],
    ["/play", { screen: "lobby" }],
    ["/play/story", { screen: "story" }],
    ["/play/rooms", { screen: "watch" }],
    ["/play/watch", { screen: "watch" }],
    ["/decks", { screen: "deck" }],
    ["/collection", { screen: "collection" }],
    ["/collection/boosters", { screen: "collection", collectionTab: "boosters" }],
    ["/booster", { screen: "booster" }],
    ["/dev/pack-opening", { screen: "booster" }],
    ["/community", { screen: "community" }],
    ["/community/decks/abc-123", { screen: "community", communityDeckId: "abc-123" }],
    ["/community/meta", { screen: "community", communityMeta: true }],
    ["/roadmap", { screen: "roadmap" }],
    ["/roadmap/7", { screen: "roadmap", roadmapItemId: 7 }],
    ["/admin/feedback", { screen: "feedback" }],
    ["/admin/feedback/412", { screen: "feedback", feedbackId: 412 }],
    ["/notifications", { screen: "notifications" }],
    ["/feedback", { screen: "myFeedback" }],
    ["/feedback/412/", { screen: "myFeedback", feedbackId: 412 }],
    ["/settings", { screen: "settings" }],
    ["/profile", { screen: "settings", profile: true }],
    ["/profile/replays", { screen: "settings", profile: true }],
    ["/profile/customize", { screen: "settings", profile: true }],
    ["/replays", { screen: "settings", profile: true }],
    ["/replays/saved-id", { screen: "replays", replayId: "saved-id" }],
    ["/replays/public", { screen: "replays", publicReplays: true }],
    ["/whats-new", { screen: "releases" }],
  ])("parses %s", (pathname, expected) => {
    expect(routeFromPathname(pathname)).toEqual(expected);
  });

  it("round-trips profile and saved replay links", () => {
    expect(pathForRoute({ screen: "settings", profile: true })).toBe("/profile");
    expect(pathForRoute({ screen: "replays", replayId: "saved-id" })).toBe("/replays/saved-id");
    expect(pathForRoute({ screen: "replays" })).toBe("/profile");
  });

  it("round-trips the public replay list", () => {
    expect(pathForRoute({ screen: "replays", publicReplays: true })).toBe("/replays/public");
  });

  it("round-trips a community deck path", () => {
    expect(pathForRoute({ screen: "community", communityDeckId: "abc-123" })).toBe("/community/decks/abc-123");
    expect(pathForRoute({ screen: "community" })).toBe("/community");
    expect(pathForRoute({ screen: "community", communityMeta: true })).toBe("/community/meta");
  });

  it("round-trips the collection tabs", () => {
    expect(pathForRoute({ screen: "collection" })).toBe("/collection");
    expect(pathForRoute({ screen: "collection", collectionTab: "cards" })).toBe("/collection");
    expect(pathForRoute({ screen: "collection", collectionTab: "boosters" })).toBe("/collection/boosters");
    expect(pathForRoute({ screen: "booster" })).toBe("/booster");
  });

  it("round-trips roadmap links", () => {
    expect(pathForRoute({ screen: "roadmap" })).toBe("/roadmap");
    expect(pathForRoute({ screen: "roadmap", roadmapItemId: 7 })).toBe("/roadmap/7");
    expect(routeFromPathname("/roadmap/abc")).toBeUndefined();
  });

  it("round-trips feedback deep links", () => {
    expect(pathForRoute({ screen: "feedback", feedbackId: 7 })).toBe("/admin/feedback/7");
    expect(pathForRoute({ screen: "myFeedback", feedbackId: 7 })).toBe("/feedback/7");
    expect(pathForRoute({ screen: "myFeedback" })).toBe("/feedback");
  });

  it("rejects unknown paths", () => {
    expect(routeFromPathname("/unknown")).toBeUndefined();
    expect(routeFromPathname("/feedback/abc")).toBeUndefined();
    expect(routeFromPathname("/tournaments")).toEqual({ screen: "tournaments", tournament: { kind: "catalog" } });
    expect(routeFromPathname("/tournaments/new")).toEqual({ screen: "tournaments", tournament: { kind: "create" } });
    const route = { screen: "tournaments", tournament: { kind: "detail", id: "community-cup" } } as const;
    expect(routeFromPathname(pathForRoute(route))).toEqual(route);
  });

  it("round-trips circuit creation and circuit detail paths", () => {
    const create = { screen: "tournaments", tournament: { kind: "createCircuit" } } as const;
    const detail = { screen: "tournaments", tournament: { kind: "circuit", id: "weekly-circuit" } } as const;
    expect(pathForRoute(create)).toBe("/tournaments/circuits/new");
    expect(pathForRoute(detail)).toBe("/tournaments/circuits/weekly-circuit");
    expect(routeFromPathname("/tournaments/circuits/new")).toEqual(create);
    expect(routeFromPathname("/tournaments/circuits/weekly-circuit")).toEqual(detail);
  });

  it("keeps a tournament tab in the path and leaves the overview at the event root", () => {
    const bracket = {
      screen: "tournaments",
      tournament: { kind: "detail", id: "community-cup", tab: "bracket" },
    } as const;
    expect(pathForRoute(bracket)).toBe("/tournaments/community-cup/bracket");
    expect(routeFromPathname("/tournaments/community-cup/bracket")).toEqual(bracket);
    expect(
      pathForRoute({ screen: "tournaments", tournament: { kind: "detail", id: "community-cup", tab: "overview" } }),
    ).toBe("/tournaments/community-cup");
    expect(routeFromPathname("/tournaments/community-cup/overview")).toBeUndefined();
    expect(routeFromPathname("/tournaments/community-cup/constructor")).toBeUndefined();
  });
});
