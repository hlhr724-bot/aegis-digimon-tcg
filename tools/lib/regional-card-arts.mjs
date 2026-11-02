export const REGIONS = {
  chinese: { suffix: "-C", printing: "Chinese printing", language: "Chinese" },
  korean: { suffix: "-K", printing: "Korean printing", language: "Korean" },
};

const CHINESE_GROUP_LABELS = new Map([
  ["宣传卡", "Promotion card"],
  ["新世纪纪念包", "New Century Memorial Pack"],
  ["西游主题教学卡组", "Journey to the West Tutorial Deck"],
  ["迎新特典包2", "Welcome Bonus Pack 2"],
]);

const HTML_ENTITIES = new Map([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#039;", "'"],
  ["&rtri;", ""],
]);

function decodeHtml(text) {
  return text.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES.get(entity) ?? entity);
}

function stripTags(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrUndefined(text) {
  const match = String(text ?? "").match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

export function canonicalCardIndex(cards) {
  const byNumber = new Map();
  for (const card of cards) {
    const match = card.cardId.match(/^([A-Z]+\d*)-(\d+)$/);
    if (match) byNumber.set(`${match[1]}-${Number(match[2])}`, card);
  }
  return byNumber;
}

export function findCanonicalCard(index, cardNumber) {
  const match = cardNumber.match(/^([A-Z]+\d*)-0*(\d+)$/);
  return match ? index.get(`${match[1]}-${Number(match[2])}`) : undefined;
}

function parseSourceNumber(raw) {
  const trimmed = String(raw ?? "")
    .trim()
    .toUpperCase();
  const variant = trimmed.match(/^([A-Z]+\d*-\d+)(?:_.+|P)$/);
  if (variant) return { cardNumber: variant[1], forcedParallel: true };
  return { cardNumber: trimmed, forcedParallel: false };
}

function chineseLabel(group) {
  const named = CHINESE_GROUP_LABELS.get(group);
  if (named) return `${named} (Chinese)`;
  return /^[\x20-\x7e]+$/.test(group ?? "") ? `${group} (Chinese)` : "Parallel (Chinese)";
}

export function chineseSourceArts(records) {
  return records.flatMap((record) => {
    const { cardNumber, forcedParallel } = parseSourceNumber(record.model);
    if (!record.imageCover || !cardNumber) return [];
    return [
      {
        region: "chinese",
        key: `cn:${record.id}`,
        order: Number(record.id),
        cardNumber,
        parallel: forcedParallel || record.parallCard !== "1",
        url: record.imageCover,
        label: chineseLabel(record.cardGroup),
        level: numberOrUndefined(record.cardLevel),
        dp: numberOrUndefined(record.dp),
        playCost: numberOrUndefined(record.entryConsumeValue),
      },
    ];
  });
}

function koreanLabel(acquisition) {
  const code = acquisition.match(/[[【]\s*([A-Z]+-[0-9.]+)\s*[\]】]/);
  if (code) return `${code[1]} (Korean)`;
  return /^[\x20-\x7e]+$/.test(acquisition) && acquisition && acquisition !== "-"
    ? `${acquisition} (Korean)`
    : "Parallel (Korean)";
}

function koreanOrder(path) {
  const numbered = path.match(/^\/files\/attach\/images\/\d+\/((?:\d+\/)+)[^/]+$/);
  if (!numbered) return Number.MAX_SAFE_INTEGER;
  return Number(numbered[1].split("/").filter(Boolean).reverse().join(""));
}

function definitionValue(item, term) {
  const match = item.match(new RegExp(`<dt>${term}</dt>\\s*<dd>([\\s\\S]*?)</dd>`));
  return match ? stripTags(match[1]) : undefined;
}

export function koreanSourceArts(html, origin = "https://digimoncard.co.kr") {
  return html
    .split('<li class="image_lists_item')
    .slice(1)
    .flatMap((item) => {
      const image = item.match(/<a class="card_img">\s*<img src="([^"]+)"/);
      const number = item.match(/<li class="cardno">([^<]*)</);
      if (!image || !number) return [];
      const { cardNumber, forcedParallel } = parseSourceNumber(number[1]);
      const level = item.match(/<li class="cardlv">([^<]*)</);
      return [
        {
          region: "korean",
          key: `kr:${image[1]}`,
          order: koreanOrder(image[1]),
          cardNumber,
          parallel: forcedParallel || item.includes("cardParallel"),
          url: new URL(image[1], origin).href,
          label: koreanLabel(definitionValue(item, "입수 정보") ?? ""),
          level: numberOrUndefined(level?.[1]),
          dp: numberOrUndefined(definitionValue(item, "DP")),
          playCost: numberOrUndefined(definitionValue(item, "등장 코스트")),
        },
      ];
    });
}

export function hasKoreanCardListItems(html) {
  return html.includes('<li class="image_lists_item');
}

function sameWhenKnown(source, canonical) {
  return source === undefined || canonical === undefined || source === canonical;
}

export function matchesCardDefinition(art, card) {
  return (
    sameWhenKnown(art.level, card.level) &&
    sameWhenKnown(art.dp, card.dp || undefined) &&
    sameWhenKnown(art.playCost, card.playCost >= 0 ? card.playCost : undefined)
  );
}

export function resolveSourceArts(sourceArts, cards) {
  const index = canonicalCardIndex(cards);
  const resolved = [];
  const rejected = [];
  const seen = new Set();
  for (const art of sourceArts) {
    if (seen.has(art.key)) continue;
    seen.add(art.key);
    const card = findCanonicalCard(index, art.cardNumber);
    if (!card) continue;
    if (!matchesCardDefinition(art, card)) {
      rejected.push({ ...art, cardId: card.cardId });
      continue;
    }
    resolved.push({ ...art, cardId: card.cardId });
  }
  return { resolved, rejected };
}

function parallelNumber(cardId, artId, suffix) {
  if (!artId.startsWith(cardId)) return undefined;
  const match = artId.slice(cardId.length).match(new RegExp(`^_P(\\d+)${suffix}$`));
  return match ? Number(match[1]) : undefined;
}

export function assignRegionalArtIds(resolvedArts, previousSources = {}) {
  const sources = { ...previousSources };
  const artIdByKey = new Map(Object.entries(previousSources).map(([artId, [key]]) => [key, artId]));
  const groups = new Map();
  for (const art of resolvedArts) {
    const group = `${art.cardId}\u0000${art.region}`;
    groups.set(group, [...(groups.get(group) ?? []), art]);
  }
  const assigned = [];
  for (const arts of groups.values()) {
    const { cardId, region } = arts[0];
    const { suffix } = REGIONS[region];
    const baseId = `${cardId}${suffix}`;
    const reserved = Object.keys(sources).filter((artId) => artId === baseId || parallelNumber(cardId, artId, suffix));
    let nextParallel = Math.max(0, ...reserved.map((artId) => parallelNumber(cardId, artId, suffix) ?? 0)) + 1;
    const ordered = [...arts].sort(
      (a, b) => a.parallel - b.parallel || a.order - b.order || a.key.localeCompare(b.key),
    );
    for (const art of ordered) {
      let artId = artIdByKey.get(art.key);
      if (!artId) {
        if (!art.parallel && !Object.hasOwn(sources, baseId)) {
          artId = baseId;
        } else {
          artId = `${cardId}_P${nextParallel}${suffix}`;
          nextParallel += 1;
        }
        artIdByKey.set(art.key, artId);
      }
      sources[artId] = [art.key, art.url];
      assigned.push({
        ...art,
        artId,
        imageId: artId,
        label: artId === baseId ? REGIONS[region].printing : art.label,
      });
    }
  }
  return {
    arts: assigned.sort((a, b) => a.artId.localeCompare(b.artId, "en", { numeric: true })),
    sources,
  };
}

const PICKER_REGION_ORDER = ["korean", "chinese"];

function pickerOrder(a, b) {
  return (
    PICKER_REGION_ORDER.indexOf(a.region) - PICKER_REGION_ORDER.indexOf(b.region) ||
    Number(a.artId.includes("_P")) - Number(b.artId.includes("_P")) ||
    a.artId.localeCompare(b.artId, "en", { numeric: true })
  );
}

export function groupArtsByCard(arts) {
  const byCard = {};
  for (const art of [...arts].sort(pickerOrder)) {
    byCard[art.cardId] = [...(byCard[art.cardId] ?? []), { artId: art.artId, imageId: art.imageId, label: art.label }];
  }
  return byCard;
}
