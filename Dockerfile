FROM python:3.10-slim

LABEL org.opencontainers.image.title="ECE-BOT" \
      org.opencontainers.image.source="https://github.com/Kr-Yogsa/ECE-BOT" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY requirements.txt .

RUN python -m pip install --no-cache-dir --upgrade "pip==25.3" "wheel>=0.46.2" \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080

EXPOSE 8080

RUN chmod +x /app/start_services.sh

CMD ["/app/start_services.sh"]
