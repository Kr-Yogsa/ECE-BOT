import random

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


def train_models(hardware_data):
    """Train one TF-IDF + Logistic Regression model per hardware."""
    models = {}

    for hardware_id, hardware_item in hardware_data.items():
        # Collect training sentences and their intent labels.
        texts = []
        labels = []
        responses = {}

        for intent in hardware_item["intents"]:
            tag = intent["tag"]
            responses[tag] = intent.get("responses", [])

            for pattern in intent.get("patterns", []):
                texts.append(pattern)
                labels.append(tag)

        # Logistic Regression needs at least 2 classes.
        if len(set(labels)) < 2:
            continue

        model = Pipeline(
            [
                ("tfidf", TfidfVectorizer()),
                ("classifier", LogisticRegression(max_iter=1000)),
            ]
        )
        model.fit(texts, labels)

        models[hardware_id] = {
            "model": model,
            "responses": responses,
        }

    return models


def predict_intent(model_bundle, message):
    """Predict the top intent and return its confidence score."""
    if not model_bundle:
        return None

    model = model_bundle["model"]
    # Predict probabilities so we can compare against the 0.75 threshold.
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
