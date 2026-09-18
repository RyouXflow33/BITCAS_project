// MVC: shared constants and static datasets (Model layer support).
const BITCAS_STORAGE_KEY = 'bitcas_ui_sim_v1';
const BITCAS_AUTH_KEY = 'bitcas_auth_v1';
const VISION_FIXTURE_URL = 'assets/data/congestion.json';
const VISION_POLL_MS = 3000;
// v2 appends one aggregated line per minute; the legacy array is the fallback
// so the dashboard still works against data captured before the rewrite.
const VISION_HISTORY_JSONL_URL = 'assets/data/traffic_history.jsonl';
const VISION_HISTORY_URL = 'assets/data/traffic_history.json';
// Hourly rollup. Minute records are capped at ~2 days in the browser, but the
// heatmap and the forecast need weeks, so they read this instead.
const VISION_HOURLY_URL = 'assets/data/traffic_hourly.jsonl';
const VISION_HOURLY_MAX_ENTRIES = 1440;
// A payload older than this means the camera or the network is down, and the
// dashboard must say so rather than presenting stale numbers as live.
const VISION_STALE_MS = 30000;
// Minute-aggregated records, so this is roughly two days of history.
const VISION_HISTORY_MAX_ENTRIES = 2880;

// Must stay in step with `congestion.bands` in vision/site_config.json.
const CONGESTION_BANDS = { moderate: 40, heavy: 65, critical: 85 };

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Forecast blend: a 15-minute horizon is mostly "what is happening right now",
// an hour out is mostly "what this slot normally looks like".
const FORECAST_HORIZONS = [
    { minutes: 15, historicalWeight: 0.35 },
    { minutes: 30, historicalWeight: 0.55 },
    { minutes: 60, historicalWeight: 0.75 }
];

// Vision levels come from the Pi. `fallbackScore` is only used for legacy
// payloads that predate the continuous congestion_score field.
const VISION_LEVELS = {
    LIGHT: { fallbackScore: 20, color: '#27ae60', caption: 'Normal', severity: 'Low' },
    MODERATE: { fallbackScore: 50, color: '#f39c12', caption: 'Monitor', severity: 'Moderate' },
    HEAVY: { fallbackScore: 75, color: '#e74c3c', caption: 'Heavy queue', severity: 'High' },
    CRITICAL: { fallbackScore: 92, color: '#8b1a1a', caption: 'Dispatch now', severity: 'Severe' }
};
const VILLAMONTE_TRAFFIC_ROAD = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        properties: { name: 'Circumferential Road', area: 'Barangay Villamonte, Bacolod City' },
        geometry: {
            type: 'LineString',
            coordinates: [
                [122.9585203, 10.6681712], [122.9597650, 10.6676309], [122.9614676, 10.6668880],
                [122.9632707, 10.6661152], [122.9654193, 10.6651956], [122.9676478, 10.6642276],
                [122.9698366, 10.6632997], [122.9712756, 10.6626900]
            ]
        }
    }]
};
// Demo-only payloads for the "Simulate vision data" button. They mirror the v2
// contract (including a calibrated speed) so the UI can be exercised without a
// camera -- the SIM badge and banner keep them distinguishable from real data.
const VISION_SIMULATION_SAMPLES = [
    {
        congestion_level: 'LIGHT', congestion_score: 22, color: '#27ae60', label: 'LIGHT',
        vehicles_in_frame: 3, vehicle_count: 3, occupancy_pct: 9.4,
        avg_speed_kph: 38.6, speed_calibrated: true,
        vehicle_types: { car: 2, motorcycle: 1 }, positions: [0.18, 0.47, 0.72],
        flow: { window_seconds: 3, per_minute: 20.0, inbound: 1 },
        totals: { today: 412, by_direction: { inbound: 221, outbound: 191 } }
    },
    {
        congestion_level: 'MODERATE', congestion_score: 54, color: '#f39c12', label: 'MODERATE',
        vehicles_in_frame: 8, vehicle_count: 8, occupancy_pct: 31.7,
        avg_speed_kph: 21.3, speed_calibrated: true,
        vehicle_types: { car: 6, bus: 1, motorcycle: 1 },
        positions: [0.08, 0.2, 0.34, 0.49, 0.58, 0.67, 0.81, 0.93],
        flow: { window_seconds: 3, per_minute: 40.0, inbound: 1, outbound: 1 },
        totals: { today: 486, by_direction: { inbound: 259, outbound: 227 } }
    },
    {
        congestion_level: 'HEAVY', congestion_score: 78, color: '#e74c3c', label: 'HEAVY',
        vehicles_in_frame: 17, vehicle_count: 17, occupancy_pct: 58.2,
        avg_speed_kph: 9.4, speed_calibrated: true,
        vehicle_types: { car: 12, bus: 2, truck: 1, motorcycle: 2 },
        positions: [0.04, 0.1, 0.16, 0.23, 0.3, 0.37, 0.44, 0.5, 0.56, 0.61, 0.67, 0.73, 0.79, 0.84, 0.89, 0.94, 0.98],
        flow: { window_seconds: 3, per_minute: 20.0, inbound: 1 },
        totals: { today: 531, by_direction: { inbound: 284, outbound: 247 } }
    },
    {
        congestion_level: 'CRITICAL', congestion_score: 93, color: '#8b1a1a', label: 'CRITICAL',
        vehicles_in_frame: 24, vehicle_count: 24, occupancy_pct: 74.8,
        avg_speed_kph: 3.1, speed_calibrated: true,
        vehicle_types: { car: 17, bus: 2, truck: 2, motorcycle: 3 },
        positions: [0.02, 0.06, 0.1, 0.14, 0.19, 0.23, 0.28, 0.32, 0.37, 0.41, 0.46, 0.5, 0.55, 0.59, 0.64, 0.68, 0.73, 0.77, 0.82, 0.86, 0.9, 0.93, 0.96, 0.99],
        flow: { window_seconds: 3, per_minute: 0.0 },
        totals: { today: 548, by_direction: { inbound: 292, outbound: 256 } }
    }
];
