// MVC - Controller: Assign Officer (dispatch) page events and interaction state.

let selectedDispatchReportId = null;
let selectedAssignmentId = null;

function initDispatchPage() {
    bindDispatchActions();
    renderDispatchPage();
}

function bindDispatchActions() {
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
            if (assignmentId) selectedAssignmentId = assignmentId;
            renderDispatchPage();
            renderGlobalCounters();
        });
    }

    const assignmentList = document.getElementById('assignmentList');
    if (assignmentList) {
        assignmentList.addEventListener('click', (event) => {
            const row = event.target.closest('[data-assignment-id]');
            if (!row) return;
            selectedAssignmentId = row.dataset.assignmentId;

            const resolveBtn = event.target.closest('[data-resolve-assignment]');
            if (resolveBtn) resolveAssignment(resolveBtn.dataset.resolveAssignment);

            renderDispatchPage();
            renderGlobalCounters();
        });
    }

    const resolveSelected = document.getElementById('resolveSelectedDispatchBtn');
    if (resolveSelected) {
        resolveSelected.addEventListener('click', () => {
            if (!selectedAssignmentId) return;
            resolveAssignment(selectedAssignmentId);
            renderDispatchPage();
            renderGlobalCounters();
        });
    }
}
