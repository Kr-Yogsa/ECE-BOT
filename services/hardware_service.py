import json
import os


BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONFIG_PATH = os.path.join(DATA_DIR, "hardware_config.json")


def load_hardware_data():
    """Load the central config and each hardware JSON file dynamically."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as config_file:
        config = json.load(config_file)

    hardware_map = {}

    for item in config.get("hardware", []):
        # Each hardware entry points to its own JSON file.
        file_name = item["file"]
        file_path = os.path.join(DATA_DIR, file_name)

        with open(file_path, "r", encoding="utf-8") as hardware_file:
            hardware_json = json.load(hardware_file)

        hardware_map[item["id"]] = {
            "id": item["id"],
            "name": item["name"],
            "description": item.get("description", ""),
            "file": file_name,
            "context": hardware_json.get("context", ""),
            "intents": hardware_json.get("intents", []),
        }

    return hardware_map


def get_hardware_list(hardware_data):
    """Return only the details that the frontend needs."""
    items = []

    for hardware_id, item in hardware_data.items():
        items.append(
            {
                "id": hardware_id,
                "name": item["name"],
                "description": item["description"],
            }
        )

    return items
