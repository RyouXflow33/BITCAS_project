"""
Traffic Vision System - Python-based vehicle detection and congestion analysis
for integration with the web-based traffic monitoring system.

This script processes video to detect and track vehicles, determines congestion
levels based on vehicle count/density, and writes the results to a JSON file
that the web system can read.
"""

import cv2
import json
import time
import os
import math
from datetime import datetime
from collections import defaultdict, deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'assets', 'data'))
DEFAULT_CONGESTION_FILE = os.path.join(WEB_DATA_DIR, 'congestion.json')
WEB_SNAPSHOT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'assets', 'snapshots'))
SNAPSHOT_URL_PREFIX = 'assets/snapshots'

# Try to import YOLO, fallback to simpler detection if not available
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("Warning: ultralytics not available. Using basic OpenCV detection.")


class TrafficVisionSystem:
    def __init__(self, video_source=0, output_file=DEFAULT_CONGESTION_FILE, update_interval=3,
                 inference_size=416, confidence_threshold=0.5):
        """
        Initialize the traffic vision system.

        Args:
            video_source: Camera index (0 for default) or path to video file
            output_file: Path to JSON file where congestion data will be written
            update_interval: Seconds between dashboard payload updates
            inference_size: Square YOLO inference size; lower values reduce Pi CPU load
            confidence_threshold: Minimum YOLO confidence for vehicle detections
        """
        self.video_source = video_source
        self.output_file = os.path.abspath(output_file)
        self.update_interval = max(0.1, float(update_interval))
        self.inference_size = max(320, int(inference_size))
        self.confidence_threshold = min(0.95, max(0.1, float(confidence_threshold)))
        self.cap = None
        self.snapshot_cooldown_seconds = 15 * 60
        self.last_snapshot_time = 0.0
        self.max_snapshots = 100

        # Vehicle detection setup
        if YOLO_AVAILABLE:
            # Load pre-trained YOLOv8n model (nano version for speed)
            # This model is trained on COCO dataset which includes vehicles
            self.model = YOLO(os.path.join(SCRIPT_DIR, 'yolov8n.pt'))
            self.vehicle_classes = [2, 3, 5, 7]  # car, motorcycle, bus, truck in COCO
            # Map class IDs to vehicle names
            self.class_to_name = {
                2: 'car',
                3: 'motorcycle',
                5: 'bus',
                7: 'truck'
            }
        else:
            # Fallback to Haar cascades or basic motion detection
            self.vehicle_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_car.xml'
            )
            self.vehicle_classes = [1]  # car class for Haar cascade
            self.class_to_name = {1: 'car'}

        # Tracking and counting
        self.frame_count = 0
        self.vehicle_counts = defaultdict(int)
        self.congestion_history = deque(maxlen=30)  # Keep last 30 frames for smoothing
        # Keep history beside the current payload so the dashboard can read both.
        self.history_file = os.path.join(os.path.dirname(self.output_file), 'traffic_history.json')
        self.history_limit = 1000  # Keep last 1000 entries
        # Simple speed tracking (store last N positions with timestamps)
        self.speed_history = defaultdict(lambda: deque(maxlen=10))  # Track ID -> positions
        self.next_track_id = 0
        self.tracked_vehicles = {}  # Map detection to track ID

        # Congestion thresholds (vehicles per frame)
        # These may need adjustment based on your camera angle and road width
        self.LIGHT_THRESHOLD = 5
        self.MODERATE_THRESHOLD = 15

        # Colors and labels matching the web system
        self.congestion_levels = {
            'LIGHT': {'color': '#27ae60', 'label': 'LIGHT'},
            'MODERATE': {'color': '#f39c12', 'label': 'MODERATE'},
            'HEAVY': {'color': '#e74c3c', 'label': 'HEAVY'}
        }

        print(f"Traffic Vision System initialized")
        print(f"Video source: {video_source}")
        print(f"Output file: {self.output_file}")
        print(f"History file: {self.history_file}")
        print(f"Inference size: {self.inference_size}")
        print(f"YOLO available: {YOLO_AVAILABLE}")

    @staticmethod
    def _atomic_write_json(path, data):
        """Write JSON atomically so web pollers never read a partially-written file."""
        output_dir = os.path.dirname(path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        temp_path = path + '.tmp'
        with open(temp_path, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_path, path)

    def start_capture(self):
        """Start video capture from source."""
        self.cap = cv2.VideoCapture(self.video_source)
        if not self.cap.isOpened():
            raise ValueError(f"Cannot open video source: {self.video_source}")

        # Set properties for better performance
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        # Get actual FPS
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        if self.fps <= 0:
            self.fps = 30  # fallback

        print(f"Video capture started successfully (FPS: {self.fps})")

    def detect_vehicles_yolo(self, frame):
        """
        Detect vehicles using YOLO model.

        Returns:
            List of detections, each detection is [x1, y1, x2, y2, confidence, class_id]
        """
        results = self.model(
            frame,
            verbose=False,
            imgsz=self.inference_size,
            conf=self.confidence_threshold,
            classes=self.vehicle_classes
        )
        detections = []

        for result in results:
            boxes = result.boxes
            for box in boxes:
                # Get box coordinates, confidence, and class
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                confidence = box.conf[0].cpu().numpy()
                class_id = int(box.cls[0].cpu().numpy())

                # Filter for vehicle classes only
                if class_id in self.vehicle_classes and confidence >= self.confidence_threshold:
                    detections.append([int(x1), int(y1), int(x2), int(y2), float(confidence), class_id])

        return detections

    def detect_vehicles_basic(self, frame):
        """
        Basic vehicle detection using Haar cascades (fallback).

        Returns:
            List of detections, each detection is [x, y, w, h]
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        vehicles = self.vehicle_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=3,
            minSize=(30, 30)
        )

        detections = []
        for (x, y, w, h) in vehicles:
            detections.append([x, y, x+w, y+h, 0.8, 2])  # format: [x1,y1,x2,y2,conf,class]

        return detections

    def detect_vehicles(self, frame):
        """
        Detect vehicles in frame using available method.

        Returns:
            List of detections with tracking IDs and speed estimates
        """
        if YOLO_AVAILABLE:
            detections = self.detect_vehicles_yolo(frame)
        else:
            detections = self.detect_vehicles_basic(frame)

        # Simple tracking: associate detections with previous frame detections
        tracked_detections = self.update_tracks(detections, frame.shape[1])

        return tracked_detections

    def update_tracks(self, detections, frame_width):
        """
        Simple centroid-based tracking to assign IDs and estimate speed.

        Args:
            detections: List of raw detections [x1, y1, x2, y2, confidence, class_id]
            frame_width: Width of the frame for normalization

        Returns:
            List of detections with tracking info: [x1, y1, x2, y2, confidence, class_id, track_id, speed]
        """
        if not detections:
            # If no detections, just return empty list and decay existing tracks
            # Decay track history (remove old entries)
            for track_id in list(self.speed_history.keys()):
                if len(self.speed_history[track_id]) == 0:
                    del self.speed_history[track_id]
                    if track_id in self.tracked_vehicles:
                        del self.tracked_vehicles[track_id]
            return []

        # Convert detections to centroids
        centroids = []
        for detection in detections:
            x1, y1, x2, y2, conf, cls = detection
            centroid_x = (x1 + x2) / 2
            centroid_y = (y1 + y2) / 2
            centroids.append((centroid_x, centroid_y))

        # If no existing tracks, assign new IDs to all detections
        if not self.speed_history:
            for i, detection in enumerate(detections):
                track_id = self.next_track_id
                self.next_track_id += 1
                self.speed_history[track_id].append((time.time(), centroids[i][0], centroids[i][1]))
                self.tracked_vehicles[i] = track_id
                # Add tracking info to detection
                detections[i].append(track_id)  # track_id
                detections[i].append(0.0)       # speed (0 for first frame)
            return detections

        # Associate detections with existing tracks using closest centroid
        assigned_tracks = {}
        used_track_ids = set()

        for det_idx, detection in enumerate(detections):
            det_centroid = centroids[det_idx]
            best_track_id = None
            min_distance = float('inf')

            # Find closest existing track
            for track_id, history in self.speed_history.items():
                if track_id in used_track_ids:
                    continue
                if len(history) == 0:
                    continue
                # Get last position
                last_time, last_x, last_y = history[-1]
                distance = math.sqrt((det_centroid[0] - last_x)**2 + (det_centroid[1] - last_y)**2)
                if distance < min_distance:
                    min_distance = distance
                    best_track_id = track_id

            # If close enough, assign to existing track, otherwise create new track
            if best_track_id is not None and min_distance < 50:  # threshold pixels
                assigned_tracks[det_idx] = best_track_id
                used_track_ids.add(best_track_id)
                # Update track history
                self.speed_history[best_track_id].append((time.time(), det_centroid[0], det_centroid[1]))
                self.tracked_vehicles[det_idx] = best_track_id
            else:
                # Create new track
                track_id = self.next_track_id
                self.next_track_id += 1
                assigned_tracks[det_idx] = track_id
                self.speed_history[track_id].append((time.time(), det_centroid[0], det_centroid[1]))
                self.tracked_vehicles[det_idx] = track_id

        # Add tracking info and speed to detections
        for det_idx, detection in enumerate(detections):
            track_id = assigned_tracks[det_idx]
            # Calculate speed if we have enough history
            speed = self.calculate_speed(track_id, frame_width)
            # Add tracking info to detection: [x1, y1, x2, y2, confidence, class_id, track_id, speed]
            detection.append(track_id)
            detection.append(speed)

        # Clean up old tracks (optional)
        # Remove tracks that haven't been updated in a while
        current_time = time.time()
        tracks_to_delete = []
        for track_id, history in self.speed_history.items():
            if track_id not in used_track_ids and len(history) > 0:
                last_time = history[-1][0]
                if current_time - last_time > 2.0:  # 2 seconds timeout
                    tracks_to_delete.append(track_id)
        for track_id in tracks_to_delete:
            del self.speed_history[track_id]
            # Note: We don't remove from tracked_vehicles as it's detection-index based

        return detections

    def calculate_speed(self, track_id, frame_width):
        """
        Calculate speed in pixels per second for a tracked vehicle.

        Args:
            track_id: ID of the track
            frame_width: Width of the frame for scaling

        Returns:
            Speed in pixels per second (0 if not enough data)
        """
        if track_id not in self.speed_history:
            return 0.0

        history = self.speed_history[track_id]
        if len(history) < 2:
            return 0.0

        # Use the last two points for speed calculation
        # Note: This is simplistic - better would be to use linear regression over N points
        time_diff = history[-1][0] - history[-2][0]
        if time_diff <= 0:
            return 0.0

        # Calculate distance moved
        dist_x = history[-1][1] - history[-2][1]
        dist_y = history[-1][2] - history[-2][2]
        distance = math.sqrt(dist_x**2 + dist_y**2)

        # Speed in pixels per second
        speed = distance / time_diff
        return speed

    def calculate_congestion_level(self, detections):
        """
        Calculate congestion level based on number of vehicle detections.

        Args:
            detections: List of vehicle detections from current frame

        Returns:
            Tuple of (level_key, level_info) where level_key is 'LIGHT', 'MODERATE', or 'HEAVY'
        """
        vehicle_count = len(detections)

        # Add to history for smoothing
        self.congestion_history.append(vehicle_count)

        # Use average of recent frames to reduce noise
        if len(self.congestion_history) > 0:
            avg_vehicles = sum(self.congestion_history) / len(self.congestion_history)
        else:
            avg_vehicles = vehicle_count

        # Determine congestion level
        if avg_vehicles >= self.MODERATE_THRESHOLD:
            level_key = 'HEAVY'
        elif avg_vehicles >= self.LIGHT_THRESHOLD:
            level_key = 'MODERATE'
        else:
            level_key = 'LIGHT'

        level_info = self.congestion_levels[level_key]

        return level_key, level_info, vehicle_count

    def write_congestion_data(self, level_key, level_info, vehicle_count, detections=None, frame_width=640, snapshot_url=None):
        """
        Write congestion data to JSON file.

        Args:
            level_key: Congestion level key ('LIGHT', 'MODERATE', 'HEAVY')
            level_info: Dictionary with color and label
            vehicle_count: Number of vehicles detected
            detections: Optional list of detections for debugging
            frame_width: Width of the frame (for position calculation)
        """
        # Initialize data structure
        data = {
            'timestamp': datetime.now().isoformat(),
            'congestion_level': level_key,
            'color': level_info['color'],
            'label': level_info['label'],
            'vehicle_count': vehicle_count,
            'detections_count': len(detections) if detections else 0,
            'smoothed_vehicle_count': round(sum(self.congestion_history) / len(self.congestion_history), 2) if self.congestion_history else vehicle_count,
            'source': 'traffic_vision_system'
        }
        if snapshot_url:
            data['snapshot_url'] = snapshot_url

        # Add detailed vehicle information if detections are provided
        if detections:
            # Count vehicles by type
            vehicle_types = defaultdict(int)
            positions = []  # Store normalized center x positions (0.0 to 1.0)
            speeds = []  # Store speeds in pixels per second

            for detection in detections:
                x1, y1, x2, y2, confidence, class_id, track_id, speed = detection

                # Get vehicle name
                vehicle_name = self.class_to_name.get(class_id, f'class_{class_id}')
                vehicle_types[vehicle_name] += 1

                # Calculate center x position and normalize by frame width
                center_x = (x1 + x2) / 2
                normalized_x = center_x / frame_width if frame_width > 0 else 0.5
                positions.append(normalized_x)

                # Collect speed data
                speeds.append(speed)

            # Add to data
            data['vehicle_types'] = dict(vehicle_types)
            if positions:
                data['positions'] = positions
                data['avg_position'] = sum(positions) / len(positions)
                data['position_std'] = (sum((p - data['avg_position']) ** 2 for p in positions) / len(positions)) ** 0.5 if len(positions) > 1 else 0.0

            # Add speed statistics
            if speeds:
                data['avg_speed'] = sum(speeds) / len(speeds)
                data['speed_std'] = (sum((s - data['avg_speed']) ** 2 for s in speeds) / len(speeds)) ** 0.5 if len(speeds) > 1 else 0.0
                data['max_speed'] = max(speeds)
                data['min_speed'] = min(speeds)

        try:
            self._atomic_write_json(self.output_file, data)
            # Also write to history file
            self.write_to_history(data)
        except Exception as e:
            print(f"Error writing to {self.output_file}: {e}")

    def write_to_history(self, data):
        """
        Append data to history file, keeping only the last `history_limit` entries.
        """
        try:
            # Read existing history
            if os.path.exists(self.history_file):
                with open(self.history_file, 'r') as f:
                    history = json.load(f)
            else:
                history = []

            # Append new data
            history.append(data)

            # Trim to last `history_limit` entries
            if len(history) > self.history_limit:
                history = history[-self.history_limit:]

            # Write back atomically
            self._atomic_write_json(self.history_file, history)
        except Exception as e:
            print(f"Error writing to history file {self.history_file}: {e}")

    def save_evidence_snapshot(self, frame, detections, level_key):
        """Save one compressed annotated image for a sustained HEAVY incident."""
        os.makedirs(WEB_SNAPSHOT_DIR, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"heavy_{timestamp}.jpg"
        path = os.path.join(WEB_SNAPSHOT_DIR, filename)
        annotated_frame = self.draw_detections(frame, detections, level_key)
        height, width = annotated_frame.shape[:2]
        if width > 960:
            scale = 960 / width
            annotated_frame = cv2.resize(annotated_frame, (960, int(height * scale)))
        if not cv2.imwrite(path, annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 75]):
            raise IOError(f"Unable to save snapshot: {path}")

        snapshots = sorted(
            (item for item in os.scandir(WEB_SNAPSHOT_DIR) if item.is_file() and item.name.endswith('.jpg')),
            key=lambda item: item.stat().st_mtime
        )
        for old_snapshot in snapshots[:-self.max_snapshots]:
            os.remove(old_snapshot.path)
        return f"{SNAPSHOT_URL_PREFIX}/{filename}"

    def draw_detections(self, frame, detections, level_key=None):
        """
        Draw bounding boxes and labels on frame for visualization.

        Args:
            frame: Input frame
            detections: List of detections to draw

        Returns:
            Frame with detections drawn
        """
        annotated_frame = frame.copy()

        # Calculate congestion level based on detections
        vehicle_count = len(detections)

        if level_key is None:
            level_key, _, _ = self.calculate_congestion_level(detections)

        level_info = self.congestion_levels[level_key]

        # Count vehicles by type for display
        vehicle_type_counts = defaultdict(int)
        positions = []  # For average position calculation
        speeds = []  # For average speed calculation

        for detection in detections:
            x1, y1, x2, y2, confidence, class_id, track_id, speed = detection
            vehicle_name = self.class_to_name.get(class_id, f'class_{class_id}')
            vehicle_type_counts[vehicle_name] += 1

            # Calculate center x position for average
            center_x = (x1 + x2) / 2
            # Assuming frame width of 640 for normalization (can be made configurable)
            normalized_x = center_x / 640.0
            positions.append(normalized_x)

            # Collect speed data
            speeds.append(speed)

        # Format breakdown string
        breakdown_parts = []
        for vtype in ['car', 'motorcycle', 'bus', 'truck']:  # Order for consistent display
            if vtype in vehicle_type_counts:
                breakdown_parts.append(f"{vtype}:{vehicle_type_counts[vtype]}")
        breakdown_str = " | ".join(breakdown_parts)

        # Calculate average position and speed
        avg_pos = sum(positions) / len(positions) if positions else 0.5
        avg_speed = sum(speeds) / len(speeds) if speeds else 0.0

        for detection in detections:
            x1, y1, x2, y2, confidence, class_id, track_id, speed = detection

            # Color based on class (simple mapping)
            colors = [(0, 255, 0), (255, 0, 0), (0, 0, 255), (0, 255, 255)]
            color = colors[class_id % len(colors)]

            # Draw bounding box
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)

            # Draw label with vehicle type, ID, and confidence
            vehicle_name = self.class_to_name.get(class_id, f'class_{class_id}')
            label = f"{vehicle_name}#{track_id}:{confidence:.2f}"
            cv2.putText(annotated_frame, label, (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        # Add container box in upper left for counting level (REQUESTED FEATURE)
        # Draw semi-transparent background box
        overlay = annotated_frame.copy()
        cv2.rectangle(overlay, (5, 5), (250, 90), (0, 0, 0), -1)  # Black background
        cv2.addWeighted(overlay, 0.6, annotated_frame, 0.4, 0, annotated_frame)  # Apply transparency

        # Add border to the container box
        cv2.rectangle(annotated_frame, (5, 5), (250, 90), (255, 255, 255), 2)  # White border

        # Format and display counting level information in the container
        # Main counting level
        count_text = f"TRAFFIC LEVEL: {level_key}"
        cv2.putText(annotated_frame, count_text, (15, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Vehicle count
        vehicle_text = f"VEHICLES: {vehicle_count}"
        cv2.putText(annotated_frame, vehicle_text, (15, 55),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        # Optional: Additional info below
        info_text = f"Avg Pos: {avg_pos:.2f}"
        cv2.putText(annotated_frame, info_text, (15, 75),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        return annotated_frame

    def run(self, display_output=True):
        """
        Main processing loop.

        Args:
            display_output: Whether to display the video with detections
        """
        if not self.cap:
            self.start_capture()

        print("Starting traffic vision processing... Press 'q' to quit")

        last_congestion_level = None
        last_write_time = 0.0
        heavy_publish_streak = 0

        try:
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    print("End of video stream or cannot read frame")
                    break

                self.frame_count += 1

                # Detect vehicles
                detections = self.detect_vehicles(frame)

                # Calculate congestion level
                level_key, level_info, vehicle_count = self.calculate_congestion_level(detections)

                # Publish a fresh payload at a predictable cadence. This keeps map
                # markers current even while the congestion color stays unchanged.
                now = time.monotonic()
                if level_key != last_congestion_level or now - last_write_time >= self.update_interval:
                    heavy_publish_streak = heavy_publish_streak + 1 if level_key == 'HEAVY' else 0
                    snapshot_url = None
                    if heavy_publish_streak >= 3 and now - self.last_snapshot_time >= self.snapshot_cooldown_seconds:
                        snapshot_url = self.save_evidence_snapshot(frame, detections, level_key)
                        self.last_snapshot_time = now
                        print(f"Evidence snapshot saved: {snapshot_url}")
                    self.write_congestion_data(level_key, level_info, vehicle_count, detections, snapshot_url=snapshot_url)
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Congestion: {level_key} ({vehicle_count} vehicles)")
                    last_congestion_level = level_key
                    last_write_time = now

                # Display output if requested
                if display_output:
                    annotated_frame = self.draw_detections(frame, detections, level_key)

                    cv2.imshow('Traffic Vision', annotated_frame)

                    # Break on 'q' key press
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break

                # Small delay to prevent excessive CPU usage
                time.sleep(0.01)

        except KeyboardInterrupt:
            print("\nInterrupted by user")
        finally:
            self.cleanup()

    def cleanup(self):
        """Release resources."""
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()
        print("Resources cleaned up")


def main():
    """Main function to run the traffic vision system."""
    import argparse

    parser = argparse.ArgumentParser(description='Traffic Vision System for Vehicle Detection')
    parser.add_argument('--source', type=str, default='0',
                       help='Video source: camera index (0,1,...) or path to video file')
    parser.add_argument('--output', type=str, default=DEFAULT_CONGESTION_FILE,
                       help='Output JSON file for congestion data')
    parser.add_argument('--no-display', action='store_true',
                       help='Do not display video output (headless mode)')
    parser.add_argument('--light-threshold', type=int, default=5,
                       help='Vehicle count threshold for LIGHT congestion')
    parser.add_argument('--moderate-threshold', type=int, default=15,
                       help='Vehicle count threshold for MODERATE congestion')
    parser.add_argument('--update-interval', type=float, default=3,
                       help='Seconds between JSON updates for the dashboard')
    parser.add_argument('--inference-size', type=int, default=416,
                       help='YOLO input size; 416 is a Pi-friendly default')
    parser.add_argument('--confidence', type=float, default=0.5,
                       help='Minimum YOLO confidence for a vehicle detection')

    args = parser.parse_args()

    # Convert source to int if it's a number, otherwise treat as file path
    try:
        video_source = int(args.source)
    except ValueError:
        video_source = args.source  # Treat as file path

    # Create and run the vision system
    vision_system = TrafficVisionSystem(
        video_source=video_source,
        output_file=args.output,
        update_interval=args.update_interval,
        inference_size=args.inference_size,
        confidence_threshold=args.confidence
    )

    # Set custom thresholds if provided
    vision_system.LIGHT_THRESHOLD = args.light_threshold
    vision_system.MODERATE_THRESHOLD = args.moderate_threshold

    # Run the system
    vision_system.run(display_output=not args.no_display)


if __name__ == "__main__":
    main()

