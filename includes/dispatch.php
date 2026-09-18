<section class="page-head">
    <div>
        <span class="section-kicker">Dispatch</span>
    </div>
    <div class="head-actions">
        <div class="segmented" id="dispatchTabs">
            <button type="button" class="active" data-dispatch-tab="board">Board</button>
            <button type="button" data-dispatch-tab="roster">Officer roster</button>
        </div>
        <div class="dispatch-clock"><span>LGU SHIFT</span><strong id="clock">00:00:00</strong></div>
    </div>
</section>

<div id="dispatchBoard">
    <div class="dispatch-kpis" id="dispatchKpis"></div>

    <div class="dispatch-grid assign-grid dispatch-board-grid">
        <section class="panel">
            <div class="panel-head"><div><h2>Open queue</h2><span id="dispatchOpenCount">0 open</span></div></div>
            <div id="dispatchQueue"></div>
        </section>

        <section class="panel">
            <div class="panel-head">
                <div><h2>Recommended officers</h2><span>System ranks, dispatcher decides</span></div>
                <span class="tag info" id="dispatchSelection">No report selected</span>
            </div>
            <div class="dispatch-selected" id="dispatchSelectedReport"></div>
            <div id="officerPool"></div>
        </section>
    </div>

    <div class="panel">
        <div class="panel-head"><div><h2>Active assignments</h2><span>Assigned → En route → On scene → Resolved</span></div></div>
        <div class="kanban" id="assignmentBoard"></div>
    </div>
</div>

<div id="dispatchRoster" hidden>
    <div class="roster-layout">
        <section class="panel">
            <div class="panel-head"><div><h2>Officer roster</h2><span id="rosterMeta">0 officers</span></div></div>
            <div class="roster-grid" id="officerRoster"></div>
        </section>
        <section class="panel detail-panel">
            <div class="panel-head"><div><h2>Officer profile</h2><span>Shift, contact, performance</span></div><span class="tag info" id="rosterOfficerId">No selection</span></div>
            <div id="officerProfile"></div>
        </section>
    </div>
</div>
