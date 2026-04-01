from services.db import (
    add_chat_message,
    create_chat_session,
    get_chat_messages,
    get_chat_session,
    get_chat_sessions,
)
from services.llm_service import get_gemini_response
from services.ml_service import predict_intent


INTENT_CONFIDENCE_THRESHOLD = 0.75


def generate_chat_title(hardware_id, first_message):
    """Create a short clean title from the first user message."""
    stop_words = {
        "what", "is", "the", "of", "this", "that", "how",
        "do", "does", "a", "an", "and", "to", "for", "in",
        "about", "can", "you", "me", "please"
    }
    hardware_words = set(hardware_id.lower().split())

    clean_words = []
    for word in first_message.lower().replace("?", " ").replace(".", " ").split():
        if word not in stop_words and word not in hardware_words and word not in clean_words:
            clean_words.append(word)

    hardware_title = hardware_id.upper()
    picked_words = clean_words[:3]

    if "machine" in picked_words:
        picked_words = ["machine"] + [word for word in picked_words if word != "machine"]
    elif "machine" in first_message.lower():
        picked_words.insert(0, "machine")

    title_words = [hardware_title] + [word.title() for word in picked_words[:3]]
    title = " ".join(title_words).strip()
    return title[:40] or "New chat"


def build_chat_reply(user_id, session_id, hardware_id, message, hardware_item, model_bundle):
    """Create a bot reply and save both sides of the conversation."""
    previous_messages = get_chat_messages(session_id, user_id)
    prediction = predict_intent(model_bundle, message)

    if prediction and prediction["confidence"] > INTENT_CONFIDENCE_THRESHOLD:
        bot_response = prediction["response"]
        response_source = "intent_model"
        confidence = prediction["confidence"]
    else:
        bot_response = get_gemini_response(
            hardware_item=hardware_item,
            user_message=message,
            previous_messages=previous_messages,
        )
        response_source = "LLM"
        confidence = prediction["confidence"] if prediction else 0.0

    add_chat_message(session_id, "user", message)
    add_chat_message(session_id, "assistant", bot_response, response_source, confidence)

    return {
        "reply": bot_response,
        "source": response_source,
        "confidence": round(confidence, 4),
        "hardware_id": hardware_id,
        "session_id": session_id,
    }


def create_new_chat_session(user_id, hardware_id, first_message):
    """Use the first user message as the chat title."""
    title = generate_chat_title(hardware_id, first_message)
    return create_chat_session(user_id, hardware_id, title)


def get_user_chat_sessions(user_id):
    """Return all chat sessions for the sidebar."""
    return get_chat_sessions(user_id)


def get_user_chat_messages(user_id, session_id):
    """Return all messages for one chat."""
    return get_chat_messages(session_id, user_id)


def get_user_chat_session(user_id, session_id):
    """Return one session if it belongs to the user."""
    return get_chat_session(session_id, user_id)
