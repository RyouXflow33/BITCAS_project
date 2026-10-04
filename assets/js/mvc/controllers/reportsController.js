// MVC - Controller: Congested Reports page events and interaction state.

let reportStatusFilter = 'all';
let reportSearchQuery = '';
let selectedReportId = null;

function syncReportSelection(reports) {
    if (!reports.length) {
        selectedReportId = null;
        return null;
    }
    if (!selectedReportId || !reports.some((report) => report.id === selectedReportId)) {
        selectedReportId = reports[0].id;
    }
    return selectedReportId;
}

function initReportsPage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('report')) selectedReportId = params.get('report');
    bindReportActions();
    renderReportsPage();
}

function bindReportActions() {
    const searchInput = document.getElementById('reportSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            reportSearchQuery = searchInput.value.trim().toLowerCase();
            renderReportsPage();
        });
    }

    const statusFilter = document.getElementById('reportStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            reportStatusFilter = statusFilter.value;
            renderReportsPage();
        });
    }

    const cardContainer = document.getElementById('reportCards');
    if (cardContainer) {
        cardContainer.addEventListener('click', (event) => {
            const button = event.target.closest('[data-report-id]');
            if (!button) return;
            selectedReportId = button.dataset.reportId;
            fillReportEditor(selectedReportId);
            highlightSelectedReport();
        });
    }

    const editorForm = document.getElementById('reportEditorForm');
    if (editorForm) {
        editorForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!selectedReportId) return;

            const report = findReport(selectedReportId);
            if (!report) return;

            if (isCameraReport(report)) {
                if (!updateCameraReportNotes(selectedReportId, getValue('editNotes'))) return;
            } else {
                const updated = updateReport(selectedReportId, {
                    location: getValue('editLocation'),
                    vehicleCount: getValue('editVehicles'),
                    severity: getValue('editSeverity'),
                    status: getValue('editStatus'),
                    context: getValue('editContext'),
                    notes: getValue('editNotes')
                });
                if (!updated) return;
            }

            renderReportsPage();
            renderGlobalCounters();
        });
    }

    const markResolvedBtn = document.getElementById('markResolvedBtn');
    const resolveModal = document.getElementById('resolveConfirmModal');
    const cancelResolveBtn = document.getElementById('cancelResolveBtn');
    const confirmResolveBtn = document.getElementById('confirmResolveBtn');
    const closeResolveModal = () => { if (resolveModal) resolveModal.hidden = true; };

    if (markResolvedBtn && resolveModal) {
        markResolvedBtn.addEventListener('click', () => {
            if (!selectedReportId) return;
            const report = findReport(selectedReportId);
            if (!report || report.status === 'Resolved') return;
            setText('resolveConfirmText', `${report.id} at ${report.location} will be closed and removed from the open queue.`);
            resolveModal.hidden = false;
        });
    }

    if (cancelResolveBtn) cancelResolveBtn.addEventListener('click', closeResolveModal);

    if (resolveModal) {
        resolveModal.addEventListener('click', (event) => {
            if (event.target === resolveModal) closeResolveModal();
        });
    }

    if (confirmResolveBtn) {
        confirmResolveBtn.addEventListener('click', () => {
            if (!selectedReportId) return;
            if (!resolveReport(selectedReportId)) return;
            closeResolveModal();
            renderReportsPage();
            renderGlobalCounters();
        });
    }

    const falsePositiveBtn = document.getElementById('markFalsePositiveBtn');
    if (falsePositiveBtn) {
        falsePositiveBtn.addEventListener('click', () => {
            if (!selectedReportId) return;
            const report = findReport(selectedReportId);
            if (!report || report.falsePositive || report.status === 'Resolved') return;
            if (!markReportFalsePositive(selectedReportId)) return;
            renderReportsPage();
            renderGlobalCounters();
        });
    }
}

function getFilteredReports() {
    return state.reports.filter((report) => {
        if (!isCameraReport(report)) return false;
        if (reportStatusFilter !== 'all' && report.status !== reportStatusFilter) return false;
        if (reportSearchQuery) {
            const haystack = `${report.id} ${report.location} ${report.cameraId || ''}`.toLowerCase();
            if (!haystack.includes(reportSearchQuery)) return false;
        }
        return true;
    });
}
