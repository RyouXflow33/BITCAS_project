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
        version: 3,
        nextReportNumber: 1,
        nextAssignmentNumber: 1,
        live: {
            currentVehicleCount: 0,
            previousVehicleCount: 0,
            congestionScore: 0,
            lastSyncIso: nowIso
        },
        telemetry: [],
        liveTelemetry: [],
        reports: [],
        snapshots: [],
        advisories: [],
        officers: [],
        assignments: [],
        users: [seedSuperAdmin()]
    };
}

function ensureStateShape(s) {
    if (!s.reports) s.reports = [];
    if (!s.telemetry) s.telemetry = [];
    if (!s.liveTelemetry) s.liveTelemetry = [];
    if (!s.advisories) s.advisories = [];
    if (!s.snapshots) s.snapshots = [];
    if (!s.officers) s.officers = [];
    if (!s.assignments) s.assignments = [];
    if (!Array.isArray(s.users) || !s.users.length) s.users = [seedSuperAdmin()];
    if (!s.nextUserNumber) s.nextUserNumber = Math.max(2, s.users.length + 1);
    if (!s.live) s.live = { currentVehicleCount: 0, previousVehicleCount: 0, congestionScore: 0, lastSyncIso: new Date().toISOString() };
    if (!s.nextReportNumber) s.nextReportNumber = 1;
    if (!s.nextAssignmentNumber) s.nextAssignmentNumber = 1;
    s.officers = s.officers.map(normalizeOfficer);
    s.assignments = s.assignments.map(normalizeAssignment);
    s.users = s.users.map(normalizeUser);
    s.reports.forEach((report) => {
        if (typeof report.falsePositive !== 'boolean') report.falsePositive = false;
        if (!report.resolvedAtIso && report.status === 'Resolved') report.resolvedAtIso = report.updatedAtIso || report.createdAtIso || null;
    });
    // Older desks kept a drawn "pending integration" card and a few simulated ticks.
    if (!s.version || s.version < 3) {
        s.snapshots = (s.snapshots || []).filter((shot) => {
            const image = String((shot && shot.image) || '');
            return image && !image.startsWith('data:');
        });
        s.telemetry = [];
        s.liveTelemetry = (s.liveTelemetry || []).filter((point) => {
            return !point.speedCalibrated && Number(point.vehicleCount) < VISION_MAX_IN_FRAME;
        });
        s.version = 3;
    }
}

function normalizeOfficer(officer) {
    const fullName = officer.fullName || officer.name || officer.id;
    return {
        id: String(officer.id || '').toUpperCase(),
        name: officer.name || displayNameFromFullName(fullName),
        fullName,
        rank: officer.rank || 'Traffic Enforcer',
        contact: officer.contact || '--',
        radio: officer.radio || officer.id,
        zone: officer.zone || 'Villamonte',
        shiftStart: officer.shiftStart || '06:00',
        shiftEnd: officer.shiftEnd || '14:00',
        restDay: officer.restDay || 'Sunday',
        status: officer.status || 'Available',
        skills: Array.isArray(officer.skills) && officer.skills.length ? officer.skills : ['Traffic control'],
        dateAssigned: officer.dateAssigned || new Date().toISOString().slice(0, 10)
    };
}

function displayNameFromFullName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Officer';
    if (parts.length === 1) return `Officer ${parts[0]}`;
    return `Officer ${parts[0][0]}. ${parts[parts.length - 1]}`;
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
        fieldNotes: assignment.fieldNotes || '',
        createdByUserId: assignment.createdByUserId || null,
        updatedByUserId: assignment.updatedByUserId || null
    };
}

// --- Session model ---

