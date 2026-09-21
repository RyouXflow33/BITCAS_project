"""
BITCAS Traffic Vision System (v2)

Detects and tracks vehicles from a camera or video file, counts each vehicle
ONCE as it crosses a virtual counting line, measures road occupancy and real
ground speed, and publishes a JSON payload the PHP dashboard consumes.

What changed from v1 and why it matters:

  * `vehicle_count` used to be "vehicles visible in this frame" -- an occupancy
    sample, not throughput. A car idling in view was counted every publish. v2
    adds counting lines, so `totals.today` is a real vehicle count and
    `flow.per_minute` is real throughput.
  * Congestion was one of three fixed scores (30/60/90). v2 computes a
    continuous 0-100 score from occupancy, load and slowness (pixel speed
    when km/h is not calibrated), labelled LIGHT / MODERATE / HEAVY.
  * Speed was pixels/second, which depends on how far the car is from the lens.
    v2 applies a ground-plane homography (see calibrate.py) and reports km/h.
  * History was a 650 KB JSON file re-read and rewritten every 3 seconds --
    roughly 18 GB/day of SD-card writes. v2 appends one aggregated line per
    minute to a JSONL file instead.

Run `python calibrate.py` first to draw the ROI, the counting line and the
speed calibration on a real frame. The defaults in site_config.json work
uncalibrated, but speed stays in px/s until you calibrate.
"""

import argparse
import json
import math
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, date

import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'assets', 'data'))
WEB_SNAPSHOT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'assets', 'snapshots'))
SNAPSHOT_URL_PREFIX = 'assets/snapshots'

DEFAULT_CONFIG_FILE = os.path.join(SCRIPT_DIR, 'site_config.json')
DEFAULT_CONGESTION_FILE = os.path.join(WEB_DATA_DIR, 'congestion.json')

LEVEL_COLORS = {
    'LIGHT': '#27ae60',
    'MODERATE': '#f39c12',
    'HEAVY': '#e74c3c',
    'CRITICAL': '#8b1a1a'
}

COCO_VEHICLES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

CONFIG_DEFAULTS = {
    'camera_id': 'CAM-01',
    'site_name': 'Unnamed site',
    'road_name': '',
    'lat': None,
    'lng': None,
    'roi': {'calibrated': False, 'polygon': [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]},
    'counting_lines': [{
        'id': 'main', 'calibrated': False,
        'start': [0.05, 0.55], 'end': [0.95, 0.55],
        'positive_direction': 'inbound', 'negative_direction': 'outbound'
    }],
    'lanes': [],
    'calibration': {'calibrated': False, 'image_points': [], 'world_points': []},
    'congestion': {
        'capacity_vehicles': 12,
        'free_flow_kph': 40.0,
        'weights': {'occupancy': 0.45, 'load': 0.30, 'slowness': 0.25},
        'bands': {'moderate': 40, 'heavy': 65, 'critical': 85},
        'smoothing_window_seconds': 12,
        'busy_occupancy': 0.16,
        'free_flow_pps': 50.0,
        'stopped_pps': 8.0
    },
    'tracking': {
        'max_match_distance_px': 60,
        'max_age_seconds': 2.0,
        'min_speed_samples': 5,
        'max_plausible_kph': 120
    },
    'publish': {
        'update_interval_seconds': 3,
        'history_interval_seconds': 60,
        'snapshot_cooldown_seconds': 900,
        'snapshot_streak': 3,
        'max_snapshots': 100,
        'spool_days': 3
    }
}


def _deep_merge(base, override):
    """Merge override into a copy of base, recursing into nested dicts."""
    result = dict(base)
    for key, value in (override or {}).items():
        if key.startswith('_'):
            continue
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_site_config(path):
    """Load site_config.json, falling back to built-in defaults for any gaps."""
    if not os.path.exists(path):
        print(f"Warning: {path} not found, using built-in defaults.")
        return dict(CONFIG_DEFAULTS)
    with open(path, 'r', encoding='utf-8') as handle:
        return _deep_merge(CONFIG_DEFAULTS, json.load(handle))


# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------

def to_pixels(point, width, height):
    return (float(point[0]) * width, float(point[1]) * height)


def segments_intersect(p1, p2, p3, p4):
    """True when segment p1-p2 crosses segment p3-p4."""
    def orientation(a, b, c):
        value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
        if abs(value) < 1e-9:
            return 0
        return 1 if value > 0 else 2

    o1, o2 = orientation(p1, p2, p3), orientation(p1, p2, p4)
    o3, o4 = orientation(p3, p4, p1), orientation(p3, p4, p2)
    return o1 != o2 and o3 != o4


class CountingLine:
    """A virtual line; a track crossing it produces exactly one count."""

    def __init__(self, config, width, height):
        self.id = config.get('id', 'main')
        self.start = to_pixels(config['start'], width, height)
        self.end = to_pixels(config['end'], width, height)
        self.positive_direction = config.get('positive_direction', 'inbound')
        self.negative_direction = config.get('negative_direction', 'outbound')

        # Normal points to the "positive" side of the line.
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        self.normal = (-dy, dx)

    def _side(self, point):
        vx = point[0] - self.start[0]
        vy = point[1] - self.start[1]
        return self.normal[0] * vx + self.normal[1] * vy

    def crossing_direction(self, previous_point, current_point):
        """Return a direction label if the track just crossed, else None."""
        before, after = self._side(previous_point), self._side(current_point)
        if before == 0 or after == 0 or (before > 0) == (after > 0):
            return None
        # Sign change alone would also fire past the line's endpoints.
        if not segments_intersect(previous_point, current_point, self.start, self.end):
            return None
        return self.positive_direction if after > 0 else self.negative_direction


