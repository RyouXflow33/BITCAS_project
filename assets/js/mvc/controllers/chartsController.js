// MVC - Controller: chart studio controls + report table search.

function initChartStudio() {
    loadStudioPref();

    const typeBar = document.getElementById('studioType');
    if (typeBar) {
        typeBar.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-type]');
            if (!button) return;
            studioPref.type = button.dataset.type;
            saveStudioPref();
            renderChartStudio(true);
        });
    }

    const select = document.getElementById('studioDataset');
    if (select) {
        select.addEventListener('change', () => {
            studioPref.dataset = select.value;
            saveStudioPref();
            renderChartStudio(true);
        });
    }

    const search = document.getElementById('reportTableSearch');
    if (search) search.addEventListener('input', renderReportTable);
}
