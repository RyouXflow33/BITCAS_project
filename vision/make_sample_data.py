"""
Generate a day of realistic v2 sample data for dashboard development.

This exists so the dashboard can be built and demonstrated before the Raspberry
Pi is deployed. Every record is stamped `"source": "sample_generator"`, which
makes the dashboard show the SIMULATED badge -- generated traffic must never be
mistaken for a camera reading.

    python make_sample_data.py              # 24 hours into assets/data/
    python make_sample_data.py --hours 72
    python make_sample_data.py --clean      # remove generated files

Delete the files (or run --clean) the moment the real vision node is running.
"""

import argparse
import json
import math
import os
import random
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'assets', 'data'))

SOURCE_TAG = 'sample_generator'
CAMERA_ID = 'CAM-SAMPLE-01'

# Vehicles per minute by hour of day: quiet overnight, sharp morning and
# evening peaks, a mild midday plateau. Loosely shaped after a Philippine
# barangay arterial road.
FLOW_BY_HOUR = [
    3, 2, 2, 2, 4, 9, 18, 31, 34, 24, 19, 20,
    22, 20, 19, 22, 28, 36, 38, 29, 19, 12, 7, 4
]

# Motorcycle-heavy mix, which is what Bacolod streets actually look like.
VEHICLE_MIX = [('car', 0.46), ('motorcycle', 0.40), ('truck', 0.09), ('bus', 0.05)]

FREE_FLOW_KPH = 40.0
CAPACITY = 20
BANDS = {'moderate': 40, 'heavy': 65, 'critical': 85}
LEVEL_COLORS = {
    'LIGHT': '#27ae60', 'MODERATE': '#f39c12',
    'HEAVY': '#e74c3c', 'CRITICAL': '#8b1a1a'
}


def level_for(score):
    if score >= BANDS['heavy']:
        return 'HEAVY'
    if score >= BANDS['moderate']:
        return 'MODERATE'
    return 'LIGHT'


def split_by_class(total):
    counts = {}
    remaining = total
    for index, (name, share) in enumerate(VEHICLE_MIX):
        if index == len(VEHICLE_MIX) - 1:
            counts[name] = max(0, remaining)
        else:
            value = int(round(total * share * random.uniform(0.85, 1.15)))
            value = min(value, remaining)
            counts[name] = value
            remaining -= value
    return {name: count for name, count in counts.items() if count > 0}


def sample_positions(vehicle_types):
    """Same {x, y, class} objects the live node publishes for map dots."""
    positions = []
    for class_name, count in vehicle_types.items():
        for _ in range(count):
            positions.append({
                'x': round(random.uniform(0.12, 0.88), 4),
                'y': round(random.uniform(0.08, 0.92), 4),
                'class': class_name
            })
    return positions


def sample_minute(moment):
    """One minute of plausible traffic, with the congestion model applied."""
    hour = moment.hour
    base = FLOW_BY_HOUR[hour]
    # Blend toward the next hour so peaks ramp rather than step.
    nxt = FLOW_BY_HOUR[(hour + 1) % 24]
    blended = base + (nxt - base) * (moment.minute / 60.0)

    weekday_factor = 0.72 if moment.weekday() >= 5 else 1.0
    crossings = max(0, int(round(random.gauss(blended * weekday_factor, blended * 0.18))))

    # Vehicles standing in frame grows faster than flow once the road saturates.
    saturation = min(1.0, crossings / 34.0)
    in_frame = max(0, int(round(crossings * 0.34 + (saturation ** 2) * 16 + random.gauss(0, 1.1))))

    occupancy = min(0.95, in_frame / 26.0 * random.uniform(0.9, 1.1))
    speed = max(2.0, FREE_FLOW_KPH * (1.0 - 0.88 * (saturation ** 1.4)) * random.uniform(0.9, 1.08))

    load = min(1.0, in_frame / CAPACITY)
    slowness = min(1.0, max(0.0, 1.0 - speed / FREE_FLOW_KPH))
    score = int(round(100 * (0.45 * occupancy + 0.30 * load + 0.25 * slowness)))
    score = max(0, min(100, score))

    inbound = int(round(crossings * random.uniform(0.42, 0.58)))
    return {
        'crossings': crossings,
        'in_frame': in_frame,
        'occupancy_pct': round(occupancy * 100, 1),
        'speed_kph': round(speed, 1),
        'score': score,
        'level': level_for(score),
        'inbound': inbound,
        'outbound': crossings - inbound
    }


