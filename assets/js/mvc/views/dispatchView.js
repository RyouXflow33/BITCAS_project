// MVC - View: Dispatch board and officer roster.

function renderDispatchPage() {
    renderDispatchKpis();
    renderDispatchQueue();
    renderSelectedDispatchReport();
    renderOfficerPool();
    renderAssignmentBoard();
    renderOfficerRoster();
    renderOfficerProfile();
}

function renderDispatchKpis() {
    const target = document.getElementById('dispatchKpis');
    if (!target) return;

    const open = state.reports.filter((report) => report.status !== 'Resolved');
    const active = state.assignments.filter((item) => item.status !== 'Resolved');
    const available = state.officers.filter((officer) => officer.status === 'Available').length;
    const breaches = active.filter((assignment) => {
        const report = findReport(assignment.reportId);
        return assignmentSla(assignment, report).breached;
    }).length;

    target.innerHTML = `
        <div class="stat-card"><div class="stat-icon yellow">!</div><div><span>Open reports</span><strong>${open.length}</strong><em>Need a unit</em></div></div>
        <div class="stat-card"><div class="stat-icon violet">⇄</div><div><span>Active assignments</span><strong>${active.length}</strong><em>In the field</em></div></div>
        <div class="stat-card"><div class="stat-icon green">OK</div><div><span>Officers available</span><strong>${available}</strong><em>of ${state.officers.length} on roster</em></div></div>
        <div class="stat-card"><div class="stat-icon ${breaches ? 'red' : 'blue'}">SLA</div><div><span>SLA breaches</span><strong>${breaches}</strong><em>${breaches ? 'Over target response time' : 'All within target'}</em></div></div>
    `;
}

function renderDispatchQueue() {
    const target = document.getElementById('dispatchQueue');
    const count = document.getElementById('dispatchOpenCount');
    if (!target || !count) return;

    const openReports = state.reports
        .filter((report) => report.status !== 'Resolved')
        .sort((a, b) => {
            const rank = { Severe: 4, High: 3, Moderate: 2, Low: 1 };
            return (rank[b.severity] || 0) - (rank[a.severity] || 0) || b.congestionScore - a.congestionScore;
        });

    count.textContent = `${openReports.length} open`;

    if (!openReports.length) {
        target.innerHTML = '<div class="dispatch-card">No open reports.</div>';
        return;
    }

    target.innerHTML = openReports.map((report) => {
        const assignment = getActiveAssignmentForReport(report.id);
        const sla = assignment ? assignmentSla(assignment, report) : null;
        const slaText = sla
            ? (sla.breached ? `SLA breached ${formatDuration(Math.round(Math.abs(sla.remaining)))}` : `${formatDuration(Math.max(0, Math.round(sla.remaining)))} to on-scene`)
            : `${slaMinutesForSeverity(report.severity)} min SLA`;
        return `
            <div class="dispatch-card ${severityBorderClass(report.severity)} ${selectedDispatchReportId === report.id ? 'selected' : ''}">
                <div class="priority ${priorityClass(report.severity)}">${priorityLabel(report.severity)}</div>
                <div class="dispatch-main">
                    <strong>${report.id} · ${report.location}</strong>
                    <span>${report.vehicleCount} veh · ${report.congestionScore}% · ${report.severity}</span>
                    <div class="dispatch-meta">
                        <span class="tag ${statusTagClass(report.status)}">${report.status}</span>
                        <span class="${sla && sla.breached ? 'sla-breach' : 'sla-ok'}">${slaText}</span>
                    </div>
                </div>
                <button class="btn ${selectedDispatchReportId === report.id ? 'primary' : 'ghost'} tiny" data-select-report="${report.id}">Select</button>
            </div>
        `;
    }).join('');
}

