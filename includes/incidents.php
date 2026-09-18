<section class="page-head">
    <div>
        <span class="section-kicker">Congested Reports</span>
    </div>
    <div class="head-actions">
        <input class="search-input" id="reportSearchInput" type="search" placeholder="Search ID or location">
        <select class="filter-select" id="reportStatusFilter" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="Assigned">Assigned</option>
            <option value="Resolved">Resolved</option>
        </select>
        <button class="btn primary" id="newReportBtn">Create report</button>
    </div>
</section>

<div class="split-layout report-layout">
    <section class="panel detail-panel">
        <div class="panel-head"><div><h2>Report list</h2><span id="reportsMeta">0 reports</span></div></div>
        <div class="report-stats" id="reportStats"></div>
        <div id="reportCards" class="report-cards"></div>
    </section>

    <section class="panel detail-panel">
        <div class="panel-head"><div><h2>Edit report</h2><span>localStorage</span></div><span class="tag info" id="editReportId">No selection</span></div>
        <div class="report-meta-strip">
            <div><span>Created</span><strong id="metaCreated">--</strong></div>
            <div><span>Updated</span><strong id="metaUpdated">--</strong></div>
            <div><span>Source</span><strong id="metaSource">--</strong></div>
            <div><span>Officer</span><strong id="metaOfficer">--</strong></div>
        </div>
        <form class="form-grid report-editor" id="reportEditorForm">
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
                    <option value="Severe">Severe</option>
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
            <div class="full-width">
                <label for="editContext">Report context <span class="tag-mini">AUTO-GENERATED</span></label>
                <textarea id="editContext" class="system-log" rows="4" readonly></textarea>
            </div>
            <div class="full-width">
                <label>Detection evidence</label>
                <div class="report-evidence" id="reportEvidence"></div>
            </div>
            <div class="full-width">
                <label for="editNotes">LGU remarks</label>
                <textarea id="editNotes" rows="3" placeholder="Notes"></textarea>
            </div>
            <div class="editor-actions">
                <button type="submit" class="btn primary">Save report</button>
                <button type="button" class="btn ghost" id="markResolvedBtn">Mark resolved</button>
                <button type="button" class="btn ghost" id="markFalsePositiveBtn">Not congestion</button>
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
