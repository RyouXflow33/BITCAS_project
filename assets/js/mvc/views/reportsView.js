// MVC - View: Congested Reports as a camera case file, not a generic editor.

function renderReportStats() {
    const target = document.getElementById('reportStats');
    if (!target) return;
    const cameraReports = state.reports.filter(isCameraReport);
    const open = cameraReports.filter((report) => report.status === 'Open').length;
    const assigned = cameraReports.filter((report) => report.status === 'Assigned').length;
    const camera = cameraReports.filter((report) => report.status !== 'Resolved').length;
    target.innerHTML = `
        <div>${icon('inbox')}<strong>${open}</strong><span>Unassigned</span></div>
        <div>${icon('send')}<strong>${assigned}</strong><span>With a unit</span></div>
        <div>${icon('camera')}<strong>${camera}</strong><span>From camera</span></div>
    `;
}

function renderReportsPage() {
    const cards = document.getElementById('reportCards');
    const meta = document.getElementById('reportsMeta');
    if (!cards || !meta) return;

    renderReportStats();
    const reports = getFilteredReports();

    meta.textContent = `${reports.length} of ${state.reports.length}`;

    if (!reports.length) {
        cards.innerHTML = emptyState('camera', 'No camera reports yet', 'Waiting for the Pi camera feed. A case opens after HEAVY holds for 3 intervals and a snapshot is written.');
        syncReportSelection([]);
        resetEditor();
        return;
    }

    cards.innerHTML = reports.map((report) => {
        return `
            <button class="report-card ${severityBorderClass(report.severity)} ${selectedReportId === report.id ? 'selected' : ''}" data-report-id="${escapeHtml(report.id)}">
                <div class="report-card-main">
                    <strong>${icon('camera')} ${escapeHtml(report.id)} · ${escapeHtml(report.location)}</strong>
                    <small>Camera · ${report.vehicleCount} veh · ${report.congestionScore}% · ${formatDateTime(report.createdAtIso)}</small>
                </div>
                <div class="report-card-badges">
                    <span class="tag ${severityTagClass(report.severity)}">${escapeHtml(report.severity)}</span>
                    <span class="tag ${statusTagClass(report.status)}">${report.status === 'Open' ? 'Unassigned' : escapeHtml(report.status)}</span>
                    ${report.falsePositive ? '<span class="tag status-open">Not congestion</span>' : ''}
                </div>
            </button>
        `;
    }).join('');

    fillReportEditor(syncReportSelection(reports));
    highlightSelectedReport();
}

function fillReportEditor(reportId) {
    const report = findReport(reportId);
    const caseBody = document.getElementById('reportCase');
    if (!report || !caseBody) return;

    const camera = isCameraReport(report);
    const officer = getAssignedOfficer(report.id);
    const occupancy = Number.isFinite(Number(report.occupancyPct)) ? `${Number(report.occupancyPct).toFixed(1)}%` : '--';
    const speed = Number.isFinite(Number(report.avgSpeedKph)) ? `${Number(report.avgSpeedKph).toFixed(1)} km/h` : 'Not calibrated';

    setText('editReportId', report.id);
    setValue('editLocation', report.location);
    setValue('editVehicles', String(report.vehicleCount));
    setValue('editSeverity', report.severity === 'Severe' ? 'High' : report.severity);
    setValue('editStatus', report.status);
    setValue('editContext', report.context || '');
    setValue('editNotes', report.notes || '');

    const manualFields = document.getElementById('manualFields');
    if (manualFields) manualFields.hidden = camera;
    ['editLocation', 'editVehicles', 'editSeverity', 'editStatus'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.required = !camera;
    });

    const assignLink = document.getElementById('assignOfficerLink');
    if (assignLink) {
        assignLink.href = `?page=dispatch&report=${encodeURIComponent(report.id)}`;
        assignLink.classList.toggle('is-disabled', report.status === 'Resolved');
        assignLink.innerHTML = `${icon('user-check')} ${report.status === 'Open' ? 'Assign officer' : 'Open in Dispatch'}`;
    }

    const markResolvedBtn = document.getElementById('markResolvedBtn');
    if (markResolvedBtn) markResolvedBtn.disabled = report.status === 'Resolved';
    const falsePositiveBtn = document.getElementById('markFalsePositiveBtn');
    if (falsePositiveBtn) falsePositiveBtn.disabled = Boolean(report.falsePositive) || report.status === 'Resolved';

    caseBody.innerHTML = `
        <div class="case-evidence">${renderEvidenceHtml(report)}</div>
        <div class="report-meta-strip">
            <div><span>Opened</span><strong>${formatDateTime(report.createdAtIso)}</strong></div>
            <div><span>Desk</span><strong>${escapeHtml(userLabel(report.updatedByUserId || report.createdByUserId))}</strong></div>
            <div><span>Source</span><strong>Pi camera · 3-interval snapshot</strong></div>
            <div><span>Camera</span><strong>${escapeHtml(report.cameraId || (camera ? 'CAM-VILLAMONTE-01' : '--'))}</strong></div>
            <div><span>Officer</span><strong>${escapeHtml(officer)}</strong></div>
        </div>
        <div class="report-meta-strip">
            <div><span>Congestion</span><strong>${escapeHtml(report.severity)} · ${report.congestionScore}%</strong></div>
            <div><span>Vehicles in frame</span><strong>${report.vehicleCount}</strong></div>
            <div><span>Occupancy</span><strong>${occupancy}</strong></div>
            <div><span>Avg speed</span><strong>${speed}</strong></div>
        </div>
        <div class="case-log">
            <span>System log</span>
            <p>${escapeHtml(report.context || '—')}</p>
        </div>
    `;
}

function renderEvidenceHtml(report) {
    if (report.snapshotUrl) {
        return `<img src="${escapeHtml(report.snapshotUrl)}" alt="Traffic evidence for ${escapeHtml(report.id)}"><small>Pi snapshot after 3 HEAVY publish intervals</small>`;
    }
    return '<div class="report-evidence-empty">Camera report — snapshot appears here when the Pi camera uploads an evidence frame.</div>';
}

function resetEditor() {
    setText('editReportId', 'No selection');
    setValue('editLocation', '');
    setValue('editVehicles', '');
    setValue('editSeverity', 'Low');
    setValue('editStatus', 'Open');
    setValue('editContext', '');
    setValue('editNotes', '');
    const manualFields = document.getElementById('manualFields');
    if (manualFields) manualFields.hidden = true;
    const caseBody = document.getElementById('reportCase');
    if (caseBody) {
        caseBody.innerHTML = emptyState('file', 'No camera case yet', 'Waiting for the Pi camera feed. HEAVY for 3 intervals opens the report and snapshot here.');
    }
    const markResolvedBtn = document.getElementById('markResolvedBtn');
    if (markResolvedBtn) markResolvedBtn.disabled = true;
    const falsePositiveBtn = document.getElementById('markFalsePositiveBtn');
    if (falsePositiveBtn) falsePositiveBtn.disabled = true;
}

function highlightSelectedReport() {
    document.querySelectorAll('.report-card').forEach((button) => {
        const isSelected = button.dataset.reportId === selectedReportId;
        button.classList.toggle('selected', isSelected);
    });
}
