<section class="page-head">
    <div>
        <span class="section-kicker">Traffic Map</span>
    </div>
    <div class="head-actions">
        <button class="btn ghost" id="simulateTickBtn">Simulate vision data</button>
        <button class="btn primary" id="captureSnapshotBtn">Capture snapshot</button>
    </div>
</section>

<div class="stats-grid">
    <div class="stat-card"><div class="stat-icon blue">#</div><div><span>Vehicles</span><strong id="statVehicleCount">0</strong><em class="up" id="statVehicleTrend">+0</em></div></div>
    <div class="stat-card"><div class="stat-icon yellow">~</div><div><span>Score</span><strong id="statCongestionScore">0%</strong><em id="statCongestionDelta" class="down">-0%</em></div></div>
    <div class="stat-card"><div class="stat-icon red">!</div><div><span>Class</span><strong id="statCongestionClass">Low</strong><em id="statClassNote" class="up">Normal</em></div></div>
    <div class="stat-card"><div class="stat-icon green">*</div><div><span>Sync</span><strong id="statLastSync">--:--:--</strong><em class="up">VPN</em></div></div>
</div>

<div class="command-grid traffic-map-grid">
    <section class="panel map-panel">
        <div class="panel-head">
            <div><h2>Villamonte Street</h2><span class="live-text"><i></i> OSM layers</span></div>
            <div class="panel-tools">
                <button class="chip active layer-chip" data-layer="road">Traffic layer</button>
                <button class="chip active layer-chip" data-layer="detections">Vehicle points</button>
                <button class="chip active layer-chip" data-layer="camera">Camera Point</button>
            </div>
        </div>
        <?php include __DIR__ . '/map.php'; ?>
    </section>

    <section class="panel snapshot-panel">
        <div class="panel-head"><div><h2>Vision feed</h2><span id="visionSource">Simulation</span></div></div>
        <div class="snapshot-preview" id="snapshotPreview">
            <div class="snapshot-placeholder">NO CAMERA FRAME YET</div>
        </div>
        <div class="snapshot-meta" id="snapshotMeta">Last snapshot: none</div>
        <div class="vision-summary">
            <span id="visionVehicles">Vehicles: --</span>
            <span id="visionTypes">Types: --</span>
            <span id="visionSpeed">Avg speed: --</span>
        </div>
        <div class="snapshot-list" id="snapshotList"></div>
    </section>
</div>

<div class="lower-grid">
    <section class="panel">
        <div class="panel-head"><div><h2>Broadcast</h2><span>OneSignal flow</span></div></div>
        <form class="form-grid" id="advisoryForm">
            <div>
                <label for="advisoryLevel">Congestion level</label>
                <select id="advisoryLevel" required>
                    <option value="Low">Low</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High</option>
                    <option value="Severe">Severe</option>
                </select>
            </div>
            <div>
                <label for="advisoryArea">Affected area</label>
                <input id="advisoryArea" type="text" value="Villamonte Street Intersection" required>
            </div>
            <div class="full-width">
                <label for="advisoryMessage">Message</label>
                <textarea id="advisoryMessage" rows="3" placeholder="Traffic advisory message" required></textarea>
            </div>
            <button class="btn primary" type="submit">Broadcast advisory</button>
        </form>
    </section>

    <section class="panel activity-panel">
        <div class="panel-head"><div><h2>Recent advisories</h2><span>localStorage</span></div><button class="btn tiny" id="clearAdvisoriesBtn">Clear</button></div>
        <div class="timeline" id="advisoryTimeline"></div>
    </section>
</div>
