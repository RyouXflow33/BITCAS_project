// MVC - Model: application state, persistence and vision data access.
// All data lives here; views render from it and controllers mutate it through these functions.

let state = null;

function loadState() {
    try {
        const raw = localStorage.getItem(BITCAS_STORAGE_KEY);
        if (!raw) return buildDefaultState();
        return JSON.parse(raw);
    } catch (error) {
        return buildDefaultState();
    }
}

function saveState() {
    localStorage.setItem(BITCAS_STORAGE_KEY, JSON.stringify(state));
}

function buildDefaultState() {
    const nowIso = new Date().toISOString();
    return {
        version: 1,
        nextReportNumber: 1048,
        nextAssignmentNumber: 61,
        live: {
            currentVehicleCount: 38,
            previousVehicleCount: 34,
            congestionScore: 47,
            lastSyncIso: nowIso
        },
        telemetry: seedTelemetry(),
        reports: [
            createSeedReport({ id: 'RPT-1042', location: 'Villamonte Street Intersection', severity: 'High', score: 76, vehicles: 62, status: 'Assigned', lat: 10.6758, lng: 122.9542, context: 'Outbound lane queue exceeded threshold for 3 intervals.' }),
            createSeedReport({ id: 'RPT-1043', location: 'Lacson Street Access', severity: 'Moderate', score: 58, vehicles: 49, status: 'Open', lat: 10.6774, lng: 122.953, context: 'Intermittent stop-and-go traffic near school zone.' }),
            createSeedReport({ id: 'RPT-1044', location: 'B.S. Aquino Drive Segment', severity: 'Severe', score: 89, vehicles: 77, status: 'Open', lat: 10.6747, lng: 122.9558, context: 'Extended congestion observed during signal cycle mismatch.' }),
            createSeedReport({ id: 'RPT-1045', location: 'Rizal Street Diversion', severity: 'Low', score: 31, vehicles: 26, status: 'Resolved', lat: 10.6761, lng: 122.9569, context: 'Temporary congestion normalized after lane clearing.' })
        ],
        snapshots: [],
        advisories: [],
        officers: defaultOfficerRoster(),
        assignments: [
            {
                id: 'DSP-060',
                reportId: 'RPT-1042',
                officerId: 'BTAO-22',
                status: 'Assigned',
                assignedAtIso: nowIso,
                acknowledgedAtIso: nowIso,
                enrouteAtIso: null,
                onsceneAtIso: null,
                resolvedAtIso: null,
                fieldNotes: ''
            }
        ]
    };
}

function ensureStateShape(s) {
    if (!s.reports) s.reports = [];
    if (!s.telemetry) s.telemetry = [];
    if (!s.advisories) s.advisories = [];
    if (!s.snapshots) s.snapshots = [];
    if (!s.officers) s.officers = [];
    if (!s.assignments) s.assignments = [];
    if (!s.live) s.live = { currentVehicleCount: 0, previousVehicleCount: 0, congestionScore: 0, lastSyncIso: new Date().toISOString() };
    if (!s.nextReportNumber) s.nextReportNumber = 2000;
    if (!s.nextAssignmentNumber) s.nextAssignmentNumber = 100;
    ensureOfficerRoster(s);
    s.assignments = s.assignments.map(normalizeAssignment);
    s.reports.forEach((report) => {
        if (typeof report.falsePositive !== 'boolean') report.falsePositive = false;
        if (!report.resolvedAtIso && report.status === 'Resolved') report.resolvedAtIso = report.updatedAtIso || report.createdAtIso || null;
    });
}

