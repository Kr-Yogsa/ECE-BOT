# ECE-BOT

ECE-BOT is a Flask based hybrid chatbot and machine monitoring web app for industrial hardware support. It provides hardware-specific assistants for MELFA, PLC, and CNC, plus operator dashboards for telemetry and live machine video.

## Features

- Flask backend with plain HTML, CSS, and JavaScript frontend
- PostgreSQL database through `DATABASE_URL`
- JWT authentication
- Signup OTP and forgot-password OTP through Brevo email API
- Role based access: admin, operator, user
- Hardware-specific chatbots loaded from JSON files in `data/`
- TF-IDF + Random Forest intent model for known questions
- Gemini fallback for low-confidence answers
- Chat sessions and chat history
- Admin operator management
- MQTT telemetry ingest for temperature, humidity, and vibration
- Machine stats dashboard with readings, summaries, and chart
- Raspberry Pi live camera stream support through Cloudflare Tunnel

## Project Structure

```text
BOT_AI/
|-- app.py
|-- mqtt_worker.py
|-- requirements.txt
|-- Dockerfile
|-- start_services.sh
|-- .env.example
|-- data/
|   |-- hardware_config.json
|   |-- melfa.json
|   |-- plc.json
|   `-- cnc.json
|-- frontend/
|   |-- login.html
|   |-- signup.html
|   |-- chat.html
|   |-- style.css
|   |-- auth.js
|   |-- app.js
|   `-- ui-config.js
|-- services/
|   |-- auth_service.py
|   |-- chat_service.py
|   |-- config_service.py
|   |-- db.py
|   |-- email_service.py
|   |-- hardware_service.py
|   |-- llm_service.py
|   |-- ml_service.py
|   |-- mqtt_service.py
|   `-- hardware_llms/
|       |-- base_llm.py
|       |-- cnc_llm.py
|       `-- generic_llm.py
`-- iot/
    |-- WIRING.md
    |-- RASPBERRY_PI_LIVE_VIDEO.md
    |-- raspberry_pi_camera_stream.py
    |-- publish_cloudflare_live_url.py
    `-- esp8266_mqtt_sensor/
        `-- esp8266_mqtt_sensor.ino
```

## Roles

Admin:

- First signed-up user automatically becomes admin.
- Can manage operators.
- Can access machine stats and live machine video.

Operator:

- Can chat with hardware assistants.
- Can access machine stats.
- Can access live machine video.

User:

- Can chat with hardware assistants.
- Cannot access machine stats, live video, or operator management.

## How Chat Works

1. User logs in.
2. User selects a hardware assistant: MELFA, PLC, or CNC.
3. Backend predicts intent using the trained local model.
4. If confidence is above `0.75`, a predefined answer is returned.
5. If confidence is low, Gemini is used as fallback.
6. User and assistant messages are saved in PostgreSQL.

## Main APIs

Auth:

```text
POST /auth/request-signup-otp
POST /auth/verify-signup-otp
POST /auth/signup
POST /auth/login
POST /auth/forgot-password/request-otp
POST /auth/forgot-password/verify-otp
POST /auth/forgot-password/reset
```

Chat and hardware:

```text
GET  /hardware-list
POST /select-bot
GET  /chat/sessions
GET  /chat/session/<session_id>
POST /chat
```

Admin/operator:

```text
GET    /admin/operators
POST   /admin/operators
PATCH  /admin/operators/<user_id>/status
DELETE /admin/operators/<user_id>
```

Machine monitoring:

```text
GET  /api/machine-stats/<machine_id>
GET  /api/machine-stats/<machine_id>/dashboard
GET  /api/machine-stats/<machine_id>/history
GET  /api/machine-live/<machine_id>
POST /api/machine-live/<machine_id>/url
```

## Environment Variables

Create `.env` from `.env.example`.

Required for the web app:

```env
JWT_SECRET=change-this-secret-key
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.your-project.supabase.co:5432/postgres
APP_BASE_URL=https://your-app.onrender.com
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-flash
BREVO_API_KEY=your-brevo-api-key
MAIL_FROM=no-reply@your-verified-domain.com
MAIL_FROM_NAME=ECE-BOT
```

Required for Raspberry Pi live URL auto-update:

```env
MACHINE_LIVE_UPDATE_TOKEN=use-a-long-random-secret-token
```

Optional MQTT settings:

```env
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC=factory/machine/+/telemetry
MQTT_CLIENT_ID=ece-bot-mqtt-worker
MQTT_USE_TLS=false
MACHINE_OFFLINE_AFTER_SECONDS=15
```

## Run Locally

Install Python 3.10+ and dependencies:

```bash
pip install -r requirements.txt
```

Set `.env`, then run:

```bash
python app.py
```

Open:

```text
http://localhost:5000
```

Note: local SQLite fallback has been removed. `DATABASE_URL` is required.

## Docker Deployment

Build:

```bash
docker build -t ece-bot .
```

Run:

```bash
docker run -p 8080:8080 \
  -e JWT_SECRET=your-secret \
  -e DATABASE_URL=your-postgres-url \
  -e APP_BASE_URL=https://your-app.onrender.com \
  -e GEMINI_API_KEY=your-gemini-key \
  -e BREVO_API_KEY=your-brevo-key \
  -e MAIL_FROM=no-reply@your-domain.com \
  -e MACHINE_LIVE_UPDATE_TOKEN=your-live-update-token \
  -e RUN_MQTT_WORKER=true \
  ece-bot
