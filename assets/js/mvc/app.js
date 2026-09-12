// MVC - Bootstrap: loads the model, authenticates, then starts the page controller.
// Load order in index.php: core -> models -> views -> controllers -> this file.

function bootSession() {
    setupClock();

    state = loadState();
    ensureStateShape(state);
    saveState();

    renderGlobalCounters();

    const page = document.body.dataset.page || 'command';
    if (page === 'command') initCommandPage();
    if (page === 'analytics') initAnalyticsPage();
    if (page === 'incidents') initReportsPage();
    if (page === 'dispatch') initDispatchPage();
}

document.addEventListener('DOMContentLoaded', () => {
    setupSidebar();
    const isAuthed = initAuth();
    if (!isAuthed) return;

    bootSession();
});
