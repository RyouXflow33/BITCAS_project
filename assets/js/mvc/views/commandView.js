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
        banner.dataset.state = 'offline';
        banner.innerHTML = `${icon('offline')}<div><strong>No camera reading yet</strong><span>The desk is waiting for congestion.json from the Pi.</span></div>`;
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

    setText('visionSpeed', payload.motion
        ? `Motion: ${payload.motion} | ${formatSpeed(payload)}`
        : `Avg speed: ${formatSpeed(payload)}`);

    const types = Object.entries(payload.vehicle_types || {}).map(([type, count]) => `${type}: ${count}`).join(', ');
    setText('visionTypes', `Types: ${types || '--'}`);

    const health = payload.health || {};
    setText('visionHealth', Number.isFinite(Number(health.fps))
        ? `Node: ${health.backend} | ${Number(health.fps).toFixed(1)} FPS${health.cpu_temp_c ? ` | ${health.cpu_temp_c}C` : ''}`
        : 'Node: --');
}

function renderVisionSource(source) {
    setText('visionSource', source === 'traffic_vision_system' ? 'Live camera' : 'Waiting');
}

function renderSnapshotPanel() {
    const payload = state.live.visionPayload || {};
    const shots = evidenceReports();
    const latestUrl = payload.snapshot_url || (shots[0] && shots[0].snapshotUrl) || '';
    const preview = document.getElementById('snapshotPreview');
    const meta = document.getElementById('snapshotMeta');
    const list = document.getElementById('snapshotList');
    if (!preview || !meta || !list) return;

    if (!latestUrl) {
        preview.innerHTML = `<div class="snapshot-placeholder">${icon('camera-off')}<span>No evidence still yet</span></div>`;
        meta.textContent = 'A still is saved after HEAVY holds for 3 readings';
    } else {
        preview.innerHTML = `<img src="${latestUrl}" alt="Traffic evidence still">`;
        const latestReport = shots.find((report) => report.snapshotUrl === latestUrl);
        meta.textContent = latestReport
            ? `Last still: ${formatDateTime(latestReport.createdAtIso)} | ${latestReport.severity}`
            : 'Last still: saved with the live reading';
    }

    if (!shots.length) {
        list.innerHTML = emptyState('camera', 'No evidence stills', 'After HEAVY holds for 3 readings, the Pi saves a JPEG and a report opens here.');
        return;
    }

    list.innerHTML = shots.slice(0, 5).map((report) => `
        <div class="snapshot-item">
            <strong>${report.severity} (${report.congestionScore}%)</strong>
            <small>${formatDateTime(report.createdAtIso)}</small>
        </div>
    `).join('');
}

function renderAdvisoryTimeline() {
    const target = document.getElementById('advisoryTimeline');
    if (!target) return;

    const html = !state.advisories.length
        ? emptyState('inbox', 'No advisories yet', 'Broadcast a message when congestion needs a public notice.')
        : state.advisories.slice(0, 8).map((advisory) => `
        <div>
            <i class="timeline-dot ${severityDotClass(advisory.level)}"></i>
            <div>
                <strong>${escapeHtml(advisory.level)} | ${escapeHtml(advisory.area)}</strong>
                <small>${escapeHtml(advisory.message)}</small><br>
                <small>${escapeHtml(formatDateTime(advisory.sentAtIso))} · ${escapeHtml(advisory.channel || 'Push')}${advisory.createdByUserId ? ` · ${escapeHtml(userLabel(advisory.createdByUserId))}` : ''}</small>
            </div>
        </div>
    `).join('');

    if (target.dataset.markup === html) return;
    target.dataset.markup = html;
    target.innerHTML = html;
}

function initLeafletMap() {
    const mapEl = document.getElementById('trafficMap');
    if (!mapEl || typeof L === 'undefined') return;

    const center = [CAMERA_SITE.lat, CAMERA_SITE.lng];
    const map = L.map('trafficMap', {
        zoomControl: true
    }).setView(center, 16);

    mapState = {
        map,
        basemapType: 'osm',
        layers: {
            basemap: createBasemapLayer('osm').addTo(map),
            road: L.layerGroup().addTo(map),
            detections: L.layerGroup().addTo(map),
            camera: L.layerGroup().addTo(map),
            reports: L.layerGroup().addTo(map)
        }
    };

    map.fitBounds(L.geoJSON(VILLAMONTE_TRAFFIC_ROAD).getBounds(), { padding: [24, 24] });
}

