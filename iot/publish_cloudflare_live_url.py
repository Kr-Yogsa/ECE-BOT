import argparse
import re
import subprocess
import sys
import time

import requests


TRYCLOUDFLARE_URL_PATTERN = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")


def publish_stream_url(app_base_url, machine_id, stream_url, update_token):
    endpoint = f"{app_base_url.rstrip('/')}/api/machine-live/{machine_id}/url"
    response = requests.post(
        endpoint,
        json={"stream_url": stream_url, "source": "raspberry_pi_cloudflared"},
        headers={"X-Live-Update-Token": update_token},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def run_cloudflared_and_publish(args):
    command = [
        args.cloudflared_path,
        "tunnel",
        "--url",
        args.local_service_url,
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    published_url = ""
    try:
        for line in process.stdout:
            print(line, end="", flush=True)
            match = TRYCLOUDFLARE_URL_PATTERN.search(line)
            if not match:
                continue

            public_base_url = match.group(0).rstrip("/")
            published_url = f"{public_base_url}{args.stream_path}"
            for attempt in range(1, args.publish_attempts + 1):
                try:
                    result = publish_stream_url(
                        args.app_base_url,
                        args.machine_id,
                        published_url,
                        args.update_token,
                    )
                    print(f"\nPublished live stream URL: {result['stream']['stream_url']}", flush=True)
                    break
                except requests.RequestException as error:
                    print(f"Publish attempt {attempt} failed: {error}", file=sys.stderr, flush=True)
                    time.sleep(args.publish_retry_seconds)
            break

        return process.wait()
    finally:
        if not published_url:
            print("No trycloudflare URL was detected from cloudflared output.", file=sys.stderr)


def parse_args():
    parser = argparse.ArgumentParser(description="Run Cloudflare quick tunnel and publish its URL to ECE-BOT.")
    parser.add_argument("--app-base-url", required=True, help="ECE-BOT public base URL, for example https://ece-bot.onrender.com")
    parser.add_argument("--machine-id", default="cnc", help="ECE-BOT machine id, for example cnc")
    parser.add_argument("--update-token", required=True, help="Token matching MACHINE_LIVE_UPDATE_TOKEN on ECE-BOT")
    parser.add_argument("--local-service-url", default="http://localhost:8080", help="Local Raspberry Pi camera server URL")
    parser.add_argument("--stream-path", default="/stream", help="Stream path exposed by the camera server")
    parser.add_argument("--cloudflared-path", default="cloudflared", help="Path to cloudflared executable")
    parser.add_argument("--publish-attempts", type=int, default=5)
    parser.add_argument("--publish-retry-seconds", type=int, default=5)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run_cloudflared_and_publish(parse_args()))
