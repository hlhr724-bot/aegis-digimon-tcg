import type { JSONContent } from "@tiptap/react";
import type { DeckGuideInline } from "@aegis/shared/decks/guide/DeckGuideNode";
import { parseDeckGuide } from "@aegis/shared/decks/guide/parseDeckGuide";

type Params = { guide: string | null };

function buildInline(nodes: DeckGuideInline[], bold = false): JSONContent[] {
  return nodes.flatMap((node): JSONContent[] => {
    if (node.kind === "bold") {
      return buildInline(node.children, true);
    }
    const text = node.kind === "card" ? node.cardId : node.text;
    return text ? [{ type: "text", text, ...(bold ? { marks: [{ type: "bold" }] } : {}) }] : [];
  });
}

export function buildGuideEditorContent({ guide }: Params): JSONContent {
  const content = parseDeckGuide({ guide: guide ?? "" }).map((block): JSONContent => {
    if (block.kind === "list") {
      return {
        type: "bulletList",
        content: block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: buildInline(item) }],
        })),
      };
    }
    return {
      type: block.kind === "heading" ? "heading" : "paragraph",
      ...(block.kind === "heading" ? { attrs: { level: 3 } } : {}),
      content: buildInline(block.children),
    };
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
