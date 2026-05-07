import logging

from services.config_service import load_local_env
from services.db import create_tables, init_db
from services.mqtt_service import start_mqtt_listener


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def main():
    load_local_env()
    init_db()
    create_tables()
    start_mqtt_listener()


if __name__ == "__main__":
    main()
