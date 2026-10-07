// MVC - Controller: Analytics page wiring and vision-history refresh.

async function initAnalyticsPage() {
    // Minute history and hourly rollups are independent files; the page is
    // useful with either, so a missing one must not block the other.
    await Promise.all([refreshVisionHistory(), refreshVisionHourly()]);
    renderAnalyticsPage();

    const exportBtn = document.getElementById('exportAnalyticsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportAnalyticsPdf();
        });
    }

    const metricToggle = document.getElementById('heatmapMetric');
    if (metricToggle) {
        metricToggle.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-metric]');
            if (!button) return;
            metricToggle.querySelectorAll('button').forEach((option) => {
                option.classList.toggle('active', option === button);
            });
            setHeatmapMetric(button.dataset.metric);
        });
    }
}

async function refreshVisionHistory() {
    try {
        const history = await fetchVisionHistory();
        // v2 history is one aggregated record per minute, so this cap is ~2
        // days of context rather than the ~50 minutes the old 3-second
        // payloads bought us at the same entry count.
        const telemetry = history
            .map(normalizeVisionHistoryEntry)
            .filter(Boolean)
            .slice(-VISION_HISTORY_MAX_ENTRIES);
        if (!telemetry.length) throw new Error('Vision history has no valid entries');

        setVisionHistory(telemetry);
        applyHistorySourceTag(history);
        return true;
    } catch (error) {
        setTag('NO FILE', 'warning');
        return false;
    }
}

// History loaded from disk is not automatically camera data -- the sample
// generator writes the same file. Label it by what actually produced it.
function applyHistorySourceTag(history) {
    const generated = history.filter((record) => record.source && record.source !== 'traffic_vision_system');
    if (!generated.length) {
        setTag('VISION', 'success');
    } else if (generated.length === history.length) {
        setTag('SAMPLE DATA', 'warning');
    } else {
        setTag('MIXED', 'warning');
    }
}

function setTag(label, variant) {
    const tag = document.getElementById('analyticsSourceTag');
    if (!tag) return;
    tag.textContent = label;
    tag.className = `tag ${variant}`;
}
