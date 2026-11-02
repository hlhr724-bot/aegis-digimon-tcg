import type { DeckGuideBlock } from "#shared/decks/guide/DeckGuideNode";
import { parseDeckGuideInline } from "#shared/decks/guide/parseDeckGuideInline";

type Params = { guide: string };

export function parseDeckGuide({ guide }: Params): DeckGuideBlock[] {
  const blocks: DeckGuideBlock[] = [];
  let paragraph: string[] = [];
  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", children: parseDeckGuideInline({ text: paragraph.join(" ") }) });
      paragraph = [];
    }
  }
  let list: Extract<DeckGuideBlock, { kind: "list" }> | undefined;
  for (const line of guide.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^[-*] /.test(line)) {
      flushParagraph();
      if (!list) {
        list = { kind: "list", items: [] };
        blocks.push(list);
      }
      list.items.push(parseDeckGuideInline({ text: line.slice(2) }));
      continue;
    }
    list = undefined;
    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ kind: "heading", children: parseDeckGuideInline({ text: line.slice(3) }) });
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}
