import type { JSONContent } from "@tiptap/react";

type Params = { document: JSONContent };

function serializeInline(node: JSONContent): string {
  if (node.type === "text") {
    const text = (node.text ?? "").normalize("NFKC").replace(/[\\*]/g, "\\$&");
    return node.marks?.some((mark) => mark.type === "bold") ? `**${text}**` : text;
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  return (node.content ?? []).map(serializeInline).join("");
}

function serializeBlock(node: JSONContent): string {
  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item) => (item.content ?? []).map(serializeInline).join(" "))
      .filter((text) => text.trim().length > 0)
      .map((text) => `- ${text}`)
      .join("\n");
  }
  const text = serializeInline(node);
  if (!text.trim()) {
    return "";
  }
  return node.type === "heading" ? `## ${text}` : text.replace(/^(?=## |[-*] )/, "\\");
}

export function serializeGuideEditorContent({ document }: Params): string {
  return (document.content ?? []).map(serializeBlock).join("\n\n");
}