function defaultOfficerRoster() {
    return [
        {
            id: 'BTAO-17', name: 'Officer J. Ramos', fullName: 'Juan Ramos', rank: 'Traffic Enforcer',
            contact: '0917-555-1017', radio: 'Victor-17', zone: 'Villamonte',
            shiftStart: '06:00', shiftEnd: '14:00', restDay: 'Sunday',
            status: 'Available', skills: ['Traffic control', 'First aid'], dateAssigned: '2025-03-12'
        },
        {
            id: 'BTAO-08', name: 'Officer M. Lopez', fullName: 'Maria Lopez', rank: 'Senior Enforcer',
            contact: '0918-555-1008', radio: 'Victor-08', zone: 'Lacson',
            shiftStart: '06:00', shiftEnd: '14:00', restDay: 'Monday',
            status: 'Available', skills: ['Traffic control', 'School zone'], dateAssigned: '2024-11-04'
        },
        {
            id: 'BTAO-22', name: 'Officer D. Velasco', fullName: 'Diego Velasco', rank: 'Traffic Enforcer',
            contact: '0916-555-1022', radio: 'Victor-22', zone: 'Aquino Drive',
            shiftStart: '14:00', shiftEnd: '22:00', restDay: 'Wednesday',
            status: 'Assigned', skills: ['Traffic control', 'Tow coordination'], dateAssigned: '2025-01-20'
        },
        {
            id: 'BTAO-31', name: 'Officer C. Alonzo', fullName: 'Carlo Alonzo', rank: 'Traffic Enforcer',
            contact: '0915-555-1031', radio: 'Victor-31', zone: 'Rizal Diversion',
            shiftStart: '06:00', shiftEnd: '14:00', restDay: 'Saturday',
            status: 'Available', skills: ['Traffic control', 'Incident response'], dateAssigned: '2025-06-02'
        },
        {
            id: 'BTAO-12', name: 'Officer A. Sison', fullName: 'Ana Sison', rank: 'Traffic Enforcer',
            contact: '0917-555-1012', radio: 'Victor-12', zone: 'Villamonte',
            shiftStart: '14:00', shiftEnd: '22:00', restDay: 'Tuesday',
            status: 'Available', skills: ['Traffic control', 'First aid'], dateAssigned: '2025-08-18'
        },
        {
            id: 'BTAO-44', name: 'Officer R. Dela Cruz', fullName: 'Ramon Dela Cruz', rank: 'Team Leader',
            contact: '0919-555-1044', radio: 'Victor-44', zone: 'Villamonte',
            shiftStart: '22:00', shiftEnd: '06:00', restDay: 'Friday',
            status: 'Off duty', skills: ['Traffic control', 'Dispatch liaison'], dateAssigned: '2024-05-09'
        }
    ];
}

function ensureOfficerRoster(s) {
    const byId = new Map((s.officers || []).map((officer) => [officer.id, officer]));
    defaultOfficerRoster().forEach((seed) => {
        if (!byId.has(seed.id)) s.officers.push({ ...seed });
    });
    s.officers = s.officers.map(normalizeOfficer);
}

function normalizeOfficer(officer) {
    const seed = defaultOfficerRoster().find((item) => item.id === officer.id) || {};
    return {
        id: officer.id,
        name: officer.name || seed.name || officer.id,
        fullName: officer.fullName || seed.fullName || officer.name || officer.id,
        rank: officer.rank || seed.rank || 'Traffic Enforcer',
        contact: officer.contact || seed.contact || '--',
        radio: officer.radio || seed.radio || officer.id,
        zone: officer.zone || seed.zone || 'Villamonte',
        shiftStart: officer.shiftStart || seed.shiftStart || '06:00',
        shiftEnd: officer.shiftEnd || seed.shiftEnd || '14:00',
        restDay: officer.restDay || seed.restDay || 'Sunday',
        status: officer.status || 'Available',
        skills: Array.isArray(officer.skills) && officer.skills.length ? officer.skills : (seed.skills || ['Traffic control']),
        dateAssigned: officer.dateAssigned || seed.dateAssigned || '2025-01-01'
    };
}

function normalizeAssignment(assignment) {
    return {
        id: assignment.id,
        reportId: assignment.reportId,
        officerId: assignment.officerId,
        status: assignment.status || 'Assigned',
        assignedAtIso: assignment.assignedAtIso,
        acknowledgedAtIso: assignment.acknowledgedAtIso || assignment.assignedAtIso || null,
        enrouteAtIso: assignment.enrouteAtIso || null,
        onsceneAtIso: assignment.onsceneAtIso || null,
        resolvedAtIso: assignment.resolvedAtIso || null,
        fieldNotes: assignment.fieldNotes || ''
    };
}

function createSeedReport({ id, location, severity, score, vehicles, status, lat, lng, context }) {
    const now = new Date();
    return {
        id,
        location,
        severity,
        congestionScore: score,
        vehicleCount: vehicles,
        status,
        lat,
        lng,
        context,
        notes: '',
        createdAtIso: new Date(now.getTime() - Math.floor(Math.random() * 50 + 10) * 60000).toISOString(),
        updatedAtIso: now.toISOString()
    };
}

