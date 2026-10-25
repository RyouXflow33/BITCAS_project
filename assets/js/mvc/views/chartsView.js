// MVC - View: Analytics dashboard (greeting, sparklines, chart studio, chart gallery, report table).

const STUDIO_PREF_KEY = 'bitcas_studio';

const CHART_TYPES = [
    { key: 'column', label: 'Column' },
    { key: 'bar', label: 'Bar' },
    { key: 'line', label: 'Line' },
    { key: 'area', label: 'Area' },
    { key: 'histogram', label: 'Histogram' },
    { key: 'pie', label: 'Pie' }
];

let studioPref = { dataset: 'hourly', type: 'column' };
let lastChartMetrics = null;
let lastChartDatasets = null;

function loadStudioPref() {
    try {
        const saved = JSON.parse(localStorage.getItem(STUDIO_PREF_KEY) || 'null');
        if (saved && CHART_TYPES.some((t) => t.key === saved.type)) studioPref = { ...studioPref, ...saved };
    } catch (error) { /* ignore */ }
}

function saveStudioPref() {
    try { localStorage.setItem(STUDIO_PREF_KEY, JSON.stringify(studioPref)); } catch (error) { /* ignore */ }
}

// --- datasets -------------------------------------------------------------

function buildChartDatasets(metrics) {
    const telemetry = getVisionHistoryRecords();
    const capability = metrics.capability;
    const hourlyUnit = capability.hasThroughput ? 'vehicles' : 'avg vehicles';

    // Average congestion score per hour of day
    const scoreBuckets = {};
    telemetry.forEach((point) => {
        const hour = new Date(point.timestampIso).getHours();
        (scoreBuckets[hour] = scoreBuckets[hour] || []).push(point.congestionScore);
    });
    const scoreHours = Object.keys(scoreBuckets).map(Number).sort((a, b) => a - b);

    const classes = getClassificationCounts();

    const sets = {
        hourly: {
            key: 'hourly', title: 'Hourly profile', unit: hourlyUnit, kind: 'series', note: 'busiest hour',
            labels: metrics.hourly.map((h) => `${String(h.hour).padStart(2, '0')}:00`),
            values: metrics.hourly.map((h) => h.value),
            raw: telemetry.map((p) => p.vehicleCount)
        },
        score: {
            key: 'score', title: 'Congestion score by hour', unit: 'score', kind: 'series', note: 'highest hour',
            labels: scoreHours.map((h) => `${String(h).padStart(2, '0')}:00`),
            values: scoreHours.map((h) => Math.round(scoreBuckets[h].reduce((s, v) => s + v, 0) / scoreBuckets[h].length)),
            raw: telemetry.map((p) => p.congestionScore)
        },
        week: {
            key: 'week', title: '7-day trend', unit: 'avg vehicles', kind: 'series', note: 'busiest day',
            labels: metrics.sevenDayTrend.map((d) => d.label),
            values: metrics.sevenDayTrend.map((d) => Math.round(d.value * 10) / 10)
        },
        mix: {
            key: 'mix', title: 'Vehicle mix', unit: 'detections', kind: 'share', note: 'total detections',
            labels: metrics.vehicleMix.map((m) => m.type),
            values: metrics.vehicleMix.map((m) => m.count)
        },
        classes: {
            key: 'classes', title: 'Congestion classes', unit: 'reports', kind: 'share', note: 'total reports',
            labels: classes.map((c) => c.label),
            values: classes.map((c) => c.count)
        },
        direction: {
            key: 'direction', title: 'Direction split', unit: 'crossings', kind: 'share', note: 'total crossings',
            labels: metrics.directionSplit.map((d) => d.direction),
            values: metrics.directionSplit.map((d) => d.count)
        }
    };

    Object.values(sets).forEach((set) => {
        set.hasData = set.values.some((v) => v > 0);
    });
    return sets;
}

function pickDataset(sets, order) {
    return order.map((key) => sets[key]).find((set) => set && set.hasData) || sets[order[0]];
}

// --- entry point ------------------------------------------------------------

function renderChartsDashboard(metrics) {
    lastChartMetrics = metrics;
    lastChartDatasets = buildChartDatasets(metrics);
    renderGreeting();
    renderSparklines();
    renderChartStudio(true);
    renderChartGallery();
    renderReportTable();
}

function displayNameFor(username) {
    if (!username) return 'there';
    const known = { lguadmin: 'LGU Admin', admin: 'LGU Admin' };
    if (known[username]) return known[username];
    return username.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderGreeting() {
    const session = typeof currentSession === 'function' ? currentSession() : null;
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = (session && session.fullName) || displayNameFor(session && session.username);
    setText('dashGreeting', `${part}, ${name} \u{1F44B}`);
}

// --- KPI sparklines ---------------------------------------------------------

function sparkSvg(values) {
    const data = values.filter((v) => Number.isFinite(v)).slice(-36);
    if (data.length < 3) return '';
    const w = 110;
    const h = 38;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 10)]);
    const third = Math.max(1, Math.floor(data.length / 3));
    const early = data.slice(0, third).reduce((s, v) => s + v, 0) / third;
    const late = data.slice(-third).reduce((s, v) => s + v, 0) / third;
    const up = late >= early;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const id = `sp${Math.random().toString(36).slice(2, 8)}`;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark-svg ${up ? 'up' : 'down'}" aria-hidden="true">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
        <path d="${line} L${w},${h} L0,${h} Z" fill="url(#${id})"/>
        <path d="${line}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function renderSparklines() {
    const telemetry = getVisionHistoryRecords();
    const series = {
        sparkThroughput: telemetry.map((p) => p.vehicleCount),
        sparkFlow: telemetry.map((p) => p.crossings).filter((v) => v !== null),
        sparkSpeed: telemetry.map((p) => p.avgSpeedKph).filter((v) => v !== null),
        sparkOccupancy: telemetry.map((p) => p.occupancyPct).filter((v) => v !== null)
    };
    Object.entries(series).forEach(([id, values]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = sparkSvg(values);
    });
}