function createBasemapLayer(type) {
    const spec = MAP_BASEMAPS[type] || MAP_BASEMAPS.osm;
    return L.tileLayer(spec.url, {
        maxZoom: spec.maxZoom,
        attribution: spec.attribution
    });
}

function setMapType(type) {
    if (!mapState) return;
    const nextType = MAP_BASEMAPS[type] ? type : 'osm';
    if (mapState.basemapType === nextType && mapState.layers.basemap) return;

    if (mapState.layers.basemap) mapState.map.removeLayer(mapState.layers.basemap);
    mapState.layers.basemap = createBasemapLayer(nextType).addTo(mapState.map);
    mapState.basemapType = nextType;
}

function renderMapLayers() {
    if (!mapState) return;

    const groups = mapState.layers;
    groups.road.clearLayers();
    groups.detections.clearLayers();
    groups.camera.clearLayers();
    groups.reports.clearLayers();

    const payload = state.live.visionPayload || {};
    const trafficLevel = normalizeVisionLevel(payload.congestion_level || state.live.visionLevel || 'LIGHT');
    const trafficColor = visionLevelColor(trafficLevel);

    L.geoJSON(VILLAMONTE_TRAFFIC_ROAD, {
        style: { color: trafficColor, weight: 10, opacity: 0.85, lineCap: 'round' },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`<strong>${feature.properties.name}</strong><br>${trafficLevel} traffic (score ${state.live.congestionScore})<br>${payloadVehicleCount(payload) || 0} vehicles in frame`);
        }
    }).addTo(groups.road);

    const roadCoordinates = VILLAMONTE_TRAFFIC_ROAD.features[0].geometry.coordinates;
    const camera = cameraSiteFromPayload(payload);
    const cameraAnchor = closestPointOnPolyline(roadCoordinates, camera.lng, camera.lat);

    (payload.positions || []).forEach((position, index) => {
        const placed = projectDetectionOnRoad(position, roadCoordinates, cameraAnchor);
        if (!placed) return;
        L.circleMarker(placed.latlng, {
            radius: 5,
            color: '#1f2633',
            fillColor: trafficColor,
            fillOpacity: 0.9,
            weight: 1
        }).bindPopup(
            `${placed.className} ${index + 1}<br>In camera view (not GPS)<br>${trafficLevel} traffic`
        ).addTo(groups.detections);
    });

    const openReports = getOpenCameraReports();
    openReports.forEach((report) => {
        const marker = L.circleMarker([report.lat, report.lng], {
            radius: 8,
            color: severityColor(report.severity === 'Severe' ? 'High' : report.severity),
            fillColor: severityColor(report.severity === 'Severe' ? 'High' : report.severity),
            fillOpacity: 0.75,
            weight: 2
        });
        marker.bindPopup(`<strong>${report.id}</strong><br>${report.location}<br>${report.severity === 'Severe' ? 'High' : report.severity} (${report.congestionScore}%)`);
        marker.addTo(groups.reports);
    });

    const cameraLabel = payload.camera_id || 'Camera';
    const siteLabel = payload.site_name || 'Villamonte Street Intersection';
    L.marker([cameraAnchor.point[1], cameraAnchor.point[0]])
        .bindPopup(`${cameraLabel}<br>${siteLabel}<br>Vehicle points are in-frame positions on ~120 m of this road, not GPS.`)
        .addTo(groups.camera);

    applyMapLayerVisibility();
}

const CAMERA_FOV_METERS = 120;
const CAMERA_LANE_HALF_METERS = 7;

function cameraSiteFromPayload(payload) {
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    if (payload.lat == null || payload.lng == null) return { ...CAMERA_SITE };
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ...CAMERA_SITE };
    return { lat, lng };
}

function normalizeMapDetection(position) {
    if (position && typeof position === 'object' && !Array.isArray(position)) {
        const x = clamp01(Number(position.x));
        const y = Number(position.y);
        return {
            x,
            y: Number.isFinite(y) ? clamp01(y) : 0.5,
            className: position.class || 'vehicle',
            useDepth: Number.isFinite(y)
        };
    }
    return {
        x: clamp01(Number(position)),
        y: 0.5,
        className: 'vehicle',
        useDepth: false
    };
}

