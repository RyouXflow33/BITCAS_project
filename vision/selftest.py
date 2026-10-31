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
    # Never let synthetic traffic reach the real database, even on the Pi where ingest.local.json exists.
    tv.RemoteIngestClient._load = lambda self, config_path: None

    output_file = os.path.join(workspace, 'congestion.json')
    # The synthetic cars cross the built-in line. The Villamonte site file is a
    # different road shape and must not decide whether this test passes.
    config_file = os.path.join(workspace, 'site_config.json')
    with open(config_file, 'w', encoding='utf-8') as handle:
        json.dump(tv.CONFIG_DEFAULTS, handle)
    system = tv.TrafficVisionSystem(
        video_source=0, output_file=output_file, update_interval=0.2, config_file=config_file)
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

    # The dashboard's vehicle mix reads crossing_types, so it must add up to the crossings.
    logged_by_class = {}
    for crossing in crossings:
        logged_by_class[crossing['vehicle_class']] = logged_by_class.get(crossing['vehicle_class'], 0) + 1
    minute_by_class = {}
    for record in history:
        for name, count in (record.get('crossing_types') or {}).items():
            minute_by_class[name] = minute_by_class.get(name, 0) + count
    hourly_by_class = {}
    for record in hourly:
        for name, count in (record.get('crossing_types') or {}).items():
            hourly_by_class[name] = hourly_by_class.get(name, 0) + count
    if minute_by_class != logged_by_class:
        failures.append(f"minute crossing_types {minute_by_class} != crossings.jsonl {logged_by_class}")
    if hourly_by_class != logged_by_class:
        failures.append(f"hourly crossing_types {hourly_by_class} != crossings.jsonl {logged_by_class}")

    failures.extend(check_catch_up_replay())
    failures.extend(check_restart_counts())

    print('===================================================')
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1

    print(f"Counted {payload['totals']['today']} vehicles, directions={sorted(directions)}")
    print("ALL CHECKS PASSED")
    return 0


def check_catch_up_replay():
    """An outage must not leave a gap: unsent rows go out later, exactly once, oldest rule applied."""
    from datetime import datetime, timedelta

    problems = []
    workspace = tempfile.mkdtemp(prefix='bitcas_replay_')
    minute_path = os.path.join(workspace, 'traffic_history.jsonl')
    hourly_path = os.path.join(workspace, 'traffic_hourly.jsonl')
    now = datetime.now().replace(microsecond=0)

    def stamp(delta):
        return (now - delta).isoformat(timespec='seconds')

    # One row older than the server keeps, then five recent ones.
    minutes = [{'camera_id': 'T', 'timestamp': stamp(timedelta(days=5))}]
    minutes += [{'camera_id': 'T', 'timestamp': stamp(timedelta(minutes=m))} for m in (5, 4, 3, 2, 1)]
    with open(minute_path, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(json.dumps(r) for r in minutes) + '\n')

    client = tv.RemoteIngestClient(config_path='', ack_file=os.path.join(workspace, 'ack.json'))
    client.enabled = True
    client.save_data_url = 'http://invalid.test'
    client._sources = {'minute': minute_path, 'hourly': hourly_path}

    sent = []
    state = {'fail_on_call': 3}

    def fake_post(body):
        if state['fail_on_call'] and len(sent) + 1 == state['fail_on_call']:
            state['fail_on_call'] = 0
            return False
        sent.append(body['record']['timestamp'])
        return True

    client._post_json = fake_post

    client._replay_once()  # the third row fails: link dropped mid-way
    if len(sent) != 2:
        problems.append(f"replay should stop at the first failure, sent {len(sent)}")
    if not client._needs_replay:
        problems.append("a failed replay must ask to be retried")

    client._replay_once()  # link is back
    expected = [r['timestamp'] for r in minutes[1:]]
    if sent != expected:
        problems.append(f"replay sent {sent}, expected {expected} (old row skipped, none twice)")

    before = len(sent)
    client._replay_once()
    if len(sent) != before:
        problems.append("replay re-sent rows that were already acknowledged")

    with open(client.ack_file, encoding='utf-8') as handle:
        if json.load(handle)['minute'] != expected[-1]:
            problems.append("acknowledged marker did not reach the newest row")
    return problems


