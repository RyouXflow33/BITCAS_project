// Core - Backdrop: a blurred satellite map behind Reports, Dispatch and Analytics.
// Purely decorative: no controls, no dragging, no data. Pages opt in with
// 'backdrop' => true in app/config.php (the markup is <div id="pageBackdrop">).

function initPageBackdrop() {
    const el = document.getElementById('pageBackdrop');
    if (!el || el.dataset.ready === '1' || typeof L === 'undefined') return;
    el.dataset.ready = '1';

    const spec = MAP_BASEMAPS.satellite;
    const map = L.map(el, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        zoomSnap: 1,
        zoomAnimation: false,
        fadeAnimation: false,
        inertia: false
    }).setView([CAMERA_SITE.lat, CAMERA_SITE.lng], 17);

    L.tileLayer(spec.url, { maxZoom: spec.maxZoom || 19, keepBuffer: 4 }).addTo(map);

    const credit = document.createElement('div');
    credit.className = 'backdrop-credit';
    credit.textContent = 'Imagery \u00a9 Esri';
    document.body.appendChild(credit);
}
