"""
BITCAS calibration tool.

Draw the road ROI, the counting line and the speed-calibration rectangle
directly on a frame from your camera, then write them into site_config.json.

    python calibrate.py --source 0
    python calibrate.py --source sample.mp4
    python calibrate.py --source frame.jpg

Everything is stored as normalised 0..1 coordinates, so the config keeps
working if you later change capture resolution.

Keys
    1 / 2 / 3   switch mode: ROI polygon / counting line / speed rectangle
    left click  add a point
    u           undo the last point in the current mode
    r           reset the current mode
    space       (video/camera) grab a different frame
    s           save to site_config.json
    q           quit without saving
"""

import argparse
import json
import os

import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG_FILE = os.path.join(SCRIPT_DIR, 'site_config.json')

MODE_ROI = 'roi'
MODE_LINE = 'line'
MODE_SPEED = 'speed'

MODE_HELP = {
    MODE_ROI: "ROI: click around the drivable road area, 3+ points. Detections outside are ignored.",
    MODE_LINE: "LINE: click 2 points across the road. Each vehicle is counted once as it crosses.",
    MODE_SPEED: "SPEED: click 4 road-surface points - near-left, near-right, far-right, far-left."
}

MODE_COLORS = {MODE_ROI: (200, 200, 200), MODE_LINE: (0, 255, 255), MODE_SPEED: (0, 165, 255)}


