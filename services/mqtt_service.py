import json
import logging
import os
from datetime import datetime, timezone

from services.db import create_machine_telemetry, create_motor_status

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover
    mqtt = None


LOGGER = logging.getLogger(__name__)


def get_mqtt_config():
    return {
        "host": os.getenv("MQTT_BROKER_HOST", "localhost").strip(),
        "port": int(os.getenv("MQTT_BROKER_PORT", "1883").strip()),
        "username": os.getenv("MQTT_USERNAME", "").strip(),
        "password": os.getenv("MQTT_PASSWORD", "").strip(),
        "topic": os.getenv("MQTT_TOPIC", "factory/machine/+/telemetry").strip(),
        "client_id": os.getenv("MQTT_CLIENT_ID", "ece-bot-mqtt-worker").strip(),
        "keepalive": int(os.getenv("MQTT_KEEPALIVE_SECONDS", "60").strip()),
        "use_tls": os.getenv("MQTT_USE_TLS", "false").strip().lower() == "true",
    }


def parse_recorded_at(raw_value):
    if not raw_value:
        return None

    cleaned = str(raw_value).strip()
    if not cleaned:
        return None

    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"

    try:
        value = datetime.fromisoformat(cleaned)
    except ValueError:
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    normalized_value = value.astimezone(timezone.utc)

    # ESP uptime-based placeholder timestamps like 1970-01-01 break the
    # dashboard windows, so fall back to server time for clearly invalid dates.
    if normalized_value.year < 2025:
        return None

    return normalized_value.isoformat()


def parse_float(value):
    if value in (None, ""):
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_machine_id(topic, payload):
    payload_machine = str(payload.get("machine_id", "")).strip().lower()
    if payload_machine:
        return payload_machine

    topic_parts = [part.strip().lower() for part in topic.split("/") if part.strip()]
    if len(topic_parts) >= 3:
        return topic_parts[-2]

    return ""


def store_telemetry_message(topic, payload):
    machine_id = extract_machine_id(topic, payload)
    if not machine_id:
        raise ValueError("machine_id is missing from payload and MQTT topic")

    create_machine_telemetry(
        machine_id=machine_id,
        temperature=parse_float(payload.get("temperature")),
        humidity=parse_float(payload.get("humidity")),
        vibration=parse_float(payload.get("vibration")),
        proximity=parse_float(
            payload.get("proximity", payload.get("proximity_sensor"))
        ),
        source_topic=topic,
        recorded_at=parse_recorded_at(payload.get("timestamp")),
    )

    # Save motor status if present in the telemetry payload
    motor_val = payload.get("motor")
    if motor_val is not None:
        try:
            state = int(float(motor_val))
            create_motor_status(
                machine_id=machine_id,
                state=state,
                recorded_at=parse_recorded_at(payload.get("timestamp")),
            )
        except (TypeError, ValueError):
            pass


def build_mqtt_client():
    if mqtt is None:
        raise RuntimeError("paho-mqtt is not installed. Add it to requirements before starting the MQTT worker.")

    config = get_mqtt_config()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=config["client_id"])

    if config["username"]:
        client.username_pw_set(config["username"], config["password"])

    if config["use_tls"]:
        client.tls_set()

    def on_connect(current_client, _userdata, _flags, reason_code, _properties):
        if reason_code == 0:
            LOGGER.info("Connected to MQTT broker %s:%s", config["host"], config["port"])
            current_client.subscribe(config["topic"])
            LOGGER.info("Subscribed to MQTT topic %s", config["topic"])
            return

        LOGGER.error("MQTT connection failed with reason code %s", reason_code)

    def on_message(_client, _userdata, message):
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            LOGGER.warning("Ignoring malformed MQTT payload on %s: %s", message.topic, error)
            return

        try:
            store_telemetry_message(message.topic, payload)
        except Exception as error:  # pragma: no cover
            LOGGER.exception("Failed to store telemetry from %s: %s", message.topic, error)

    client.on_connect = on_connect
    client.on_message = on_message
    return client, config


def start_mqtt_listener():
    client, config = build_mqtt_client()
    client.connect(config["host"], config["port"], config["keepalive"])
    client.loop_forever()


def publish_control_message(machine_id, payload):
    if mqtt is None:
        raise RuntimeError("paho-mqtt is not installed.")

    config = get_mqtt_config()
    client_id = f"{config['client_id']}-publisher"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)

    if config["username"]:
        client.username_pw_set(config["username"], config["password"])

    if config["use_tls"]:
        client.tls_set()

    client.connect(config["host"], config["port"], config["keepalive"])
    topic = f"factory/machine/{machine_id}/control"
    client.publish(topic, json.dumps(payload), qos=1, retain=True)
    client.disconnect()
