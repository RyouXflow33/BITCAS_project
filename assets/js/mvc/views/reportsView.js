// MVC - View: Congested Reports page rendering (list, stats, editor).

function renderReportStats() {
    const target = document.getElementById('reportStats');
    if (!target) return;
    const open = state.reports.filter((report) => report.status === 'Open').length;
    const assigned = state.reports.filter((report) => report.status === 'Assigned').length;
    const resolved = state.reports.filter((report) => report.status === 'Resolved').length;
    target.innerHTML = `
        <div><strong>${open}</strong><span>Open</span></div>
        <div><strong>${assigned}</strong><span>Assigned</span></div>
        <div><strong>${resolved}</strong><span>Resolved</span></div>
    `;
}

function renderReportsPage() {
    const cards = document.getElementById('reportCards');
    const meta = document.getElementById('reportsMeta');
    if (!cards || !meta) return;

    renderReportStats();
    const reports = getFilteredReports();

    meta.textContent = `${reports.length} of ${state.reports.length} reports`;

    if (!reports.length) {
        cards.innerHTML = '<div class="report-card empty">No reports match the current filter.</div>';
        selectedReportId = null;
        resetEditor();
        return;
    }

    cards.innerHTML = reports.map((report) => `
        <button class="report-card ${severityBorderClass(report.severity)} ${selectedReportId === report.id ? 'selected' : ''}" data-report-id="${report.id}">
            <div class="report-card-main">
                <strong>${report.id} | ${report.location}</strong>
                <small>${report.vehicleCount} veh &middot; ${report.congestionScore}% score &middot; ${formatDateTime(report.createdAtIso)}</small>
            </div>
            <div class="report-card-badges">
                <span class="tag ${severityTagClass(report.severity)}">${report.severity}</span>
                <span class="tag ${statusTagClass(report.status)}">${report.status}</span>
            </div>
        </button>
    `).join('');

    if (!selectedReportId || !reports.some((report) => report.id === selectedReportId)) {
        selectedReportId = reports[0].id;
    }
    fillReportEditor(selectedReportId);
    highlightSelectedReport();
}

function fillReportEditor(reportId) {
    const report = findReport(reportId);
    if (!report) return;
    setText('editReportId', report.id);
    setValue('editLocation', report.location);
    setValue('editVehicles', String(report.vehicleCount));
    setValue('editSeverity', report.severity);
    setValue('editStatus', report.status);
    setValue('editContext', report.context);
    setValue('editNotes', report.notes || '');
    setText('metaCreated', formatDateTime(report.createdAtIso));
    setText('metaUpdated', formatDateTime(report.updatedAtIso));
    setText('metaSource', getReportSource(report));
    setText('metaOfficer', getAssignedOfficer(report.id));
    const markResolvedBtn = document.getElementById('markResolvedBtn');
    if (markResolvedBtn) markResolvedBtn.disabled = report.status === 'Resolved';
    renderReportEvidence(report);
}

function renderReportEvidence(report) {
    const target = document.getElementById('reportEvidence');
    if (!target) return;
    target.innerHTML = report.snapshotUrl
        ? `<img src="${report.snapshotUrl}" alt="Traffic evidence for ${report.id}"><small>Evidence snapshot: sustained HEAVY traffic</small>`
        : '<div class="report-evidence-empty">No evidence snapshot attached.</div>';
}

function resetEditor() {
    setText('editReportId', 'No selection');
    setValue('editLocation', '');
    setValue('editVehicles', '');
    setValue('editSeverity', 'Low');
    setValue('editStatus', 'Open');
    setValue('editContext', '');
    setValue('editNotes', '');
    setText('metaCreated', '--');
    setText('metaUpdated', '--');
    setText('metaSource', '--');
    setText('metaOfficer', '--');
    const markResolvedBtn = document.getElementById('markResolvedBtn');
    if (markResolvedBtn) markResolvedBtn.disabled = true;
    renderReportEvidence({});
}

function highlightSelectedReport() {
    document.querySelectorAll('.report-card').forEach((button) => {
        const isSelected = button.dataset.reportId === selectedReportId;
        button.classList.toggle('selected', isSelected);
    });
}