function renderSelectedDispatchReport() {
    const target = document.getElementById('dispatchSelectedReport');
    const selection = document.getElementById('dispatchSelection');
    if (!target || !selection) return;

    const report = selectedDispatchReportId ? findReport(selectedDispatchReportId) : null;
    if (!report) {
        selection.textContent = 'No report selected';
        target.innerHTML = '<p class="panel-note">Select an open report. The pool below ranks officers for that location — the dispatcher still confirms.</p>';
        return;
    }

    const assignment = getActiveAssignmentForReport(report.id);
    const officer = assignment ? state.officers.find((item) => item.id === assignment.officerId) : null;
    selection.textContent = report.id;
    target.innerHTML = `
        <div class="selected-report">
            <div>
                <strong>${report.id}</strong>
                <span>${report.location}</span>
            </div>
            <div class="selected-report-meta">
                <span class="tag ${severityTagClass(report.severity)}">${priorityLabel(report.severity)} ${report.severity}</span>
                <span>${report.vehicleCount} vehicles · ${report.congestionScore}%</span>
                <span>${officer ? `Assigned: ${officer.id} ${officer.name}` : 'Unassigned'}</span>
            </div>
        </div>
    `;
}

function renderOfficerPool() {
    const target = document.getElementById('officerPool');
    if (!target) return;

    const report = selectedDispatchReportId ? findReport(selectedDispatchReportId) : null;
    const alreadyAssigned = report ? Boolean(getActiveAssignmentForReport(report.id)) : false;
    const ranked = recommendOfficers(report);

    if (!report) {
        target.innerHTML = '';
        return;
    }

    target.innerHTML = ranked.map((item, index) => {
        const { officer, score, reasons, canAssign } = item;
        const recommend = index === 0 && canAssign && !alreadyAssigned;
        return `
            <div class="recommendation ${recommend ? 'recommended' : ''}">
                <div class="score ${canAssign ? '' : 'muted'}">${score}</div>
                <div>
                    <strong>${officer.id} · ${officer.fullName}</strong>
                    <p>${officer.rank} · ${officer.zone}${recommend ? ' · Recommended' : ''}</p>
                    <small>${reasons.join(' · ')}</small>
                </div>
                <button class="btn ${canAssign && !alreadyAssigned ? 'primary' : 'ghost'} tiny" data-assign-officer="${officer.id}" ${canAssign && !alreadyAssigned ? '' : 'disabled'}>${alreadyAssigned ? 'Assigned' : 'Assign'}</button>
            </div>
        `;
    }).join('');
}

function renderAssignmentBoard() {
    const target = document.getElementById('assignmentBoard');
    if (!target) return;

    const columns = ['Assigned', 'En route', 'On scene', 'Resolved'];
    const today = formatLocalDateKey(new Date());

    target.innerHTML = columns.map((status) => {
        const items = state.assignments.filter((assignment) => {
            if (assignment.status !== status) return false;
            if (status !== 'Resolved') return true;
            const stamp = assignment.resolvedAtIso || assignment.assignedAtIso;
            return stamp && formatLocalDateKey(new Date(stamp)) === today;
        });

        return `
            <div class="kanban-col">
                <div class="kanban-head"><strong>${status}</strong><span>${items.length}</span></div>
                ${items.map((assignment) => renderAssignmentCard(assignment)).join('') || '<div class="kanban-empty">None</div>'}
            </div>
        `;
    }).join('');
}

function renderAssignmentCard(assignment) {
    const report = findReport(assignment.reportId);
    const officer = state.officers.find((item) => item.id === assignment.officerId);
    const sla = assignmentSla(assignment, report);
    const nextLabel = nextAssignmentActionLabel(assignment.status);
    const slaText = assignment.status === 'Resolved'
        ? `Cleared in ${formatElapsed(assignment.assignedAtIso)}`
        : sla.breached
            ? `Breached ${formatDuration(Math.round(Math.abs(sla.remaining)))}`
            : `${formatDuration(Math.max(0, Math.round(sla.remaining)))} left`;

    return `
        <div class="kanban-card ${selectedAssignmentId === assignment.id ? 'selected' : ''} ${sla.breached ? 'sla-hot' : ''}" data-assignment-id="${assignment.id}">
            <strong>${assignment.id}</strong>
            <span>${report ? report.location : assignment.reportId}</span>
            <span>${officer ? officer.name : assignment.officerId} · ${assignment.reportId}</span>
            <small class="${sla.breached ? 'sla-breach' : 'sla-ok'}">${slaText}</small>
            ${nextLabel ? `<button class="btn primary tiny" data-advance-assignment="${assignment.id}">${nextLabel}</button>` : ''}
        </div>
    `;
}