function seedTelemetry() {
    const result = [];
    const now = Date.now();
    for (let i = 23; i >= 0; i -= 1) {
        const ts = new Date(now - i * 60 * 60 * 1000).toISOString();
        const base = 24 + Math.round(Math.random() * 62);
        result.push({
            timestampIso: ts,
            vehicleCount: base,
            congestionScore: scoreFromVehicleCount(base)
        });
    }
    return result;
}

// --- Session model ---

function loadAuthSession() {
    try {
        const raw = localStorage.getItem(BITCAS_AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.username) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function isValidCredential(username, password) {
    const userOk = username === 'lguadmin' || username === 'admin';
    const passOk = password === 'bitcas123' || password === 'admin123';
    return userOk && passOk;
}

function saveAuthSession(session) {
    localStorage.setItem(BITCAS_AUTH_KEY, JSON.stringify(session));
}

function clearAuthSession() {
    localStorage.removeItem(BITCAS_AUTH_KEY);
}

// --- Vision feed model ---

async function fetchVisionFeed() {
    const response = await fetch(`${VISION_FIXTURE_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Vision feed unavailable (${response.status})`);
    return response.json();
}

// v2 writes append-only JSONL (one aggregated record per minute). v1 wrote a
// JSON array. Try the new format first so a Pi running v2 wins, then fall back
// so history captured before the rewrite still renders.
async function fetchVisionHistory() {
    const jsonl = await fetchVisionHistoryJsonl();
    if (jsonl.length) return jsonl;

    const response = await fetch(`${VISION_HISTORY_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Vision history unavailable (${response.status})`);
    const history = await response.json();
    if (!Array.isArray(history)) throw new Error('Vision history must be an array');
    return history;
}

async function fetchVisionHistoryJsonl() {
    return fetchJsonl(VISION_HISTORY_JSONL_URL);
}

async function fetchJsonl(url) {
    try {
        const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return [];
        const text = await response.text();
        return text.split('\n').reduce((records, line) => {
            const trimmed = line.trim();
            if (!trimmed) return records;
            try {
                records.push(JSON.parse(trimmed));
            } catch (error) {
                // A partially flushed final line is expected while the Pi writes.
            }
            return records;
        }, []);
    } catch (error) {
        return [];
    }
}

// Hourly rollups are read-only derived data, so they live in memory rather
// than in the persisted state object -- no reason to spend localStorage on
// something re-fetched on every page load.
let visionHourly = [];

async function refreshVisionHourly() {
    const records = await fetchJsonl(VISION_HOURLY_URL);
    visionHourly = records
        .map(normalizeHourlyEntry)
        .filter(Boolean)
        .slice(-VISION_HOURLY_MAX_ENTRIES);
    return visionHourly;
}

function getVisionHourly() {
    return visionHourly;
}

function normalizeHourlyEntry(record) {
    if (!record || !record.timestamp) return null;
    const when = new Date(record.timestamp);
    if (Number.isNaN(when.getTime())) return null;

    const crossings = Number(record.crossings);
    const samples = Number(record.samples) || 0;
    const speed = Number(record.avg_speed_kph);
    const occupancy = Number(record.occupancy_pct);

    return {
        timestampIso: when.toISOString(),
        // Recomputed locally so a file generated in another timezone still
        // lands in the right heatmap cell for the viewer.
        weekday: (when.getDay() + 6) % 7,
        hour: when.getHours(),
        samples,
        congestionScore: Number(record.congestion_score) || 0,
        peakCongestionScore: Number(record.peak_congestion_score) || 0,
        vehicleCount: Number(record.vehicles_in_frame_avg) || 0,
        occupancyPct: Number.isFinite(occupancy) ? occupancy : null,
        avgSpeedKph: record.speed_calibrated && Number.isFinite(speed) ? speed : null,
        crossings: Number.isFinite(crossings) ? crossings : null,
        // Per-minute rate, so an hourly bucket can be compared directly with a
        // short window of minute records.
        crossingsPerMinute: Number.isFinite(crossings) && samples ? crossings / samples : null,
        vehicleTypes: record.vehicle_types || {},
        byDirection: record.by_direction || {},
        source: record.source || 'traffic_vision_system'
    };
}

function applyVisionPayload(payload, source) {
    if (!isValidVisionPayload(payload)) return false;

    const previous = state.live.currentVehicleCount;
    const nextVehicleCount = payloadVehicleCount(payload);
    const nextScore = payloadScore(payload);
    const nowIso = normalizeVisionTimestamp(payload.timestamp);

    state.live.previousVehicleCount = previous;
    state.live.previousCongestionScore = state.live.congestionScore;
    state.live.currentVehicleCount = nextVehicleCount;
    state.live.congestionScore = nextScore;
    state.live.lastSyncIso = nowIso;
    state.live.visionLevel = payload.congestion_level;
    state.live.visionPayload = { ...payload, source: payload.source || source };

    const latest = state.telemetry[state.telemetry.length - 1];
    if (!latest || latest.sourceTimestamp !== payload.timestamp) {
        state.telemetry.push(buildTelemetryEntry(payload, nowIso, nextVehicleCount, nextScore));
        state.telemetry = state.telemetry.slice(-240);
        maybeCreateEvidenceReport(payload, nextVehicleCount, nextScore, nowIso);
    }

    saveState();
    return true;
}

function buildTelemetryEntry(payload, nowIso, vehicleCount, score) {
    const speedKph = Number(payload.avg_speed_kph);
    const occupancy = Number(payload.occupancy_pct);
    const flow = payload.flow || {};

    return {
        timestampIso: nowIso,
        sourceTimestamp: payload.timestamp,
        vehicleCount,
        congestionScore: score,
        visionLevel: payload.congestion_level,
        vehicleTypes: payload.vehicle_types || {},
        occupancyPct: Number.isFinite(occupancy) ? occupancy : null,
        avgSpeedKph: payload.speed_calibrated && Number.isFinite(speedKph) ? speedKph : null,
        speedCalibrated: Boolean(payload.speed_calibrated),
        // Vehicles that actually crossed the counting line in this window --
        // throughput, as opposed to vehicleCount which is an occupancy sample.
        crossings: Array.isArray(payload.crossings) ? payload.crossings.length : null,
        byDirection: Object.keys(flow)
            .filter((key) => key !== 'window_seconds' && key !== 'per_minute')
            .reduce((result, key) => ({ ...result, [key]: flow[key] }), {})
    };
}

function maybeCreateEvidenceReport(payload, vehicleCount, score, nowIso) {
    const isSevere = payload.congestion_level === 'HEAVY' || payload.congestion_level === 'CRITICAL';
    if (!payload.snapshot_url || !isSevere) return;
    if (state.reports.some((report) => report.snapshotUrl === payload.snapshot_url)) return;

    state.reports.unshift({
        id: `RPT-${state.nextReportNumber}`,
        location: payload.site_name || 'Villamonte Street Intersection',
        cameraId: payload.camera_id || null,
        severity: visionLevelToSeverity(payload.congestion_level),
        congestionScore: score,
        vehicleCount,
        occupancyPct: Number.isFinite(Number(payload.occupancy_pct)) ? Number(payload.occupancy_pct) : null,
        avgSpeedKph: payload.speed_calibrated ? Number(payload.avg_speed_kph) : null,
        status: 'Open',
        lat: Number(payload.lat) || 10.6758,
        lng: Number(payload.lng) || 122.9542,
        source: 'Vision system',
        context: `Automatically generated: ${payload.congestion_level} congestion (score ${score}) persisted for three reporting intervals.`,
        notes: '',
        falsePositive: false,
        snapshotUrl: payload.snapshot_url,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        resolvedAtIso: null
    });

    state.nextReportNumber += 1;
    state.reports = state.reports.slice(0, 120);
}

// Accepts both a v2 aggregated history record and a raw v1 payload.
function normalizeVisionHistoryEntry(record) {
    if (!record || !VISION_LEVELS[record.congestion_level]) return null;

    const isAggregate = Number.isFinite(Number(record.vehicles_in_frame_avg));
    const vehicleCount = isAggregate
        ? Number(record.vehicles_in_frame_avg)
        : payloadVehicleCount(record);
    if (!Number.isFinite(vehicleCount)) return null;

    const occupancy = Number(record.occupancy_pct);
    const speedKph = Number(record.avg_speed_kph);
    const crossings = Number(record.crossings);

    return {
        timestampIso: normalizeVisionTimestamp(record.timestamp),
        sourceTimestamp: record.timestamp,
        vehicleCount,
        peakVehicleCount: Number(record.vehicles_in_frame_peak) || vehicleCount,
        congestionScore: payloadScore(record),
        visionLevel: record.congestion_level,
        vehicleTypes: record.vehicle_types || {},
        occupancyPct: Number.isFinite(occupancy) ? occupancy : null,
        avgSpeedKph: record.speed_calibrated && Number.isFinite(speedKph) ? speedKph : null,
        speedCalibrated: Boolean(record.speed_calibrated),
        crossings: Number.isFinite(crossings) ? crossings : null,
        byDirection: record.by_direction || {}
    };
}

// --- Snapshot model ---

function captureSnapshotRecord() {
    const score = state.live.congestionScore;
    const severity = classifyCongestion(score);
    const ts = new Date().toISOString();
    const vehicle = state.live.currentVehicleCount;

    state.snapshots.unshift({
        id: `SNP-${Date.now()}`,
        capturedAtIso: ts,
        severity,
        score,
        image: buildSnapshotSvgDataUrl({ severity, score, vehicle })
    });
    state.snapshots = state.snapshots.slice(0, 20);
    saveState();
}

function buildSnapshotSvgDataUrl({ severity, score, vehicle }) {
    const palette = {
        Low: '#2f9e73',
        Moderate: '#54a67f',
        High: '#b58b3a',
        Severe: '#b44e58'
    };
    const color = palette[severity] || '#54a67f';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='700' height='420'>
<rect width='700' height='420' fill='#f3f4f7'/>
<rect x='24' y='24' width='652' height='372' rx='10' fill='white' stroke='#d3d8e2' stroke-width='2'/>
<text x='48' y='78' fill='#1e2430' font-size='28' font-family='Segoe UI, Arial'>BITCAS SNAPSHOT</text>
<text x='48' y='128' fill='#5a6679' font-size='20' font-family='Segoe UI, Arial'>Villamonte Street Intersection</text>
<text x='48' y='178' fill='${color}' font-size='22' font-family='Segoe UI, Arial'>Congestion: ${severity} (${score}%)</text>
<text x='48' y='220' fill='#5a6679' font-size='20' font-family='Segoe UI, Arial'>Vehicles: ${vehicle}</text>
<text x='48' y='262' fill='#5a6679' font-size='18' font-family='Segoe UI, Arial'>Captured: ${new Date().toLocaleString()}</text>
<text x='48' y='330' fill='#7a8598' font-size='16' font-family='Segoe UI, Arial'>Pending integration: Raspberry Pi + Python vision stream</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// --- Advisory model ---

function addAdvisory({ level, area, message }) {
    state.advisories.unshift({
        id: `ADV-${Date.now()}`,
        level,
        area,
        message,
        sentAtIso: new Date().toISOString(),
        channel: 'Push simulator'
    });
    state.advisories = state.advisories.slice(0, 20);
    saveState();
}

function clearAdvisories() {
    state.advisories = [];
    saveState();
}

// --- Report model ---

function findReport(reportId) {
    return state.reports.find((item) => item.id === reportId);
}

function createManualReport() {
    const nowIso = new Date().toISOString();
    const score = state.live.congestionScore;
    const report = {
        id: `RPT-${state.nextReportNumber}`,
        location: 'Villamonte Street Intersection',
        severity: classifyCongestion(score),
        congestionScore: score,
        vehicleCount: state.live.currentVehicleCount,
        status: 'Open',
        lat: 10.6758,
        lng: 122.9542,
        source: 'Manual entry',
        context: 'Manually created by LGU admin.',
        notes: '',
        falsePositive: false,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        resolvedAtIso: null
    };

    state.nextReportNumber += 1;
    state.reports.unshift(report);
    saveState();
    return report.id;
}

function updateReport(reportId, fields) {
    const report = findReport(reportId);
    if (!report) return null;

    report.location = fields.location;
    report.vehicleCount = Number(fields.vehicleCount);
    report.severity = fields.severity;
    if (fields.status === 'Resolved' && report.status !== 'Resolved') report.resolvedAtIso = new Date().toISOString();
    report.status = fields.status;
    report.context = fields.context;
    report.notes = fields.notes;
    // A vision-sourced score is a measurement from the camera. Editing the
    // vehicle count by hand must not silently overwrite it.
    if (getReportSource(report) !== 'Vision system') {
        report.congestionScore = scoreFromVehicleCount(report.vehicleCount);
    }
    report.updatedAtIso = new Date().toISOString();

    saveState();
    return report;
}

function resolveReport(reportId) {
    const report = findReport(reportId);
    if (!report) return null;
    report.status = 'Resolved';
    report.resolvedAtIso = new Date().toISOString();
    report.updatedAtIso = report.resolvedAtIso;
    saveState();
    return report;
}

function getReportSource(report) {
    if (report.source) return report.source;
    if (report.snapshotUrl || (report.context || '').startsWith('Automatically generated')) return 'Vision system';
    return 'Manual entry';
}

function getAssignedOfficer(reportId) {
    const assignment = getActiveAssignmentForReport(reportId);
    if (!assignment) return '--';
    const officer = state.officers.find((item) => item.id === assignment.officerId);
    return officer ? `${officer.id} ${officer.name}` : assignment.officerId;
}

function getActiveAssignmentForReport(reportId) {
    return state.assignments.find((item) => item.reportId === reportId && item.status !== 'Resolved') || null;
}

function markReportFalsePositive(reportId) {
    const report = findReport(reportId);
    if (!report) return null;
    report.falsePositive = true;
    report.status = 'Resolved';
    report.resolvedAtIso = new Date().toISOString();
    report.updatedAtIso = report.resolvedAtIso;
    report.notes = [report.notes, 'Marked not congestion (false positive).'].filter(Boolean).join(' ');

    const assignment = getActiveAssignmentForReport(reportId);
    if (assignment) resolveAssignment(assignment.id);
    else saveState();
    return report;
}

// --- Dispatch model ---

function officerTasksToday(officerId) {
    const today = formatLocalDateKey(new Date());
    return state.assignments.filter((assignment) => {
        if (assignment.officerId !== officerId) return false;
        const stamp = assignment.assignedAtIso || assignment.resolvedAtIso;
        return stamp && formatLocalDateKey(new Date(stamp)) === today;
    }).length;
}

function isOfficerOnShift(officer, date = new Date()) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    if (officer.restDay === weekday) return false;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const [startHour, startMin] = String(officer.shiftStart || '06:00').split(':').map(Number);
    const [endHour, endMin] = String(officer.shiftEnd || '14:00').split(':').map(Number);
    const start = startHour * 60 + startMin;
    const end = endHour * 60 + endMin;
    if (end > start) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
}

function officerZoneMatches(officer, location) {
    const zone = String(officer.zone || '').toLowerCase();
    const loc = String(location || '').toLowerCase();
    if (!zone || !loc) return false;
    const zoneToken = zone.split(' ')[0];
    return loc.includes(zone) || (zoneToken.length > 3 && loc.includes(zoneToken));
}

function recommendOfficers(report) {
    const maxTasks = 4;
    return state.officers.map((officer) => {
        const available = officer.status === 'Available';
        const onShift = isOfficerOnShift(officer);
        const zoneMatch = report ? officerZoneMatches(officer, report.location) : false;
        const tasksToday = officerTasksToday(officer.id);
        const busyOnPriority = officer.status === 'Assigned' || officer.status === 'En route' || officer.status === 'On scene';
        const reasons = [];
        let score = 0;

        if (zoneMatch) {
            score += 40;
            reasons.push('same zone');
        } else {
            reasons.push(`beat ${officer.zone}`);
        }
        if (available) {
            score += 25;
            reasons.push('available');
        } else {
            reasons.push(officer.status.toLowerCase());
        }
        if (onShift) {
            score += 15;
            reasons.push(`${officer.shiftStart}–${officer.shiftEnd}`);
        } else {
            reasons.push(officer.restDay === new Date().toLocaleDateString('en-US', { weekday: 'long' }) ? 'rest day' : 'off shift');
        }
        score += Math.round(20 * (1 - Math.min(tasksToday, maxTasks) / maxTasks));
        reasons.push(`${tasksToday} task${tasksToday === 1 ? '' : 's'} today`);
        if (busyOnPriority) score -= 30;

        score = Math.max(0, Math.min(100, score));
        return { officer, score, reasons, available, onShift, zoneMatch, tasksToday, canAssign: available && Boolean(report) };
    }).sort((a, b) => b.score - a.score);
}

function assignmentSla(assignment, report) {
    const limit = slaMinutesForSeverity(report?.severity || 'Moderate');
    const started = new Date(assignment.assignedAtIso).getTime();
    const elapsed = Math.max(0, (Date.now() - started) / 60000);
    const remaining = limit - elapsed;
    const onScene = Boolean(assignment.onsceneAtIso) || assignment.status === 'On scene' || assignment.status === 'Resolved';
    return {
        limit,
        elapsed,
        remaining,
        onScene,
        breached: !onScene && remaining < 0
    };
}

function officerPerformance(officerId) {
    const closed = state.assignments.filter((item) => item.officerId === officerId && item.status === 'Resolved' && item.assignedAtIso && item.resolvedAtIso);
    const responseSamples = closed
        .filter((item) => item.onsceneAtIso)
        .map((item) => (new Date(item.onsceneAtIso) - new Date(item.assignedAtIso)) / 60000);
    const clearanceSamples = closed
        .filter((item) => item.onsceneAtIso)
        .map((item) => (new Date(item.resolvedAtIso) - new Date(item.onsceneAtIso)) / 60000);
    const totalSamples = closed.map((item) => (new Date(item.resolvedAtIso) - new Date(item.assignedAtIso)) / 60000);
    return {
        closedCount: closed.length,
        tasksToday: officerTasksToday(officerId),
        avgResponseMin: responseSamples.length ? Math.round(average(responseSamples)) : null,
        avgClearanceMin: clearanceSamples.length ? Math.round(average(clearanceSamples)) : null,
        avgDurationMin: totalSamples.length ? Math.round(average(totalSamples)) : null
    };
}

function assignOfficerToReport(officerId, reportId) {
    const officer = state.officers.find((item) => item.id === officerId);
    const report = findReport(reportId);
    if (!officer || !report || officer.status !== 'Available') return null;
    if (getActiveAssignmentForReport(reportId)) return null;

    const nowIso = new Date().toISOString();
    const assignment = {
        id: `DSP-${state.nextAssignmentNumber}`,
        reportId,
        officerId,
        status: 'Assigned',
        assignedAtIso: nowIso,
        acknowledgedAtIso: nowIso,
        enrouteAtIso: null,
        onsceneAtIso: null,
        resolvedAtIso: null,
        fieldNotes: ''
    };

    state.nextAssignmentNumber += 1;
    state.assignments.unshift(assignment);
    officer.status = 'Assigned';
    report.status = 'Assigned';
    report.updatedAtIso = nowIso;

    saveState();
    return assignment.id;
}

function advanceAssignment(assignmentId) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.status === 'Resolved') return null;

    const next = nextAssignmentStatus(assignment.status);
    if (!next) return null;
    if (next === 'Resolved') return resolveAssignment(assignmentId) || assignment;

    const nowIso = new Date().toISOString();
    assignment.status = next;
    if (next === 'En route') assignment.enrouteAtIso = nowIso;
    if (next === 'On scene') assignment.onsceneAtIso = nowIso;

    const officer = state.officers.find((item) => item.id === assignment.officerId);
    if (officer) officer.status = next;

    const report = findReport(assignment.reportId);
    if (report) report.updatedAtIso = nowIso;

    saveState();
    return assignment;
}

function resolveAssignment(assignmentId) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.status === 'Resolved') return null;

    const nowIso = new Date().toISOString();
    assignment.status = 'Resolved';
    assignment.resolvedAtIso = nowIso;
    if (!assignment.onsceneAtIso) assignment.onsceneAtIso = nowIso;

    const officer = state.officers.find((item) => item.id === assignment.officerId);
    if (officer) officer.status = 'Available';

    const report = state.reports.find((item) => item.id === assignment.reportId);
    if (report) {
        report.status = 'Resolved';
        report.resolvedAtIso = nowIso;
        report.updatedAtIso = nowIso;
    }

    saveState();
    return assignment;
}
