# ECE-BOT

AI-powered industrial chatbot + real-time machine monitoring platform built using Flask, MQTT, PostgreSQL, Docker, Raspberry Pi, ESP8266 and ML models to reduce unnecessary LLM calls.

---

## Live Demo

https://ece-bot-zd84.onrender.com

---

# System Overview

### Software Platform

![ECE-BOT System Overview](https://raw.githubusercontent.com/Kr-Yogsa/ECE-BOT/main/image/image.jpeg)

### Physical Hardware Setup

![ECE-BOT Hardware Setup](https://raw.githubusercontent.com/Kr-Yogsa/ECE-BOT/main/image/Hardware.jpeg)

ECE-BOT is deployed on a real Industrial IoT hardware stack consisting of Raspberry Pi 5, ESP8266 NodeMCU, DHT11 Sensor, MPU6050 Sensor and Raspberry Pi Camera Module. Sensor telemetry is transmitted through MQTT to the Raspberry Pi, where data is processed, stored and visualized through the monitoring dashboard.

---

## 1. Operator Management (Admin Panel)

Admin dashboard used for:
- Managing operator accounts
- Granting/revoking access
- Monitoring active operators
- Industrial role-based access control

This panel is designed for factory supervisors and administrators.

---

## 2. AI Hardware Chat Interface

Industrial AI assistant supporting:
- CNC machines
- PLC systems
- MELFA robots

The chatbot uses:
- TF-IDF + Logistic Regression intent detection
- LLM fallback for unknown queries
- Session-based chat history
- Hardware-specific knowledge bases

---

## 3. Real-Time Telemetry Dashboard

Industrial telemetry monitoring dashboard displaying:
- Temperature
- Humidity
- Vibration
- Historical telemetry graphs

Sensor data is received through MQTT and stored inside PostgreSQL for analytics and monitoring.

---

## 4. Authentication System

Secure login interface featuring:
- JWT authentication
- OTP-based verification
- Role-based access control
- Password reset workflow

---

## 5. Mobile Responsive Chat Interface

Fully responsive mobile interface for:
- Field operators
- Industrial technicians
- Remote monitoring access

Optimized for smartphones and tablets.

---

## 6. Machine Statistics & Monitoring

Live machine monitoring panel showing:
- Sensor readings
- Machine health analytics
- Telemetry history
- Offline detection
- Date-wise telemetry filtering

---

## 7. Live Machine Camera Stream

Real-time Raspberry Pi camera integration using Cloudflare Tunnel.

Supports:
- Live CNC machine monitoring
- Remote industrial supervision
- Browser-based camera streaming
- Operator/admin access control

This enables remote monitoring of industrial equipment directly from the dashboard.

---

# Features

- CNC, PLC, and MELFA hardware assistants
- TF-IDF + Logistic Regression intent engine
- LLM fallback for unknown queries
- Real-time MQTT telemetry monitoring
- Live Raspberry Pi machine camera streaming
- JWT authentication + role-based access
- Docker-ready deployment
- PostgreSQL support
- Operator/admin dashboards
- OTP signup and forgot password system
- Hardware-specific JSON knowledge system
- MQTT-based industrial sensor ingestion
- Cloudflare Tunnel live stream integration

---

# Tech Stack

Flask • PostgreSQL • MQTT • Docker • Raspberry Pi • ESP8266 • Scikit-learn • JWT • Gunicorn

---

# Built For

Smart factories, industrial labs, CNC monitoring, automation projects, and IoT-based machine supervision systems.


# Quick Start

## 1. Pull Docker Image

```bash
docker pull yogsaa/ece-bot
```

---

## 2. Create .env File

Create a `.env` file and paste the following:

```env
JWT_SECRET=your_jwt_secret
LLM_API_KEY=your_LLM_api_key
MODEL=model_name
DATABASE_URL=postgresql://username:password@host:5432/database_name
APP_BASE_URL=http://localhost:8080
BREVO_API_KEY=your_brevo_api_key
BREVO_API_TIMEOUT_SECONDS=15
MAIL_FROM=your_email@example.com
MAIL_FROM_NAME=ECE-BOT
SHOW_SMTP_ERROR_DETAILS=true
MQTT_BROKER_HOST=your_mqtt_broker
MQTT_BROKER_PORT=8883
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
MQTT_TOPIC=factory/machine/+/telemetry
MQTT_CLIENT_ID=ece-bot-client
MQTT_KEEPALIVE_SECONDS=60
MACHINE_OFFLINE_AFTER_SECONDS=60
MQTT_USE_TLS=true
```

---

## 3. Run Docker Container

```bash
docker run --env-file .env -p 8080:8080 yogsaa/ece-bot
```

---

# Default Access

```text
http://localhost:8080
```

---

# Run Locally Without Docker

## Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Start Application

```bash
python app.py
```

---


# Hardware Roles

## Admin

- Full access
- Manage operators
- Access live machine monitoring
- Access telemetry dashboards

---

## Operator

- Access machine stats
- Access live streams
- Use industrial assistants

---

## User

- Access chatbot only
- No monitoring permissions

---

# MQTT Machine Monitoring

Default telemetry topic:

```text
factory/machine/+/telemetry
```

Example payload:

```json
{
  "machine_id": "cnc",
  "temperature": 29.4,
  "humidity": 61.0,
  "vibration": 0.0314,
  "timestamp": "2026-05-05T10:30:00Z"
}
```

---

# Live Machine Video

ECE-BOT supports:
- Raspberry Pi camera streaming
- Cloudflare Tunnel public stream URLs
- Real-time operator monitoring

Flow:

```text
Raspberry Pi Camera
        ↓
Local Stream
        ↓
Cloudflare Tunnel
        ↓
ECE-BOT Dashboard
```

---

# Add New Hardware Assistant

1. Create a JSON file inside `data/`
2. Add hardware config in:

```text
data/hardware_config.json
```

3. Restart application

No backend route changes required.


# Security Note

Never upload your real `.env` file or secrets to GitHub.

Add this inside `.gitignore`:

```bash
.env
```

---

# License

MIT License

---

# Author

Yajvendra Singh Naruka

Industrial AI • IoT • Docker • Machine Monitoring • Embedded Systems
