import os

import requests


def call_gemini(prompt_text):
    """Call the Gemini REST API with a ready-made prompt."""
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()

    if not gemini_api_key:
        return "Gemini API key is missing. Please set GEMINI_API_KEY in your environment."

    if gemini_api_key == "your-gemini-api-key":
        return "Gemini API key is still a placeholder. Please update GEMINI_API_KEY in the .env file."

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{gemini_model}:generateContent?key={gemini_api_key}"
    )

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
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return "I could not get a response from Gemini."

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return "I could not read Gemini's response."

        return parts[0].get("text", "I could not read Gemini's response.").strip()
    except requests.RequestException as error:
        response = getattr(error, "response", None)

        if response is not None and response.status_code == 403:
            return "The AI service is not available right now. Please check the API key or model access and try again."

        if response is not None and response.status_code == 429:
            return "The AI service is busy right now. Please wait a moment and try again."

        return "The AI service is temporarily unavailable. Please try again later."
