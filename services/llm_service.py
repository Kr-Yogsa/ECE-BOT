from services.hardware_llms.cnc_llm import get_cnc_response
from services.hardware_llms.generic_llm import get_generic_response


def get_gemini_response(hardware_item, user_message, previous_messages=None):
    """Pick the correct hardware-specific LLM handler."""
    hardware_id = hardware_item.get("id", "").lower()

    if hardware_id == "cnc":
        return get_cnc_response(user_message, previous_messages or [])

    return get_generic_response(
        hardware_name=hardware_item["name"],
        hardware_context=hardware_item["context"],
        user_message=user_message,
    )
