from PanelArchetypeClassifier import PanelArchetypeClassifier


def _references() -> list[dict]:
    staples = [f"staple-{index}" for index in range(20)]
    return [
        {
            "deckId": f"reference-{name}",
            "archetype": name,
            "mainDeck": [f"{name}-{index}" for index in range(30)] + staples,
        }
        for name in ("A", "B")
    ]


def test_exact_and_nearby_variants_use_archetype_specific_cards() -> None:
    references = _references()
    classifier = PanelArchetypeClassifier(references)
    assert classifier.classify(references[0])["archetype"] == "A"
    variant = {"mainDeck": references[0]["mainDeck"][2:] + ["novel-a", "novel-b"]}
    assert classifier.classify(variant)["archetype"] == "A"
    assert classifier.classify(variant)["sharedCopies"] == 48


def test_staples_and_ambiguous_mixed_decks_do_not_receive_confident_labels() -> None:
    references = _references()
    classifier = PanelArchetypeClassifier(references)
    staples = references[0]["mainDeck"][30:]
    assert classifier.classify({"mainDeck": staples})["archetype"] == "Unclassified"
    mixed = {"mainDeck": references[0]["mainDeck"][:15] + references[1]["mainDeck"][:15] + staples}
    assert classifier.classify(mixed)["archetype"] == "Unclassified"
    assert classifier.classify(mixed)["margin"] == 0


def test_multiple_references_for_one_family_do_not_make_the_runner_up_ambiguous() -> None:
    references = _references()
    references.append({**references[0], "deckId": "another-A"})
    assert PanelArchetypeClassifier(references).classify(references[0])["archetype"] == "A"


def test_multiset_order_and_cached_return_mutation_do_not_change_classification() -> None:
    references = _references()
    classifier = PanelArchetypeClassifier(references)
    first = classifier.classify(references[0])
    first["archetype"] = "changed"
    first["alternatives"][0]["archetype"] = "changed"
    reversed_deck = {"mainDeck": list(reversed(references[0]["mainDeck"]))}
    result = classifier.classify(reversed_deck)
    assert result["archetype"] == "A"
    assert result["alternatives"][0]["archetype"] == "A"