function loadAuthSession() {
    try {
        const raw = localStorage.getItem(BITCAS_AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const roleOk = parsed.role === 'super_admin' || parsed.role === 'traffic_desk';
        if (!parsed.userId || !parsed.username || !roleOk) {
            localStorage.removeItem(BITCAS_AUTH_KEY);
            return null;
        }
        return parsed;
    } catch (error) {
        return null;
    }
}

function seedSuperAdmin() {
    return {
        id: 'USR-1',
        fullName: 'LGU Admin',
        username: 'lguadmin',
        passwordHash: SEEDED_SUPER_ADMIN_HASH,
        role: 'super_admin',
        active: true,
        mustChangePassword: false,
        createdBy: null,
        createdAtIso: new Date().toISOString()
    };
}

function normalizeUser(user) {
    return {
        id: user.id,
        fullName: user.fullName || user.username,
        username: String(user.username || '').trim().toLowerCase(),
        passwordHash: user.passwordHash,
        role: user.role === 'super_admin' ? 'super_admin' : 'traffic_desk',
        active: user.active !== false,
        mustChangePassword: Boolean(user.mustChangePassword),
        createdBy: user.createdBy || null,
        createdAtIso: user.createdAtIso || new Date().toISOString()
    };
}

function hashPassword(password) {
    const data = new TextEncoder().encode(PASSWORD_PEPPER + String(password || ''));
    return crypto.subtle.digest('SHA-256', data).then((buffer) => {
        return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    });
}

function accountUsers() {
    if (state && Array.isArray(state.users) && state.users.length) return state.users;
    const loaded = loadState();
    ensureStateShape(loaded);
    return loaded.users;
}

function roleLabel(role) {
    return role === 'super_admin' ? 'Super admin' : 'Traffic Desk';
}

function currentSession() {
    return loadAuthSession();
}

function isSuperAdmin() {
    return currentSession()?.role === 'super_admin';
}

function currentActor() {
    const session = currentSession();
    if (!session?.userId) return { userId: null };
    return { userId: session.userId };
}

function userLabel(userId) {
    if (!userId) return '—';
    const user = (state?.users || []).find((item) => item.id === userId);
    return user ? user.fullName : userId;
}

async function authenticateUser(username, password) {
    const name = String(username || '').trim().toLowerCase();
    const user = accountUsers().find((item) => item.username === name);
    if (!user) return { error: 'Invalid username or password.' };
    if (!user.active) return { error: 'This account is disabled. Ask the super admin.' };
    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) return { error: 'Invalid username or password.' };
    return { user };
}

function sessionFromUser(user) {
    return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword),
        loginAtIso: new Date().toISOString()
    };
}

function createDeskUser(fields) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can add a desk account.' };
    const fullName = String(fields.fullName || '').trim();
    const username = String(fields.username || '').trim().toLowerCase();
    const password = String(fields.password || '');
    if (!fullName) return { error: 'Full name is required.' };
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return { error: 'Username must be 3–32 characters: letters, numbers, dot, dash, or underscore.' };
    }
    if (password.length < 8) return { error: 'Temporary password must be at least 8 characters.' };
    if (state.users.some((user) => user.username === username)) {
        return { error: 'That username is already in use.' };
    }
    return { pending: { fullName, username, password } };
}

async function commitDeskUser(pending) {
    const hash = await hashPassword(pending.password);
    const user = normalizeUser({
        id: `USR-${state.nextUserNumber}`,
        fullName: pending.fullName,
        username: pending.username,
        passwordHash: hash,
        role: 'traffic_desk',
        active: true,
        mustChangePassword: true,
        createdBy: currentActor().userId,
        createdAtIso: new Date().toISOString()
    });
    state.nextUserNumber += 1;
    state.users.push(user);
    saveState();
    return { user };
}

function setDeskUserActive(userId, active) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can change account access.' };
    const user = state.users.find((item) => item.id === userId);
    if (!user) return { error: 'Account not found.' };
    if (user.id === currentActor().userId && !active) {
        return { error: 'You cannot disable the account you are using.' };
    }
    const otherAdmins = state.users.filter((item) => item.role === 'super_admin' && item.active && item.id !== user.id);
    if (user.role === 'super_admin' && !active && !otherAdmins.length) {
        return { error: 'Keep at least one active super admin.' };
    }
    user.active = Boolean(active);
    saveState();
    return { user };
}

async function resetDeskUserPassword(userId, password) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can reset a password.' };
    const user = state.users.find((item) => item.id === userId);
    if (!user) return { error: 'Account not found.' };
    if (String(password || '').length < 8) return { error: 'Temporary password must be at least 8 characters.' };
    user.passwordHash = await hashPassword(password);
    user.mustChangePassword = true;
    saveState();
    return { user };
}