def check_restart_counts():
    """A restart must keep today's count, add onto this hour, and file the new hour separately."""
    from datetime import date, datetime

    problems = []
    today = date.today()
    workspace = tempfile.mkdtemp(prefix='bitcas_counts_')
    crossings_path = os.path.join(workspace, 'crossings.jsonl')
    rows = [
        {'camera_id': 'CAM', 'crossed_at': today.isoformat() + 'T01:00:00',
         'vehicle_class': 'car', 'direction': 'inbound'},
        {'camera_id': 'CAM', 'crossed_at': today.isoformat() + 'T01:00:01',
         'vehicle_class': 'motorcycle', 'direction': 'outbound'},
        {'camera_id': 'CAM', 'crossed_at': '2000-01-01T00:00:00',
         'vehicle_class': 'bus', 'direction': 'inbound'},
        {'camera_id': 'OTHER', 'crossed_at': today.isoformat() + 'T01:00:02',
         'vehicle_class': 'car', 'direction': 'inbound'},
        'not-json',
    ]
    with open(crossings_path, 'w', encoding='utf-8') as handle:
        for row in rows:
            handle.write((row if isinstance(row, str) else json.dumps(row)) + '\n')

    totals = tv.load_today_totals(crossings_path, 'CAM', today)
    if totals['total'] != 2:
        problems.append(f"today reload counted {totals['total']}, expected 2")
    if totals['by_class'].get('car') != 1 or totals['by_class'].get('motorcycle') != 1:
        problems.append(f"today reload classes {dict(totals['by_class'])}")
    if totals['by_direction'].get('inbound') != 1 or totals['by_direction'].get('outbound') != 1:
        problems.append(f"today reload directions {dict(totals['by_direction'])}")

    hour = datetime(2026, 10, 25, 7, 0, 0)
    hourly_path = os.path.join(workspace, 'traffic_hourly.jsonl')
    partial = {
        'camera_id': 'CAM', 'timestamp': hour.isoformat(timespec='seconds'), 'samples': 10,
        'crossings': 4, 'congestion_score': 20, 'peak_congestion_score': 30,
        'vehicles_in_frame_avg': 2, 'vehicles_in_frame_peak': 5, 'occupancy_pct': 10,
        'avg_speed_kph': None, 'speed_calibrated': False,
        'vehicle_types': {'car': 3}, 'crossing_types': {'car': 4}, 'by_direction': {'inbound': 4},
    }
    newer = dict(partial)
    newer['timestamp'] = '2026-10-25T08:00:00'
    with open(hourly_path, 'w', encoding='utf-8') as handle:
        handle.write(json.dumps(partial) + '\n')
        handle.write(json.dumps(newer) + '\n')
        handle.write(json.dumps(partial | {'crossings': 6, 'samples': 12}) + '\n')
    loaded = tv.load_current_hour(hourly_path, 'CAM', hour)
    if not loaded or loaded.get('crossings') != 6:
        problems.append(f"hourly reload kept {None if not loaded else loaded.get('crossings')}, expected the last line (6)")

    fresh = {
        'timestamp': hour.isoformat(timespec='seconds'), 'samples': 2, 'crossings': 1,
        'congestion_score': 50, 'peak_congestion_score': 50,
        'vehicles_in_frame_avg': 4, 'vehicles_in_frame_peak': 4, 'occupancy_pct': 20,
        'avg_speed_kph': None, 'speed_calibrated': False,
        'vehicle_types': {'motorcycle': 1}, 'crossing_types': {'motorcycle': 1},
        'by_direction': {'outbound': 1},
    }
    merged = tv.merge_hourly_records(loaded, fresh)
    if merged['crossings'] != 7 or merged['samples'] != 14:
        problems.append(f"hourly merge crossings={merged['crossings']} samples={merged['samples']}, expected 7 and 14")
    if merged['crossing_types'].get('car') != 4 or merged['crossing_types'].get('motorcycle') != 1:
        problems.append(f"hourly merge classes {merged['crossing_types']}")
    if abs(merged['congestion_score'] - round((20 * 12 + 50 * 2) / 14, 1)) > 0.05:
        problems.append(f"hourly merge score {merged['congestion_score']} is not weighted by samples")

    old_hour = datetime(2026, 10, 25, 7, 0, 0)
    new_hour = datetime(2026, 10, 25, 8, 0, 0)
    old_minute = {'timestamp': '2026-10-25T07:59:00', 'crossings': 3}
    new_minute = {'timestamp': '2026-10-25T08:00:00', 'crossings': 1}
    to_flush, kept, hour_after = tv.split_hour_bucket(old_hour, new_hour, [old_minute], new_minute)
    if to_flush != [old_minute] or kept != [new_minute] or hour_after != new_hour:
        problems.append("the first minute of a new hour was filed in the old hour")
    same_flush, same_kept, same_hour = tv.split_hour_bucket(old_hour, old_hour, [old_minute], new_minute)
    if same_flush or same_kept != [old_minute, new_minute] or same_hour != old_hour:
        problems.append("a minute inside the same hour was split off")

    if tv.ground_point((10, 20, 30, 80)) != (20.0, 80.0):
        problems.append("ground point is not the bottom centre of the box")
    return problems


def _read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as handle:
        return [json.loads(line) for line in handle if line.strip()]


if __name__ == '__main__':
    sys.exit(run())
