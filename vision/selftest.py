"""
Offline self-test for the vision pipeline.

Feeds synthetic detections through the real tracker, counting lines, occupancy
and scoring code, then asserts the published payload matches the contract the
dashboard expects. Needs neither a camera nor YOLO, so it is the fastest way to
confirm a Raspberry Pi install is wired up correctly:

    python selftest.py
"""

import json
import os
import sys
import tempfile
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traffic_vision as tv  # noqa: E402

FRAME_W, FRAME_H = 640, 480
TOTAL_FRAMES = 160

REQUIRED_KEYS = [
    'schema', 'camera_id', 'timestamp', 'congestion_level', 'congestion_score',
    'vehicles_in_frame', 'occupancy_pct', 'avg_speed_kph', 'speed_calibrated',
    'flow', 'totals', 'health',
    # v1 compatibility keys the current dashboard still reads
    'color', 'label', 'vehicle_count', 'vehicle_types', 'positions', 'source'
]


class SyntheticDetector:
    """Two vehicles drive down the frame and cross the counting line."""
    backend = 'synthetic'

    def __init__(self, *args, **kwargs):
        self.frame_index = 0

    def detect(self, frame):
        index = self.frame_index
        self.frame_index += 1
        detections = []

        car_y = 60 + (index % 40) * 12
        if car_y < FRAME_H - 60:
            detections.append({'bbox': (280, car_y, 350, car_y + 55),
                               'confidence': 0.9, 'class_name': 'car'})

        moto_y = 40 + ((index + 13) % 55) * 9
        if moto_y < FRAME_H - 40:
            detections.append({'bbox': (430, moto_y, 470, moto_y + 38),
                               'confidence': 0.8, 'class_name': 'motorcycle'})
        return detections


class SyntheticGrabber:
    def __init__(self, *args, **kwargs):
        self.count = 0
        self.finished = False
        self.is_file = False
        self.fps = 25.0

    def read(self):
        if self.count >= TOTAL_FRAMES:
            self.finished = True
            return None
        self.count += 1
        time.sleep(0.01)
        return np.zeros((FRAME_H, FRAME_W, 3), dtype=np.uint8)

    def release(self):
        pass


def run():
    workspace = tempfile.mkdtemp(prefix='bitcas_selftest_')
    tv.WEB_DATA_DIR = workspace
    tv.WEB_SNAPSHOT_DIR = os.path.join(workspace, 'snapshots')
    tv.VehicleDetector = SyntheticDetector
    tv.FrameGrabber = SyntheticGrabber

    output_file = os.path.join(workspace, 'congestion.json')
    system = tv.TrafficVisionSystem(video_source=0, output_file=output_file, update_interval=0.2)
    system.history_interval = 0.5
    system.run(display_output=False)

    with open(output_file, encoding='utf-8') as handle:
        payload = json.load(handle)

    history_path = os.path.join(workspace, 'traffic_history.jsonl')
    crossings_path = os.path.join(workspace, 'crossings.jsonl')
    hourly_path = os.path.join(workspace, 'traffic_hourly.jsonl')
    history = _read_jsonl(history_path)
    crossings = _read_jsonl(crossings_path)
    hourly = _read_jsonl(hourly_path)

    print('\n================ SELF-TEST RESULTS ================')
    print(f"level / score      : {payload['congestion_level']} {payload['congestion_score']}")
    print(f"vehicles in frame  : {payload['vehicles_in_frame']}")
    print(f"occupancy_pct      : {payload['occupancy_pct']}")
    print(f"flow               : {payload['flow']}")
    print(f"totals             : {payload['totals']}")
    print(f"speed_calibrated   : {payload['speed_calibrated']}  avg_speed_kph={payload['avg_speed_kph']}")
    print(f"health             : {payload['health']}")
    print(f"history lines      : {len(history)}")
    print(f"crossings logged   : {len(crossings)}")
    if crossings:
        print(f"crossing sample    : {crossings[0]}")
    print(f"hourly lines       : {len(hourly)}")
    if history:
        print(f"history sample     : {history[-1]}")
    if hourly:
        print(f"hourly sample      : {hourly[-1]}")

    failures = []
    missing = [key for key in REQUIRED_KEYS if key not in payload]
    if missing:
        failures.append(f"payload missing keys: {missing}")
    if payload['totals']['today'] <= 0:
        failures.append("counting line never fired - totals.today is 0")
    if not crossings:
        failures.append("no crossings written to crossings.jsonl")
    if not history:
        failures.append("no aggregated lines written to traffic_history.jsonl")
    # The run is far shorter than an hour, so this only passes if the final
    # flush rolls the partial bucket up instead of dropping it.
    if not hourly:
        failures.append("no rollup written to traffic_hourly.jsonl")
    elif sum(record['crossings'] for record in hourly) != payload['totals']['today']:
        failures.append("hourly rollup crossings do not match the day total")
    if payload['congestion_level'] not in tv.LEVEL_COLORS:
        failures.append(f"unknown congestion level {payload['congestion_level']}")
    if not 0 <= payload['congestion_score'] <= 100:
        failures.append("congestion score out of range")
    if payload.get('positions'):
        sample = payload['positions'][0]
        if not (isinstance(sample, dict) and 'x' in sample and 'y' in sample):
            failures.append("positions should be {x, y, class} objects")
    directions = {c['direction'] for c in crossings}
    if not directions:
        failures.append("crossings carry no direction")

    print('===================================================')
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1

    print(f"Counted {payload['totals']['today']} vehicles, directions={sorted(directions)}")
    print("ALL CHECKS PASSED")
    return 0


def _read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as handle:
        return [json.loads(line) for line in handle if line.strip()]


if __name__ == '__main__':
    sys.exit(run())
