<section class="page-head">
    <div>
        <span class="section-kicker">Assign a unit to a camera report</span>
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
            <div class="panel-head"><div><h2>Unassigned / open</h2><span id="dispatchOpenCount">0 open</span></div></div>
            <div id="dispatchQueue"></div>
        </section>

        <section class="panel">
            <div class="panel-head">
                <div><h2>Assign officer</h2><span>Ranked for this location — you confirm</span></div>
                <span class="tag info" id="dispatchSelection">No report selected</span>
            </div>
            <div class="dispatch-selected" id="dispatchSelectedReport"></div>
            <div id="officerPool"></div>
        </section>
    </div>

    <div class="panel">
        <div class="panel-head"><div><h2>Field status</h2><span>Assigned → En route → On scene → Resolved</span></div></div>
        <div class="kanban" id="assignmentBoard"></div>
    </div>
</div>

<div id="dispatchRoster" hidden>
    <div class="roster-layout">
        <div class="roster-left">
            <section class="panel">
                <div class="panel-head"><div><h2>Create officer profile</h2><span>Saved in this browser</span></div></div>
                <form class="form-grid officer-create-form" id="officerCreateForm">
                    <div>
                        <label for="officerBadge">Badge ID</label>
                        <input id="officerBadge" type="text" placeholder="BTAO-01 (auto if blank)" autocomplete="off">
                    </div>
                    <div>
                        <label for="officerFullName">Full name</label>
                        <input id="officerFullName" type="text" required placeholder="Juan Ramos" autocomplete="name">
                    </div>
                    <div>
                        <label for="officerRank">Rank</label>
                        <select id="officerRank">
                            <option value="Traffic Enforcer">Traffic Enforcer</option>
                            <option value="Senior Enforcer">Senior Enforcer</option>
                            <option value="Team Leader">Team Leader</option>
                        </select>
                    </div>
                    <div>
                        <label for="officerContact">Contact</label>
                        <input id="officerContact" type="text" placeholder="09xx-xxx-xxxx" autocomplete="tel">
                    </div>
                    <div>
                        <label for="officerRadio">Radio callsign</label>
                        <input id="officerRadio" type="text" placeholder="Victor-01">
                    </div>
                    <div>
                        <label for="officerZone">Zone / beat</label>
                        <input id="officerZone" type="text" value="Villamonte">
                    </div>
                    <div>
                        <label for="officerShiftStart">Shift start</label>
                        <input id="officerShiftStart" type="time" value="06:00">
                    </div>
                    <div>
                        <label for="officerShiftEnd">Shift end</label>
                        <input id="officerShiftEnd" type="time" value="14:00">
                    </div>
                    <div>
                        <label for="officerRestDay">Rest day</label>
                        <select id="officerRestDay">
                            <option>Sunday</option>
                            <option>Monday</option>
                            <option>Tuesday</option>
                            <option>Wednesday</option>
                            <option>Thursday</option>
                            <option>Friday</option>
                            <option>Saturday</option>
                        </select>
                    </div>
                    <div>
                        <label for="officerSkills">Skills</label>
                        <input id="officerSkills" type="text" placeholder="Traffic control, First aid">
                    </div>
                    <p class="form-error" id="officerCreateError" hidden></p>
                    <div class="full-width">
                        <button class="btn primary" type="submit">Create officer</button>
                    </div>
                </form>
            </section>
            <section class="panel">
                <div class="panel-head"><div><h2>Officer roster</h2><span id="rosterMeta">0 officers</span></div></div>
                <div class="roster-grid" id="officerRoster"></div>
            </section>
        </div>
        <section class="panel detail-panel">
            <div class="panel-head"><div><h2>Officer profile</h2><span>Shift, contact, performance</span></div><span class="tag info" id="rosterOfficerId">No selection</span></div>
            <div id="officerProfile"></div>
        </section>
    </div>
</div>