async function changeOwnPassword(currentPassword, nextPassword) {
    const session = currentSession();
    const user = state.users.find((item) => item.id === session?.userId);
    if (!user) return { error: 'Sign in again before changing the password.' };
    if (String(nextPassword || '').length < 8) return { error: 'New password must be at least 8 characters.' };
    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== user.passwordHash) return { error: 'Current password does not match.' };
    user.passwordHash = await hashPassword(nextPassword);
    user.mustChangePassword = false;
    saveState();
    const nextSession = sessionFromUser(user);
    nextSession.loginAtIso = session.loginAtIso;
    saveAuthSession(nextSession);
    return { user };
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
    return fetchVisionHistoryJsonl();
}

function isKeptVisionRecord(record, start) {
    if (!record || !record.timestamp) return false;
    if (String(record.timestamp) < start) return false;
    const peak = Number(record.vehicles_in_frame_peak);
    const average = Number(record.vehicles_in_frame_avg);
    if (Number.isFinite(peak) && peak >= VISION_MAX_IN_FRAME) return false;
    if (Number.isFinite(average) && average >= VISION_MAX_IN_FRAME) return false;
    return true;
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
let visionHistory = [];

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

function setVisionHistory(records) {
    visionHistory = Array.isArray(records) ? records : [];
    return visionHistory;
}

function getVisionHistoryRecords() {
    if (visionHistory.length) return visionHistory;
    if (state.liveTelemetry && state.liveTelemetry.length) return state.liveTelemetry;
    return state.telemetry || [];
}

function normalizeHourlyEntry(record) {
    if (!isKeptVisionRecord(record, VISION_HOURLY_START)) return null;
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
    state.live.visionLevel = normalizeVisionLevel(payload.congestion_level);
    state.live.visionPayload = { ...payload, source: payload.source || source };

    const latest = state.liveTelemetry[state.liveTelemetry.length - 1];
    if (!latest || latest.sourceTimestamp !== payload.timestamp) {
        state.liveTelemetry.push(buildTelemetryEntry(payload, nowIso, nextVehicleCount, nextScore));
        state.liveTelemetry = state.liveTelemetry.slice(-240);
        maybeCreateEvidenceReport({ ...payload, source: payload.source || source }, nextVehicleCount, nextScore, nowIso);
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
        visionLevel: normalizeVisionLevel(payload.congestion_level),
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
    // Only the live vision node may open a case.
    if ((payload.source || '') !== 'traffic_vision_system') return;
    const isHeavy = normalizeVisionLevel(payload.congestion_level) === 'HEAVY';
    if (!payload.snapshot_url || !isHeavy) return;
    if (state.reports.some((report) => report.snapshotUrl === payload.snapshot_url)) return;

    state.reports.unshift({
        id: `RPT-${state.nextReportNumber}`,
        location: payload.site_name || 'Villamonte Street Intersection',
        cameraId: payload.camera_id || null,
        severity: visionLevelToSeverity(normalizeVisionLevel(payload.congestion_level)),
        congestionScore: score,
        vehicleCount,
        occupancyPct: Number.isFinite(Number(payload.occupancy_pct)) ? Number(payload.occupancy_pct) : null,
        avgSpeedKph: payload.speed_calibrated ? Number(payload.avg_speed_kph) : null,
        status: 'Open',
        lat: Number(payload.lat) || CAMERA_SITE.lat,
        lng: Number(payload.lng) || CAMERA_SITE.lng,
        source: 'Vision system',
        context: `Automatically generated: ${normalizeVisionLevel(payload.congestion_level)} congestion (score ${score}) persisted for three reporting intervals.`,
        notes: '',
        falsePositive: false,
        snapshotUrl: payload.snapshot_url,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        resolvedAtIso: null,
        createdByUserId: currentActor().userId,
        updatedByUserId: currentActor().userId
    });

    state.nextReportNumber += 1;
    state.reports = state.reports.slice(0, 120);
}

// Accepts both a v2 aggregated history record and a raw v1 payload.
function normalizeVisionHistoryEntry(record) {
    if (!isKeptVisionRecord(record, VISION_HISTORY_START)) return null;
    if (!VISION_LEVELS[record.congestion_level]) return null;

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
        visionLevel: normalizeVisionLevel(record.congestion_level),
        vehicleTypes: record.vehicle_types || {},
        occupancyPct: Number.isFinite(occupancy) ? occupancy : null,
        avgSpeedKph: record.speed_calibrated && Number.isFinite(speedKph) ? speedKph : null,
        speedCalibrated: Boolean(record.speed_calibrated),
        crossings: Number.isFinite(crossings) ? crossings : null,
        byDirection: record.by_direction || {}
    };
}

function evidenceReports() {
    return (state.reports || []).filter((report) => {
        const url = String(report.snapshotUrl || '');
        return url && !url.startsWith('data:');
    });
}

// --- Advisory model ---

async function fetchAdvisories() {
    try {
        const response = await fetch(`${ADVISORIES_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const list = await response.json();
        return Array.isArray(list) ? list : [];
    } catch (error) {
        return null;
    }
}

async function refreshAdvisories() {
    const list = await fetchAdvisories();
    if (!list || !state) return false;
    state.advisories = list;
    saveState();
    return true;
}

async function publishAdvisory({ level, area, message }) {
    const response = await fetch(ADVISORY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'broadcast',
            level,
            area,
            message,
            createdByUserId: currentActor().userId
        })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Broadcast failed');
    }
    await refreshAdvisories();
    return body;
}

async function clearAdvisories() {
    const response = await fetch(ADVISORY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not clear advisories');
    }
    if (state) {
        state.advisories = [];
        saveState();
    }
}

// --- Report model ---

function findReport(reportId) {
    return state.reports.find((item) => item.id === reportId);
}

function updateCameraReportNotes(reportId, notes) {
    const report = findReport(reportId);
    if (!report || !isCameraReport(report)) return null;
    report.notes = notes;
    report.updatedAtIso = new Date().toISOString();
    report.updatedByUserId = currentActor().userId;
    saveState();
    return report;
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
    report.updatedByUserId = currentActor().userId;

    saveState();
    return report;
}

function resolveReport(reportId) {
    const report = findReport(reportId);
    if (!report) return null;
    report.status = 'Resolved';
    report.resolvedAtIso = new Date().toISOString();
    report.updatedAtIso = report.resolvedAtIso;
    report.updatedByUserId = currentActor().userId;
    saveState();
    return report;
}

function getReportSource(report) {
    if (report.source) return report.source;
    if (report.snapshotUrl || (report.context || '').startsWith('Automatically generated')) return 'Vision system';
    return 'Manual entry';
}

function isCameraReport(report) {
    return getReportSource(report) === 'Vision system';
}

function getOpenCameraReports() {
    return state.reports.filter((report) => isCameraReport(report) && report.status !== 'Resolved');
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
    report.updatedByUserId = currentActor().userId;

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

function nextOfficerId() {
    const numbers = state.officers.map((officer) => {
        const match = String(officer.id).match(/(\d+)$/);
        return match ? Number(match[1]) : 0;
    });
    const next = Math.max(0, ...numbers) + 1;
    return `BTAO-${String(next).padStart(2, '0')}`;
}

// Field roster only. A badge is not a desk login; the super admin creates those on Desk accounts.
function createOfficer(fields) {
    const fullName = String(fields.fullName || '').trim();
    if (!fullName) return { error: 'Full name is required.' };

    let id = String(fields.id || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!id) id = nextOfficerId();
    else if (/^\d+$/.test(id)) id = `BTAO-${id.padStart(2, '0')}`;

    if (state.officers.some((officer) => officer.id === id)) {
        return { error: `Badge ${id} is already on the roster.` };
    }

    const skills = String(fields.skills || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    const officer = normalizeOfficer({
        id,
        fullName,
        name: displayNameFromFullName(fullName),
        rank: fields.rank,
        contact: fields.contact,
        radio: fields.radio || id,
        zone: fields.zone || 'Villamonte',
        shiftStart: fields.shiftStart,
        shiftEnd: fields.shiftEnd,
        restDay: fields.restDay,
        status: 'Available',
        skills,
        dateAssigned: new Date().toISOString().slice(0, 10)
    });

    state.officers.push(officer);
    saveState();
    return { officer };
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
        fieldNotes: '',
        createdByUserId: currentActor().userId
    };

    state.nextAssignmentNumber += 1;
    state.assignments.unshift(assignment);
    officer.status = 'Assigned';
    report.status = 'Assigned';
    report.updatedAtIso = nowIso;
    report.updatedByUserId = currentActor().userId;

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
    if (report) {
        report.updatedAtIso = nowIso;
        report.updatedByUserId = currentActor().userId;
    }
    assignment.updatedByUserId = currentActor().userId;

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
        report.updatedByUserId = currentActor().userId;
    }
    assignment.updatedByUserId = currentActor().userId;

    saveState();
    return assignment;
}