class Calibration:
    """Maps image pixels to ground-plane metres via a 4-point homography."""

    def __init__(self, config):
        self.enabled = False
        self._matrix = None
        self._config = config

    def build(self, width, height):
        config = self._config
        if not config.get('calibrated'):
            return
        image_points = config.get('image_points') or []
        world_points = config.get('world_points') or []
        if len(image_points) != 4 or len(world_points) != 4:
            print("Warning: calibration needs exactly 4 image and 4 world points. Speed stays in px/s.")
            return

        source = np.array([to_pixels(p, width, height) for p in image_points], dtype=np.float32)
        target = np.array(world_points, dtype=np.float32)
        self._matrix = cv2.getPerspectiveTransform(source, target)
        self.enabled = True
        print("Speed calibration active: reporting km/h.")

    def to_world(self, point):
        """Convert one (x, y) pixel to (X, Y) metres on the ground plane."""
        if not self.enabled:
            return None
        source = np.array([[[float(point[0]), float(point[1])]]], dtype=np.float32)
        result = cv2.perspectiveTransform(source, self._matrix)
        return (float(result[0][0][0]), float(result[0][0][1]))


# --------------------------------------------------------------------------
# Capture
# --------------------------------------------------------------------------

class FrameGrabber:
    """
    Live camera: background thread, keep only the newest frame so the overlay
    never lags behind the buffer.

    Video file: read every frame in order and let the main loop pace to the
    file's FPS. Drop-newest on a file looks like fast-forward because the
    decoder outruns YOLO and discarded frames never get shown.
    """

    def __init__(self, source, width=640, height=480):
        self.capture = cv2.VideoCapture(source)
        if not self.capture.isOpened():
            raise ValueError(f"Cannot open video source: {source}")

        self.is_file = isinstance(source, str) and os.path.isfile(source)
        fps = float(self.capture.get(cv2.CAP_PROP_FPS) or 0)
        self.fps = fps if fps > 1 else 25.0
        self.frame_interval = 1.0 / self.fps

        if not self.is_file:
            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            try:
                self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except cv2.error:
                pass

        self._lock = threading.Lock()
        self._frame = None
        self._stopped = False
        self._finished = False
        self._thread = None
        if not self.is_file:
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def _run(self):
        while not self._stopped:
            ok, frame = self.capture.read()
            if not ok:
                self._finished = True
                break
            with self._lock:
                self._frame = frame

    def read(self):
        if self.is_file:
            ok, frame = self.capture.read()
            if not ok:
                self._finished = True
                return None
            return frame
        with self._lock:
            frame = self._frame
            self._frame = None
        return frame

    @property
    def finished(self):
        return self._finished

    def release(self):
        self._stopped = True
        if self._thread is not None:
            self._thread.join(timeout=1.0)
        self.capture.release()


# --------------------------------------------------------------------------
# Detection
# --------------------------------------------------------------------------

