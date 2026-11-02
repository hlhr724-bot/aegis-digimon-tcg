import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";
import { buildGuideEditorContent } from "@/screens/community/guide/buildGuideEditorContent";
import { serializeGuideEditorContent } from "@/screens/community/guide/serializeGuideEditorContent";

describe("rich text guide storage", () => {
  it.each([
    "**literal**",
    "## literal heading",
    "- literal list",
    "* literal list",
    "a\\b",
    "BT1-009",
    "**bold marker** inside",
  ])("preserves literal text %s with and without bold", (text) => {
    for (const marks of [undefined, [{ type: "bold" }]]) {
      const document: JSONContent = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] }],
      };
      expect(buildGuideEditorContent({ guide: serializeGuideEditorContent({ document }) })).toEqual(document);
    }
  });

  it("preserves supported formatting across edits", () => {
    const guide = "## Opening\n\nPlay **BT1-009** now\n\n- First\n- **Second**";
    const document = buildGuideEditorContent({ guide });
    expect(buildGuideEditorContent({ guide: serializeGuideEditorContent({ document }) })).toEqual(document);
  });
});

it("clears empty formatted blocks without leaving markup characters", () => {
  expect(
    serializeGuideEditorContent({
      document: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 3 } },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
        ],
      },
    }).trim(),
  ).toBe("");
});

it("normalizes full-width markup characters before escaping literal text", () => {
  const document: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "＊＊literal＊＊" }] }],
  };
  expect(buildGuideEditorContent({ guide: serializeGuideEditorContent({ document }) })).toEqual({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "**literal**" }] }],
  });
});
