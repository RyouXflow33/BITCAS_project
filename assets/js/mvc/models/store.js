// MVC - Model: application state, persistence and vision data access.
// All data lives here; views render from it and controllers mutate it through these functions.

let state = null;
let activeSession = window.__BITCAS_SESSION || null;
let lastSyncedDeskSignature = '';
let deskSaveInFlight = false;
let deskSaveQueued = false;
// The page starts with only the seeded admin in memory. Nothing may be saved
// until the real desk list has been read from the database at least once.
let deskLoaded = false;

function isDeskStateLoaded() {
    return deskLoaded;
}

function deskStatePayload(source = state) {
    if (!source) return null;
    // Accounts are not part of this list. They change only through api/desk_users.php.
    return {
        reports: source.reports || [],
        officers: source.officers || [],
        assignments: source.assignments || []
    };
}

function loadState() {
    if (state) return state;
    return buildDefaultState();
}

function saveState(syncRemote = true) {
    if (!syncRemote || !state || !deskLoaded) return;
    const signature = JSON.stringify(deskStatePayload(state));
    if (signature === lastSyncedDeskSignature && !deskSaveQueued) return;
    queueDeskSave();
}

function queueDeskSave() {
    if (!state || !deskLoaded) return;
    if (deskSaveInFlight) {
        deskSaveQueued = true;
        return;
    }
    const payload = deskStatePayload(state);
    const signature = JSON.stringify(payload);
    if (signature === lastSyncedDeskSignature) {
        deskSaveQueued = false;
        return;
    }
    deskSaveInFlight = true;
    deskSaveQueued = false;
    fetch(DESK_STATE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, basedOnServerState: true })
    }).then((response) => {
        if (response.ok && signature === JSON.stringify(deskStatePayload(state))) {
            lastSyncedDeskSignature = signature;
        }
    }).catch(() => {
        // The next desk change sends the current list again.
    }).finally(() => {
        deskSaveInFlight = false;
        if (deskSaveQueued || signature !== JSON.stringify(deskStatePayload(state))) {
            deskSaveQueued = false;
            queueDeskSave();
        }
    });
}

