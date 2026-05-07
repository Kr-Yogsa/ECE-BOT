from services.hardware_llms.cnc_llm import get_cnc_response
from services.hardware_llms.generic_llm import get_generic_response


TRANSIENT_LLM_FAILURE_MESSAGES = {
    "The AI service is temporarily unavailable. Please try again later.",
    "The AI service is busy right now. Please wait a moment and try again.",
    "I could not get a response from the AI service.",
    "I could not read the AI service response.",
}


def get_gemini_response(hardware_item, user_message, previous_messages=None):
    """Pick the correct hardware-specific LLM handler."""
    hardware_id = hardware_item.get("id", "").lower()

    if hardware_id == "cnc":
        cnc_response = get_cnc_response(user_message, previous_messages or [])
        if cnc_response not in TRANSIENT_LLM_FAILURE_MESSAGES:
            return cnc_response

    return get_generic_response(
        hardware_name=hardware_item["name"],
        hardware_context=hardware_item["context"],
        user_message=user_message,
    )
