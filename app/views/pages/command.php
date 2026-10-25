<div class="map-stage">
    <!-- Map fills the stage. Title, legend and layer controls sit together in a dock at the bottom so the map stays clear -->
    <section class="panel map-panel">
        <div class="panel-head">
            <h2 class="dock-title">Traffic Management</h2>
            <div class="dock-info">
                <div class="stage-sub">
                    <span class="stage-place"><?= icon('map-pin') ?> Villamonte Street</span>
                    <span class="live-text"><i></i> Live camera map</span>
                </div>
                <?php include __DIR__ . '/../partials/map-legend.php'; ?>
            </div>
            <div class="panel-tools">
                <label class="map-type" for="mapTypeSelect">
                    <span>Map type</span>
                    <select id="mapTypeSelect" aria-label="Map type">
                        <option value="osm" selected>OpenStreetMap</option>
                        <option value="satellite">Satellite</option>
                        <option value="light">Light streets</option>
                    </select>
                </label>
                <button class="chip active layer-chip" data-layer="road">Traffic layer</button>
                <button class="chip active layer-chip" data-layer="detections" title="In-frame detections on ~120 m of road around the camera, not GPS">Vehicle points</button>
                <button class="chip active layer-chip" data-layer="camera">Camera Point</button>
                <button class="chip" type="button" id="mapFullscreenBtn" aria-pressed="false"><?= icon('maximize') ?><span>Full screen</span></button>
            </div>
        </div>
        <?php $showMapLegend = false; include __DIR__ . '/../partials/map.php'; ?>
    </section>

    <!-- Left column: live numbers + camera -->
    <div class="stage-col stage-left">
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon blue"><?= icon('car') ?></div><div><span>Vehicles in frame</span><strong id="statVehicleCount">0</strong><em class="up" id="statVehicleTrend">+0</em></div></div>
            <div class="stat-card" id="statCountedCard"><div class="stat-icon violet"><?= icon('flow') ?></div><div><span>Counted today</span><strong id="statCountedToday">--</strong><em id="statCountedNote">crossings</em></div></div>
            <div class="stat-card"><div class="stat-icon yellow"><?= icon('gauge') ?></div><div><span>Congestion</span><strong id="statCongestionScore">0%</strong><em id="statCongestionClass">Low</em></div></div>
            <div class="stat-card"><div class="stat-icon green"><?= icon('refresh') ?></div><div><span>Last sync</span><strong id="statLastSync">--:--:--</strong><em id="statClassNote">Normal</em></div></div>
        </div>

        <section class="panel snapshot-panel">
            <div class="panel-head"><div><h2><?= icon('camera') ?> Vision feed</h2><span id="visionSource">Waiting</span></div></div>
            <div class="snapshot-preview" id="snapshotPreview">
                <div class="snapshot-placeholder"><?= icon('camera-off') ?><span>No evidence still yet</span></div>
            </div>
            <div class="snapshot-meta" id="snapshotMeta">A still is saved after HEAVY holds for 3 readings</div>
            <div class="vision-summary">
                <span id="visionVehicles">In frame: --</span>
                <span id="visionOccupancy">Road occupancy: --</span>
                <span id="visionFlow">Flow: --</span>
                <span id="visionSpeed">Avg speed: --</span>
                <span id="visionTypes">Types: --</span>
                <span id="visionHealth">Node: --</span>
            </div>
            <div class="snapshot-list" id="snapshotList"></div>
        </section>
    </div>

    <!-- Right column: warnings + broadcast -->
    <div class="stage-col stage-right">
        <div class="camera-banner" id="cameraBanner" hidden></div>

        <section class="panel">
            <div class="panel-head"><div><h2><?= icon('megaphone') ?> Broadcast</h2><span id="advisoryStatus">Driver phones</span></div></div>
            <form class="form-grid" id="advisoryForm">
                <div>
                    <label for="advisoryLevel">Congestion level</label>
                    <select id="advisoryLevel" required>
                        <option value="Low">Low</option>
                        <option value="Moderate">Moderate</option>
                        <option value="High">High</option>
                    </select>
                </div>
                <div>
                    <label for="advisoryArea">Affected area</label>
                    <input id="advisoryArea" type="text" maxlength="80" value="Villamonte Street Intersection" required>
                    <small>Up to 80 characters.</small>
                </div>
                <div class="full-width">
                    <label for="advisoryMessage">Message</label>
                    <textarea id="advisoryMessage" rows="3" maxlength="280" placeholder="Traffic advisory message" required></textarea>
                    <small>Up to 280 characters.</small>
                </div>
                <button class="btn primary broadcast-btn" id="broadcastBtn" type="submit">
                    <?= icon('send') ?><span class="btn-spinner" aria-hidden="true"></span><?= icon('check') ?>
                    <span class="btn-label">Broadcast advisory</span>
                </button>
            </form>
        </section>

        <section class="panel activity-panel">
            <div class="panel-head"><div><h2><?= icon('inbox') ?> Recent advisories</h2><span>Driver phones</span></div><button class="btn tiny" id="clearAdvisoriesBtn"><?= icon('trash') ?> Clear</button></div>
            <div class="timeline" id="advisoryTimeline"></div>
        </section>
    </div>
</div>
