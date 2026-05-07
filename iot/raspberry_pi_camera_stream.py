from flask import Flask, Response, jsonify
from picamera2 import Picamera2
import cv2
import time


app = Flask(__name__)
camera = Picamera2()
camera.configure(
    camera.create_video_configuration(
        main={"size": (1280, 720), "format": "RGB888"}
    )
)
camera.start()
time.sleep(1)


def generate_frames():
    while True:
        frame = camera.capture_array()
        success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not success:
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buffer.tobytes()
            + b"\r\n"
        )


@app.route("/")
def index():
    return jsonify(
        {
            "name": "ECE-BOT Raspberry Pi live camera",
            "stream": "/stream",
            "health": "/health",
        }
    )


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/stream")
def stream():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
