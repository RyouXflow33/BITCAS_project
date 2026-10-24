// Renders the three log lists. The times come from the database, not from the browser clock.

function renderLogLists(data) {
    const congestion = document.getElementById('congestionLog');
    const reports = document.getElementById('reportLog');
    const assignments = document.getElementById('assignmentLog');
    if (!congestion || !reports || !assignments) return;

    const hours = data.congestion || [];
    congestion.innerHTML = hours.length ? hours.map((row) => `
        <div class="log-row">
            <strong>${escapeHtml(formatDateTime(row.recordedAt))}</strong>
            <span>${escapeHtml(row.level)} · score ${Number(row.score).toFixed(0)}</span>
            <span>${Number(row.vehiclesAvg).toFixed(1)} vehicles avg · peak ${row.vehiclesPeak} · ${row.crossings} crossings</span>
        </div>
    `).join('') : '<div class="chart-empty">No hourly congestion in this period. The camera writes one row per hour.</div>';

    const cases = data.reports || [];
    reports.innerHTML = cases.length ? cases.map((row) => `
        <div class="log-row">
            <strong>${escapeHtml(row.id)} · ${escapeHtml(row.location)}</strong>
            <span>Opened ${escapeHtml(formatDateTime(row.openedAt))}</span>
            <span>${escapeHtml(row.severity)} · ${row.score}% · ${escapeHtml(row.status)}${row.resolvedAt ? ` · resolved ${escapeHtml(formatDateTime(row.resolvedAt))}` : ''}</span>
        </div>
    `).join('') : '<div class="chart-empty">No congestion reports opened in this period.</div>';

    const jobs = data.assignments || [];
    assignments.innerHTML = jobs.length ? jobs.map((row) => `
        <div class="log-row">
            <strong>${escapeHtml(row.id)} · ${escapeHtml(row.officer || 'Officer')} · ${escapeHtml(row.reportId)}</strong>
            <span>${escapeHtml(row.location)} · ${escapeHtml(row.status)}</span>
            <span>
                Assigned ${escapeHtml(formatDateTime(row.assignedAt))}
                ${row.acknowledgedAt ? ` · acknowledged ${escapeHtml(formatDateTime(row.acknowledgedAt))}` : ''}
                ${row.enrouteAt ? ` · en route ${escapeHtml(formatDateTime(row.enrouteAt))}` : ''}
                ${row.onsceneAt ? ` · on scene ${escapeHtml(formatDateTime(row.onsceneAt))}` : ''}
                ${row.resolvedAt ? ` · resolved ${escapeHtml(formatDateTime(row.resolvedAt))}` : ''}
            </span>
        </div>
    `).join('') : '<div class="chart-empty">No officer was assigned in this period.</div>';
}