function clamp01(value) {
    if (!Number.isFinite(value)) return 0.5;
    return Math.max(0, Math.min(1, value));
}

// Map a camera-frame centroid onto the traffic line starting at the Pi.
// Image bottom (near) sits on the camera; image top (far) is farther along
// the line. x is a few metres across the carriageway. Not GPS.
function projectDetectionOnRoad(position, roadCoordinates, cameraAnchor) {
    const detection = normalizeMapDetection(position);
    const fovFraction = metersToLineFraction(roadCoordinates, CAMERA_FOV_METERS);
    const alongOffset = detection.useDepth
        ? (1 - detection.y) * fovFraction
        : detection.x * fovFraction;
    const alongFraction = Math.max(0, Math.min(1, cameraAnchor.fraction + alongOffset));
    const alongPoint = getPointAtFractionOfLine(roadCoordinates, alongFraction);
    if (!alongPoint) return null;

    const heading = polylineHeadingAtFraction(roadCoordinates, alongFraction);
    const lateralMeters = detection.useDepth
        ? (detection.x - 0.5) * 2 * CAMERA_LANE_HALF_METERS
        : 0;
    const offset = offsetLatLng(alongPoint[1], alongPoint[0], heading + 90, lateralMeters);
    return {
        latlng: [offset.lat, offset.lng],
        className: detection.className
    };
}

function metersToLineFraction(coordinates, meters) {
    const length = polylineLengthMeters(coordinates);
    return length ? meters / length : 0.08;
}

function polylineLengthMeters(coordinates) {
    let meters = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        meters += haversineMeters(
            coordinates[index][1], coordinates[index][0],
            coordinates[index + 1][1], coordinates[index + 1][0]
        );
    }
    return meters;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function closestPointOnPolyline(coordinates, lng, lat) {
    let best = { fraction: 0.5, point: coordinates[0], distance: Infinity };
    const lengths = [];
    let total = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const length = lineDistance(coordinates[index], coordinates[index + 1]);
        lengths.push(length);
        total += length;
    }
    if (!total) return best;

    let travelled = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const projected = projectPointOnSegment(lng, lat, coordinates[index], coordinates[index + 1]);
        if (projected.distance < best.distance) {
            best = {
                distance: projected.distance,
                point: projected.point,
                fraction: (travelled + projected.t * lengths[index]) / total
            };
        }
        travelled += lengths[index];
    }
    return best;
}

function projectPointOnSegment(lng, lat, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((lng - start[0]) * dx + (lat - start[1]) * dy) / lengthSq)) : 0;
    const point = [start[0] + dx * t, start[1] + dy * t];
    return { t, point, distance: Math.hypot(lng - point[0], lat - point[1]) };
}

function polylineHeadingAtFraction(coordinates, fraction) {
    const clamped = Math.max(0, Math.min(1, fraction));
    let total = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        total += lineDistance(coordinates[index], coordinates[index + 1]);
    }
    let travelled = 0;
    const target = total * clamped;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        const segmentLength = lineDistance(start, end);
        if (travelled + segmentLength >= target || index === coordinates.length - 2) {
            return bearingDegrees(start[0], start[1], end[0], end[1]);
        }
        travelled += segmentLength;
    }
    return 0;
}

function bearingDegrees(lng1, lat1, lng2, lat2) {
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function offsetLatLng(lat, lng, bearingDeg, distanceM) {
    const radius = 6371000;
    const bearing = bearingDeg * Math.PI / 180;
    const phi1 = lat * Math.PI / 180;
    const lambda1 = lng * Math.PI / 180;
    const angular = distanceM / radius;
    const phi2 = Math.asin(Math.sin(phi1) * Math.cos(angular)
        + Math.cos(phi1) * Math.sin(angular) * Math.cos(bearing));
    const lambda2 = lambda1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(phi1),
        Math.cos(angular) - Math.sin(phi1) * Math.sin(phi2)
    );
    return { lat: phi2 * 180 / Math.PI, lng: lambda2 * 180 / Math.PI };
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