```

The Docker startup script runs:

- Gunicorn web app
- MQTT worker in the background when `RUN_MQTT_WORKER=true`

## MQTT Machine Monitoring

The MQTT worker listens for telemetry and stores it in PostgreSQL.

Default topic:

```text
factory/machine/+/telemetry
```

Expected payload:

```json
{
  "machine_id": "cnc",
  "temperature": 29.4,
  "humidity": 61.0,
  "vibration": 0.0314,
  "timestamp": "2026-05-05T10:30:00Z"
}
```

ESP8266 wiring and sketch are in:

```text
iot/WIRING.md
iot/esp8266_mqtt_sensor/esp8266_mqtt_sensor.ino
```

## Live Machine Video

Live video uses Raspberry Pi camera + Cloudflare Tunnel.

Flow:

```text
Raspberry Pi camera
-> local stream at http://localhost:8080/stream
-> Cloudflare quick tunnel
-> ECE-BOT receives latest stream URL
-> operator/admin opens Live Machine
```

### Raspberry Pi Files

Run these two files on the Raspberry Pi:

```text
iot/raspberry_pi_camera_stream.py
iot/publish_cloudflare_live_url.py
```

Terminal 1:

```bash
python3 raspberry_pi_camera_stream.py
```

This starts the camera stream:

```text
http://localhost:8080/stream
```

Terminal 2:

```bash
python3 publish_cloudflare_live_url.py \
  --app-base-url https://your-ece-bot-app.onrender.com \
  --machine-id cnc \
  --update-token your-live-update-token
```

The token must match:

```env
MACHINE_LIVE_UPDATE_TOKEN=your-live-update-token
```

The helper starts:

```bash
cloudflared tunnel --url http://localhost:8080
```

Then it detects the generated `trycloudflare.com` URL, appends `/stream`, and updates ECE-BOT through:

```text
POST /api/machine-live/<machine_id>/url
```

Because quick Cloudflare URLs can change after Raspberry Pi restart, this auto-update script avoids manually changing Render environment variables every time.

More details:

```text
iot/RASPBERRY_PI_LIVE_VIDEO.md
```

## Add New Hardware Bot

1. Create a JSON file in `data/`, for example `new_machine.json`.
2. Add the hardware entry to `data/hardware_config.json`.
3. Add context and intents to the new JSON file.
4. Restart the app so models are retrained.

No backend route changes are needed.

## Useful Notes

- First signup becomes admin.
- Operator invitation is done by admin from the profile menu.
- Machine Stats and Live Machine are separate windows.
- Static live stream URL env variables are still supported:

```env
LIVE_STREAM_URL=https://example.trycloudflare.com/stream
CNC_LIVE_STREAM_URL=https://example.trycloudflare.com/stream
PLC_LIVE_STREAM_URL=
MELFA_LIVE_STREAM_URL=
```

- DB-published stream URLs take priority over static env URLs.