// --- chart studio -------------------------------------------------------------

function renderStudioControls() {
    const select = document.getElementById('studioDataset');
    if (select && lastChartDatasets) {
        select.innerHTML = Object.values(lastChartDatasets).map((set) =>
            `<option value="${set.key}"${set.key === studioPref.dataset ? ' selected' : ''}>${set.title}${set.hasData ? '' : ' (no data)'}</option>`).join('');
    }
    document.querySelectorAll('#studioType button').forEach((button) => {
        button.classList.toggle('active', button.dataset.type === studioPref.type);
    });
}

function renderChartStudio(animate = true) {
    const target = document.getElementById('studioChart');
    if (!target || !lastChartDatasets) return;

    if (!lastChartDatasets[studioPref.dataset]) studioPref.dataset = 'hourly';
    const set = lastChartDatasets[studioPref.dataset];
    renderStudioControls();

    // headline number
    const values = set.values;
    const total = values.reduce((s, v) => s + v, 0);
    const mean = values.length ? total / values.length : 0;
    let big = '--';
    let deltaHtml = '';
    let note = set.hasData ? '' : 'No minute readings yet';

    if (set.hasData) {
        if (set.kind === 'share') {
            big = BitcasCharts.fmt(total);
            note = set.note;
        } else {
            const peak = Math.max(...values);
            const peakLabel = set.labels[values.indexOf(peak)];
            big = BitcasCharts.fmt(peak);
            note = `${set.note}: ${peakLabel}`;
            const last = values[values.length - 1];
            if (mean > 0 && values.length > 2) {
                const delta = Math.round(((last - mean) / mean) * 100);
                deltaHtml = `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}%</span><small>latest vs avg</small>`;
            }
        }
    }

    setText('studioBig', big);
    const deltaEl = document.getElementById('studioDelta');
    if (deltaEl) deltaEl.innerHTML = deltaHtml;
    setText('studioNote', note);
    setText('studioSubtitle', `${set.title} \u00b7 ${CHART_TYPES.find((t) => t.key === studioPref.type).label.toLowerCase()} chart`);

    BitcasCharts.render(target, {
        type: studioPref.type,
        labels: set.labels,
        values: set.values,
        raw: set.raw,
        unit: set.unit,
        emptyText: `No ${set.title.toLowerCase()} data yet.`
    }, animate);
}

// --- gallery: one card per chart type --------------------------------------------

const GALLERY = [
    { id: 'galColumn', type: 'column', title: 'Column chart', order: ['hourly', 'score', 'week'] },
    { id: 'galBar', type: 'bar', title: 'Bar chart', order: ['direction', 'classes', 'mix', 'week'] },
    { id: 'galLine', type: 'line', title: 'Line chart', order: ['week', 'hourly', 'score'] },
    { id: 'galArea', type: 'area', title: 'Area chart', order: ['score', 'hourly', 'week'] },
    { id: 'galHistogram', type: 'histogram', title: 'Histogram', order: ['hourly', 'score'] },
    { id: 'galPie', type: 'pie', title: 'Pie chart', order: ['mix', 'classes', 'direction'] }
];

function renderChartGallery() {
    if (!lastChartDatasets) return;
    GALLERY.forEach((card) => {
        const target = document.getElementById(card.id);
        if (!target) return;
        const set = pickDataset(lastChartDatasets, card.order);
        const sub = document.getElementById(`${card.id}Sub`);
        if (sub) sub.textContent = card.type === 'histogram' ? 'Spread of minute readings' : set.title;
        BitcasCharts.render(target, {
            type: card.type,
            labels: set.labels,
            values: set.values,
            raw: set.raw,
            unit: set.unit,
            compact: true,
            emptyText: 'No data yet.'
        });
    });
}

// --- report monitoring table ---------------------------------------------------------

function renderReportTable() {
    const body = document.getElementById('reportTableBody');
    if (!body) return;
    const query = (document.getElementById('reportTableSearch') || {}).value || '';
    const q = query.trim().toLowerCase();

    const rows = state.reports
        .filter((report) => !q || `${report.id} ${report.location} ${report.status} ${report.severity}`.toLowerCase().includes(q))
        .slice(0, 8);

    setText('reportTableCount', `${rows.length} of ${state.reports.length}`);

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="6" class="table-empty">${q ? 'No reports match your search.' : 'No reports yet. Camera cases appear here once congestion persists.'}</td></tr>`;
        return;
    }

    body.innerHTML = rows.map((report) => {
        const assignment = (state.assignments || []).find((item) => item.reportId === report.id);
        const officer = assignment ? state.officers.find((item) => item.id === assignment.officerId) : null;
        const severity = report.severity === 'Severe' ? 'High' : report.severity;
        const level = severity === 'High' ? 'high' : severity === 'Moderate' ? 'mid' : 'low';
        const created = report.createdAtIso ? new Date(report.createdAtIso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '--';
        return `<tr>
            <td><strong>${escapeHtml(report.id)}</strong></td>
            <td>${escapeHtml(report.location)}</td>
            <td><span class="priority ${level}"><i></i><i></i><i></i> ${escapeHtml(severity)}</span></td>
            <td>${officer ? escapeHtml(officer.name) : '<span class="muted">Unassigned</span>'}</td>
            <td><span class="tag status-${escapeHtml(String(report.status).toLowerCase())}">${escapeHtml(report.status)}</span></td>
            <td>${escapeHtml(created)}</td>
        </tr>`;
    }).join('');
}
