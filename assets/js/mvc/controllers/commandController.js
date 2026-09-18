// MVC - Controller: Traffic Map (command) page events and vision polling.

let simulationSampleIndex = 0;

function initCommandPage() {
    initLeafletMap();
    bindLayerChips();
    bindCommandActions();
    renderCommandPage();
}

function bindLayerChips() {
    document.querySelectorAll('.layer-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            applyMapLayerVisibility();
        });
    });
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
        advisoryForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const level = getValue('advisoryLevel');
            const area = getValue('advisoryArea');
            const message = getValue('advisoryMessage');
            if (!level || !area || !message) return;

            addAdvisory({ level, area, message });

            advisoryForm.reset();
            setValue('advisoryArea', 'Villamonte Street Intersection');
            renderCommandPage();
        });
    }

    const clearBtn = document.getElementById('clearAdvisoriesBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearAdvisories();
            renderCommandPage();
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
    applyVisionPayload({ ...sample, timestamp: new Date().toISOString(), source: 'bitcas_simulation' }, 'bitcas_simulation');
}
