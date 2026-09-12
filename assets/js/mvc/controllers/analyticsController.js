// MVC - Controller: Analytics page wiring and vision-history refresh.

async function initAnalyticsPage() {
    await refreshVisionHistory();
    renderAnalyticsPage();

    const exportBtn = document.getElementById('exportAnalyticsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportAnalyticsPdf();
        });
    }
}

async function refreshVisionHistory() {
    try {
        const history = await fetchVisionHistory();
        const telemetry = history
            .map(normalizeVisionHistoryEntry)
            .filter(Boolean)
            .slice(-1000);
        if (!telemetry.length) throw new Error('Vision history has no valid entries');

        state.telemetry = telemetry;
        saveState();
        setText('analyticsDataSource', 'Vision history');
        setText('analyticsSourceTag', 'VISION');
        return true;
    } catch (error) {
        setText('analyticsDataSource', 'Local simulation');
        setText('analyticsSourceTag', 'SIM');
        return false;
    }
}
