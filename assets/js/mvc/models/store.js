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
        officers: [
            { id: 'BTAO-17', name: 'Officer J. Ramos', status: 'Available', workload: 31, zone: 'Villamonte' },
            { id: 'BTAO-08', name: 'Officer M. Lopez', status: 'Available', workload: 42, zone: 'Lacson' },
            { id: 'BTAO-22', name: 'Officer D. Velasco', status: 'Assigned', workload: 68, zone: 'Aquino Drive' },
            { id: 'BTAO-31', name: 'Officer C. Alonzo', status: 'Available', workload: 27, zone: 'Rizal Diversion' }
        ],
        assignments: [
            {
                id: 'DSP-060',
                reportId: 'RPT-1042',
                officerId: 'BTAO-22',
                status: 'Assigned',
                assignedAtIso: nowIso,
                resolvedAtIso: null
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

async function fetchVisionHistory() {
    const response = await fetch(`${VISION_HISTORY_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Vision history unavailable (${response.status})`);
    const history = await response.json();
    if (!Array.isArray(history)) throw new Error('Vision history must be an array');
    return history;
}

function applyVisionPayload(payload, source) {
    if (!isValidVisionPayload(payload)) return false;

    const previous = state.live.currentVehicleCount;
    const nextVehicleCount = Number(payload.vehicle_count);
    const nextScore = visionLevelToScore(payload.congestion_level);
    const nowIso = normalizeVisionTimestamp(payload.timestamp);

    state.live.previousVehicleCount = previous;
    state.live.currentVehicleCount = nextVehicleCount;
    state.live.congestionScore = nextScore;
    state.live.lastSyncIso = nowIso;
    state.live.visionLevel = payload.congestion_level;
    state.live.visionPayload = { ...payload, source: payload.source || source };

    const latest = state.telemetry[state.telemetry.length - 1];
    if (!latest || latest.sourceTimestamp !== payload.timestamp) {
        state.telemetry.push({
            timestampIso: nowIso,
            sourceTimestamp: payload.timestamp,
            vehicleCount: nextVehicleCount,
            congestionScore: nextScore,
            visionLevel: payload.congestion_level,
            vehicleTypes: payload.vehicle_types || {},
            avgSpeed: Number(payload.avg_speed) || 0
        });
        state.telemetry = state.telemetry.slice(-240);
        maybeCreateEvidenceReport(payload, nextVehicleCount, nextScore, nowIso);
    }

    saveState();
    return true;
}

function maybeCreateEvidenceReport(payload, vehicleCount, score, nowIso) {
    if (!payload.snapshot_url || payload.congestion_level !== 'HEAVY') return;
    if (state.reports.some((report) => report.snapshotUrl === payload.snapshot_url)) return;

    state.reports.unshift({
        id: `RPT-${state.nextReportNumber}`,
        location: 'Villamonte Street Intersection',
        severity: 'Severe',
        congestionScore: score,
        vehicleCount,
        status: 'Open',
        lat: 10.6758,
        lng: 122.9542,
        context: 'Evidence captured after HEAVY traffic persisted for three reporting intervals.',
        notes: '',
        snapshotUrl: payload.snapshot_url,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        resolvedAtIso: null
    });

    state.nextReportNumber += 1;
    state.reports = state.reports.slice(0, 120);
}

function normalizeVisionHistoryEntry(payload) {
    if (!isValidVisionPayload(payload)) return null;

    return {
        timestampIso: normalizeVisionTimestamp(payload.timestamp),
        sourceTimestamp: payload.timestamp,
        vehicleCount: Number(payload.vehicle_count),
        congestionScore: visionLevelToScore(payload.congestion_level),
        visionLevel: payload.congestion_level,
        vehicleTypes: payload.vehicle_types || {},
        avgSpeed: Number(payload.avg_speed) || 0
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
        context: 'Manually created by LGU admin.',
        notes: '',
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
    report.congestionScore = scoreFromVehicleCount(report.vehicleCount);
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
    if (report.snapshotUrl || (report.context || '').startsWith('Automatically generated')) return 'Vision system';
    return 'Manual entry';
}

function getAssignedOfficer(reportId) {
    const assignment = state.assignments.find((item) => item.reportId === reportId && item.status !== 'Resolved');
    if (!assignment) return '--';
    const officer = state.officers.find((item) => item.id === assignment.officerId);
    return officer ? `${officer.id} ${officer.name}` : assignment.officerId;
}

// --- Dispatch model ---

function assignOfficerToReport(officerId, reportId) {
    const officer = state.officers.find((item) => item.id === officerId);
    const report = findReport(reportId);
    if (!officer || !report || officer.status !== 'Available') return null;

    const assignment = {
        id: `DSP-${state.nextAssignmentNumber}`,
        reportId,
        officerId,
        status: 'Assigned',
        assignedAtIso: new Date().toISOString(),
        resolvedAtIso: null
    };

    state.nextAssignmentNumber += 1;
    state.assignments.unshift(assignment);

    officer.status = 'Assigned';
    officer.workload = Math.min(100, officer.workload + 18);
    report.status = 'Assigned';
    report.updatedAtIso = new Date().toISOString();

    saveState();
    return assignment.id;
}

function resolveAssignment(assignmentId) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.status === 'Resolved') return;

    assignment.status = 'Resolved';
    assignment.resolvedAtIso = new Date().toISOString();

    const officer = state.officers.find((item) => item.id === assignment.officerId);
    if (officer) {
        officer.status = 'Available';
        officer.workload = Math.max(10, officer.workload - 20);
    }

    const report = state.reports.find((item) => item.id === assignment.reportId);
    if (report) {
        report.status = 'Resolved';
        report.resolvedAtIso = assignment.resolvedAtIso;
        report.updatedAtIso = assignment.resolvedAtIso;
    }

    saveState();
}
