import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignRegionalArtIds,
  chineseSourceArts,
  groupArtsByCard,
  hasKoreanCardListItems,
  koreanSourceArts,
  resolveSourceArts,
} from "./lib/regional-card-arts.mjs";

const cards = [
  { cardId: "BT1-010", level: 3, dp: 2000, playCost: 3 },
  { cardId: "EX5-043", level: 4, dp: 5000, playCost: 5 },
  { cardId: "ST1-12", playCost: 2, dp: 0 },
];

function chineseRecord(overrides) {
  return {
    id: 1,
    model: "BT1-010",
    parallCard: "1",
    cardGroup: "BTC-01",
    imageCover: "https://cdn.example/BT1-010.png",
    cardLevel: "Lv.3",
    dp: "2000",
    entryConsumeValue: "3",
    ...overrides,
  };
}

function koreanItem({ image, number, parallel = false, acquisition = "-", level = "Lv.3", dp = "2000", cost = "3" }) {
  return `<li class="image_lists_item data page-1">
    <a class="card_img"><img src="${image}" alt=""></a>
    <ul class="cardinfo_head"><li class="cardno">${number}</li><li class="cardlv">${level}</li>
    ${parallel ? '<li class="cardtype cardParallel">페러렐</li>' : ""}</ul>
    <dl><dt>DP</dt><dd>${dp}</dd></dl><dl><dt>등장 코스트</dt><dd>${cost}</dd></dl>
    <dl><dt>입수 정보</dt><dd> ${acquisition} </dd></dl></li>`;
}

test("reads Chinese printings, treating parallCard 1 as the base and suffixed models as parallels", () => {
  const arts = chineseSourceArts([
    chineseRecord({}),
    chineseRecord({ id: 2, parallCard: "0", cardGroup: "宣传卡" }),
    chineseRecord({ id: 3, model: "BT1-010_TDTS", parallCard: "1" }),
    chineseRecord({ id: 4, model: " BT1-010 ", cardGroup: "迎新特典包2", parallCard: "0" }),
  ]);
  assert.deepEqual(
    arts.map(({ key, cardNumber, parallel, label }) => ({ key, cardNumber, parallel, label })),
    [
      { key: "cn:1", cardNumber: "BT1-010", parallel: false, label: "BTC-01 (Chinese)" },
      { key: "cn:2", cardNumber: "BT1-010", parallel: true, label: "Promotion card (Chinese)" },
      { key: "cn:3", cardNumber: "BT1-010", parallel: true, label: "BTC-01 (Chinese)" },
      { key: "cn:4", cardNumber: "BT1-010", parallel: true, label: "Welcome Bonus Pack 2 (Chinese)" },
    ],
  );
  assert.deepEqual([arts[0].level, arts[0].dp, arts[0].playCost], [3, 2000, 3]);
});

test("reads Korean list items with their parallel flag, acquisition label, and absolute image url", () => {
  const html = [
    koreanItem({ image: "/files/attach/images/139/598/049/a.png", number: "BT1-010" }),
    koreanItem({
      image: "/files/attach/images/139/599/049/b.png",
      number: "BT1-010",
      parallel: true,
      acquisition: '<a href="x">&rtri;부스터 팩 [BTK-1.0]</a>',
    }),
    koreanItem({ image: "/files/attach/c.png", number: "EX5-43P", level: "Lv.4", dp: "5000", cost: "5" }),
  ].join("");
  assert.equal(hasKoreanCardListItems(html), true);
  assert.equal(hasKoreanCardListItems("<ul></ul>"), false);
  assert.deepEqual(
    koreanSourceArts(html).map(({ key, order, cardNumber, parallel, url, label }) => ({
      key,
      order,
      cardNumber,
      parallel,
      url,
      label,
    })),
    [
      {
        key: "kr:/files/attach/images/139/598/049/a.png",
        order: 49598,
        cardNumber: "BT1-010",
        parallel: false,
        url: "https://digimoncard.co.kr/files/attach/images/139/598/049/a.png",
        label: "Parallel (Korean)",
      },
      {
        key: "kr:/files/attach/images/139/599/049/b.png",
        order: 49599,
        cardNumber: "BT1-010",
        parallel: true,
        url: "https://digimoncard.co.kr/files/attach/images/139/599/049/b.png",
        label: "BTK-1.0 (Korean)",
      },
      {
        key: "kr:/files/attach/c.png",
        order: Number.MAX_SAFE_INTEGER,
        cardNumber: "EX5-43",
        parallel: true,
        url: "https://digimoncard.co.kr/files/attach/c.png",
        label: "Parallel (Korean)",
      },
    ],
  );
});

