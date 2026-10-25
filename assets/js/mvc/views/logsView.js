// Renders the three log lists. The times come from the database, not from the browser clock.

function levelTag(level) {
    const name = String(level || '').toUpperCase();
    const kind = name === 'HEAVY' || name === 'CRITICAL' ? 'danger' : (name === 'MODERATE' ? 'warning' : 'success');
    return `<span class="tag ${kind}">${escapeHtml(level || '--')}</span>`;
}

function statusTag(status) {
    const key = String(status || '').toLowerCase().replace(/\s+/g, '');
    const kinds = {
        open: 'status-open',
        assigned: 'status-assigned',
        enroute: 'status-enroute',
        onscene: 'status-onscene',
        resolved: 'status-resolved',
        closed: 'status-resolved'
    };
    return `<span class="tag ${kinds[key] || 'info'}">${escapeHtml(status || '--')}</span>`;
}

function renderCongestionSummary(summary) {
    const target = document.getElementById('congestionSummary');
    if (!target) return;
    const stored = Number(summary.hoursStored) || 0;
    if (!stored) {
        target.innerHTML = '<div class="chart-empty">No hourly record in this period. The camera writes one row per hour.</div>';
        return;
    }
    const busiest = summary.busiest;
    const busiestValue = busiest ? formatDateTime(busiest.recordedAt) : '--';
    const busiestNote = busiest ? `${busiest.level} · score ${Number(busiest.score).toFixed(0)}` : 'No hour in this period';
    const crossings = Number(summary.totalCrossings) || 0;
    target.innerHTML = `
        <div class="log-stats">
            <div class="log-stat"><span>Hours stored</span><strong>${stored}</strong></div>
            <div class="log-stat"><span>Congested</span><strong>${Number(summary.congestedHours) || 0}</strong></div>
            <div class="log-stat"><span>Crossings</span><strong>${crossings}</strong></div>
            <div class="log-stat"><span>Busiest hour</span><strong>${escapeHtml(busiestValue)}</strong><em>${escapeHtml(busiestNote)}</em></div>
        </div>`;
}

function renderLogLists(data) {
    const congestion = document.getElementById('congestionLog');
    const reports = document.getElementById('reportLog');
    const assignments = document.getElementById('assignmentLog');
    if (!congestion || !reports || !assignments) return;

    const summary = data.summary || { hoursStored: 0, congestedHours: 0, totalCrossings: 0, busiest: null };
    renderCongestionSummary(summary);

    const hours = data.congestion || [];
    if (!Number(summary.hoursStored)) {
        congestion.innerHTML = '';
    } else {
        congestion.innerHTML = hours.length ? hours.map((row) => `
            <div class="log-row">
                <strong>${escapeHtml(formatDateTime(row.recordedAt))}</strong>
                <div class="log-facts">
                    <span>Score ${Number(row.score).toFixed(0)}</span>
                    <span>${row.crossings} crossing${row.crossings === 1 ? '' : 's'}</span>
                    <span>Peak ${row.vehiclesPeak} in frame</span>
                </div>
                ${levelTag(row.level)}
            </div>
        `).join('') : '<div class="chart-empty">None of those hours were congested, and no vehicles crossed the line.</div>';
    }

    const cases = data.reports || [];
    reports.innerHTML = cases.length ? cases.map((row) => `
        <div class="log-row">
            <strong>${escapeHtml(row.id)}</strong>
            <div class="log-facts">
                <span>${escapeHtml(row.location)}</span>
                <span>Opened ${escapeHtml(formatDateTime(row.openedAt))}</span>
                <span>${escapeHtml(row.severity)} · ${row.score}% · ${row.vehicles} vehicle${row.vehicles === 1 ? '' : 's'}</span>
                ${row.resolvedAt ? `<span>Resolved ${escapeHtml(formatDateTime(row.resolvedAt))}</span>` : ''}
            </div>
            ${statusTag(row.status)}
        </div>
    `).join('') : '<div class="chart-empty">No congestion reports opened in this period.</div>';

    const jobs = data.assignments || [];
    assignments.innerHTML = jobs.length ? jobs.map((row) => {
        const times = [
            ['Assigned', row.assignedAt],
            ['Acknowledged', row.acknowledgedAt],
            ['En route', row.enrouteAt],
            ['On scene', row.onsceneAt],
            ['Resolved', row.resolvedAt]
        ].filter((pair) => pair[1]);
        return `
        <div class="log-row">
            <strong>${escapeHtml(row.officer || 'Officer')}</strong>
            <div class="log-facts">
                <span>${escapeHtml(row.reportId)}</span>
                <span>${escapeHtml(row.location)}</span>
            </div>
            ${statusTag(row.status)}
            <div class="log-times">
                ${times.map((pair) => `<div class="log-time"><small>${escapeHtml(pair[0])}</small><b>${escapeHtml(formatDateTime(pair[1]))}</b></div>`).join('')}
            </div>
        </div>`;
    }).join('') : '<div class="chart-empty">No officer was assigned in this period.</div>';
}
