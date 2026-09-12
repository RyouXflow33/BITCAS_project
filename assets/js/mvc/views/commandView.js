// MVC - View: Traffic Map (command) page rendering: stats, map, snapshots, advisories.

let mapState = null;

function renderCommandPage() {
    setText('statVehicleCount', String(state.live.currentVehicleCount));
    setText('statVehicleTrend', signedNumber(state.live.currentVehicleCount - state.live.previousVehicleCount));
    setText('statCongestionScore', `${state.live.congestionScore}%`);
    setText('statCongestionDelta', `${signedNumber(state.live.congestionScore - scoreFromVehicleCount(state.live.previousVehicleCount))}%`);

    const level = state.live.visionLevel || classifyCongestion(state.live.congestionScore);
    setText('statCongestionClass', level);
    setText('statClassNote', visionStatusCaption(level));
    setText('statLastSync', formatTime(state.live.lastSyncIso));

    renderSnapshotPanel();
    renderVisionSummary();
    renderAdvisoryTimeline();
    renderMapLayers();
}

function renderVisionSummary() {
    const payload = state.live.visionPayload || {};
    renderVisionSource(payload.source || 'Simulation');
    setText('visionVehicles', `Vehicles: ${payload.vehicle_count ?? '--'}`);
    const types = Object.entries(payload.vehicle_types || {}).map(([type, count]) => `${type}: ${count}`).join(', ');
    setText('visionTypes', `Types: ${types || '--'}`);
    const avgSpeed = Number(payload.avg_speed);
    setText('visionSpeed', `Avg speed: ${Number.isFinite(avgSpeed) ? avgSpeed.toFixed(1) : '--'} px/s`);
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
        preview.innerHTML = '<div class="snapshot-placeholder">NO SNAPSHOT</div>';
        meta.textContent = 'Last snapshot: none';
    } else {
        preview.innerHTML = `<img src="${latest.image}" alt="Simulated camera snapshot">`;
        meta.textContent = `Last snapshot: ${formatDateTime(latest.capturedAtIso)} | ${latest.severity}`;
    }

    if (!state.snapshots.length) {
        list.innerHTML = '<div class="snapshot-item">No stored snapshots.</div>';
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
        target.innerHTML = '<div class="timeline-empty">No advisories yet.</div>';
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
    const trafficColor = payload.color || severityColor(classifyCongestion(state.live.congestionScore));
    const trafficLevel = payload.congestion_level || classifyCongestion(state.live.congestionScore);

    L.geoJSON(VILLAMONTE_TRAFFIC_ROAD, {
        style: { color: trafficColor, weight: 10, opacity: 0.85, lineCap: 'round' },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`<strong>${feature.properties.name}</strong><br>${trafficLevel} traffic<br>${payload.vehicle_count ?? 0} vehicles detected`);
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

    const openReports = state.reports.filter((report) => report.status !== 'Resolved');
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
