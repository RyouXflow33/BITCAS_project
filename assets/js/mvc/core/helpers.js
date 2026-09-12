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
    return Boolean(
        payload &&
        ['LIGHT', 'MODERATE', 'HEAVY'].includes(payload.congestion_level) &&
        typeof payload.color === 'string' &&
        Number.isFinite(Number(payload.vehicle_count))
    );
}

function visionLevelToScore(level) {
    if (level === 'HEAVY') return 90;
    if (level === 'MODERATE') return 60;
    return 30;
}

function normalizeVisionTimestamp(timestamp) {
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function visionStatusCaption(level) {
    if (level === 'HEAVY') return 'High density';
    if (level === 'MODERATE') return 'Monitor';
    return 'Normal';
}

function classifyCongestion(score) {
    if (score >= 85) return 'Severe';
    if (score >= 65) return 'High';
    if (score >= 45) return 'Moderate';
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
    return level === 'Severe' ? 'danger' : 'warning';
}

function priorityLabel(level) {
    return level === 'Severe' ? 'P1' : 'P2';
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
