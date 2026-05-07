# Raspberry Pi Live Video Setup

This setup exposes a Raspberry Pi camera as an MJPEG stream and lets ECE-BOT show it inside the operator live machine view.

## 1. Enable Camera On Raspberry Pi

Update the Pi first:

```bash
sudo apt update
sudo apt upgrade -y
```

For Raspberry Pi OS with Camera Module support, make sure the camera is detected:

```bash
libcamera-hello
```

## 2. Install Stream Dependencies

```bash
sudo apt install -y python3-picamera2 python3-opencv
python3 -m pip install flask
```

## 3. Run The Local Stream

Copy `raspberry_pi_camera_stream.py` to the Raspberry Pi, then run:

```bash
python3 raspberry_pi_camera_stream.py
```

Local test from another device on the same network:

```text
http://RASPBERRY_PI_IP:8080/stream
```

## 4. Expose It With Cloudflare Tunnel

Install `cloudflared` on the Raspberry Pi, then run a quick tunnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

Cloudflare will print an HTTPS URL like:

```text
https://example-name.trycloudflare.com
```

Your ECE-BOT stream URL becomes:

```text
https://example-name.trycloudflare.com/stream
```

## 5. Configure ECE-BOT

For CNC:

```env
CNC_LIVE_STREAM_URL=https://example-name.trycloudflare.com/stream
```

Or use one shared stream URL for all machines:

```env
LIVE_STREAM_URL=https://example-name.trycloudflare.com/stream
```

Restart/redeploy ECE-BOT after updating environment variables.

## Domain-Free Auto Update

If you do not have a domain, the quick `trycloudflare.com` URL can change after a Raspberry Pi restart.
ECE-BOT can still stay updated automatically if the Pi publishes the newest URL on boot.

Set this environment variable in ECE-BOT:

```env
MACHINE_LIVE_UPDATE_TOKEN=use-a-long-random-token
```

Install Pi helper dependencies:

```bash
python3 -m pip install requests
```

Run the auto-publish helper on the Raspberry Pi:

```bash
python3 publish_cloudflare_live_url.py \
  --app-base-url https://your-ece-bot-app.onrender.com \
  --machine-id cnc \
  --update-token use-a-long-random-token
```

The helper starts Cloudflare quick tunnel, detects the generated public URL, appends `/stream`, and sends it to ECE-BOT.
Keep `raspberry_pi_camera_stream.py` running at the same time, because the tunnel points to `http://localhost:8080`.

## Production Note

Quick tunnel URLs can change when `cloudflared` restarts. For a stable URL, create a named Cloudflare Tunnel and route it to a domain/subdomain you control.
