<section class="page-head">
    <div>
        <span class="section-kicker"><?= icon('inbox') ?> Camera evidence inbox</span>
    </div>
    <div class="head-actions">
        <div class="search-wrap"><?= icon('search') ?><input class="search-input" id="reportSearchInput" type="search" placeholder="Search ID or location"></div>
        <select class="filter-select" id="reportStatusFilter" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="Open">Unassigned</option>
            <option value="Assigned">Assigned</option>
            <option value="Resolved">Resolved</option>
        </select>
    </div>
</section>

<div class="split-layout report-layout">
    <section class="panel detail-panel">
        <div class="panel-head"><div><h2><?= icon('reports') ?> Queue</h2><span id="reportsMeta">0 reports</span></div></div>
        <div class="report-stats" id="reportStats"></div>
        <div id="reportCards" class="report-cards"></div>
    </section>

    <section class="panel detail-panel case-panel">
        <div class="panel-head">
            <div><h2><?= icon('file') ?> Case file</h2><span>Pi snapshot + measurements stay read-only</span></div>
            <span class="tag info" id="editReportId">No selection</span>
        </div>
        <div class="case-body" id="reportCase"></div>
        <form class="form-grid report-editor case-editor" id="reportEditorForm">
            <div class="full-width" id="manualFields">
                <div class="form-grid">
                    <div>
                        <label for="editLocation">Location</label>
                        <input id="editLocation" type="text" required>
                    </div>
                    <div>
                        <label for="editVehicles">Vehicle count</label>
                        <input id="editVehicles" type="number" min="0" required>
                    </div>
                    <div>
                        <label for="editSeverity">Congestion class</label>
                        <select id="editSeverity" required>
                            <option value="Low">Low</option>
                            <option value="Moderate">Moderate</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                    <div>
                        <label for="editStatus">Status</label>
                        <select id="editStatus" required>
                            <option value="Open">Open</option>
                            <option value="Assigned">Assigned</option>
                            <option value="Resolved">Resolved</option>
                        </select>
                    </div>
                </div>
            </div>
            <input type="hidden" id="editContext">
            <div class="full-width">
                <label for="editNotes">Desk remarks</label>
                <textarea id="editNotes" rows="3" placeholder="What the traffic desk observed or instructed"></textarea>
            </div>
            <div class="editor-actions">
                <a class="btn primary" id="assignOfficerLink" href="?page=dispatch"><?= icon('user-check') ?> Assign officer</a>
                <button type="submit" class="btn ghost"><?= icon('save') ?> Save remarks</button>
                <button type="button" class="btn ghost" id="markResolvedBtn"><?= icon('check') ?> Mark resolved</button>
                <button type="button" class="btn ghost" id="markFalsePositiveBtn"><?= icon('shield-off') ?> Not congestion</button>
            </div>
        </form>
    </section>
</div>

<div class="modal-backdrop" id="resolveConfirmModal" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="resolveConfirmTitle">
        <h3 id="resolveConfirmTitle">Resolve this report?</h3>
        <p id="resolveConfirmText">The report will be marked as resolved.</p>
        <div class="modal-actions">
            <button class="btn ghost" id="cancelResolveBtn" type="button">Cancel</button>
            <button class="btn primary" id="confirmResolveBtn" type="button">Mark resolved</button>
        </div>
    </div>
</div>
