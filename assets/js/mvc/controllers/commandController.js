// MVC - Controller: Traffic Map (command) page events and vision polling.

let simulationSampleIndex = 0;

function initCommandPage() {
    initLeafletMap();
    bindLayerChips();
    bindMapTypeSelect();
    bindMapFullscreen();
    bindCommandActions();
    renderCommandPage();
    refreshAdvisories().then(() => {
        if (document.body.dataset.page === 'command') renderCommandPage();
    });
}

function bindLayerChips() {
    document.querySelectorAll('.layer-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            applyMapLayerVisibility();
        });
    });
}

function bindMapTypeSelect() {
    const select = document.getElementById('mapTypeSelect');
    if (!select) return;
    select.addEventListener('change', () => setMapType(select.value));
}

function bindMapFullscreen() {
    const button = document.getElementById('mapFullscreenBtn');
    const panel = document.querySelector('.map-panel');
    if (!button || !panel) return;

    button.addEventListener('click', () => toggleMapFullscreen(panel));
    document.addEventListener('fullscreenchange', () => syncMapFullscreen(button, panel));
    document.addEventListener('webkitfullscreenchange', () => syncMapFullscreen(button, panel));
}

function toggleMapFullscreen(panel) {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active === panel) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
        return;
    }
    const enter = panel.requestFullscreen || panel.webkitRequestFullscreen;
    if (enter) enter.call(panel);
}

function syncMapFullscreen(button, panel) {
    const active = (document.fullscreenElement || document.webkitFullscreenElement) === panel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    const label = button.querySelector('span');
    const iconUse = button.querySelector('use');
    if (label) label.textContent = active ? 'Exit' : 'Full screen';
    if (iconUse) iconUse.setAttribute('href', active ? '#i-minimize' : '#i-maximize');
    if (mapState && mapState.map) {
        window.setTimeout(() => mapState.map.invalidateSize(), 120);
    }
}

function bindCommandActions() {
    const simulateBtn = document.getElementById('simulateTickBtn');
    if (simulateBtn) {
        simulateBtn.addEventListener('click', () => {
            runVisionSimulationTick();
            renderCommandPage();
            renderGlobalCounters();
        });
    }

    const captureBtn = document.getElementById('captureSnapshotBtn');
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            captureSnapshotRecord();
            renderCommandPage();
        });
    }

    const advisoryForm = document.getElementById('advisoryForm');
    if (advisoryForm) {
        advisoryForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const level = getValue('advisoryLevel');
            const area = getValue('advisoryArea');
            const message = getValue('advisoryMessage');
            if (!level || !area || !message) return;

            setText('advisoryStatus', 'Sending…');
            try {
                const result = await publishAdvisory({ level, area, message });
                advisoryForm.reset();
                setValue('advisoryArea', 'Villamonte Street Intersection');
                setText('advisoryStatus', result.push?.sent ? 'Sent to driver phones' : (result.push?.reason || 'Saved'));
                renderCommandPage();
            } catch (error) {
                setText('advisoryStatus', error.message || 'Broadcast failed');
            }
        });
    }

    const clearBtn = document.getElementById('clearAdvisoriesBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            setText('advisoryStatus', 'Clearing…');
            try {
                await clearAdvisories();
                setText('advisoryStatus', 'Driver phones');
                renderCommandPage();
            } catch (error) {
                setText('advisoryStatus', error.message || 'Could not clear advisories');
            }
        });
    }
}

async function refreshVisionFeed() {
    try {
        const payload = await fetchVisionFeed();
        applyVisionPayload(payload, 'traffic_vision_system');
        renderCommandPage();
        renderGlobalCounters();
    } catch (error) {
        renderVisionSource('Simulation fallback');
    }
}

function runVisionSimulationTick() {
    const sample = VISION_SIMULATION_SAMPLES[simulationSampleIndex % VISION_SIMULATION_SAMPLES.length];
    simulationSampleIndex += 1;
    applyVisionPayload({
        ...sample,
        timestamp: new Date().toISOString(),
        source: 'bitcas_simulation',
        camera_id: sample.camera_id || 'CAM-VILLAMONTE-01',
        site_name: sample.site_name || 'Villamonte Street Intersection',
        lat: CAMERA_SITE.lat,
        lng: CAMERA_SITE.lng
    }, 'bitcas_simulation');
}