class VehicleDetector:
    """YOLO (NCNN or PyTorch) with a Haar cascade as a last resort."""

    def __init__(self, backend='auto', inference_size=416, confidence=0.5):
        self.inference_size = max(320, int(inference_size))
        self.confidence = min(0.95, max(0.1, float(confidence)))
        self.backend = self._select_backend(backend)

        if self.backend == 'ncnn':
            self.model = YOLO(os.path.join(SCRIPT_DIR, 'yolov8n_ncnn_model'), task='detect')
        elif self.backend == 'pytorch':
            self.model = YOLO(os.path.join(SCRIPT_DIR, 'yolov8n.pt'))
        else:
            self.cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_car.xml')

        print(f"Detector backend: {self.backend} (imgsz={self.inference_size}, conf={self.confidence})")

    def _select_backend(self, requested):
        ncnn_dir = os.path.join(SCRIPT_DIR, 'yolov8n_ncnn_model')
        if requested == 'auto':
            if YOLO_AVAILABLE and os.path.isdir(ncnn_dir):
                return 'ncnn'
            if YOLO_AVAILABLE:
                return 'pytorch'
            print("Warning: ultralytics not installed. Falling back to Haar cascade (low accuracy).")
            return 'haar'
        if requested in ('ncnn', 'pytorch') and not YOLO_AVAILABLE:
            print(f"Warning: '{requested}' requested but ultralytics is missing. Using Haar cascade.")
            return 'haar'
        if requested == 'ncnn' and not os.path.isdir(ncnn_dir):
            print("Warning: yolov8n_ncnn_model/ not found. Export it with:")
            print("         yolo export model=yolov8n.pt format=ncnn")
            print("         Falling back to PyTorch.")
            return 'pytorch' if YOLO_AVAILABLE else 'haar'
        return requested

    def detect(self, frame):
        """Return a list of {bbox, confidence, class_name} for vehicles only."""
        if self.backend == 'haar':
            return self._detect_haar(frame)
        return self._detect_yolo(frame)

    def _detect_yolo(self, frame):
        results = self.model(
            frame,
            verbose=False,
            imgsz=self.inference_size,
            conf=self.confidence,
            classes=list(COCO_VEHICLES)
        )
        detections = []
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                class_id = int(box.cls[0])
                if class_id not in COCO_VEHICLES:
                    continue
                detections.append({
                    'bbox': (int(x1), int(y1), int(x2), int(y2)),
                    'confidence': float(box.conf[0]),
                    'class_name': COCO_VEHICLES[class_id]
                })
        return detections

    def _detect_haar(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        boxes = self.cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
        return [{
            'bbox': (int(x), int(y), int(x + w), int(y + h)),
            'confidence': 0.8,
            'class_name': 'car'
        } for (x, y, w, h) in boxes]


# --------------------------------------------------------------------------
# Tracking
# --------------------------------------------------------------------------

class Track:
    """One vehicle followed across frames."""

    __slots__ = ('id', 'class_name', 'bbox', 'centroid', 'last_seen', 'misses',
                 'pixel_history', 'world_history', 'counted_lines', 'speed_kph', 'speed_pps')

    def __init__(self, track_id, detection, centroid, now):
        self.id = track_id
        self.class_name = detection['class_name']
        self.bbox = detection['bbox']
        self.centroid = centroid
        self.last_seen = now
        self.misses = 0
        self.pixel_history = deque(maxlen=30)
        self.world_history = deque(maxlen=30)
        self.counted_lines = set()
        self.speed_kph = None
        self.speed_pps = 0.0
        self.pixel_history.append((now, centroid[0], centroid[1]))

    @property
    def previous_centroid(self):
        if len(self.pixel_history) < 2:
            return None
        entry = self.pixel_history[-2]
        return (entry[1], entry[2])


class CentroidTracker:
    """
    Nearest-centroid association keyed by track ID.

    v1 keyed its track map by detection index, which is meaningless between
    frames. Tracks here own their own history, which is what makes per-vehicle
    counting and least-squares speed possible.
    """

    def __init__(self, config, calibration):
        self.max_distance = float(config['max_match_distance_px'])
        self.max_age = float(config['max_age_seconds'])
        self.min_speed_samples = int(config['min_speed_samples'])
        self.max_plausible_kph = float(config['max_plausible_kph'])
        self.calibration = calibration
        self.tracks = {}
        self._next_id = 1

    def update(self, detections, now):
        """Associate detections with existing tracks; return the live tracks."""
        centroids = [((d['bbox'][0] + d['bbox'][2]) / 2.0,
                      (d['bbox'][1] + d['bbox'][3]) / 2.0) for d in detections]

        # Greedy nearest-neighbour: the shortest candidate pair wins first, so
        # one close match cannot be stolen by a more distant detection.
        candidates = []
        for det_index, centroid in enumerate(centroids):
            for track_id, track in self.tracks.items():
                distance = math.hypot(centroid[0] - track.centroid[0], centroid[1] - track.centroid[1])
                if distance <= self.max_distance:
                    candidates.append((distance, det_index, track_id))
        candidates.sort()

        assignments = {}
        taken_detections = set()
        taken_tracks = set()
        for _distance, det_index, track_id in candidates:
            if det_index in taken_detections or track_id in taken_tracks:
                continue
            assignments[det_index] = track_id
            taken_detections.add(det_index)
            taken_tracks.add(track_id)

        updated_ids = []
        for det_index, detection in enumerate(detections):
            centroid = centroids[det_index]
            track_id = assignments.get(det_index)

            if track_id is None:
                track_id = self._next_id
                self._next_id += 1
                track = Track(track_id, detection, centroid, now)
                self.tracks[track_id] = track
            else:
                track = self.tracks[track_id]
                track.bbox = detection['bbox']
                track.centroid = centroid
                track.class_name = detection['class_name']
                track.last_seen = now
                track.misses = 0
                track.pixel_history.append((now, centroid[0], centroid[1]))

            world = self.calibration.to_world(centroid)
            if world is not None:
                track.world_history.append((now, world[0], world[1]))
            self._update_speed(track)
            updated_ids.append(track_id)

        for track_id in list(self.tracks):
            track = self.tracks[track_id]
            if track_id not in taken_tracks and track_id not in updated_ids:
                track.misses += 1
            if now - track.last_seen > self.max_age:
                del self.tracks[track_id]

        return [self.tracks[track_id] for track_id in updated_ids]

    def _update_speed(self, track):
        """
        Least-squares velocity over the track's history.

        v1 differenced only the last two centroids, which is extremely noisy at
        low frame rates. Fitting a line over N points averages that out.
        """
        history = track.world_history if self.calibration.enabled else track.pixel_history
        if len(history) < max(2, self.min_speed_samples):
            return

        times = np.array([point[0] for point in history], dtype=np.float64)
        times = times - times[0]
        if times[-1] <= 0:
            return
        xs = np.array([point[1] for point in history], dtype=np.float64)
        ys = np.array([point[2] for point in history], dtype=np.float64)

        vx = np.polyfit(times, xs, 1)[0]
        vy = np.polyfit(times, ys, 1)[0]
        magnitude = math.hypot(float(vx), float(vy))

        if self.calibration.enabled:
            kph = magnitude * 3.6
            track.speed_kph = kph if 0.0 <= kph <= self.max_plausible_kph else None
        else:
            track.speed_pps = magnitude


# --------------------------------------------------------------------------
# Congestion scoring
# --------------------------------------------------------------------------

class CongestionModel:
    """
    Continuous 0-100 score from occupancy, load and slowness.

    Occupancy against a whole uncalibrated frame is a few percent even when the
    road is busy, so it is scaled by `busy_occupancy` until the ROI is the road.
    Slowness uses km/h after speed calibration, otherwise pixel speed so a
    stopped queue still raises the score.
    """

    def __init__(self, config):
        self.capacity = max(1, int(config['capacity_vehicles']))
        self.free_flow_kph = max(1.0, float(config['free_flow_kph']))
        weights = config['weights']
        self.w_occupancy = float(weights['occupancy'])
        self.w_load = float(weights['load'])
        self.w_slowness = float(weights['slowness'])
        bands = config['bands']
        self.moderate = int(bands['moderate'])
        self.heavy = int(bands['heavy'])
        self.critical = int(bands['critical'])
        self.window_seconds = float(config['smoothing_window_seconds'])
        self.busy_occupancy = max(0.02, float(config.get('busy_occupancy', 0.16)))
        self.free_flow_pps = max(1.0, float(config.get('free_flow_pps', 50.0)))
        self.stopped_pps = max(0.5, float(config.get('stopped_pps', 8.0)))
        self.roi_calibrated = False
        self._samples = deque()

    def smooth(self, vehicle_count, now):
        """Time-based smoothing window, not last-N-frames."""
        self._samples.append((now, vehicle_count))
        while self._samples and now - self._samples[0][0] > self.window_seconds:
            self._samples.popleft()
        return sum(sample[1] for sample in self._samples) / len(self._samples)

    def occupancy_term(self, occupancy_fraction):
        occupancy = min(1.0, max(0.0, occupancy_fraction))
        if self.roi_calibrated:
            return occupancy
        return min(1.0, occupancy / self.busy_occupancy)

    def slowness_term(self, avg_speed_kph, avg_speed_pps, vehicle_count):
        """1 = standing still, 0 = free flow. Empty road is not a jam."""
        if vehicle_count <= 0:
            return 0.0
        if avg_speed_kph is not None:
            slowness = min(1.0, max(0.0, 1.0 - (avg_speed_kph / self.free_flow_kph)))
        elif avg_speed_pps is None:
            slowness = 0.0
        elif avg_speed_pps <= self.stopped_pps:
            slowness = 1.0
        else:
            slowness = min(1.0, max(0.0, 1.0 - (avg_speed_pps / self.free_flow_pps)))
        # One stopped car is not congestion; a queue of 3+ is.
        if vehicle_count < 3:
            slowness *= vehicle_count / 3.0
        return slowness

    def score(self, occupancy_fraction, smoothed_count, avg_speed_kph,
              avg_speed_pps=None, vehicle_count=0):
        occupancy = self.occupancy_term(occupancy_fraction)
        load = min(1.0, max(0.0, smoothed_count / self.capacity))
        slowness = self.slowness_term(avg_speed_kph, avg_speed_pps, vehicle_count)
        value = (self.w_occupancy * occupancy + self.w_load * load + self.w_slowness * slowness)
        return max(0, min(100, int(round(100 * value))))

    def level(self, score):
        if score >= self.heavy:
            return 'HEAVY'
        if score >= self.moderate:
            return 'MODERATE'
        return 'LIGHT'

    def motion_label(self, slowness, vehicle_count):
        if vehicle_count <= 0:
            return 'empty'
        if slowness >= 0.85:
            return 'stopped'
        if slowness >= 0.45:
            return 'slow'
        return 'flowing'


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

class TelemetryWriter:
    """
    Writes the live payload, plus append-only logs for history and crossings.

    v1 read, parsed and rewrote a 650 KB history file every 3 seconds --
    ~18 GB/day onto the SD card, and the parse blocked the detection loop.
    Appending one aggregated line per minute is ~0.4 MB/day and never reads.
    """

    def __init__(self, current_file, data_dir):
        self.current_file = os.path.abspath(current_file)
        self.history_file = os.path.join(data_dir, 'traffic_history.jsonl')
        # Hourly rollup: minute records are too many for a browser to hold more
        # than a couple of days, but heatmaps and prediction need weeks. This is
        # the same rollup the Phase 2 database cron will produce.
        self.hourly_file = os.path.join(data_dir, 'traffic_hourly.jsonl')
        self.crossings_file = os.path.join(data_dir, 'crossings.jsonl')
        os.makedirs(data_dir, exist_ok=True)

    @staticmethod
    def _atomic_write_json(path, data):
        """Write via .tmp + os.replace so pollers never read a partial file."""
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        temp_path = path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2)
        os.replace(temp_path, path)

    @staticmethod
    def _append_line(path, record):
        with open(path, 'a', encoding='utf-8') as handle:
            handle.write(json.dumps(record) + '\n')

    def write_current(self, payload):
        try:
            self._atomic_write_json(self.current_file, payload)
        except OSError as error:
            print(f"Error writing {self.current_file}: {error}")

    def append_history(self, record):
        try:
            self._append_line(self.history_file, record)
        except OSError as error:
            print(f"Error appending history: {error}")

    def append_hourly(self, record):
        try:
            self._append_line(self.hourly_file, record)
        except OSError as error:
            print(f"Error appending hourly rollup: {error}")

    def append_crossings(self, crossings):
        if not crossings:
            return
        try:
            with open(self.crossings_file, 'a', encoding='utf-8') as handle:
                for crossing in crossings:
                    handle.write(json.dumps(crossing) + '\n')
        except OSError as error:
            print(f"Error appending crossings: {error}")


