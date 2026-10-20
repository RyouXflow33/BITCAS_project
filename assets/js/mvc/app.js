// MVC - Bootstrap: loads the model, authenticates, then starts the page controller.
// Load order in index.php: core -> models -> views -> controllers -> this file.

function bootSession() {
    setupClock();

    state = loadState();
    ensureStateShape(state);
    saveState(false);

    renderGlobalCounters();

    const page = document.body.dataset.page || 'command';
    if (page === 'command') initCommandPage();
    if (page === 'analytics') initAnalyticsPage();
    if (page === 'incidents') initReportsPage();
    if (page === 'dispatch') initDispatchPage();
    if (page === 'accounts') initAccountsPage();

    refreshDeskState().then((updated) => {
        if (!updated) return;
        renderGlobalCounters();
        if (page === 'command') renderCommandPage();
        if (page === 'incidents') renderReportsPage();
        if (page === 'dispatch') renderDispatchPage();
        if (page === 'accounts') renderAccountsPage();
        if (page === 'analytics') renderAnalyticsPage();
    });

    startGlobalVisionPoller();
}

function startGlobalVisionPoller() {
    if (window.__bitcasVisionPoller) return;

    const tick = async () => {
        if (!isDeskStateLoaded()) {
            const loaded = await refreshDeskState();
            if (loaded && document.body.dataset.page === 'accounts') renderAccountsPage();
        }
        try {
            const payload = await fetchVisionFeed();
            applyVisionPayload(payload, 'traffic_vision_system');
            if (document.body.dataset.page === 'command') renderVisionSource('traffic_vision_system');
        } catch (error) {
            if (document.body.dataset.page === 'command') renderVisionSource((state.live.visionPayload || {}).source || '');
        }
        renderGlobalCounters();
        const page = document.body.dataset.page;
        if (page === 'command') {
            const now = Date.now();
            if (!window.__bitcasAdvisoryRefreshAt || now - window.__bitcasAdvisoryRefreshAt > 5000) {
                window.__bitcasAdvisoryRefreshAt = now;
                await refreshAdvisories();
            }
            renderCommandPage();
        }
        if (page === 'incidents') renderReportsPage();
        if (page === 'dispatch') renderDispatchPage();
        if (page === 'analytics') {
            const now = Date.now();
            if (!window.__bitcasHistoryRefreshAt || now - window.__bitcasHistoryRefreshAt > 15000) {
                window.__bitcasHistoryRefreshAt = now;
                await Promise.all([refreshVisionHistory(), refreshVisionHourly()]);
            }
            renderAnalyticsPage();
        }
    };

    tick();
    window.__bitcasVisionPoller = setInterval(tick, VISION_POLL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
    setupSidebar();
    const isAuthed = initAuth();
    if (!isAuthed) return;

    bootSession();
});

window.addEventListener('pageshow', (event) => {
    if (!event.persisted || loadAuthSession()) return;
    const shell = document.getElementById('appShell');
    const overlay = document.getElementById('authOverlay');
    if (window.__bitcasVisionPoller) {
        clearInterval(window.__bitcasVisionPoller);
        window.__bitcasVisionPoller = null;
    }
    applyAuthUi(false, null, shell, overlay);
});
