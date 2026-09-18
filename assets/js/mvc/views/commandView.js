// MVC - View: Traffic Map (command) page rendering: stats, map, snapshots, advisories.

let mapState = null;

function renderCommandPage() {
    const payload = state.live.visionPayload || {};

    setText('statVehicleCount', String(state.live.currentVehicleCount));
    setText('statVehicleTrend', signedNumber(state.live.currentVehicleCount - state.live.previousVehicleCount));
    setText('statCongestionScore', `${state.live.congestionScore}%`);

    const level = state.live.visionLevel || 'LIGHT';
    setText('statCongestionClass', `${level} | ${visionStatusCaption(level)}`);
    setText('statLastSync', formatTime(state.live.lastSyncIso));
    setText('statClassNote', isVisionStale(state.live.lastSyncIso) ? 'stale' : 'live');

    renderThroughputCard(payload);
    renderCameraBanner();
    renderSnapshotPanel();
    renderVisionSummary();
    renderAdvisoryTimeline();
    renderMapLayers();
}

// Counted-today is throughput from the counting line, which only exists once
// the vision node is calibrated. Vehicles-in-frame is a different measure and
// must not be substituted for it.
function renderThroughputCard(payload) {
    const card = document.getElementById('statCountedCard');
    const today = payload.totals && Number(payload.totals.today);
    const available = Number.isFinite(today);

    if (card) card.classList.toggle('unavailable', !available);
    setText('statCountedToday', available ? String(today) : '--');
    setText('statCountedNote', available
        ? `${Object.keys((payload.totals && payload.totals.by_direction) || {}).length || 1} direction(s)`
        : 'Needs counting line');
}

function renderCameraBanner() {
    const banner = document.getElementById('cameraBanner');
    if (!banner) return;

    const payload = state.live.visionPayload || {};
    const isVision = payload.source === 'traffic_vision_system';
    const stale = isVisionStale(state.live.lastSyncIso);

    if (isVision && !stale) {
        banner.hidden = true;
        return;
    }

    banner.hidden = false;
    if (!isVision) {
        banner.dataset.state = 'simulated';
        banner.innerHTML = `${icon('zap')}<div><strong>Simulated data</strong><span>No vision node detected. Numbers on this page are not from a camera.</span></div>`;
        return;
    }

    banner.dataset.state = 'offline';
    banner.innerHTML = `${icon('offline')}<div><strong>Camera offline</strong><span>Last reading ${formatDateTime(state.live.lastSyncIso)}. Figures below are stale.</span></div>`;
}

function renderVisionSummary() {
    const payload = state.live.visionPayload || {};
    renderVisionSource(payload.source || 'Simulation');

    setText('visionVehicles', `In frame: ${payloadVehicleCount(payload) || '--'}`);
    setText('visionOccupancy', `Road occupancy: ${formatOccupancy(payload)}`);

    const flow = payload.flow || {};
    const perMinute = Number(flow.per_minute);
    const directions = Object.entries(flow)
        .filter(([key]) => key !== 'window_seconds' && key !== 'per_minute')
        .map(([key, value]) => `${key} ${value}`)
        .join(', ');
    setText('visionFlow', Number.isFinite(perMinute)
        ? `Flow: ${perMinute.toFixed(1)} veh/min${directions ? ` (${directions})` : ''}`
        : 'Flow: needs counting line');

    setText('visionSpeed', `Avg speed: ${formatSpeed(payload)}`);

    const types = Object.entries(payload.vehicle_types || {}).map(([type, count]) => `${type}: ${count}`).join(', ');
    setText('visionTypes', `Types: ${types || '--'}`);

    const health = payload.health || {};
    setText('visionHealth', Number.isFinite(Number(health.fps))
        ? `Node: ${health.backend} | ${Number(health.fps).toFixed(1)} FPS${health.cpu_temp_c ? ` | ${health.cpu_temp_c}C` : ''}`
        : 'Node: --');
}

function renderVisionSource(source) {
    setText('visionSource', source === 'traffic_vision_system' ? 'Vision JSON' : 'Simulation');
}

function renderSnapshotPanel() {
    const latest = state.snapshots[0] || null;
    const preview = document.getElementById('snapshotPreview');
    const meta = document.getElementById('snapshotMeta');
    const list = document.getElementById('snapshotList');
    if (!preview || !meta || !list) return;

    if (!latest) {
        preview.innerHTML = `<div class="snapshot-placeholder">${icon('camera-off')}<span>No camera frame yet</span></div>`;
        meta.textContent = 'Last snapshot: none';
    } else {
        preview.innerHTML = `<img src="${latest.image}" alt="Simulated camera snapshot">`;
        meta.textContent = `Last snapshot: ${formatDateTime(latest.capturedAtIso)} | ${latest.severity}`;
    }

    if (!state.snapshots.length) {
        list.innerHTML = emptyState('camera', 'No stored snapshots', 'Capture a snapshot from the live map when you need a still frame.');
        return;
    }

    list.innerHTML = state.snapshots.slice(0, 5).map((shot) => `
        <div class="snapshot-item">
            <strong>${shot.severity} (${shot.score}%)</strong>
            <small>${formatDateTime(shot.capturedAtIso)}</small>
        </div>
    `).join('');
}

