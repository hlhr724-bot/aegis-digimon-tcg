import copy
import math
from collections import Counter
from typing import Any


class PanelArchetypeClassifier:
    def __init__(self, references: list[dict[str, Any]]) -> None:
        if not references:
            raise ValueError("Archetype classification needs reference decks")
        self.references = [
            {
                "deckId": row["deckId"],
                "archetype": row["archetype"],
                "counts": Counter(row["mainDeck"]),
            }
            for row in references
        ]
        families: dict[str, set[str]] = {}
        for reference in self.references:
            families.setdefault(reference["archetype"], set()).update(reference["counts"])
        frequency = Counter(card for cards in families.values() for card in cards)
        self.weights = {
            card: 1 + math.log((len(families) + 1) / (count + 1))
            for card, count in frequency.items()
        }
        self.unseen_weight = 1 + math.log(len(families) + 1)
        self.cache: dict[tuple[tuple[str, int], ...], dict[str, Any]] = {}

    def classify(self, deck: dict[str, Any]) -> dict[str, Any]:
        counts = Counter(deck["mainDeck"])
        signature = tuple(sorted(counts.items()))
        if signature in self.cache:
            return copy.deepcopy(self.cache[signature])
        best_by_family = {}
        for reference in self.references:
            target = reference["counts"]
            cards = counts.keys() | target.keys()
            overlap = sum(
                self.weights.get(card, self.unseen_weight) * min(counts[card], target[card])
                for card in cards
            )
            union = sum(
                self.weights.get(card, self.unseen_weight) * max(counts[card], target[card])
                for card in cards
            )
            score = overlap / union if union else 0.0
            candidate = {
                "archetype": reference["archetype"],
                "score": score,
                "sharedCopies": sum(min(counts[card], target[card]) for card in cards),
                "referenceDeckId": reference["deckId"],
            }
            current = best_by_family.get(reference["archetype"])
            if current is None or score > current["score"]:
                best_by_family[reference["archetype"]] = candidate
        ordered = sorted(
            best_by_family.values(),
            key=lambda candidate: (-candidate["score"], candidate["archetype"]),
        )
        first = ordered[0]
        margin = first["score"] - (ordered[1]["score"] if len(ordered) > 1 else 0)
        confident = first["score"] >= 0.45 and first["sharedCopies"] >= 16 and margin >= 0.05
        result = {
            "archetype": first["archetype"] if confident else "Unclassified",
            "score": round(first["score"], 6),
            "margin": round(margin, 6),
            "sharedCopies": first["sharedCopies"],
            "referenceDeckId": first["referenceDeckId"],
            "alternatives": [
                {"archetype": candidate["archetype"], "score": round(candidate["score"], 6)}
                for candidate in ordered[:3]
            ],
        }
        self.cache[signature] = result
        return copy.deepcopy(result)
