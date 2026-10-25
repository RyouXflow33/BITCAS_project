<section class="page-head">
    <div>
        <span class="section-kicker"><?= icon('clock') ?> Dated record of congestion and dispatch</span>
    </div>
    <div class="head-actions">
        <label for="logRange">Show</label>
        <select id="logRange" class="pill-select">
            <option value="day">Last 24 hours</option>
            <option value="week" selected>Last 7 days</option>
        </select>
    </div>
</section>

<section class="panel">
    <div class="panel-head"><div><h2><?= icon('analytics') ?> Congestion by hour</h2><span>Hours that were congested, or had vehicles cross</span></div></div>
    <div id="congestionSummary"></div>
    <div id="congestionLog" class="log-list"></div>
</section>

<section class="panel">
    <div class="panel-head"><div><h2><?= icon('reports') ?> Reports opened</h2><span>When a congestion case was opened and closed, and how many vehicles were in frame</span></div></div>
    <div id="reportLog" class="log-list"></div>
</section>

<section class="panel">
    <div class="panel-head"><div><h2><?= icon('dispatch') ?> Officer assignments</h2><span>Each time the desk recorded, on its own line</span></div></div>
    <div id="assignmentLog" class="log-list"></div>
</section>
