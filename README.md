# Hybrid Chatbot Web App

This project is a simple production-ready hybrid chatbot built with:

- Flask backend
- SQLite database
- TF-IDF + Logistic Regression intent model
- Gemini fallback for low-confidence questions
- Email OTP login verification
- Plain HTML, CSS, and JavaScript frontend

## Folder Structure

```text
BOT_AI/
├── app.py
├── chatbot.db
├── Dockerfile
├── requirements.txt
├── .env.example
├── data/
│   ├── hardware_config.json
│   ├── melfa.json
│   ├── plc.json
│   └── cnc.json
├── services/
│   ├── __init__.py
│   ├── auth_service.py
│   ├── chat_service.py
│   ├── db.py
│   ├── email_service.py
│   ├── hardware_service.py
│   ├── llm_service.py
│   └── ml_service.py
└── frontend/
    ├── login.html
    ├── signup.html
    ├── chat.html
    ├── style.css
    ├── auth.js
    └── app.js
```

## How It Works

1. User signs up.
2. During login, backend checks email and password.
3. Backend sends a one-time OTP to the user's email.
4. User enters the OTP on the login page.
5. Backend verifies the OTP and returns a JWT token.
6. Frontend stores the token in `localStorage`.
7. User selects hardware from the sidebar.
8. Backend checks the intent model confidence.
9. If confidence is greater than `0.75`, it returns a predefined response.
10. If confidence is `0.75` or below, it calls Gemini.
11. Every chat message is saved in SQLite.

## Auth APIs

- `POST /auth/signup`
- `POST /auth/login` for email + password and sending OTP
- `POST /auth/verify-login-otp` for verifying OTP and getting JWT

## Run Locally

1. Install Python 3.10+
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set environment variables:

```bash
export JWT_SECRET="your-secret"
export GEMINI_API_KEY="your-gemini-key"
export SMTP_HOST="smtp.example.com"
export SMTP_PORT="587"
export SMTP_USERNAME="your-email@example.com"
export SMTP_PASSWORD="your-email-password"
export MAIL_FROM="your-email@example.com"
```

On Windows PowerShell:

```powershell
$env:JWT_SECRET="your-secret"
$env:GEMINI_API_KEY="your-gemini-key"
$env:SMTP_HOST="smtp.example.com"
$env:SMTP_PORT="587"
$env:SMTP_USERNAME="your-email@example.com"
$env:SMTP_PASSWORD="your-email-password"
$env:MAIL_FROM="your-email@example.com"
```

4. Start the app:

```bash
python app.py
```

5. Open:

```text
http://localhost:5000
```

## Docker Run

```bash
docker build -t hybrid-chatbot .
docker run -p 5000:5000 \
  -e JWT_SECRET=your-secret \
  -e GEMINI_API_KEY=your-gemini-key \
  -e SMTP_HOST=smtp.example.com \
  -e SMTP_PORT=587 \
  -e SMTP_USERNAME=your-email@example.com \
  -e SMTP_PASSWORD=your-email-password \
  -e MAIL_FROM=your-email@example.com \
  hybrid-chatbot
```

## Add New Hardware

1. Create a new JSON file inside `data/`
2. Add a new entry in `data/hardware_config.json`
3. Restart the app

No backend code changes are needed.
