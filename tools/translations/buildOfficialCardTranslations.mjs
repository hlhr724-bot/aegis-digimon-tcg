import { normalizePrintedTextKey } from "../../apps/web/src/i18n/normalizePrintedTextKey.ts";
import { canonicalCardIndex, findCanonicalCard } from "../lib/regional-card-arts.mjs";

const effectFields = ["effectText", "inheritedEffectText", "securityEffectText", "optionEffect", "linkEffect"];

export function buildOfficialCardTranslations({ cards, printings, language }) {
  const index = canonicalCardIndex(cards);
  const candidates = new Map();
  for (const printing of printings) {
    const card = findCanonicalCard(index, printing.cardId);
    if (!card) {
      continue;
    }
    const list = candidates.get(card.cardId) ?? [];
    list.push(printing);
    candidates.set(card.cardId, list);
  }
  const textCandidates = new Map();
  const nameCandidates = new Map();
  const metaCandidates = { forms: new Map(), attributes: new Map(), traits: new Map() };
  const byCard = {};
  const provenance = {};
  const missing = [];
  const conflicts = [];
  function collect(map, key, value) {
    if (!key || !value) {
      return;
    }
    const values = map.get(key) ?? new Set();
    values.add(value);
    map.set(key, values);
  }
  for (const card of cards) {
    const list = candidates.get(card.cardId) ?? [];
    const originals = list.filter((printing) => !printing.parallel);
    const considered = originals.length ? originals : list;
    const record = {};
    for (const printing of considered) {
      collect(nameCandidates, card.nameEn, printing.name);
      for (const [field, group] of [
        ["forms", "forms"],
        ["attributes", "attributes"],
        ["types", "traits"],
      ]) {
        if (card[field]?.length === 1 && printing[group] && !/[／/,]/.test(printing[group])) {
          collect(metaCandidates[group], card[field][0], printing[group]);
        }
      }
    }
    for (const field of effectFields) {
      const sourceText = card[field];
      if (!sourceText) {
        continue;
      }
      const key = normalizePrintedTextKey(sourceText);
      const values = new Map();
      for (const printing of considered) {
        let target =
          printing[
            {
              effectText: "main",
              inheritedEffectText: "inherited",
              securityEffectText: "security",
              optionEffect: "option",
              linkEffect: "link",
            }[field]
          ];
        if (language === "ko") {
          if (card.optionEffect) {
            target = undefined;
          } else if (field !== "effectText") {
            const lowerFields = effectFields.slice(1).filter((name) => card[name]);
            target = lowerFields.length === 1 ? printing.bottom : undefined;
          }
        }
        if (target) {
          values.set(normalizePrintedTextKey(target), { text: target, source: printing.source });
        }
      }
      if (values.size !== 1) {
        missing.push({
          cardId: card.cardId,
          field,
          reason: values.size ? "conflicting-printings" : "unavailable-source-field",
        });
        if (values.size > 1) {
          conflicts.push({ cardId: card.cardId, field });
        }
        continue;
      }
      const translated = [...values.values()][0];
      if (record[key] && record[key] !== translated.text) {
        throw new Error(`Conflicting fields on ${card.cardId}`);
      }
      record[key] = translated.text;
      collect(textCandidates, key, translated.text);
      (provenance[card.cardId] ??= {})[field] = translated.source;
    }
    if (Object.keys(record).length) {
      byCard[card.cardId] = record;
    }
  }
  function unambiguous(map) {
    return Object.fromEntries(
      [...map]
        .filter(([, values]) => values.size === 1)
        .map(([key, values]) => [key, [...values][0]])
        .sort(([a], [b]) => a.localeCompare(b, "en")),
    );
  }
  return {
    names: unambiguous(nameCandidates),
    text: unambiguous(textCandidates),
    byCard,
    meta: Object.fromEntries(Object.entries(metaCandidates).map(([group, values]) => [group, unambiguous(values)])),
    report: {
      language,
      catalogCards: cards.length,
      sourceCards: candidates.size,
      translatedCards: Object.keys(byCard).length,
      translatedFields: Object.values(provenance).reduce((sum, fields) => sum + Object.keys(fields).length, 0),
      missing,
      conflicts,
      provenance,
    },
  };
}
