// MVC: pure formatting, classification and DOM helpers (shared by all layers).
function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatLocalDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSameMonth(first, second) {
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function formatShortTime(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function scoreFromVehicleCount(vehicleCount) {
    const normalized = Math.round((vehicleCount / 90) * 100);
    return Math.max(12, Math.min(98, normalized));
}

function isValidVisionPayload(payload) {
    if (!payload || !VISION_LEVELS[payload.congestion_level]) return false;
    return Number.isFinite(payloadVehicleCount(payload));
}

// The Pi publishes a continuous 0-100 score. Payloads captured before the v2
// rewrite only carried a level, so fall back to that band's midpoint.
function payloadScore(payload) {
    const score = Number(payload.congestion_score);
    if (Number.isFinite(score)) return Math.max(0, Math.min(100, Math.round(score)));
    return visionLevelToScore(payload.congestion_level);
}

function payloadVehicleCount(payload) {
    const v2 = Number(payload.vehicles_in_frame);
    if (Number.isFinite(v2)) return v2;
    return Number(payload.vehicle_count);
}

function normalizeVisionLevel(level) {
    if (level === 'CRITICAL') return 'HEAVY';
    return VISION_LEVELS[level] ? level : 'LIGHT';
}

function visionLevelToScore(level) {
    return (VISION_LEVELS[level] || VISION_LEVELS.LIGHT).fallbackScore;
}

function scoreToVisionLevel(score) {
    if (score >= CONGESTION_BANDS.heavy) return 'HEAVY';
    if (score >= CONGESTION_BANDS.moderate) return 'MODERATE';
    return 'LIGHT';
}

function standardDeviation(values) {
    if (values.length < 2) return 0;
    const mean = average(values);
    return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function visionLevelToSeverity(level) {
    return (VISION_LEVELS[level] || VISION_LEVELS.LIGHT).severity;
}

function visionLevelColor(level) {
    return (VISION_LEVELS[level] || VISION_LEVELS.LIGHT).color;
}

function isVisionStale(isoString) {
    if (!isoString) return true;
    const parsed = new Date(isoString).getTime();
    if (Number.isNaN(parsed)) return true;
    return Date.now() - parsed > VISION_STALE_MS;
}

// Speed is only meaningful once the site homography is calibrated. Until then
// say so rather than printing a pixel figure that reads like a real speed.
function formatSpeed(payload) {
    if (!payload) return '--';
    const kph = Number(payload.avg_speed_kph);
    if (payload.speed_calibrated && Number.isFinite(kph)) return `${kph.toFixed(1)} km/h`;
    const legacy = Number(payload.avg_speed);
    if (Number.isFinite(legacy) && legacy > 0) return `${legacy.toFixed(1)} px/s (uncalibrated)`;
    return 'Not calibrated';
}

function formatOccupancy(payload) {
    const occupancy = Number(payload && payload.occupancy_pct);
    return Number.isFinite(occupancy) ? `${occupancy.toFixed(1)}%` : '--';
}

function normalizeVisionTimestamp(timestamp) {
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function visionStatusCaption(level) {
    return (VISION_LEVELS[level] || VISION_LEVELS.LIGHT).caption;
}

function classifyCongestion(score) {
    if (score >= CONGESTION_BANDS.heavy) return 'High';
    if (score >= CONGESTION_BANDS.moderate) return 'Moderate';
    return 'Low';
}

function congestionCaption(level) {
    if (level === 'Severe') return 'Dispatch now';
    if (level === 'High') return 'Heavy queue';
    if (level === 'Moderate') return 'Monitor';
    return 'Normal';
}

function severityColor(level) {
    if (level === 'Severe') return '#b44e58';
    if (level === 'High') return '#b58b3a';
    if (level === 'Moderate') return '#4a9c78';
    return '#4a6ea9';
}

function severityTagClass(level) {
    if (level === 'Severe') return 'danger';
    if (level === 'High') return 'warning';
    if (level === 'Moderate') return 'success';
    return 'info';
}

function severityBorderClass(level) {
    if (level === 'Severe') return 'sev-severe';
    if (level === 'High') return 'sev-high';
    if (level === 'Moderate') return 'sev-moderate';
    return 'sev-low';
}

function statusTagClass(status) {
    if (status === 'Resolved') return 'status-resolved';
    if (status === 'Assigned') return 'status-assigned';
    return 'status-open';
}

function severityDotClass(level) {
    if (level === 'Severe' || level === 'High') return 'red';
    if (level === 'Moderate') return 'yellow';
    return 'green';
}

function priorityClass(level) {
    if (level === 'Severe') return 'danger';
    if (level === 'High') return 'warning';
    if (level === 'Moderate') return 'success';
    return 'info';
}

function priorityLabel(level) {
    if (level === 'Severe') return 'P1';
    if (level === 'High') return 'P2';
    if (level === 'Moderate') return 'P3';
    return 'P4';
}

function assignmentStatusTagClass(status) {
    if (status === 'Resolved') return 'status-resolved';
    if (status === 'On scene') return 'status-onscene';
    if (status === 'En route') return 'status-enroute';
    if (status === 'Assigned') return 'status-assigned';
    return 'status-open';
}

function officerStatusTagClass(status) {
    if (status === 'Available') return 'success';
    if (status === 'On scene' || status === 'En route' || status === 'Assigned') return 'status-assigned';
    return 'status-open';
}

function slaMinutesForSeverity(severity) {
    if (severity === 'Severe') return 5;
    if (severity === 'High') return 10;
    if (severity === 'Moderate') return 20;
    return 30;
}

function nextAssignmentStatus(status) {
    if (status === 'Assigned') return 'En route';
    if (status === 'En route') return 'On scene';
    if (status === 'On scene') return 'Resolved';
    return null;
}

function nextAssignmentActionLabel(status) {
    if (status === 'Assigned') return 'Mark en route';
    if (status === 'En route') return 'Mark on scene';
    if (status === 'On scene') return 'Resolve';
    return null;
}

function formatElapsed(isoString) {
    if (!isoString) return '--';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60000));
    return formatDuration(minutes);
}

function initialsFromName(name) {
    return String(name || '')
        .replace(/^Officer\s+/i, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'OF';
}

function signedNumber(value) {
    if (value > 0) return `+${value}`;
    return String(value);
}

function formatTime(isoString) {
    if (!isoString) return '--:--:--';
    return new Date(isoString).toLocaleTimeString([], { hour12: false });
}

function formatDateTime(isoString) {
    if (!isoString) return '--';
    return new Date(isoString).toLocaleString();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function icon(name, className = 'ico') {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

function emptyState(iconName, title, hint) {
    return `<div class="empty-state">
        <div class="empty-state-icon">${icon(iconName)}</div>
        <strong>${title}</strong>
        <span>${hint}</span>
    </div>`;
}
