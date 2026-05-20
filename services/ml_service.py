import re
from difflib import SequenceMatcher
from hashlib import sha256

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline


def normalize_text(text):
    """Normalize text so saved suggestion buttons can match intent patterns exactly."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def tokenize_text(text):
    normalized = normalize_text(text)
    return [token for token in normalized.split() if token]


def build_pattern_record(pattern_text):
    normalized = normalize_text(pattern_text)
    return {
        "pattern": pattern_text,
        "normalized": normalized,
        "tokens": set(tokenize_text(pattern_text)),
    }


def choose_response(responses, message, fallback_text="I found a matching intent."):
    """Return a stable response so the same query does not feel random between refreshes."""
    if not responses:
        return fallback_text

    digest = sha256(normalize_text(message).encode("utf-8")).hexdigest()
    selected_index = int(digest[:8], 16) % len(responses)
    return responses[selected_index]


def compute_pattern_score(message_tokens, normalized_message, pattern_record):
    """Score how closely a message matches one training pattern."""
    pattern_tokens = pattern_record["tokens"]
    if not pattern_tokens:
        token_overlap = 0.0
    else:
        token_overlap = len(message_tokens & pattern_tokens) / len(message_tokens | pattern_tokens)

    sequence_similarity = SequenceMatcher(
        None,
        normalized_message,
        pattern_record["normalized"],
    ).ratio()

    return (token_overlap * 0.55) + (sequence_similarity * 0.45)


def build_intent_pattern_scores(intent_patterns, message):
    """Return the best heuristic score and best matching pattern per intent."""
    normalized_message = normalize_text(message)
    message_tokens = set(tokenize_text(message))
    intent_scores = {}

    for tag, pattern_records in intent_patterns.items():
        best_score = 0.0
        best_pattern = ""

        for pattern_record in pattern_records:
            score = compute_pattern_score(message_tokens, normalized_message, pattern_record)
            if score > best_score:
                best_score = score
                best_pattern = pattern_record["pattern"]

        intent_scores[tag] = {
            "score": best_score,
            "matched_pattern": best_pattern,
        }

    return intent_scores


def train_models(hardware_data):
    """Train one hybrid classifier per hardware with exact and fuzzy fallbacks."""
    models = {}

    for hardware_id, hardware_item in hardware_data.items():
        texts = []
        labels = []
        responses = {}
        exact_patterns = {}
        intent_patterns = {}

        for intent in hardware_item["intents"]:
            tag = intent["tag"]
            responses[tag] = intent.get("responses", [])
            intent_patterns[tag] = []

            for pattern in intent.get("patterns", []):
                normalized_pattern = normalize_text(pattern)
                texts.append(normalized_pattern)
                labels.append(tag)
                exact_patterns[normalized_pattern] = tag
                intent_patterns[tag].append(build_pattern_record(pattern))

        classifier = None
        unique_labels = set(labels)
        if len(unique_labels) >= 2:
            classifier = Pipeline(
                [
                    (
                        "features",
                        FeatureUnion(
                            [
                                (
                                    "word_tfidf",
                                    TfidfVectorizer(
                                        analyzer="word",
                                        ngram_range=(1, 2),
                                        sublinear_tf=True,
                                    ),
                                ),
                                (
                                    "char_tfidf",
                                    TfidfVectorizer(
                                        analyzer="char_wb",
                                        ngram_range=(3, 5),
                                        sublinear_tf=True,
                                    ),
                                ),
                            ]
                        ),
                    ),
                    (
                        "classifier",
                        LogisticRegression(
                            max_iter=2000,
                            class_weight="balanced",
                            solver="lbfgs",
                        ),
                    ),
                ]
            )
            classifier.fit(texts, labels)

        models[hardware_id] = {
            "model": classifier,
            "responses": responses,
            "exact_patterns": exact_patterns,
            "intent_patterns": intent_patterns,
        }

    return models


def predict_intent(model_bundle, message):
    """Predict the top intent and return its confidence score."""
    normalized_message = normalize_text(message)
    if not model_bundle or not normalized_message:
        return None

    exact_tag = model_bundle.get("exact_patterns", {}).get(normalized_message)
    if exact_tag:
        responses = model_bundle["responses"].get(exact_tag, [])
        response_text = choose_response(responses, message)
        return {
            "tag": exact_tag,
            "confidence": 1.0,
            "response": response_text,
            "matched_pattern": normalized_message,
            "routing": "intent_model",
        }

    intent_pattern_scores = build_intent_pattern_scores(
        model_bundle.get("intent_patterns", {}),
        normalized_message,
    )
    score_by_tag = {}

    for tag, details in intent_pattern_scores.items():
        score_by_tag[tag] = {
            "pattern_score": details["score"],
            "model_score": 0.0,
            "combined_score": details["score"] * 0.3,
            "matched_pattern": details["matched_pattern"],
        }

    model = model_bundle.get("model")
    if model:
        probabilities = model.predict_proba([normalized_message])[0]
        labels = model.classes_

        for tag, probability in zip(labels, probabilities):
            tag_scores = score_by_tag.setdefault(
                tag,
                {
                    "pattern_score": 0.0,
                    "model_score": 0.0,
                    "combined_score": 0.0,
                    "matched_pattern": "",
                },
            )
            tag_scores["model_score"] = float(probability)
            tag_scores["combined_score"] = (tag_scores["model_score"] * 0.7) + (
                tag_scores["pattern_score"] * 0.3
            )

    if not score_by_tag:
        return None

    ranked_scores = sorted(
        score_by_tag.items(),
        key=lambda item: item[1]["combined_score"],
        reverse=True,
    )
    best_tag, best_details = ranked_scores[0]
    runner_up_score = ranked_scores[1][1]["combined_score"] if len(ranked_scores) > 1 else 0.0

    confidence = float(best_details["combined_score"])
    confidence += max(0.0, confidence - runner_up_score) * 0.35
    if best_details["pattern_score"] >= 0.7:
        confidence = max(confidence, best_details["pattern_score"] + 0.08)
    confidence = min(confidence, 1.0)
    responses = model_bundle["responses"].get(best_tag, [])
    response_text = choose_response(responses, message)

    return {
        "tag": best_tag,
        "confidence": confidence,
        "response": response_text,
        "matched_pattern": best_details["matched_pattern"],
        "pattern_confidence": round(best_details["pattern_score"], 4),
        "model_confidence": round(best_details["model_score"], 4),
        "routing": "intent_model",
    }
