// MVC - View: Assign Officer (dispatch) page rendering.

function renderDispatchPage() {
    renderDispatchQueue();
    renderOfficerPool();
    renderAssignmentList();
}

function renderDispatchQueue() {
    const target = document.getElementById('dispatchQueue');
    const count = document.getElementById('dispatchOpenCount');
    if (!target || !count) return;

    const openReports = state.reports
        .filter((report) => report.status !== 'Resolved')
        .sort((a, b) => b.congestionScore - a.congestionScore);

    count.textContent = `${openReports.length} open`;

    target.innerHTML = openReports.map((report) => `
        <div class="dispatch-card ${selectedDispatchReportId === report.id ? 'selected' : ''}">
            <div class="priority ${priorityClass(report.severity)}">${priorityLabel(report.severity)}</div>
            <div class="dispatch-main">
                <strong>${report.id} | ${report.location}</strong>
                <span>${report.vehicleCount} vehicles | ${report.congestionScore}%</span>
                <div class="dispatch-meta"><span>${report.status}</span><span>${formatTime(report.updatedAtIso)}</span></div>
            </div>
            <button class="btn ${selectedDispatchReportId === report.id ? 'primary' : 'ghost'} tiny" data-select-report="${report.id}">Select</button>
        </div>
    `).join('') || '<div class="dispatch-card">No open reports.</div>';
}

function renderOfficerPool() {
    const target = document.getElementById('officerPool');
    const selection = document.getElementById('dispatchSelection');
    if (!target || !selection) return;

    selection.textContent = selectedDispatchReportId || 'No report selected';

    target.innerHTML = state.officers.map((officer) => `
        <div class="recommendation">
            <div class="score ${officer.status === 'Available' ? '' : 'muted'}">${100 - officer.workload}</div>
            <div>
                <strong>${officer.id} | ${officer.name}</strong>
                <p>${officer.zone}</p>
                <small>${officer.status} | ${officer.workload}%</small>
            </div>
            <button class="btn ${officer.status === 'Available' ? 'primary' : 'ghost'}" data-assign-officer="${officer.id}" ${officer.status === 'Available' && selectedDispatchReportId ? '' : 'disabled'}>Assign</button>
        </div>
    `).join('');
}

function renderAssignmentList() {
    const target = document.getElementById('assignmentList');
    if (!target) return;

    target.innerHTML = state.assignments.map((assignment) => {
        const report = state.reports.find((item) => item.id === assignment.reportId);
        const officer = state.officers.find((item) => item.id === assignment.officerId);
        return `
            <div class="audit-row ${selectedAssignmentId === assignment.id ? 'selected-audit' : ''}" data-assignment-id="${assignment.id}">
                <span class="audit-time">${formatTime(assignment.assignedAtIso)}</span>
                <strong>${assignment.id}</strong>
                <span>${assignment.reportId} -> ${assignment.officerId} (${assignment.status})${report ? ` | ${report.location}` : ''}${officer ? ` | ${officer.name}` : ''}</span>
                <button class="btn tiny ${assignment.status === 'Resolved' ? 'ghost' : 'primary'}" data-resolve-assignment="${assignment.id}" ${assignment.status === 'Resolved' ? 'disabled' : ''}>Resolve</button>
            </div>
        `;
    }).join('') || '<div class="audit-row">No assignments.</div>';
}
