// MVC - Controller: Traffic Map (command) page events and vision polling.

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
    const advisoryForm = document.getElementById('advisoryForm');
    if (advisoryForm) {
        advisoryForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const level = getValue('advisoryLevel');
            const area = getValue('advisoryArea');
            const message = getValue('advisoryMessage');
            if (!level || !area || !message) return;

            const button = advisoryForm.querySelector('button[type="submit"]');
            if (button) button.disabled = true;
            setText('advisoryStatus', 'Sending…');
            try {
                const result = await publishAdvisory({ level, area, message });
                advisoryForm.reset();
                setValue('advisoryArea', 'Villamonte Street Intersection');
                setText('advisoryStatus', result.push?.sent ? 'Sent to driver phones' : (result.push?.reason || 'Saved'));
                renderCommandPage();
                const sentId = result.advisory && result.advisory.id;
                window.setTimeout(async () => {
                    if (document.body.dataset.page !== 'command') return;
                    await refreshAdvisories();
                    renderCommandPage();
                    const latest = (state.advisories || []).find((item) => item.id === sentId);
                    if (latest && latest.channel !== 'OneSignal') {
                        setText('advisoryStatus', 'Saved on the desk. The phone push did not send.');
                    }
                }, 3000);
            } catch (error) {
                setText('advisoryStatus', error.message || 'Broadcast failed');
            } finally {
                if (button) button.disabled = false;
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
        renderVisionSource((state.live.visionPayload || {}).source || '');
    }
}
