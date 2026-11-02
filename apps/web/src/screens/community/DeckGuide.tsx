import type { DeckGuideInline } from "@aegis/shared/decks/guide/DeckGuideNode";
import { parseDeckGuide } from "@aegis/shared/decks/guide/parseDeckGuide";
import { DeckGuideCardChip } from "@/screens/community/DeckGuideCardChip";

type Props = { guide: string };

function renderInline(nodes: DeckGuideInline[]) {
  return nodes.map((node, index) => {
    if (node.kind === "card") {
      return <DeckGuideCardChip key={index} cardId={node.cardId} />;
    }
    if (node.kind === "bold") {
      return <strong key={index}>{renderInline(node.children)}</strong>;
    }
    return node.text;
  });
}

export function DeckGuide({ guide }: Props) {
  return (
    <div className="community-guide__body">
      {parseDeckGuide({ guide }).map((block, index) => {
        if (block.kind === "heading") {
          return <h3 key={index}>{renderInline(block.children)}</h3>;
        }
        if (block.kind === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInline(block.children)}</p>;
      })}
    </div>
  );
}
