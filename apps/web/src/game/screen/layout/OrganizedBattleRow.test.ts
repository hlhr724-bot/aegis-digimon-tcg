import { describe, expect, it } from "vitest";
import { fitLanes, fitLanesToWidth, laneContentWidth, LanePlacement } from "./OrganizedBattleRow";
import { linkCardSlots, sourceFanStepLimit } from "../../boardModel";

const crowded = { digimonCount: 6, supportCount: 6 };

describe("fitLanes", () => {
  it("keeps two readable lanes side by side when a phone row cannot fit two uniform shelves", () => {
    const content = {
      digimonCount: 2,
      supportCount: 2,
      supportScale: 1,
      reserveSupport: true,
      preferStacked: true,
      overlapLanes: true,
      fitWidth: true,
      sourceTop: 2,
      sourceStep: 1.25,
    };
    const upright = { suspended: false, sources: 0, links: 0, copies: 1 };
    const cards = {
      digimon: [upright, { ...upright, suspended: true, sources: 6 }],
      support: [{ ...upright, copies: 3 }, upright],
    };
    for (const width of [288, 343]) {
      const lanes = fitLanes({ width, height: 186 }, 76, { ...content, digimonSources: 6 });
      expect(lanes).toMatchObject({ placement: LanePlacement.SideBySide, digimon: 76, support: 76 });
      const fitted = fitLanesToWidth(lanes, width, cards, content);
      expect(fitted.digimon).toBeGreaterThanOrEqual(65);
      expect(fitted.support).toBe(fitted.digimon);
      expect(
        laneContentWidth(cards.digimon, fitted.digimon, 0.25, 1.25, true) +
          laneContentWidth(cards.support, fitted.support, 0.3, 1.25, true),
      ).toBeGreaterThan(width);
    }
  });

  it("keeps a tall phone row in one lane of readable cards", () => {
    const lanes = fitLanes({ width: 288, height: 270 }, 76, {
      ...crowded,
      supportScale: 1,
      reserveSupport: true,
      preferStacked: true,
      overlapLanes: true,
      singleLane: true,
    });
    expect(lanes).toEqual({ placement: LanePlacement.Merged, digimon: 91, support: 91 });
  });

  it("grows one desktop lane's cards a little past the layout's card size, never to the row's height", () => {
    const content = { ...crowded, supportScale: 1, reserveSupport: true, overlapLanes: true, singleLane: true };
    for (const height of [323, 480, 900]) {
      expect(fitLanes({ width: 1257, height }, 116, content)).toEqual({
        placement: LanePlacement.Merged,
        digimon: 139,
        support: 139,
      });
    }
    expect(fitLanes({ width: 1257, height: 0 }, 116, content)).toMatchObject({ placement: LanePlacement.Merged });
    const twoLanes = fitLanes({ width: 1257, height: 323 }, 116, { ...content, singleLane: false });
    expect(twoLanes.placement).toBe(LanePlacement.Stacked);
    expect(twoLanes.digimon).toBeLessThan(116);
  });

  it("fits one short desktop lane's sources, links and suspension inside its height", () => {
    const height = 120;
    const lanes = fitLanes({ width: 1257, height }, 116, {
      ...crowded,
      digimonSources: 3,
      supportSources: 6,
      supportLinks: 2,
      singleLane: true,
    });
    expect(lanes.placement).toBe(LanePlacement.Merged);
    expect(lanes.support).toBe(lanes.digimon);
    const fan = 6 + 5 * Math.min(4, sourceFanStepLimit(lanes.digimon, 6));
    expect(Math.ceil(lanes.digimon * 1.4) + 22 + fan).toBeLessThanOrEqual(height);
  });

  it("keeps uniform cards in compact stacked and side-by-side rows, including deep support stacks", () => {
    const content = {
      ...crowded,
      supportScale: 1,
      reserveSupport: true,
      digimonSources: 3,
      supportSources: 8,
    };
    for (const height of [0, 90, 180, 320]) {
      const lanes = fitLanes({ width: 720, height }, 88, content);
      expect(lanes.support).toBe(lanes.digimon);
      expect(fitLanes({ width: 720, height }, 88, { ...content, supportCount: 0 })).toEqual(lanes);
    }
  });

  it("shrinks a crowded lane to fit the row before it scrolls, down to a floor", () => {
    const upright = { suspended: false, sources: 0, links: 0, copies: 1 };
    const suspended = { ...upright, suspended: true };
    const crowded = { digimon: [...Array(5).fill(upright), ...Array(4).fill(suspended)], support: [upright] };
    const lanes = { placement: LanePlacement.Stacked, digimon: 87, support: 87 };
    const content = { digimonCount: 9, supportCount: 1, supportScale: 1, sourceStep: 2, fitWidth: true };
    const fitted = fitLanesToWidth(lanes, 1260, crowded, content);
    expect(fitted.digimon).toBeLessThan(87);
    expect(fitted.digimon).toBe(fitted.support);
    expect(laneContentWidth(crowded.digimon, fitted.digimon, 0.25, 2)).toBeLessThanOrEqual(1260);
    expect(fitLanesToWidth(lanes, 400, crowded, content).digimon).toBe(66);
    expect(fitLanesToWidth(lanes, 1260, crowded, { ...content, fitWidth: false })).toBe(lanes);
  });
  it("gives an upright card the same lane width as a turned card on a wide row", () => {
    const upright = { suspended: false, sources: 0, links: 0, copies: 1 };
    const turned = { ...upright, suspended: true };
    expect(laneContentWidth([upright, upright], 100, 0.25, 4)).toBe(laneContentWidth([turned, upright], 100, 0.25, 4));
    expect(laneContentWidth([upright, upright], 56, 0.25, 4, true)).toBeLessThan(
      laneContentWidth([turned, upright], 56, 0.25, 4, true),
    );
  });
  it("sizes a sideline row the same before and after its first Tamer", () => {
    const sideline = { supportScale: 1, reserveSupport: true, overlapLanes: true };
    const row = { width: 1257, height: 323 };
    const empty = fitLanes(row, 100, { digimonCount: 1, supportCount: 0, ...sideline });
    const withTamer = fitLanes(row, 100, { digimonCount: 1, supportCount: 1, ...sideline });
    expect(withTamer).toEqual(empty);
    expect(withTamer).toMatchObject({ placement: LanePlacement.Stacked, support: withTamer.digimon });
  });
  it("gains width when stacked lanes share their clearance", () => {
    const row = { width: 1257, height: 323 };
    const content = { digimonCount: 1, supportCount: 1, supportScale: 1 };
    const separate = fitLanes(row, 100, content);
    const shared = fitLanes(row, 100, { ...content, overlapLanes: true });
    expect(shared.digimon).toBeGreaterThan(separate.digimon);
  });
  it("keeps portrait support below Digimon when both lanes fit", () => {
    const lanes = fitLanes({ width: 288, height: 320 }, 84, {
      ...crowded,
      digimonSources: 12,
      digimonLinks: 2,
      supportSources: 8,
      sourceTop: 2,
      sourceStep: 1.25,
      preferStacked: true,
    });
    expect(lanes.placement).toBe(LanePlacement.Stacked);
    expect(lanes.digimon).toBeGreaterThanOrEqual(72);
    expect(lanes.support).toBe(52);
  });
  it("puts a landscape phone's two lanes side by side when stacking would shrink Digimon past the touch target", () => {
    const lanes = fitLanes({ width: 462, height: 103 }, 58, {
      digimonCount: 2,
      supportCount: 1,
      supportScale: 1,
      reserveSupport: true,
      twoRows: true,
    });
    expect(lanes.placement).toBe(LanePlacement.SideBySide);
    expect(lanes.digimon).toBeGreaterThanOrEqual(44);
  });

  it("stacks a portrait phone's support lane under its Digimon while the cards keep the touch target", () => {
    const lanes = fitLanes({ width: 380, height: 220 }, 88, {
      digimonCount: 2,
      supportCount: 1,
      supportScale: 1,
      reserveSupport: true,
      preferStacked: true,
      overlapLanes: true,
    });
    expect(lanes.placement).toBe(LanePlacement.Stacked);
    expect(lanes.digimon).toBeGreaterThanOrEqual(44);
    expect(lanes.support).toBe(lanes.digimon);
  });

  it("keeps a short portrait row in two lanes side by side", () => {
    const lanes = fitLanes({ width: 288, height: 116 }, 76, {
      ...crowded,
      digimonSources: 12,
      digimonLinks: 2,
      supportSources: 8,
      preferStacked: true,
      sourceTop: 2,
      sourceStep: 1.25,
    });
    expect(lanes.placement).toBe(LanePlacement.SideBySide);
    expect(lanes.digimon).toBeGreaterThanOrEqual(40);
  });
  it("fits five upright portrait cards across a 360 px phone row without edge spacers", () => {
    const upright = { suspended: false, sources: 0, links: 0, copies: 1 };
    const fiveCards = Array.from({ length: 5 }, () => upright);
    expect(laneContentWidth(fiveCards, 56, 0.25, 4, true)).toBe(5 * 56 + 4 * 8 + 2 * 4);
    expect(laneContentWidth(fiveCards, 56, 0.25, 4, true)).toBeLessThanOrEqual(328);
    expect(laneContentWidth([{ ...upright, sources: 3 }], 56, 0.25, 4, true)).toBeGreaterThan(56 + 2 * 4);
  });
  it("pages merged Digimon and support together when height already requires smaller cards", () => {
    const upright = { suspended: false, sources: 0, links: 0, copies: 1 };
    const cards = { digimon: [upright, upright, upright, upright], support: [upright] };
    const lanes = { placement: LanePlacement.Merged, digimon: 60, support: 60 };
    const content = { digimonCount: 4, supportCount: 1, supportScale: 1, preferStacked: true, fitWidth: true };
    const fitted = fitLanesToWidth(lanes, 300, cards, content);
    expect(fitted.digimon).toBe(60);
    expect(fitted.support).toBe(fitted.digimon);
    expect(laneContentWidth([...cards.digimon, ...cards.support], fitted.digimon, 0.25, 4, true)).toBeGreaterThan(300);
  });
  it("keeps the layout's width when a single lane has enough height", () => {
    expect(fitLanes({ width: 900, height: 220 }, 116, { digimonCount: 6, supportCount: 0 })).toMatchObject({
      placement: LanePlacement.Stacked,
      digimon: 116,
    });
  });

  it("stacks the lanes when the row is tall enough", () => {
    const lanes = fitLanes({ width: 1300, height: 260 }, 116, crowded);
    expect(lanes.placement).toBe(LanePlacement.Stacked);
    expect(lanes.digimon).toBeLessThanOrEqual(116);
    expect(lanes.digimon * 1.4 + lanes.support * 1.4).toBeLessThanOrEqual(245);
  });

  it("never grows a card past the layout's width", () => {
    expect(fitLanes({ width: 800, height: 900 }, 88, crowded)).toMatchObject({ digimon: 88 });
  });

  it("puts the lanes side by side on a row too short to stack them", () => {
    const lanes = fitLanes({ width: 380, height: 64 }, 58, crowded);
    expect(lanes.placement).toBe(LanePlacement.SideBySide);
    expect(lanes.digimon * 1.4).toBeLessThanOrEqual(64);
  });

  it("keeps the same lanes and card sizes when copies split or merge", () => {
    const lanes = fitLanes({ width: 1600, height: 220 }, 84, { digimonCount: 3, supportCount: 2 });
    expect(lanes.placement).toBe(LanePlacement.Stacked);
    expect(lanes).toEqual(fitLanes({ width: 1600, height: 220 }, 84, crowded));
  });

  it("stays stacked when side by side would push cards out of sight", () => {
    expect(fitLanes({ width: 778, height: 220 }, 84, crowded).placement).toBe(LanePlacement.Stacked);
  });

  it("fits the rotating artwork's diagonal in a short single lane", () => {
    const height = 90;
    const { support } = fitLanes({ width: 900, height }, 116, { digimonCount: 0, supportCount: 3 });
    const artworkHeight = Math.ceil(support * 1.4);
    const frameHeight = Math.max(44, artworkHeight);
    const swing = Math.ceil((Math.hypot(support, artworkHeight) - frameHeight) / 2);
    expect(frameHeight + 22 + Math.max(4, swing + 4)).toBeLessThanOrEqual(height);
  });

  it("reserves the Yoshino source fan and badges in both stacked lanes", () => {
    const lanes = fitLanes({ width: 900, height: 270 }, 116, {
      ...crowded,
      digimonSources: 3,
      supportSources: 4,
      sourceTop: 6,
      sourceStep: 4,
    });
    expect(lanes.placement).toBe(LanePlacement.Stacked);
    expect(Math.ceil(lanes.digimon * 1.4) + Math.ceil(lanes.support * 1.4) + 22 + 24 + 22 + 28).toBeLessThanOrEqual(
      270,
    );
  });

  it("fits a short row even when it contains only Digimon", () => {
    const lanes = fitLanes({ width: 900, height: 90 }, 116, { digimonCount: 3, supportCount: 0, digimonSources: 6 });
    const fan = 6 + 5 * Math.min(4, sourceFanStepLimit(lanes.digimon, 6));
    expect(lanes.digimon * 1.4 + 22 + fan + 4).toBeLessThanOrEqual(90);
  });

  it("keeps deep sources visible without reducing the card to a one-pixel placeholder", () => {
    const height = 77;
    const lanes = fitLanes({ width: 900, height }, 58, { ...crowded, digimonSources: 12, supportSources: 8 });
    expect(lanes.placement).toBe(LanePlacement.SideBySide);
    expect(lanes.digimon).toBeGreaterThanOrEqual(22);
    const fan = 6 + 11 * Math.min(4, sourceFanStepLimit(lanes.digimon, 12));
    expect(Math.max(44, lanes.digimon * 1.4 + fan) + 22 + 4).toBeLessThanOrEqual(height);
  });

  it("reserves both linked cards below Vulcanusmon in a short single lane", () => {
    const lanes = fitLanes({ width: 900, height: 90 }, 116, {
      digimonCount: 1,
      supportCount: 0,
      digimonLinks: 2,
    });
    const paintedBottom = Math.max(
      lanes.digimon * 1.4,
      ...linkCardSlots(2, lanes.digimon).map((slot) => slot.top + slot.height),
    );
    expect(paintedBottom + 22 + 4).toBeLessThanOrEqual(90);
  });
});
