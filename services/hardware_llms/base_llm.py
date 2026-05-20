import os

import requests


def normalize_model_name(model_name):
    """Accept either `gemini-...` or `models/gemini-...` in .env."""
    cleaned = (model_name or "").strip()
    if cleaned.startswith("models/"):
        return cleaned.split("/", 1)[1]
    return cleaned


def build_provider_error_message(response, model_name):
    """Turn Google API errors into a user-friendly message."""
    default_message = "The AI service is temporarily unavailable. Please try again later."

    try:
        error_data = response.json().get("error", {})
    except ValueError:
        error_data = {}

    provider_message = (error_data.get("message") or "").strip()
    lowered_message = provider_message.lower()

    if response.status_code == 400 and "not found" in lowered_message:
        return f'The configured AI model "{model_name}" was not found. Please check GEMINI_MODEL.'

    if response.status_code == 400 and "not supported" in lowered_message:
        return f'The configured AI model "{model_name}" does not support text generation.'

    if response.status_code == 403 and "unregistered callers" in lowered_message:
        return "The LLM API key is being rejected by the server. Please check the key restrictions or regenerate the API key."

    if response.status_code == 403:
        return "The AI service is not allowed to use this Google model right now. Please check the API key permissions."

    if response.status_code == 404:
        return f'The configured AI model "{model_name}" was not found. Please check GEMINI_MODEL.'

    if response.status_code == 429:
        return "The AI service is busy right now. Please wait a moment and try again."

    if provider_message:
        return f"LLM error: {provider_message}"

    return default_message


def extract_visible_text(parts):
    """Prefer the final answer over hidden/thought parts."""
    visible_texts = []

    for part in parts:
        if part.get("thought"):
            continue

        text = (part.get("text") or "").strip()
        if text:
            visible_texts.append(text)

    if visible_texts:
        return "\n".join(visible_texts).strip()

    for part in parts:
        text = (part.get("text") or "").strip()
        if text:
            return text

    return ""


def call_gemini(prompt_text):
    """Call Google AI with the configured model and prompt text."""
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = normalize_model_name(os.getenv("GEMINI_MODEL", "gemini-1.5-flash"))

    if not gemini_api_key:
        return "The AI service is not configured right now. Please contact support."

    if gemini_api_key == "your-gemini-api-key":
        return "The AI service is not configured right now. Please contact support."

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
    headers = {
        "x-goog-api-key": gemini_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt_text
                    }
                ]
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if not response.ok:
            return build_provider_error_message(response, gemini_model)

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return "I could not get a response from the AI service."

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return "I could not read the AI service response."

        visible_text = extract_visible_text(parts)
        if visible_text:
            return visible_text

        return "I could not read the AI service response."
    except requests.RequestException:
        return "The AI service is temporarily unavailable. Please try again later."