def apply_incident(minute):
    """
    Turn a normal minute into the signature of a blockage.

    Flow collapses and speed drops through the floor while the road stays full
    -- vehicles are present but not moving. This is what the anomaly detector
    is supposed to catch, so the generated data has to contain a real one.
    """
    minute['crossings'] = max(0, int(minute['crossings'] * random.uniform(0.05, 0.2)))
    minute['speed_kph'] = round(random.uniform(1.5, 4.5), 1)
    minute['in_frame'] = int(minute['in_frame'] * random.uniform(1.4, 1.9)) + 6
    minute['occupancy_pct'] = round(min(94.0, minute['occupancy_pct'] * 1.7 + 18), 1)
    minute['score'] = min(100, int(minute['score'] * 1.3 + 38))
    minute['level'] = level_for(minute['score'])
    inbound = int(minute['crossings'] * 0.5)
    minute['inbound'] = inbound
    minute['outbound'] = minute['crossings'] - inbound
    return minute


def build_history(hours, end, incidents=()):
    records = []
    start = end - timedelta(hours=hours)
    moment = start
    while moment < end:
        minute = sample_minute(moment)
        if any(window_start <= moment < window_end for window_start, window_end in incidents):
            minute = apply_incident(minute)
        records.append({
            'camera_id': CAMERA_ID,
            'source': SOURCE_TAG,
            'timestamp': moment.isoformat(timespec='seconds'),
            'window_seconds': 60.0,
            'samples': 20,
            'congestion_score': minute['score'],
            'congestion_level': minute['level'],
            'peak_congestion_score': min(100, minute['score'] + random.randint(0, 6)),
            'vehicles_in_frame_avg': minute['in_frame'],
            'vehicles_in_frame_peak': minute['in_frame'] + random.randint(0, 3),
            'occupancy_pct': minute['occupancy_pct'],
            'avg_speed_kph': minute['speed_kph'],
            'speed_calibrated': True,
            'crossings': minute['crossings'],
            'vehicle_types': split_by_class(minute['crossings']),
            'by_direction': {'inbound': minute['inbound'], 'outbound': minute['outbound']}
        })
        moment += timedelta(minutes=1)
    return records


def build_current(end, today_total, today_by_direction, incidents=()):
    minute = sample_minute(end)
    if any(window_start <= end < window_end for window_start, window_end in incidents):
        minute = apply_incident(minute)
    level = minute['level']
    types = split_by_class(minute['in_frame'])
    positions = sample_positions(types)
    return {
        'schema': 2,
        'camera_id': CAMERA_ID,
        'site_name': 'Villamonte Street Intersection (SAMPLE DATA)',
        'timestamp': end.isoformat(timespec='seconds'),
        'congestion_level': level,
        'congestion_score': minute['score'],
        'vehicles_in_frame': minute['in_frame'],
        'smoothed_vehicle_count': minute['in_frame'],
        'occupancy_pct': minute['occupancy_pct'],
        'avg_speed_kph': minute['speed_kph'],
        'speed_calibrated': True,
        'flow': {
            'window_seconds': 3.0,
            'per_minute': float(minute['crossings']),
            'inbound': minute['inbound'],
            'outbound': minute['outbound']
        },
        'totals': {
            'date': end.date().isoformat(),
            'today': today_total,
            'by_class': split_by_class(today_total),
            'by_direction': today_by_direction
        },
        'crossings': [],
        'health': {
            'fps': 6.4, 'backend': 'sample_generator', 'detect_every': 1,
            'cpu_temp_c': 54.2, 'uptime_s': 3600,
            'roi_calibrated': True, 'lines_calibrated': True
        },
        'color': LEVEL_COLORS[level],
        'label': level,
        'vehicle_count': minute['in_frame'],
        'detections_count': minute['in_frame'],
        # Marks the payload as generated, so the dashboard shows SIMULATED.
        'source': SOURCE_TAG,
        'vehicle_types': types,
        'positions': positions,
        'avg_speed': minute['speed_kph']
    }


def rollup_hourly(records):
    """Collapse minute records into one record per clock hour."""
    buckets = {}
    for record in records:
        key = record['timestamp'][:13]  # YYYY-MM-DDTHH
        buckets.setdefault(key, []).append(record)

    hourly = []
    for key in sorted(buckets):
        group = buckets[key]
        start = datetime.fromisoformat(f"{key}:00:00")
        speeds = [r['avg_speed_kph'] for r in group if r['avg_speed_kph'] is not None]
        classes, directions = {}, {}
        for record in group:
            for name, count in record['vehicle_types'].items():
                classes[name] = classes.get(name, 0) + count
            for name, count in record['by_direction'].items():
                directions[name] = directions.get(name, 0) + count

        mean_score = sum(r['congestion_score'] for r in group) / len(group)
        hourly.append({
            'camera_id': CAMERA_ID,
            'source': SOURCE_TAG,
            'timestamp': start.isoformat(timespec='seconds'),
            'weekday': start.weekday(),
            'hour': start.hour,
            'samples': len(group),
            'congestion_score': round(mean_score, 1),
            'congestion_level': level_for(int(round(mean_score))),
            'peak_congestion_score': max(r['peak_congestion_score'] for r in group),
            'vehicles_in_frame_avg': round(sum(r['vehicles_in_frame_avg'] for r in group) / len(group), 2),
            'vehicles_in_frame_peak': max(r['vehicles_in_frame_peak'] for r in group),
            'occupancy_pct': round(sum(r['occupancy_pct'] for r in group) / len(group), 1),
            'avg_speed_kph': round(sum(speeds) / len(speeds), 1) if speeds else None,
            'speed_calibrated': True,
            'crossings': sum(r['crossings'] for r in group),
            'vehicle_types': classes,
            'by_direction': directions
        })
    return hourly


