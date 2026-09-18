// MVC - Controller: Dispatch board events, roster selection, assignment lifecycle.

let selectedDispatchReportId = null;
let selectedAssignmentId = null;
let selectedOfficerId = null;
let dispatchTab = 'board';

function initDispatchPage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('report')) selectedDispatchReportId = params.get('report');
    bindDispatchActions();
    autoSelectDispatchReport();
    autoSelectOfficer();
    setDispatchTab(dispatchTab);
    renderDispatchPage();
    setupDispatchSlaTick();
}

function bindDispatchActions() {
    const tabs = document.getElementById('dispatchTabs');
    if (tabs) {
        tabs.addEventListener('click', (event) => {
            const button = event.target.closest('[data-dispatch-tab]');
            if (!button) return;
            dispatchTab = button.dataset.dispatchTab;
            setDispatchTab(dispatchTab);
            renderDispatchPage();
        });
    }

    const queue = document.getElementById('dispatchQueue');
    if (queue) {
        queue.addEventListener('click', (event) => {
            const selectBtn = event.target.closest('[data-select-report]');
            if (!selectBtn) return;
            selectedDispatchReportId = selectBtn.dataset.selectReport;
            renderDispatchPage();
        });
    }

    const officerPool = document.getElementById('officerPool');
    if (officerPool) {
        officerPool.addEventListener('click', (event) => {
            const assignBtn = event.target.closest('[data-assign-officer]');
            if (!assignBtn || !selectedDispatchReportId) return;
            const assignmentId = assignOfficerToReport(assignBtn.dataset.assignOfficer, selectedDispatchReportId);
            if (assignmentId) {
                selectedAssignmentId = assignmentId;
                selectedOfficerId = assignBtn.dataset.assignOfficer;
            }
            renderDispatchPage();
            renderGlobalCounters();
        });
    }

    const board = document.getElementById('assignmentBoard');
    if (board) {
        board.addEventListener('click', (event) => {
            const card = event.target.closest('[data-assignment-id]');
            if (card) selectedAssignmentId = card.dataset.assignmentId;

            const advanceBtn = event.target.closest('[data-advance-assignment]');
            if (advanceBtn) advanceAssignment(advanceBtn.dataset.advanceAssignment);

            renderDispatchPage();
            renderGlobalCounters();
        });
    }

    const roster = document.getElementById('officerRoster');
    if (roster) {
        roster.addEventListener('click', (event) => {
            const button = event.target.closest('[data-select-officer]');
            if (!button) return;
            selectedOfficerId = button.dataset.selectOfficer;
            renderDispatchPage();
        });
    }

    const officerForm = document.getElementById('officerCreateForm');
    if (officerForm) {
        officerForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const errorEl = document.getElementById('officerCreateError');
            const result = createOfficer({
                id: getValue('officerBadge'),
                fullName: getValue('officerFullName'),
                rank: getValue('officerRank'),
                contact: getValue('officerContact'),
                radio: getValue('officerRadio'),
                zone: getValue('officerZone'),
                shiftStart: getValue('officerShiftStart'),
                shiftEnd: getValue('officerShiftEnd'),
                restDay: getValue('officerRestDay'),
                skills: getValue('officerSkills')
            });

            if (result.error) {
                if (errorEl) {
                    errorEl.hidden = false;
                    errorEl.textContent = result.error;
                }
                return;
            }

            if (errorEl) {
                errorEl.hidden = true;
                errorEl.textContent = '';
            }
            officerForm.reset();
            setValue('officerZone', 'Villamonte');
            setValue('officerShiftStart', '06:00');
            setValue('officerShiftEnd', '14:00');
            selectedOfficerId = result.officer.id;
            dispatchTab = 'roster';
            setDispatchTab(dispatchTab);
            renderDispatchPage();
            renderGlobalCounters();
        });
    }
}

function autoSelectDispatchReport() {
    const current = selectedDispatchReportId ? findReport(selectedDispatchReportId) : null;
    if (current && isCameraReport(current) && current.status !== 'Resolved') return;
    const open = getOpenCameraReports()
        .sort((a, b) => b.congestionScore - a.congestionScore);
    selectedDispatchReportId = open[0]?.id || null;
}

function autoSelectOfficer() {
    if (selectedOfficerId && state.officers.some((officer) => officer.id === selectedOfficerId)) return;
    selectedOfficerId = state.officers[0]?.id || null;
}

function setupDispatchSlaTick() {
    if (window.__bitcasSlaTick) return;
    window.__bitcasSlaTick = setInterval(() => {
        if (document.body.dataset.page !== 'dispatch') return;
        renderDispatchKpis();
        renderDispatchQueue();
        renderAssignmentBoard();
    }, 15000);
}
