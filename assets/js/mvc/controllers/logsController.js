// Loads the log lists for the selected period. Signed-in only; api/logs.php checks the session.

async function loadLogs(range) {
    const response = await fetch(`api/logs.php?range=${encodeURIComponent(range)}&t=${Date.now()}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load the logs.');
    }
    return body;
}

function initLogsPage() {
    const select = document.getElementById('logRange');
    const show = async () => {
        const range = select ? select.value : 'week';
        try {
            renderLogLists(await loadLogs(range));
        } catch (error) {
            renderLogLists({ congestion: [], reports: [], assignments: [] });
            const target = document.getElementById('congestionLog');
            if (target) target.innerHTML = `<div class="chart-empty">${escapeHtml(error.message || 'Could not load the logs.')}</div>`;
        }
    };
    if (select) select.addEventListener('change', show);
    show();
}
