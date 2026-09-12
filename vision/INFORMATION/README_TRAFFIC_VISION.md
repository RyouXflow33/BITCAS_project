# Traffic Vision System Integration

This document explains how to integrate the Python-based traffic vision system with the existing web-based traffic monitoring system.

## Overview

The traffic vision system processes video to detect and track vehicles, determines congestion levels, and writes the results to a JSON file. The web system periodically checks this file and updates the traffic display automatically.

## Components

1. **traffic_vision.py** - Python script for vehicle detection and congestion analysis
2. **Modified controller.js** - Adds auto mode functionality to periodically check for congestion data
3. **congestion.json** - Generated file containing current congestion data (created by Python script)

## Setup Instructions

### 1. Install Dependencies

For the Python vision system, you'll need:

```bash
pip install opencv-python ultralytics
```

If you prefer not to use YOLO (requires significant disk space and download time), the system will fall back to OpenCV's Haar cascade detector.

### 2. Prepare Test Video

Place your MP4 test video in this directory or note its full path.

### 3. Run the Vision System

```bash
python traffic_vision.py --source /path/to/your/video.mp4 --output congestion.json
```

For webcam testing:
```bash
python traffic_vision.py --source 0 --output congestion.json
```

For headless mode (no video display):
```bash
python traffic_vision.py --source /path/to/video.mp4 --output congestion.json --no-display
```

### 4. Use the Web System

1. Open `index.html` in a browser
2. Check the "Enable Auto Traffic Detection" checkbox
3. The system will automatically read congestion data from `congestion.json` every 3 seconds
4. When the Python system detects a change in congestion level, the web display will update automatically

## Configuration

You can adjust congestion thresholds in `traffic_vision.py`:
- `LIGHT_THRESHOLD`: Vehicle count for LIGHT congestion (default: 5)
- `MODERATE_THRESHOLD`: Vehicle count for MODERATE congestion (default: 15)

These values may need adjustment based on your camera angle, resolution, and road width.

## How It Works

1. Python system processes video frames and detects vehicles
2. Vehicle count is averaged over recent frames to reduce noise
3. Congestion level is determined:
   - LIGHT: < LIGHT_THRESHOLD vehicles
   - MODERATE: LIGHT_THRESHOLD ≤ vehicles < MODERATE_THRESHOLD  
   - HEAVY: ≥ MODERATE_THRESHOLD vehicles
4. Results written to `congestion.json` with timestamp, level, color, label, and count
5. Web system polls `congestion.json` every 3 seconds when auto mode is enabled
6. When congestion level changes, web system updates the traffic display

## Files Updated

- `js/controller.js` - Added auto mode functionality
- `traffic_vision.py` - New Python vision system
- `README_TRAFFIC_VISION.md` - This file

## Notes

- The first time you run the Python script, it may take a moment to download the YOLO model (~25MB for yolov8n.pt)
- Ensure the web server has permission to read the `congestion.json` file
- For best results, position your camera to have a clear view of the road section you want to monitor
- The system works with both recorded video files and live camera feeds