async function refreshDeskState() {
    try {
        const response = await fetch(`${DESK_STATE_API_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return false;
        const body = await response.json();
        if (!body || !body.ok || !body.state) return false;
        if (deskSaveInFlight || deskSaveQueued) return false;
        if (!state) {
            state = loadState();
            ensureStateShape(state);
        }
        const remote = body.state;

        state.users = Array.isArray(remote.users) && remote.users.length ? remote.users.map(normalizeUser) : [seedSuperAdmin()];
        state.reports = Array.isArray(remote.reports) ? remote.reports : [];
        state.officers = Array.isArray(remote.officers) ? remote.officers.map(normalizeOfficer) : [];
        state.assignments = Array.isArray(remote.assignments) ? remote.assignments.map(normalizeAssignment) : [];
        state.nextReportNumber = Number(remote.nextReportNumber) || 1;
        state.nextAssignmentNumber = Number(remote.nextAssignmentNumber) || 1;
        state.nextUserNumber = Number(remote.nextUserNumber) || Math.max(2, state.users.length + 1);
        ensureStateShape(state);
        lastSyncedDeskSignature = JSON.stringify(deskStatePayload(state));
        deskLoaded = true;
        return true;
    } catch (error) {
        return false;
    }
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
    if (!activeSession || typeof activeSession !== 'object') return null;
    const roleOk = activeSession.role === 'super_admin' || activeSession.role === 'traffic_desk';
    if (!activeSession.userId || !activeSession.username || !roleOk) {
        activeSession = null;
        return null;
    }
    return activeSession;
}

function seedSuperAdmin() {
    return {
        id: 'USR-1',
        fullName: 'LGU Admin',
        username: 'lguadmin',
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
        role: user.role === 'super_admin' ? 'super_admin' : 'traffic_desk',
        active: user.active !== false,
        mustChangePassword: Boolean(user.mustChangePassword),
        createdBy: user.createdBy || null,
        createdAtIso: user.createdAtIso || new Date().toISOString()
    };
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
    try {
        // The server checks the password. Nothing about it is stored or hashed in the browser.
        const response = await fetch(AUTH_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username: name, password: String(password || '') })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok || !body.user) {
            return { error: body.error || 'Invalid username or password.' };
        }
        if (body.session) {
            saveAuthSession(body.session);
        }
        await refreshDeskState();
        return { user: normalizeUser(body.user) };
    } catch (error) {
        return { error: 'Could not reach the server to sign in.' };
    }
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
    const problem = personNameError(fullName, 'Full name')
        || usernameError(username)
        || passwordError(password, 'Temporary password');
    if (problem) return { error: problem };
    if (state.users.some((user) => user.username === username)) {
        return { error: 'That username is already in use.' };
    }
    return { pending: { fullName, username, password } };
}

// Every account change goes to api/desk_users.php. The server checks who is asking,
// applies the rules (last super admin, own account), and keeps the hashes.
async function postDeskUsers(body) {
    try {
        const response = await fetch(DESK_USERS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
            return { error: result.error || 'Could not save the account change.' };
        }
        return result;
    } catch (error) {
        return { error: 'Could not reach the server.' };
    }
}

async function commitDeskUser(pending) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can add a desk account.' };
    const result = await postDeskUsers({
        action: 'create',
        fullName: pending.fullName,
        username: pending.username,
        password: pending.password
    });
    if (result.error) return result;
    await refreshDeskState();
    return { user: normalizeUser(result.user) };
}

async function setDeskUserActive(userId, active) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can change account access.' };
    const result = await postDeskUsers({ action: 'set_active', userId, active: Boolean(active) });
    if (result.error) return result;
    await refreshDeskState();
    return { user: normalizeUser(result.user) };
}

async function deleteDeskUser(userId) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can delete a desk account.' };
    const result = await postDeskUsers({ action: 'delete', userId });
    if (result.error) return result;
    await refreshDeskState();
    return { ok: true };
}

async function resetDeskUserPassword(userId, password) {
    if (!isSuperAdmin()) return { error: 'Only the super admin can reset a password.' };
    if (String(password || '').length < 8) return { error: 'Temporary password must be at least 8 characters.' };
    const result = await postDeskUsers({ action: 'reset_password', userId, password: String(password) });
    if (result.error) return result;
    await refreshDeskState();
    return { user: normalizeUser(result.user) };
}

async function changeOwnPassword(currentPassword, nextPassword) {
    if (!currentSession()) return { error: 'Sign in again before changing the password.' };
    if (String(nextPassword || '').length < 8) return { error: 'New password must be at least 8 characters.' };
    const result = await postDeskUsers({
        action: 'change_password',
        currentPassword: String(currentPassword || ''),
        newPassword: String(nextPassword)
    });
    if (result.error) return result;
    if (result.session) saveAuthSession(result.session);
    await refreshDeskState();
    return { user: normalizeUser(result.user) };
}

// The session itself lives on the server. This only keeps the copy the page already received.
function saveAuthSession(session) {
    activeSession = session;
    window.__BITCAS_SESSION = session;
}

function clearAuthSession() {
    activeSession = null;
    window.__BITCAS_SESSION = null;
    return fetch(AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
    }).catch(() => {});
}

// --- Vision feed model ---

async function fetchVisionFeed() {
    const sep = VISION_FIXTURE_URL.includes('?') ? '&' : '?';
    const response = await fetch(`${VISION_FIXTURE_URL}${sep}t=${Date.now()}`, { cache: 'no-store' });
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
        const sep = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' });
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

// Hourly rollups are read-only derived data held in memory.
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
        crossingTypes: record.crossing_types || {},
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
    }

    saveState();
    return true;
}

// Vehicles that crossed the counting line, grouped by class.
function countCrossingsByClass(crossings) {
    const counts = {};
    (Array.isArray(crossings) ? crossings : []).forEach((crossing) => {
        const type = crossing && crossing.vehicle_class;
        if (type) counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
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
        crossingTypes: countCrossingsByClass(payload.crossings),
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

// Congestion reports are opened on the server when the Pi uploads a HEAVY photo
// (api/upload_snapshot.php). The desk only reads them, so a report exists even when
// nobody had the page open. See refreshDeskState().

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
        crossingTypes: record.crossing_types || {},
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
    const problem = noteError(notes, 'Remarks', 500);
    if (problem) return { error: problem };
    report.notes = notes;
    report.updatedAtIso = new Date().toISOString();
    report.updatedByUserId = currentActor().userId;
    saveState();
    return report;
}

function updateReport(reportId, fields) {
    const report = findReport(reportId);
    if (!report) return null;
    const problem = shortTextError(fields.location, 'Location', 160, true)
        || wholeNumberError(fields.vehicleCount, 'Vehicle count', 0, 500)
        || noteError(fields.notes, 'Remarks', 500)
        || noteError(fields.context, 'System log', 500);
    if (problem) return { error: problem };

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
    const nameProblem = personNameError(fullName, 'Full name')
        || badgeError(fields.id)
        || contactError(fields.contact)
        || shortTextError(fields.radio, 'Radio', 40, false)
        || shortTextError(fields.zone, 'Zone', 40, false)
        || shortTextError(fields.skills, 'Skills', 200, false);
    if (nameProblem) return { error: nameProblem };

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
    const skillProblem = skills.map((skill) => shortTextError(skill, 'Skill', 40, true)).find(Boolean);
    if (skillProblem) return { error: skillProblem };

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