function renderOfficerRoster() {
    const target = document.getElementById('officerRoster');
    const meta = document.getElementById('rosterMeta');
    if (!target || !meta) return;

    meta.textContent = `${state.officers.length} officers`;
    target.innerHTML = state.officers.map((officer) => {
        const perf = officerPerformance(officer.id);
        const onShift = isOfficerOnShift(officer);
        return `
            <button class="roster-card ${selectedOfficerId === officer.id ? 'selected' : ''}" data-select-officer="${officer.id}">
                <div class="roster-avatar">${initialsFromName(officer.fullName)}</div>
                <div>
                    <strong>${officer.fullName}</strong>
                    <small>${officer.id} · ${officer.rank}</small>
                    <div class="dispatch-meta">
                        <span class="tag ${officerStatusTagClass(officer.status)}">${officer.status}</span>
                        <span>${officer.zone}</span>
                        <span>${onShift ? 'On shift' : 'Off shift'}</span>
                    </div>
                </div>
                <span class="roster-tasks">${perf.tasksToday} today</span>
            </button>
        `;
    }).join('');
}

function renderOfficerProfile() {
    const target = document.getElementById('officerProfile');
    const label = document.getElementById('rosterOfficerId');
    if (!target || !label) return;

    const officer = state.officers.find((item) => item.id === selectedOfficerId);
    if (!officer) {
        label.textContent = 'No selection';
        target.innerHTML = '<p class="panel-note">Select an officer to see shift, contact, and clearance times.</p>';
        return;
    }

    const perf = officerPerformance(officer.id);
    const assignment = state.assignments.find((item) => item.officerId === officer.id && item.status !== 'Resolved');
    const report = assignment ? findReport(assignment.reportId) : null;
    label.textContent = officer.id;

    target.innerHTML = `
        <div class="profile-hero">
            <div class="roster-avatar lg">${initialsFromName(officer.fullName)}</div>
            <div>
                <strong>${officer.fullName}</strong>
                <span>${officer.rank} · ${officer.id}</span>
                <div class="dispatch-meta">
                    <span class="tag ${officerStatusTagClass(officer.status)}">${officer.status}</span>
                    <span>${isOfficerOnShift(officer) ? 'On shift now' : 'Off shift'}</span>
                </div>
            </div>
        </div>
        <div class="report-meta-strip">
            <div><span>Zone / beat</span><strong>${officer.zone}</strong></div>
            <div><span>Shift</span><strong>${officer.shiftStart}–${officer.shiftEnd}</strong></div>
            <div><span>Rest day</span><strong>${officer.restDay}</strong></div>
            <div><span>Radio</span><strong>${officer.radio}</strong></div>
        </div>
        <div class="profile-block">
            <span>Contact</span>
            <strong>${officer.contact}</strong>
        </div>
        <div class="profile-block">
            <span>Skills</span>
            <strong>${officer.skills.join(' · ')}</strong>
        </div>
        <div class="profile-block">
            <span>Current assignment</span>
            <strong>${report ? `${assignment.id} · ${report.id} · ${report.location}` : 'None'}</strong>
        </div>
        <div class="kpi-grid report-kpis">
            <div><span>Tasks today</span><strong>${perf.tasksToday}</strong><small>Assignments started today</small></div>
            <div><span>Closed jobs</span><strong>${perf.closedCount}</strong><small>Resolved in this browser</small></div>
            <div><span>Avg response</span><strong>${perf.avgResponseMin == null ? '--' : formatDuration(perf.avgResponseMin)}</strong><small>Assigned to on-scene</small></div>
            <div><span>Avg clearance</span><strong>${perf.avgClearanceMin == null ? '--' : formatDuration(perf.avgClearanceMin)}</strong><small>On-scene to resolved</small></div>
        </div>
    `;
}

function setDispatchTab(tab) {
    const board = document.getElementById('dispatchBoard');
    const roster = document.getElementById('dispatchRoster');
    if (board) board.hidden = tab !== 'board';
    if (roster) roster.hidden = tab !== 'roster';
    document.querySelectorAll('#dispatchTabs [data-dispatch-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.dispatchTab === tab);
    });
}
