<section class="page-head">
    <div>
        <span class="section-kicker"><?= icon('clock') ?> Dated record of congestion and dispatch</span>
    </div>
    <div class="head-actions">
        <label for="logRange">Show</label>
        <select id="logRange">
            <option value="day">Last 24 hours</option>
            <option value="week" selected>Last 7 days</option>
        </select>
    </div>
</section>

<section class="panel">
    <div class="panel-head"><div><h2><?= icon('analytics') ?> Congestion by hour</h2><span>One row per hour from the camera</span></div></div>
    <div id="congestionLog" class="log-list"></div>
</section>

<section class="panel">
    <div class="panel-head"><div><h2><?= icon('reports') ?> Reports opened</h2><span>When a congestion case was opened and closed</span></div></div>
    <div id="reportLog" class="log-list"></div>
</section>

<section class="panel">
    <div class="panel-head"><div><h2><?= icon('dispatch') ?> Officer assignments</h2><span>Assigned, acknowledged, en route, on scene, resolved</span></div></div>
    <div id="assignmentLog" class="log-list"></div>
</section>