function renderAdvisoryTimeline() {
    const target = document.getElementById('advisoryTimeline');
    if (!target) return;

    if (!state.advisories.length) {
        target.innerHTML = emptyState('inbox', 'No advisories yet', 'Broadcast a message when congestion needs a public notice.');
        return;
    }

    target.innerHTML = state.advisories.slice(0, 8).map((advisory) => `
        <div>
            <i class="timeline-dot ${severityDotClass(advisory.level)}"></i>
            <div>
                <strong>${advisory.level} | ${advisory.area}</strong>
                <small>${advisory.message}</small><br>
                <small>${formatDateTime(advisory.sentAtIso)}</small>
            </div>
        </div>
    `).join('');
}

function initLeafletMap() {
    const mapEl = document.getElementById('trafficMap');
    if (!mapEl || typeof L === 'undefined') return;

    const center = [10.6665, 122.9645];
    const map = L.map('trafficMap', {
        zoomControl: true
    }).setView(center, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapState = {
        map,
        layers: {
            road: L.layerGroup().addTo(map),
            detections: L.layerGroup().addTo(map),
            camera: L.layerGroup().addTo(map),
            reports: L.layerGroup().addTo(map)
        }
    };

    map.fitBounds(L.geoJSON(VILLAMONTE_TRAFFIC_ROAD).getBounds(), { padding: [24, 24] });
}

function renderMapLayers() {
    if (!mapState) return;

    const groups = mapState.layers;
    groups.road.clearLayers();
    groups.detections.clearLayers();
    groups.camera.clearLayers();
    groups.reports.clearLayers();

    const payload = state.live.visionPayload || {};
    const trafficLevel = payload.congestion_level || state.live.visionLevel || 'LIGHT';
    const trafficColor = payload.color || visionLevelColor(trafficLevel);

    L.geoJSON(VILLAMONTE_TRAFFIC_ROAD, {
        style: { color: trafficColor, weight: 10, opacity: 0.85, lineCap: 'round' },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`<strong>${feature.properties.name}</strong><br>${trafficLevel} traffic (score ${state.live.congestionScore})<br>${payloadVehicleCount(payload) || 0} vehicles in frame`);
        }
    }).addTo(groups.road);

    const roadCoordinates = VILLAMONTE_TRAFFIC_ROAD.features[0].geometry.coordinates;
    (payload.positions || []).forEach((position, index) => {
        const point = getPointAtFractionOfLine(roadCoordinates, Number(position));
        if (!point) return;
        L.circleMarker([point[1], point[0]], {
            radius: 5,
            color: '#1f2633',
            fillColor: trafficColor,
            fillOpacity: 0.9,
            weight: 1
        }).bindPopup(`Detection ${index + 1}<br>${trafficLevel} traffic`).addTo(groups.detections);
    });

    const openReports = getOpenCameraReports();
    openReports.forEach((report) => {
        const marker = L.circleMarker([report.lat, report.lng], {
            radius: 8,
            color: severityColor(report.severity),
            fillColor: severityColor(report.severity),
            fillOpacity: 0.75,
            weight: 2
        });
        marker.bindPopup(`<strong>${report.id}</strong><br>${report.location}<br>${report.severity} (${report.congestionScore}%)`);
        marker.addTo(groups.reports);
    });

    const cameraPoint = getPointAtFractionOfLine(roadCoordinates, 0.5);
    L.marker([cameraPoint[1], cameraPoint[0]])
        .bindPopup('Camera node (simulation)')
        .addTo(groups.camera);

    applyMapLayerVisibility();
}

function getPointAtFractionOfLine(coordinates, fraction) {
    const clampedFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
    let totalLength = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        totalLength += lineDistance(coordinates[index], coordinates[index + 1]);
    }

    let travelled = 0;
    const target = totalLength * clampedFraction;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        const segmentLength = lineDistance(start, end);
        if (travelled + segmentLength >= target) {
            const segmentFraction = segmentLength ? (target - travelled) / segmentLength : 0;
            return [
                start[0] + (end[0] - start[0]) * segmentFraction,
                start[1] + (end[1] - start[1]) * segmentFraction
            ];
        }
        travelled += segmentLength;
    }
    return coordinates[coordinates.length - 1];
}

function lineDistance(start, end) {
    return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function applyMapLayerVisibility() {
    if (!mapState) return;
    const map = mapState.map;

    document.querySelectorAll('.layer-chip').forEach((chip) => {
        const layerName = chip.dataset.layer;
        const layer = mapState.layers[layerName];
        if (!layer) return;

        if (chip.classList.contains('active')) {
            if (!map.hasLayer(layer)) map.addLayer(layer);
        } else if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
}