def aggregate_minute_records(records, camera_id, bucket_start, congestion_model):
    """
    Collapse a list of minute records into one hourly rollup.

    `weekday` and `hour` are stored explicitly so the dashboard can build an
    hour-by-weekday heatmap without re-parsing every timestamp.
    """
    speeds = [r['avg_speed_kph'] for r in records if r.get('avg_speed_kph') is not None]
    classes = defaultdict(int)
    directions = defaultdict(int)
    for record in records:
        for name, count in (record.get('vehicle_types') or {}).items():
            classes[name] += count
        for name, count in (record.get('by_direction') or {}).items():
            directions[name] += count

    mean_score = sum(r['congestion_score'] for r in records) / len(records)
    return {
        'camera_id': camera_id,
        'timestamp': bucket_start.isoformat(timespec='seconds'),
        'weekday': bucket_start.weekday(),
        'hour': bucket_start.hour,
        'samples': len(records),
        'congestion_score': round(mean_score, 1),
        'congestion_level': congestion_model.level(int(round(mean_score))),
        'peak_congestion_score': max(r.get('peak_congestion_score', r['congestion_score']) for r in records),
        'vehicles_in_frame_avg': round(sum(r['vehicles_in_frame_avg'] for r in records) / len(records), 2),
        'vehicles_in_frame_peak': max(r['vehicles_in_frame_peak'] for r in records),
        'occupancy_pct': round(sum(r['occupancy_pct'] for r in records) / len(records), 1),
        'avg_speed_kph': round(sum(speeds) / len(speeds), 1) if speeds else None,
        'speed_calibrated': any(r.get('speed_calibrated') for r in records),
        'crossings': sum(r['crossings'] for r in records),
        'vehicle_types': dict(classes),
        'by_direction': dict(directions)
    }