class Calibrator:
    def __init__(self, frame):
        self.frame = frame
        self.height, self.width = frame.shape[:2]
        self.mode = MODE_ROI
        self.points = {MODE_ROI: [], MODE_LINE: [], MODE_SPEED: []}

    def normalised(self, mode):
        return [[round(x / self.width, 4), round(y / self.height, 4)] for x, y in self.points[mode]]

    def load_existing(self, config):
        """Pre-populate from a previous calibration so you can adjust, not redo."""
        def denormalise(pairs):
            return [(int(px * self.width), int(py * self.height)) for px, py in pairs]

        roi = config.get('roi', {})
        if roi.get('calibrated'):
            self.points[MODE_ROI] = denormalise(roi.get('polygon', []))

        lines = config.get('counting_lines') or []
        if lines and lines[0].get('calibrated'):
            self.points[MODE_LINE] = denormalise([lines[0]['start'], lines[0]['end']])

        calibration = config.get('calibration', {})
        if calibration.get('calibrated'):
            self.points[MODE_SPEED] = denormalise(calibration.get('image_points', []))

    def on_mouse(self, event, x, y, flags, param):
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        limit = {MODE_ROI: 12, MODE_LINE: 2, MODE_SPEED: 4}[self.mode]
        if len(self.points[self.mode]) >= limit:
            print(f"{self.mode}: already has {limit} points. Press 'u' to undo or 'r' to reset.")
            return
        self.points[self.mode].append((x, y))

    def render(self):
        canvas = self.frame.copy()

        roi = self.points[MODE_ROI]
        if len(roi) >= 3:
            shade = canvas.copy()
            cv2.fillPoly(shade, [np.array(roi, dtype=np.int32)], (60, 90, 60))
            cv2.addWeighted(shade, 0.25, canvas, 0.75, 0, canvas)
            cv2.polylines(canvas, [np.array(roi, dtype=np.int32)], True, MODE_COLORS[MODE_ROI], 2)
        elif roi:
            cv2.polylines(canvas, [np.array(roi, dtype=np.int32)], False, MODE_COLORS[MODE_ROI], 2)

        line = self.points[MODE_LINE]
        if len(line) == 2:
            cv2.line(canvas, line[0], line[1], MODE_COLORS[MODE_LINE], 3)
            mid = ((line[0][0] + line[1][0]) // 2, (line[0][1] + line[1][1]) // 2)
            cv2.putText(canvas, 'COUNT', (mid[0] + 8, mid[1] - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, MODE_COLORS[MODE_LINE], 2)

        speed = self.points[MODE_SPEED]
        if len(speed) == 4:
            cv2.polylines(canvas, [np.array(speed, dtype=np.int32)], True, MODE_COLORS[MODE_SPEED], 2)
        elif len(speed) >= 2:
            cv2.polylines(canvas, [np.array(speed, dtype=np.int32)], False, MODE_COLORS[MODE_SPEED], 2)
        for index, point in enumerate(speed):
            cv2.putText(canvas, str(index + 1), (point[0] + 6, point[1] - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, MODE_COLORS[MODE_SPEED], 2)

        for mode, points in self.points.items():
            for point in points:
                cv2.circle(canvas, point, 4, MODE_COLORS[mode], -1)
                cv2.circle(canvas, point, 6, (20, 20, 20), 1)

        banner = canvas.copy()
        cv2.rectangle(banner, (0, 0), (self.width, 58), (0, 0, 0), -1)
        cv2.addWeighted(banner, 0.65, canvas, 0.35, 0, canvas)
        cv2.putText(canvas, MODE_HELP[self.mode], (12, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1)
        counts = (f"roi:{len(self.points[MODE_ROI])}  line:{len(self.points[MODE_LINE])}/2  "
                  f"speed:{len(self.points[MODE_SPEED])}/4")
        cv2.putText(canvas, f"[1/2/3] mode   [u] undo   [r] reset   [s] save   [q] quit    {counts}",
                    (12, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (180, 220, 255), 1)
        return canvas


def ask_float(prompt, default):
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    try:
        value = float(raw)
        return value if value > 0 else default
    except ValueError:
        print("  Not a number, using the default.")
        return default


def build_config_update(calibrator, existing):
    """Turn clicked points into config blocks. Returns None if nothing valid."""
    updates = {}

    roi = calibrator.points[MODE_ROI]
    if len(roi) >= 3:
        updates['roi'] = {'calibrated': True, 'polygon': calibrator.normalised(MODE_ROI)}
    elif roi:
        print("ROI needs at least 3 points - skipping ROI.")

    line = calibrator.points[MODE_LINE]
    if len(line) == 2:
        template = (existing.get('counting_lines') or [{}])[0]
        normalised = calibrator.normalised(MODE_LINE)
        updates['counting_lines'] = [{
            'id': template.get('id', 'main'),
            'calibrated': True,
            'start': normalised[0],
            'end': normalised[1],
            'positive_direction': template.get('positive_direction', 'inbound'),
            'negative_direction': template.get('negative_direction', 'outbound')
        }]
    elif line:
        print("Counting line needs exactly 2 points - skipping line.")

    speed = calibrator.points[MODE_SPEED]
    if len(speed) == 4:
        print("\nSpeed calibration - measure these on the road with a tape:")
        width_m = ask_float("  Width between points 1 and 2 (metres, e.g. lane width)", 3.5)
        length_m = ask_float("  Distance from the near edge to the far edge (metres)", 15.0)
        updates['calibration'] = {
            'calibrated': True,
            'image_points': calibrator.normalised(MODE_SPEED),
            # Points were clicked near-left, near-right, far-right, far-left.
            'world_points': [[0.0, 0.0], [width_m, 0.0], [width_m, length_m], [0.0, length_m]]
        }
        print(f"  Ground plane set to {width_m} m x {length_m} m. Speeds will be reported in km/h.")
    elif speed:
        print("Speed calibration needs exactly 4 points - skipping calibration.")

    return updates


def main():
    parser = argparse.ArgumentParser(description='BITCAS ROI / counting line / speed calibration')
    parser.add_argument('--source', default='0', help='Camera index, video file, or image file')
    parser.add_argument('--config', default=DEFAULT_CONFIG_FILE, help='site_config.json to update')
    args = parser.parse_args()

    try:
        source = int(args.source)
    except ValueError:
        source = args.source

    is_image = isinstance(source, str) and os.path.splitext(source)[1].lower() in ('.jpg', '.jpeg', '.png')
    capture = None

    if is_image:
        frame = cv2.imread(source)
        if frame is None:
            raise SystemExit(f"Cannot read image: {source}")
    else:
        capture = cv2.VideoCapture(source)
        if not capture.isOpened():
            raise SystemExit(f"Cannot open source: {source}")
        ok, frame = capture.read()
        if not ok:
            raise SystemExit("Could not grab a frame from the source.")

    existing = {}
    if os.path.exists(args.config):
        with open(args.config, 'r', encoding='utf-8') as handle:
            existing = json.load(handle)

    calibrator = Calibrator(frame)
    calibrator.load_existing(existing)

    window = 'BITCAS calibration'
    cv2.namedWindow(window)
    cv2.setMouseCallback(window, calibrator.on_mouse)
    print(__doc__)

    while True:
        cv2.imshow(window, calibrator.render())
        key = cv2.waitKey(20) & 0xFF

        if key == ord('q'):
            print("Quit without saving.")
            break
        if key == ord('1'):
            calibrator.mode = MODE_ROI
        elif key == ord('2'):
            calibrator.mode = MODE_LINE
        elif key == ord('3'):
            calibrator.mode = MODE_SPEED
        elif key == ord('u'):
            if calibrator.points[calibrator.mode]:
                calibrator.points[calibrator.mode].pop()
        elif key == ord('r'):
            calibrator.points[calibrator.mode] = []
        elif key == ord(' ') and capture is not None:
            ok, new_frame = capture.read()
            if ok:
                calibrator.frame = new_frame
            else:
                print("No further frames available.")
        elif key == ord('s'):
            updates = build_config_update(calibrator, existing)
            if not updates:
                print("Nothing valid to save yet.")
                continue
            existing.update(updates)
            with open(args.config, 'w', encoding='utf-8') as handle:
                json.dump(existing, handle, indent=2)
            print(f"\nSaved {', '.join(updates)} to {args.config}")
            print("Restart traffic_vision.py to pick up the new geometry.")
            break

    if capture is not None:
        capture.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
