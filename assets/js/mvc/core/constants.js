// MVC: shared constants and static datasets (Model layer support).
const BITCAS_STORAGE_KEY = 'bitcas_ui_ops_v1';
const BITCAS_AUTH_KEY = 'bitcas_auth_v1';
// Local stand-in for the future MySQL `users` table. Officers stay a separate roster.
const USER_ROLES = { super_admin: 'Super admin', traffic_desk: 'Traffic Desk' };
const PASSWORD_PEPPER = 'bitcas-lgu|';
// SHA-256 of PASSWORD_PEPPER + the setup password. First super admin only.
const SEEDED_SUPER_ADMIN_HASH = '85e507903d4c970932a88f72039b779c878bc8f7c849aeb662ceebf228e19f80';
const VISION_FIXTURE_URL = 'assets/data/congestion.json';
const ADVISORIES_URL = 'assets/data/advisories.json';
const ADVISORY_API_URL = 'api/advisories.php';
const VISION_POLL_MS = 3000;
// One aggregated line per minute, written by the Pi.
const VISION_HISTORY_JSONL_URL = 'assets/data/traffic_history.jsonl';
// First minute the NCNN detector was actually boxing the Villamonte street.
// Earlier lines are the broken PyTorch run (empty frames, or peaks of ~300).
const VISION_HISTORY_START = '2026-10-07T15:33:00';
// The 15:00 hourly rollup mixes those broken minutes with the first real ones.
const VISION_HOURLY_START = '2026-10-07T16:00:00';
// A real frame at this site stays well under this. The broken model saturated near 300.
const VISION_MAX_IN_FRAME = 30;
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

