import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { findGuideCardSuggestions } from "@/screens/community/guide/findGuideCardSuggestions";

describe("card autocomplete", () => {
  it.each(["BT1-009", "bt1-009", "Play (BT1-009"])("recognizes a code at the caret: %s", (text) => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    });
    editor.commands.setTextSelection(text.length + 1);
    const suggestion = findGuideCardSuggestions({ editor });
    expect(suggestion?.cards[0]).toMatchObject({ cardId: "BT1-009", nameEn: "Monodramon" });
    expect(suggestion?.to).toBe(text.length + 1);
    expect(suggestion?.from).toBe(text.length + 1 - 7);
    editor.destroy();
  });
  it.each(["BT99-999", "BT1-009 ", "plain text"])("does not suggest for %s", (text) => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    });
    editor.commands.setTextSelection(text.length + 1);
    expect(findGuideCardSuggestions({ editor })).toBeNull();
    editor.destroy();
  });
});