def main():
    parser = argparse.ArgumentParser(description='Generate BITCAS sample vision data')
    parser.add_argument('--days', type=int, default=21,
                        help='Days of hourly history (heatmaps and prediction need 2+ weeks)')
    parser.add_argument('--minute-hours', type=int, default=48,
                        help='How many recent hours also get minute-level detail')
    parser.add_argument('--out', default=DEFAULT_OUT_DIR, help='Output directory')
    parser.add_argument('--seed', type=int, default=7, help='Random seed for repeatability')
    parser.add_argument('--no-incident', action='store_true',
                        help='Skip the injected blockage used to exercise anomaly detection')
    parser.add_argument('--clean', action='store_true', help='Delete generated files and exit')
    args = parser.parse_args()

    history_path = os.path.join(args.out, 'traffic_history.jsonl')
    hourly_path = os.path.join(args.out, 'traffic_hourly.jsonl')
    current_path = os.path.join(args.out, 'congestion.json')

    if args.clean:
        for path in (history_path, hourly_path):
            if os.path.exists(path):
                os.remove(path)
                print(f"Removed {path}")
        print("Left congestion.json in place; the vision node overwrites it on start.")
        return

    random.seed(args.seed)
    os.makedirs(args.out, exist_ok=True)
    end = datetime.now().replace(second=0, microsecond=0)

    # One blockage still in progress, so it falls inside the detector's 10-minute
    # window and the dashboard shows a live alert. One two days back gives the
    # historical record something that is not a clean weekly pattern.
    incidents = []
    if not args.no_incident:
        recent_start = end - timedelta(minutes=14)
        incidents.append((recent_start, end + timedelta(minutes=1)))
        older_start = end - timedelta(days=2, hours=3)
        incidents.append((older_start, older_start + timedelta(minutes=35)))

    total_hours = args.days * 24
    records = build_history(total_hours, end, incidents)

    hourly = rollup_hourly(records)
    with open(hourly_path, 'w', encoding='utf-8') as handle:
        for record in hourly:
            handle.write(json.dumps(record) + '\n')

    detail_cutoff = end - timedelta(hours=args.minute_hours)
    detail = [r for r in records if datetime.fromisoformat(r['timestamp']) >= detail_cutoff]
    with open(history_path, 'w', encoding='utf-8') as handle:
        for record in detail:
            handle.write(json.dumps(record) + '\n')

    today = end.date().isoformat()
    today_records = [r for r in records if r['timestamp'][:10] == today]
    today_total = sum(r['crossings'] for r in today_records)
    today_by_direction = {
        'inbound': sum(r['by_direction']['inbound'] for r in today_records),
        'outbound': sum(r['by_direction']['outbound'] for r in today_records)
    }

    with open(current_path, 'w', encoding='utf-8') as handle:
        json.dump(build_current(end, today_total, today_by_direction, incidents), handle, indent=2)

    print(f"Wrote {len(hourly)} hourly records ({os.path.getsize(hourly_path)/1024:.0f} KB) "
          f"covering {args.days} days -> {hourly_path}")
    print(f"Wrote {len(detail)} minute records ({os.path.getsize(history_path)/1024:.0f} KB) "
          f"covering {args.minute_hours} h -> {history_path}")
    print(f"Wrote current payload -> {current_path}")
    print(f"Counted today: {today_total} vehicles "
          f"({today_by_direction['inbound']} in / {today_by_direction['outbound']} out)")
    for window_start, window_end in incidents:
        print(f"Injected blockage: {window_start:%Y-%m-%d %H:%M} to {window_end:%H:%M}")

    print("\nThese files are SAMPLE DATA. The dashboard will show a SAMPLE DATA badge.")
    print("Delete them (python make_sample_data.py --clean) once the Pi is publishing.")


if __name__ == '__main__':
    main()
