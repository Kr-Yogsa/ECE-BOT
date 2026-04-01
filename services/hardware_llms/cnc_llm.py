from services.hardware_llms.base_llm import call_gemini


SYSTEM_PROMPT = """
You are an expert assistant for CNC 3018 Pro machine.

Answer ONLY about:
- Specifications
- Usage (engraving, PCB, wood, copper)
- Software (Candle, GRBL)
- Troubleshooting
- Price of hardware
- General CNC basics that help explain the CNC 3018 Pro machine

STRICT RULE:
If question is not related to CNC 3018 Pro, reply EXACTLY:
Sorry, I can only answer questions about CNC 3018 Pro machine.

Do not use markdown symbols like *, #, or unnecessary spacing. Use clean plain text with - bullets.

Give simple and step-by-step answers.
Treat questions like "what is CNC", "how does a CNC machine work", "purpose of CNC", and "common CNC problems"
as valid and relevant to this assistant.
""".strip()


CNC_DATA = """
CNC 3018 Pro Machine:

- Working Area: 300 x 180 x 45 mm
- Spindle Speed: ~10000 RPM
- Controller: GRBL
- Software: Candle, UGS

Uses:
- Wood engraving
- PCB making
- Acrylic cutting
- Copper engraving

Common Problems:
- Machine not moving -> Check USB connection
- Spindle not working -> Check power supply
- Uneven cutting -> Check leveling
""".strip()


def is_valid_input(text):
    """Reject empty questions before calling the model."""
    return text.strip() != ""


def build_recent_context(previous_messages):
    """Keep a short plain-text summary of the last few chat messages."""
    if not previous_messages:
        return ""

    recent_lines = []
    for item in previous_messages[-4:]:
        role = item.get("role", "user").title()
        message = item.get("message", "").strip()
        if message:
            recent_lines.append(f"{role}: {message}")

    return "\n".join(recent_lines)


def is_cnc_related(text, previous_messages=None):
    """Local keyword filter to save API calls."""
    keywords = [
        "cnc", "3018", "spindle", "engraving",
        "grbl", "candle", "machine", "gcode",
        "pcb", "cutting", "price", "cost", "inr",
        "rupees", "rs", "software", "problem",
        "purpose", "used", "use", "work", "working",
        "drilling", "milling", "router", "wood", "acrylic", "copper"
    ]
    combined_text = text.lower()

    if previous_messages:
        combined_text += "\n" + build_recent_context(previous_messages).lower()

    return any(word in combined_text for word in keywords)


def build_cnc_prompt(user_message, previous_messages=None):
    """Build the CNC-specific prompt exactly from the desktop app style."""
    recent_context = build_recent_context(previous_messages)
    context_block = ""

    if recent_context:
        context_block = f"\nRecent Conversation:\n{recent_context}\n"

    return f"""
{SYSTEM_PROMPT}

{CNC_DATA}
{context_block}

User Question: {user_message}
""".strip()


def get_cnc_response(user_message, previous_messages=None):
    """Generate a CNC-only answer."""
    if not is_valid_input(user_message):
        return "Please type something."

    return call_gemini(build_cnc_prompt(user_message, previous_messages))