test("maps unpadded numbers to canonical cards and rejects printings whose stats differ", () => {
  const { resolved, rejected } = resolveSourceArts(
    [
      { key: "kr:a", cardNumber: "EX5-43", level: 4, dp: 5000, playCost: 5 },
      { key: "kr:a", cardNumber: "EX5-43", level: 4, dp: 5000, playCost: 5 },
      { key: "cn:1", cardNumber: "BT1-010", level: 3, dp: 1000, playCost: 3 },
      { key: "cn:2", cardNumber: "ST1-12", dp: undefined, playCost: 2 },
      { key: "cn:3", cardNumber: "BT99-001" },
    ],
    cards,
  );
  assert.deepEqual(
    resolved.map((art) => [art.key, art.cardId]),
    [
      ["kr:a", "EX5-043"],
      ["cn:2", "ST1-12"],
    ],
  );
  assert.deepEqual(
    rejected.map((art) => [art.key, art.cardId]),
    [["cn:1", "BT1-010"]],
  );
});

test("assigns the base and parallel art ids once and keeps them when the source changes", () => {
  const art = (key, order, parallel, url = `https://cdn.example/${key}.png`) => ({
    region: "chinese",
    cardId: "BT1-010",
    key,
    order,
    parallel,
    url,
    label: "BTC-01 (Chinese)",
  });
  const first = assignRegionalArtIds([art("cn:9", 9, true), art("cn:5", 5, false), art("cn:7", 7, true)]);
  assert.deepEqual(first.sources, {
    "BT1-010-C": ["cn:5", "https://cdn.example/cn:5.png"],
    "BT1-010_P1-C": ["cn:7", "https://cdn.example/cn:7.png"],
    "BT1-010_P2-C": ["cn:9", "https://cdn.example/cn:9.png"],
  });
  assert.equal(first.arts.find((entry) => entry.artId === "BT1-010-C").label, "Chinese printing");

  const second = assignRegionalArtIds(
    [art("cn:9", 9, true, "https://cdn.example/moved.png"), art("cn:8", 8, true), art("cn:6", 6, false)],
    first.sources,
  );
  assert.deepEqual(
    second.arts.map((entry) => [entry.key, entry.artId]),
    [
      ["cn:9", "BT1-010_P2-C"],
      ["cn:6", "BT1-010_P3-C"],
      ["cn:8", "BT1-010_P4-C"],
    ],
  );
  assert.deepEqual(second.sources["BT1-010_P1-C"], ["cn:7", "https://cdn.example/cn:7.png"]);
  assert.deepEqual(second.sources["BT1-010_P2-C"], ["cn:9", "https://cdn.example/moved.png"]);
});

test("numbers parallels per card, even when card ids have the same length", () => {
  const art = (cardId, key) => ({ region: "korean", cardId, key, order: 0, parallel: true, url: key, label: "x" });
  const { sources } = assignRegionalArtIds([art("BT1-010", "kr:a"), art("BT1-010", "kr:b"), art("AD1-001", "kr:c")]);
  assert.deepEqual(Object.keys(sources).sort(), ["AD1-001_P1-K", "BT1-010_P1-K", "BT1-010_P2-K"]);
  assert.equal(sources["AD1-001_P1-K"][0], "kr:c");
});

test("lists Korean before Chinese arts, each base before its parallels", () => {
  const entry = (region, artId) => ({ region, cardId: "BT1-010", artId, imageId: artId, label: artId });
  const grouped = groupArtsByCard([
    entry("chinese", "BT1-010_P1-C"),
    entry("korean", "BT1-010_P2-K"),
    entry("chinese", "BT1-010-C"),
    entry("korean", "BT1-010_P10-K"),
    entry("korean", "BT1-010-K"),
  ]);
  assert.deepEqual(
    grouped["BT1-010"].map((art) => art.artId),
    ["BT1-010-K", "BT1-010_P2-K", "BT1-010_P10-K", "BT1-010-C", "BT1-010_P1-C"],
  );
});
