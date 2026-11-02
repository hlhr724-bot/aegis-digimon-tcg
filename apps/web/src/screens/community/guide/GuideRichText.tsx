import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Bold, Heading, List, CornerDownLeft } from "lucide-react";
import ListItem from "@tiptap/extension-list-item";
import StarterKit from "@tiptap/starter-kit";
import { buildGuideEditorContent } from "@/screens/community/guide/buildGuideEditorContent";
import { serializeGuideEditorContent } from "@/screens/community/guide/serializeGuideEditorContent";
import { findGuideCardSuggestions } from "@/screens/community/guide/findGuideCardSuggestions";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { initialGuide: string | null; disabled: boolean; onChange: (guide: string) => void };
type Suggestions = ReturnType<typeof findGuideCardSuggestions>;

export function GuideRichText({ initialGuide, disabled, onChange }: Props) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<Suggestions>(null);
  const [active, setActive] = useState(0);
  const suggestionRef = useRef<Suggestions>(null);
  const activeRef = useRef(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        italic: false,
        strike: false,
        orderedList: false,
        link: false,
        underline: false,
        hardBreak: false,
        listItem: false,
      }),
      ListItem.extend({ content: "paragraph" }),
    ],
    content: buildGuideEditorContent({ guide: initialGuide }),
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": t("community.guide.label"),
        "aria-autocomplete": "list",
        "aria-controls": listId,
        class: "community-guide__input",
      },
      handleKeyDown(view, event) {
        const current = suggestionRef.current;
        if (!current || event.isComposing) {
          return false;
        }
        if (event.key === "Escape") {
          suggestionRef.current = null;
          setSuggestions(null);
          return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const next =
            (activeRef.current + (event.key === "ArrowDown" ? 1 : -1) + current.cards.length) % current.cards.length;
          activeRef.current = next;
          setActive(next);
          return true;
        }
        if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
          const card = current.cards[activeRef.current];
          if (card) {
            view.dispatch(view.state.tr.insertText(`${card.cardId} `, current.from, current.to));
            return true;
          }
        }
        return false;
      },
    },
    onTransaction({ editor: current }) {
      const next = findGuideCardSuggestions({ editor: current });
      suggestionRef.current = next;
      activeRef.current = 0;
      setSuggestions(next);
      setActive(0);
    },
    onUpdate({ editor: current }) {
      onChange(serializeGuideEditorContent({ document: current.getJSON() }));
    },
    onBlur() {
      suggestionRef.current = null;
      setSuggestions(null);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const element = editor.view.dom;
    if (suggestions && !disabled) {
      element.setAttribute("aria-activedescendant", `${listId}-${active}`);
    } else {
      element.removeAttribute("aria-activedescendant");
    }
  }, [editor, suggestions, active, listId, disabled]);

  if (!editor) {
    return null;
  }
  return (
    <div className="community-guide__rich-text">
      <div className="community-guide__toolbar" role="group" aria-label={t("community.guide.formatting")}>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={editor.isActive("bold")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} aria-hidden="true" />
          <span>{t("community.guide.bold")}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={editor.isActive("heading")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading size={16} aria-hidden="true" />
          <span>{t("community.guide.heading")}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={editor.isActive("bulletList")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} aria-hidden="true" />
          <span>{t("community.guide.bullets")}</span>
        </button>
      </div>
      <EditorContent editor={editor} />
      {suggestions && !disabled ? (
        <ul id={listId} className="community-guide__suggestions" role="listbox" aria-label={t("community.guide.cards")}>
          {suggestions.cards.map((card, index) => (
            <li
              key={card.cardId}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertContentAt({ from: suggestions.from, to: suggestions.to }, `${card.cardId} `)
                    .run()
                }
              >
                <span className="community-guide__suggestion-code">{card.cardId}</span>
                <span className="community-guide__suggestion-name">{getCardName(card.cardId)}</span>
                <CornerDownLeft className="community-guide__suggestion-enter" size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