# --------------------------------------------------------------------------
# Main system
# --------------------------------------------------------------------------

class TrafficVisionSystem:
    def __init__(self, video_source=0, config_file=DEFAULT_CONFIG_FILE,
                 output_file=DEFAULT_CONGESTION_FILE, backend='auto',
                 inference_size=416, confidence_threshold=0.5, detect_every=1,
                 update_interval=None):
        self.config = load_site_config(config_file)
        publish = self.config['publish']

        self.video_source = video_source
        self.detect_every = max(1, int(detect_every))
        self.update_interval = float(update_interval or publish['update_interval_seconds'])
        self.history_interval = float(publish['history_interval_seconds'])
        self.snapshot_cooldown = float(publish['snapshot_cooldown_seconds'])
        self.snapshot_streak_target = int(publish['snapshot_streak'])
        self.max_snapshots = int(publish['max_snapshots'])

        self.detector = VehicleDetector(backend, inference_size, confidence_threshold)
        self.calibration = Calibration(self.config['calibration'])
        self.tracker = CentroidTracker(self.config['tracking'], self.calibration)
        self.congestion = CongestionModel(self.config['congestion'])
        self.writer = TelemetryWriter(output_file, WEB_DATA_DIR)

        self.grabber = None
        self.frame_size = None
        self.roi_polygon = None
        self.roi_mask = None
        self.roi_area = 1.0
        self.counting_lines = []

        self.started_at = time.time()
        self.frame_count = 0
        self._fps_samples = deque(maxlen=30)
        self._last_frame_time = None

        self.pending_crossings = []
        self.window_crossings = []
        self.daily_totals = self._empty_totals()
        self.totals_date = date.today()
        self.history_bucket = []
        self.last_history_flush = time.monotonic()
        self.hour_bucket = []
        self.current_hour = datetime.now().replace(minute=0, second=0, microsecond=0)
        self.last_snapshot_time = 0.0
        self.heavy_streak = 0

        print(f"BITCAS vision node | site: {self.config['site_name']} ({self.config['camera_id']})")
        print(f"Source: {video_source} | output: {os.path.abspath(output_file)}")
        print(f"History: {self.writer.history_file}")

    @staticmethod
    def _empty_totals():
        return {'total': 0, 'by_class': defaultdict(int), 'by_direction': defaultdict(int)}

    # -- setup -------------------------------------------------------------

    def start_capture(self):
        self.grabber = FrameGrabber(self.video_source)
        frame = None
        deadline = time.time() + 10
        while frame is None and time.time() < deadline:
            frame = self.grabber.read()
            if frame is None:
                time.sleep(0.05)
        if frame is None:
            raise ValueError(f"No frames received from source: {self.video_source}")

        height, width = frame.shape[:2]
        self.frame_size = (width, height)
        self._build_geometry(width, height)
        self.calibration.build(width, height)
        if self.grabber.is_file:
            print(f"Capture ready at {width}x{height} | video file {self.grabber.fps:.1f} FPS (realtime playback)")
        else:
            print(f"Capture ready at {width}x{height} | live camera (drop stale frames)")
        return frame

    def _build_geometry(self, width, height):
        polygon = [to_pixels(point, width, height) for point in self.config['roi']['polygon']]
        self.roi_polygon = np.array(polygon, dtype=np.int32)

        self.roi_mask = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(self.roi_mask, [self.roi_polygon], 255)
        self.roi_area = float(max(1, cv2.countNonZero(self.roi_mask)))

        self.counting_lines = [CountingLine(line, width, height)
                               for line in self.config['counting_lines']]
        if not self.config['roi'].get('calibrated'):
            print("Note: ROI not calibrated -- using the whole frame. Run calibrate.py for accuracy.")
        self.congestion.roi_calibrated = bool(self.config['roi'].get('calibrated'))

    # -- per-cycle work ----------------------------------------------------

    def _in_roi(self, centroid):
        return cv2.pointPolygonTest(self.roi_polygon, (float(centroid[0]), float(centroid[1])), False) >= 0

    def _occupancy_fraction(self, tracks):
        """Share of the road ROI covered by vehicles -- the density measure."""
        if not tracks:
            return 0.0
        mask = np.zeros(self.roi_mask.shape, dtype=np.uint8)
        for track in tracks:
            x1, y1, x2, y2 = track.bbox
            cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
        cv2.bitwise_and(mask, self.roi_mask, dst=mask)
        return cv2.countNonZero(mask) / self.roi_area

    def _register_crossings(self, tracks, now_iso):
        for track in tracks:
            previous = track.previous_centroid
            if previous is None:
                continue
            for line in self.counting_lines:
                if line.id in track.counted_lines:
                    continue
                direction = line.crossing_direction(previous, track.centroid)
                if direction is None:
                    continue
                track.counted_lines.add(line.id)
                crossing = {
                    'camera_id': self.config['camera_id'],
                    'crossed_at': now_iso,
                    'track_id': track.id,
                    'vehicle_class': track.class_name,
                    'direction': direction,
                    'line_id': line.id,
                    'speed_kph': round(track.speed_kph, 1) if track.speed_kph is not None else None
                }
                self.pending_crossings.append(crossing)
                self.window_crossings.append(crossing)
                self._record_total(crossing)

    def _record_total(self, crossing):
        today = date.today()
        if today != self.totals_date:
            self.daily_totals = self._empty_totals()
            self.totals_date = today
        self.daily_totals['total'] += 1
        self.daily_totals['by_class'][crossing['vehicle_class']] += 1
        self.daily_totals['by_direction'][crossing['direction']] += 1

    def _cpu_temperature(self):
        path = '/sys/class/thermal/thermal_zone0/temp'
        try:
            with open(path, 'r', encoding='utf-8') as handle:
                return round(int(handle.read().strip()) / 1000.0, 1)
        except (OSError, ValueError):
            return None

    def _build_payload(self, tracks, now):
        roi_tracks = [track for track in tracks if self._in_roi(track.centroid)]
        vehicles_in_frame = len(roi_tracks)

        occupancy = self._occupancy_fraction(roi_tracks)
        smoothed = self.congestion.smooth(vehicles_in_frame, now)

        speeds_kph = [t.speed_kph for t in roi_tracks if t.speed_kph is not None]
        avg_speed_kph = sum(speeds_kph) / len(speeds_kph) if speeds_kph else None
        min_samples = self.tracker.min_speed_samples
        speeds_pps = [t.speed_pps for t in roi_tracks if len(t.pixel_history) >= min_samples]
        avg_speed_pps = sum(speeds_pps) / len(speeds_pps) if speeds_pps else None

        slowness = self.congestion.slowness_term(avg_speed_kph, avg_speed_pps, vehicles_in_frame)
        score = self.congestion.score(
            occupancy, smoothed, avg_speed_kph, avg_speed_pps, vehicles_in_frame)
        level = self.congestion.level(score)
        motion = self.congestion.motion_label(slowness, vehicles_in_frame)

        vehicle_types = defaultdict(int)
        positions = []
        width = max(1, self.frame_size[0])
        height = max(1, self.frame_size[1])
        for track in roi_tracks:
            vehicle_types[track.class_name] += 1
            positions.append({
                'x': round(track.centroid[0] / width, 4),
                'y': round(track.centroid[1] / height, 4),
                'class': track.class_name
            })

        window_directions = defaultdict(int)
        for crossing in self.window_crossings:
            window_directions[crossing['direction']] += 1
        window_seconds = max(0.001, self.update_interval)

        payload = {
            # --- v2 fields ---
            'schema': 2,
            'camera_id': self.config['camera_id'],
            'site_name': self.config['site_name'],
            'timestamp': datetime.now().isoformat(timespec='seconds'),
            'lat': self.config.get('lat'),
            'lng': self.config.get('lng'),
            'congestion_level': level,
            'congestion_score': score,
            'vehicles_in_frame': vehicles_in_frame,
            'smoothed_vehicle_count': round(smoothed, 2),
            'occupancy_pct': round(occupancy * 100, 1),
            'motion': motion,
            'avg_speed_kph': round(avg_speed_kph, 1) if avg_speed_kph is not None else None,
            'speed_calibrated': self.calibration.enabled,
            'flow': {
                'window_seconds': round(window_seconds, 1),
                'per_minute': round(len(self.window_crossings) * 60.0 / window_seconds, 1),
                **{key: value for key, value in window_directions.items()}
            },
            'totals': {
                'date': self.totals_date.isoformat(),
                'today': self.daily_totals['total'],
                'by_class': dict(self.daily_totals['by_class']),
                'by_direction': dict(self.daily_totals['by_direction'])
            },
            'crossings': self.window_crossings[-20:],
            'health': {
                'fps': round(sum(self._fps_samples) / len(self._fps_samples), 1) if self._fps_samples else 0.0,
                'backend': self.detector.backend,
                'detect_every': self.detect_every,
                'cpu_temp_c': self._cpu_temperature(),
                'uptime_s': int(time.time() - self.started_at),
                'roi_calibrated': bool(self.config['roi'].get('calibrated')),
                'lines_calibrated': all(line.get('calibrated') for line in self.config['counting_lines'])
            },

            # --- v1 compatibility: keeps the existing dashboard working ---
            'color': LEVEL_COLORS[level],
            'label': level,
            'vehicle_count': vehicles_in_frame,
            'detections_count': vehicles_in_frame,
            'source': 'traffic_vision_system',
            'vehicle_types': dict(vehicle_types),
            'positions': positions,
            'avg_speed': round(avg_speed_kph, 1) if avg_speed_kph is not None else (
                round(avg_speed_pps, 1) if avg_speed_pps is not None else 0.0
            )
        }

        if positions:
            xs = [item['x'] if isinstance(item, dict) else item for item in positions]
            payload['avg_position'] = round(sum(xs) / len(xs), 4)

        return payload

    def _flush_history(self, now_monotonic, force=False):
        """Aggregate the publish-cycle samples into one line per interval."""
        if not self.history_bucket:
            return
        if not force and now_monotonic - self.last_history_flush < self.history_interval:
            return

        bucket = self.history_bucket
        speeds = [entry['avg_speed_kph'] for entry in bucket if entry['avg_speed_kph'] is not None]
        classes = defaultdict(int)
        directions = defaultdict(int)
        for entry in bucket:
            for name, count in entry['vehicle_types'].items():
                classes[name] += count
            for name, count in entry['directions'].items():
                directions[name] += count

        record = {
            'camera_id': self.config['camera_id'],
            'timestamp': datetime.now().isoformat(timespec='seconds'),
            'window_seconds': round(now_monotonic - self.last_history_flush, 1),
            'samples': len(bucket),
            'congestion_score': round(sum(e['score'] for e in bucket) / len(bucket), 1),
            'congestion_level': self.congestion.level(int(round(sum(e['score'] for e in bucket) / len(bucket)))),
            'peak_congestion_score': max(e['score'] for e in bucket),
            'vehicles_in_frame_avg': round(sum(e['vehicles'] for e in bucket) / len(bucket), 2),
            'vehicles_in_frame_peak': max(e['vehicles'] for e in bucket),
            'occupancy_pct': round(sum(e['occupancy'] for e in bucket) / len(bucket), 1),
            'avg_speed_kph': round(sum(speeds) / len(speeds), 1) if speeds else None,
            'speed_calibrated': self.calibration.enabled,
            'crossings': sum(e['crossings'] for e in bucket),
            'vehicle_types': dict(classes),
            'by_direction': dict(directions)
        }
        self.writer.append_history(record)
        self.history_bucket = []
        self.last_history_flush = now_monotonic

        self.hour_bucket.append(record)
        self._flush_hourly()

    def _flush_hourly(self, force=False):
        """Roll the collected minute records up into one record per hour."""
        if not self.hour_bucket:
            return
        hour_now = datetime.now().replace(minute=0, second=0, microsecond=0)
        if not force and hour_now <= self.current_hour:
            return

        self.writer.append_hourly(aggregate_minute_records(
            self.hour_bucket, self.config['camera_id'], self.current_hour, self.congestion
        ))
        self.hour_bucket = []
        self.current_hour = hour_now

    # -- snapshots ---------------------------------------------------------

    def save_evidence_snapshot(self, frame, tracks, level, score):
        os.makedirs(WEB_SNAPSHOT_DIR, exist_ok=True)
        filename = f"heavy_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        path = os.path.join(WEB_SNAPSHOT_DIR, filename)

        annotated = self.draw_overlay(frame, tracks, level, score)
        height, width = annotated.shape[:2]
        if width > 960:
            annotated = cv2.resize(annotated, (960, int(height * 960 / width)))
        if not cv2.imwrite(path, annotated, [cv2.IMWRITE_JPEG_QUALITY, 75]):
            raise IOError(f"Unable to save snapshot: {path}")

        existing = sorted(
            (item for item in os.scandir(WEB_SNAPSHOT_DIR) if item.is_file() and item.name.endswith('.jpg')),
            key=lambda item: item.stat().st_mtime
        )
        for stale in existing[:-self.max_snapshots]:
            os.remove(stale.path)
        return f"{SNAPSHOT_URL_PREFIX}/{filename}"

    # -- display -----------------------------------------------------------

    def draw_overlay(self, frame, tracks, level, score):
        annotated = frame.copy()
        colors = {'car': (0, 220, 0), 'motorcycle': (255, 170, 0),
                  'bus': (0, 170, 255), 'truck': (255, 0, 170)}

        cv2.polylines(annotated, [self.roi_polygon], True, (200, 200, 200), 1)
        for line in self.counting_lines:
            cv2.line(annotated,
                     (int(line.start[0]), int(line.start[1])),
                     (int(line.end[0]), int(line.end[1])), (0, 255, 255), 2)

        for track in tracks:
            x1, y1, x2, y2 = track.bbox
            color = colors.get(track.class_name, (200, 200, 200))
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            if track.speed_kph is not None:
                speed_text = f" {track.speed_kph:.0f}km/h"
            elif track.speed_pps:
                speed_text = f" {track.speed_pps:.0f}px/s"
            else:
                speed_text = ""
            cv2.putText(annotated, f"{track.class_name}#{track.id}{speed_text}",
                        (x1, max(12, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        overlay = annotated.copy()
        cv2.rectangle(overlay, (5, 5), (360, 136), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, annotated, 0.4, 0, annotated)
        cv2.rectangle(annotated, (5, 5), (360, 136), (255, 255, 255), 1)

        roi_tracks = [track for track in tracks if self._in_roi(track.centroid)]
        occupancy_pct = self._occupancy_fraction(roi_tracks) * 100
        fps = sum(self._fps_samples) / len(self._fps_samples) if self._fps_samples else 0.0
        lines = [
            f"{level}  score {score}  (MOD {self.congestion.moderate}  HEV {self.congestion.heavy})",
            f"In frame: {len(roi_tracks)}   Today: {self.daily_totals['total']}",
            f"Occupancy {occupancy_pct:.0f}%   load {len(roi_tracks)}/{self.congestion.capacity}",
            f"FPS {fps:.1f}  {self.detector.backend}  speed {'off' if not self.calibration.enabled else 'on'}"
        ]
        for index, text in enumerate(lines):
            cv2.putText(annotated, text, (14, 32 + index * 26),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6 if index == 0 else 0.5,
                        (255, 255, 255), 2 if index == 0 else 1)
        return annotated

    # -- main loop ---------------------------------------------------------

    def run(self, display_output=True):
        if not self.grabber:
            self.start_capture()

        print("Processing... press 'q' in the video window to quit (Ctrl+C when headless)")
        last_publish = 0.0
        detections = []
        tracks = []
        level, score = 'LIGHT', 0

        try:
            while True:
                frame = self.grabber.read()
                if frame is None:
                    if self.grabber.finished:
                        print("End of video stream")
                        break
                    time.sleep(0.005)
                    continue

                frame_started = time.monotonic()
                now = time.time()
                if self._last_frame_time:
                    delta = now - self._last_frame_time
                    if delta > 0:
                        self._fps_samples.append(1.0 / delta)
                self._last_frame_time = now
                self.frame_count += 1

                # Detection is the expensive step; tracking between detections
                # is nearly free and keeps IDs alive on a slow Pi.
                if self.frame_count % self.detect_every == 0:
                    detections = self.detector.detect(frame)
                    tracks = self.tracker.update(detections, now)
                    self._register_crossings(tracks, datetime.now().isoformat(timespec='seconds'))

                now_monotonic = time.monotonic()
                if now_monotonic - last_publish >= self.update_interval:
                    payload = self._build_payload(tracks, now)
                    level, score = payload['congestion_level'], payload['congestion_score']

                    if level == 'HEAVY':
                        self.heavy_streak += 1
                    else:
                        self.heavy_streak = 0

                    if (self.heavy_streak >= self.snapshot_streak_target
                            and now_monotonic - self.last_snapshot_time >= self.snapshot_cooldown):
                        payload['snapshot_url'] = self.save_evidence_snapshot(frame, tracks, level, score)
                        self.last_snapshot_time = now_monotonic
                        print(f"Evidence snapshot saved: {payload['snapshot_url']}")

                    self.writer.write_current(payload)
                    self.writer.append_crossings(self.pending_crossings)
                    self.history_bucket.append({
                        'score': score,
                        'vehicles': payload['vehicles_in_frame'],
                        'occupancy': payload['occupancy_pct'],
                        'avg_speed_kph': payload['avg_speed_kph'],
                        'crossings': len(self.window_crossings),
                        'vehicle_types': payload['vehicle_types'],
                        'directions': {k: v for k, v in payload['flow'].items()
                                       if k not in ('window_seconds', 'per_minute')}
                    })
                    self._flush_history(now_monotonic)

                    speed_text = (f"{payload['avg_speed_kph']} km/h"
                                  if payload['avg_speed_kph'] is not None else "speed n/a")
                    print(f"[{datetime.now():%H:%M:%S}] {level} {score}% | "
                          f"{payload['vehicles_in_frame']} in frame | "
                          f"occ {payload['occupancy_pct']}% load "
                          f"{payload['vehicles_in_frame']}/{self.congestion.capacity} | "
                          f"{payload.get('motion', '--')} | {self.daily_totals['total']} today | {speed_text}")

                    self.pending_crossings = []
                    self.window_crossings = []
                    last_publish = now_monotonic

                wait_ms = 1
                if self.grabber.is_file:
                    leftover = self.grabber.frame_interval - (time.monotonic() - frame_started)
                    if leftover > 0:
                        wait_ms = max(1, int(leftover * 1000))

                if display_output:
                    cv2.imshow('BITCAS Traffic Vision', self.draw_overlay(frame, tracks, level, score))
                    if cv2.waitKey(wait_ms) & 0xFF == ord('q'):
                        break
                elif wait_ms > 1:
                    time.sleep(wait_ms / 1000.0)

        except KeyboardInterrupt:
            print("\nInterrupted by user")
        finally:
            self._final_flush()
            self.cleanup()

    def _final_flush(self):
        """Persist anything buffered so a Ctrl+C never drops counted vehicles."""
        self.writer.append_crossings(self.pending_crossings)
        self.pending_crossings = []
        self._flush_history(time.monotonic(), force=True)
        self._flush_hourly(force=True)

    def cleanup(self):
        if self.grabber:
            self.grabber.release()
        cv2.destroyAllWindows()
        print("Resources released")


def main():
    parser = argparse.ArgumentParser(description='BITCAS Traffic Vision System')
    parser.add_argument('--source', default='0', help='Camera index (0, 1, ...) or path to a video file')
    parser.add_argument('--config', default=DEFAULT_CONFIG_FILE, help='Path to site_config.json')
    parser.add_argument('--output', default=DEFAULT_CONGESTION_FILE, help='Live payload JSON path')
    parser.add_argument('--backend', default='auto', choices=['auto', 'ncnn', 'pytorch', 'haar'],
                        help='Detector backend. ncnn is 2-3x faster on a Raspberry Pi 5')
    parser.add_argument('--inference-size', type=int, default=416,
                        help='YOLO input size. Use 320 on a Pi if FPS is low')
    parser.add_argument('--confidence', type=float, default=0.5, help='Minimum detection confidence')
    parser.add_argument('--detect-every', type=int, default=1,
                        help='Run detection every Nth frame; track in between (use 2-3 on a Pi)')
    parser.add_argument('--update-interval', type=float, default=None,
                        help='Seconds between dashboard payloads (overrides site_config.json)')
    parser.add_argument('--threads', type=int, default=0,
                        help='OpenCV thread cap. Set to 3 on a Pi so the video stream keeps a core')
    parser.add_argument('--no-display', action='store_true', help='Headless mode')
    parser.add_argument('--pi', action='store_true',
                        help='Raspberry Pi 5 4GB preset: NCNN, 320px, detect every 2nd frame, 3 OpenCV threads, headless')
    args = parser.parse_args()

    if args.pi:
        if args.backend == 'auto':
            args.backend = 'ncnn'
        if args.inference_size == 416:
            args.inference_size = 320
        if args.detect_every == 1:
            args.detect_every = 2
        if args.threads == 0:
            args.threads = 3
        args.no_display = True
        print('Pi 5 preset: backend=%s inference=%s detect-every=%s threads=%s headless' % (
            args.backend, args.inference_size, args.detect_every, args.threads))

    if args.threads > 0:
        cv2.setNumThreads(args.threads)

    try:
        video_source = int(args.source)
    except ValueError:
        video_source = args.source

    system = TrafficVisionSystem(
        video_source=video_source,
        config_file=args.config,
        output_file=args.output,
        backend=args.backend,
        inference_size=args.inference_size,
        confidence_threshold=args.confidence,
        detect_every=args.detect_every,
        update_interval=args.update_interval
    )
    system.run(display_output=not args.no_display)


if __name__ == '__main__':
    main()
