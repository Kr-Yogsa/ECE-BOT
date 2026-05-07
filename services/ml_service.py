import random
import re

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline


def normalize_text(text):
    """Normalize text so saved suggestion buttons can match intent patterns exactly."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def train_models(hardware_data):
    """Train one TF-IDF + Random Forest model per hardware."""
    models = {}

    for hardware_id, hardware_item in hardware_data.items():
        texts = []
        labels = []
        responses = {}
        exact_patterns = {}

        for intent in hardware_item["intents"]:
            tag = intent["tag"]
            responses[tag] = intent.get("responses", [])

            for pattern in intent.get("patterns", []):
                texts.append(pattern)
                labels.append(tag)
                exact_patterns[normalize_text(pattern)] = tag

        # A classifier needs at least 2 different intent classes.
        if len(set(labels)) < 2:
            continue

        model = Pipeline(
            [
                ("tfidf", TfidfVectorizer()),
                (
                    "classifier",
                    RandomForestClassifier(
                        n_estimators=100,
                        random_state=42,
                    ),
                ),
            ]
        )
        model.fit(texts, labels)

        models[hardware_id] = {
            "model": model,
            "responses": responses,
            "exact_patterns": exact_patterns,
        }

    return models


def predict_intent(model_bundle, message):
    """Predict the top intent and return its confidence score."""
    if not model_bundle:
        return None

    exact_tag = model_bundle.get("exact_patterns", {}).get(normalize_text(message))
    if exact_tag:
        responses = model_bundle["responses"].get(exact_tag, [])
        response_text = random.choice(responses) if responses else "I found a matching intent."
        return {
            "tag": exact_tag,
            "confidence": 1.0,
            "response": response_text,
        }

    model = model_bundle["model"]
    probabilities = model.predict_proba([message])[0]
    labels = model.classes_

    best_index = probabilities.argmax()
    best_tag = labels[best_index]
    confidence = float(probabilities[best_index])

    responses = model_bundle["responses"].get(best_tag, [])
    response_text = random.choice(responses) if responses else "I found a matching intent."

    return {
        "tag": best_tag,
        "confidence": confidence,
        "response": response_text,
    }
