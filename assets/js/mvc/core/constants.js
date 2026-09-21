// MVC: shared constants and static datasets (Model layer support).
const BITCAS_STORAGE_KEY = 'bitcas_ui_ops_v1';
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
    // Older payloads used CRITICAL for score >= 85. The live UI folds that
    // into HEAVY; this entry exists so those files still parse.
    CRITICAL: { fallbackScore: 75, color: '#e74c3c', caption: 'Heavy queue', severity: 'High' }
};
const CAMERA_SITE = { lat: 10.6642688, lng: 122.9675934 };
const MAP_BASEMAPS = {
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    },
    light: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri',
        maxZoom: 16
    }
};
const VILLAMONTE_TRAFFIC_ROAD = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        properties: { name: 'Circumferential Road', area: 'Barangay Villamonte, Bacolod City' },
        geometry: {
            type: 'LineString',
            coordinates: [
                [122.9675934, 10.6642688], [122.9668395, 10.6645762], [122.9661113, 10.6648988],
                [122.9652753, 10.6652617], [122.9646445, 10.6655439]
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
        vehicle_types: { car: 2, motorcycle: 1 },
        positions: [
            { x: 0.32, y: 0.78, class: 'car' },
            { x: 0.58, y: 0.61, class: 'car' },
            { x: 0.44, y: 0.42, class: 'motorcycle' }
        ],
        flow: { window_seconds: 3, per_minute: 20.0, inbound: 1 },
        totals: { today: 412, by_direction: { inbound: 221, outbound: 191 } }
    },
    {
        congestion_level: 'MODERATE', congestion_score: 54, color: '#f39c12', label: 'MODERATE',
        vehicles_in_frame: 8, vehicle_count: 8, occupancy_pct: 31.7,
        avg_speed_kph: 21.3, speed_calibrated: true,
        vehicle_types: { car: 6, bus: 1, motorcycle: 1 },
        positions: [
            { x: 0.22, y: 0.86, class: 'car' }, { x: 0.41, y: 0.74, class: 'car' },
            { x: 0.63, y: 0.69, class: 'bus' }, { x: 0.35, y: 0.58, class: 'car' },
            { x: 0.71, y: 0.51, class: 'motorcycle' }, { x: 0.48, y: 0.39, class: 'car' },
            { x: 0.28, y: 0.28, class: 'car' }, { x: 0.55, y: 0.18, class: 'car' }
        ],
        flow: { window_seconds: 3, per_minute: 40.0, inbound: 1, outbound: 1 },
        totals: { today: 486, by_direction: { inbound: 259, outbound: 227 } }
    },
    {
        congestion_level: 'HEAVY', congestion_score: 78, color: '#e74c3c', label: 'HEAVY',
        vehicles_in_frame: 17, vehicle_count: 17, occupancy_pct: 58.2,
        avg_speed_kph: 9.4, speed_calibrated: true,
        vehicle_types: { car: 12, bus: 2, truck: 1, motorcycle: 2 },
        positions: [
            { x: 0.18, y: 0.91, class: 'car' }, { x: 0.46, y: 0.84, class: 'car' },
            { x: 0.72, y: 0.79, class: 'truck' }, { x: 0.33, y: 0.72, class: 'car' },
            { x: 0.58, y: 0.66, class: 'motorcycle' }, { x: 0.41, y: 0.59, class: 'car' },
            { x: 0.67, y: 0.53, class: 'bus' }, { x: 0.24, y: 0.47, class: 'car' },
            { x: 0.51, y: 0.41, class: 'car' }, { x: 0.76, y: 0.36, class: 'car' },
            { x: 0.38, y: 0.31, class: 'motorcycle' }, { x: 0.62, y: 0.26, class: 'car' },
            { x: 0.29, y: 0.21, class: 'car' }, { x: 0.54, y: 0.16, class: 'bus' },
            { x: 0.71, y: 0.12, class: 'car' }, { x: 0.43, y: 0.08, class: 'car' },
            { x: 0.60, y: 0.05, class: 'car' }
        ],
        flow: { window_seconds: 3, per_minute: 20.0, inbound: 1 },
        totals: { today: 531, by_direction: { inbound: 284, outbound: 247 } }
    },
    {
        congestion_level: 'HEAVY', congestion_score: 93, color: '#e74c3c', label: 'HEAVY',
        vehicles_in_frame: 24, vehicle_count: 24, occupancy_pct: 74.8,
        avg_speed_kph: 3.1, speed_calibrated: true,
        vehicle_types: { car: 17, bus: 2, truck: 2, motorcycle: 3 },
        positions: [
            { x: 0.16, y: 0.94, class: 'car' }, { x: 0.38, y: 0.89, class: 'car' },
            { x: 0.61, y: 0.85, class: 'truck' }, { x: 0.27, y: 0.80, class: 'motorcycle' },
            { x: 0.52, y: 0.76, class: 'car' }, { x: 0.74, y: 0.71, class: 'car' },
            { x: 0.33, y: 0.67, class: 'bus' }, { x: 0.58, y: 0.62, class: 'car' },
            { x: 0.21, y: 0.58, class: 'car' }, { x: 0.46, y: 0.53, class: 'motorcycle' },
            { x: 0.69, y: 0.49, class: 'car' }, { x: 0.41, y: 0.44, class: 'car' },
            { x: 0.63, y: 0.40, class: 'truck' }, { x: 0.29, y: 0.35, class: 'car' },
            { x: 0.54, y: 0.31, class: 'bus' }, { x: 0.76, y: 0.27, class: 'car' },
            { x: 0.36, y: 0.23, class: 'car' }, { x: 0.59, y: 0.19, class: 'motorcycle' },
            { x: 0.44, y: 0.15, class: 'car' }, { x: 0.67, y: 0.12, class: 'car' },
            { x: 0.31, y: 0.09, class: 'car' }, { x: 0.51, y: 0.06, class: 'car' },
            { x: 0.72, y: 0.04, class: 'car' }, { x: 0.48, y: 0.02, class: 'car' }
        ],
        flow: { window_seconds: 3, per_minute: 0.0 },
        totals: { today: 548, by_direction: { inbound: 292, outbound: 256 } }
    }
];
