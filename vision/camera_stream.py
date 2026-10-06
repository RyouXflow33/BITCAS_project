# Standalone preview only. traffic_vision.py --stream-port 8080 serves the
# same page from the detector, and both programs cannot open the camera.
import cv2
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

if not cap.isOpened():
    raise SystemExit("Camera did not open")

page = b"""<!doctype html>
<title>BITCAS Camera</title>
<img src="/stream" style="width:100%;max-width:960px">
"""

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/stream"):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
                if not ok:
                    continue
                try:
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg.tobytes() + b"\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(page)
    def log_message(self, *args):
        pass

print("Camera stream running on port 8080")
print("Open http://100.103.30.96:8080 on the laptop")
ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()