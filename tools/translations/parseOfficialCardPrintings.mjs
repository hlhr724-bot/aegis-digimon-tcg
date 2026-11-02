const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function readText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity) => {
      if (entity.startsWith("#")) {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return String.fromCodePoint(code);
      }
      return entities[entity.toLowerCase()] ?? original;
    })
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function parseOfficialCardPrintings({ html, language, source }) {
  const japanese = language === "ja";
  return html
    .split(/<li class="image_lists_item[^>]*>/)
    .slice(1)
    .flatMap((item) => {
      const clean = item.replace(/<!--[\s\S]*?-->/g, "");
      const cardId = readText(clean.match(/<li class="card[Nn]o">([\s\S]*?)<\/li>/)?.[1] ?? "");
      if (!/^[A-Z]+\d*-\d+$/.test(cardId)) {
        return [];
      }
      const fields = {};
      for (const match of clean.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)) {
        const label = readText(match[1]);
        const text = readText(match[2]);
        if (text && text !== "-") {
          fields[label] = text;
        }
      }
      const rawName = readText(clean.match(/<div class="(?:cardTitle|card_name)">([\s\S]*?)<\/div>/)?.[1] ?? "");
      const name = japanese ? rawName : rawName.replace(/^[A-Z]+\d*-\d+[A-Z]*\s*/, "");
      const main = japanese
        ? [fields["[特殊進化]"], fields["[特殊登場]"], fields["[効果]"], fields["[特別ルール]"]]
            .filter(Boolean)
            .join("\n\n")
        : fields["상단 텍스트"];
      return [
        {
          cardId,
          name,
          source,
          parallel: /parallel_icon|cardParallel/.test(clean),
          main,
          inherited: fields["[進化元効果]"],
          security: fields["[セキュリティ効果]"],
          option: fields["[デュアル効果]"],
          link: fields["[リンク中効果]"],
          bottom: fields["하단 텍스트"],
          forms: fields[japanese ? "形態" : "형태"],
          attributes: fields[japanese ? "属性" : "속성"],
          traits: fields[japanese ? "タイプ" : "유형"],
        },
      ];
    });
}
