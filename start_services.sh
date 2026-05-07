#!/bin/sh
set -eu

PORT_VALUE="${PORT:-8080}"
WEB_WORKERS_VALUE="${WEB_WORKERS:-2}"
WEB_THREADS_VALUE="${WEB_THREADS:-8}"
RUN_MQTT_WORKER_VALUE="${RUN_MQTT_WORKER:-true}"

MQTT_PID=""

cleanup() {
  if [ -n "${MQTT_PID}" ] && kill -0 "${MQTT_PID}" 2>/dev/null; then
    kill "${MQTT_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [ "${RUN_MQTT_WORKER_VALUE}" = "true" ]; then
  echo "Starting MQTT worker..."
  python mqtt_worker.py &
  MQTT_PID="$!"
fi

echo "Starting web app on port ${PORT_VALUE}..."
exec gunicorn \
  -w "${WEB_WORKERS_VALUE}" \
  --threads "${WEB_THREADS_VALUE}" \
  --worker-class gthread \
  --timeout 120 \
  --graceful-timeout 30 \
  -b "0.0.0.0:${PORT_VALUE}" \
  app:app
