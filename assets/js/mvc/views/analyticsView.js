// MVC - View: Analytics page rendering (charts, widgets, PDF export).

function renderAnalyticsPage() {
    const metrics = computeAnalytics();
    setText('aTotalReports', String(metrics.totalReports));
    setText('aReportTrend', `+${Math.min(metrics.totalReports, 12)}`);
    setText('aAvgCongestion', `${metrics.avgCongestion}%`);
    setText('aCongestionTrend', `${metrics.avgCongestion >= 65 ? '+' : '-'}${Math.abs(metrics.avgCongestion - 65)}%`);
    setText('aResolvedRate', `${metrics.resolvedRate}%`);
    setText('aResolvedTrend', `+${Math.max(0, metrics.resolvedRate - 50)}%`);
    setText('aPeakHour', metrics.peakHour);
    setText('aRollingVehicleAverage', metrics.rollingVehicleAverage.toFixed(1));
    setText('aBaselineVehicleAverage', metrics.baselineVehicleAverage.toFixed(1));
    setText('aBaselineDelta', signedNumber(Math.round(metrics.baselineDelta)));
    setText('aBaselineNote', metrics.baselineDelta > 0 ? 'Above typical volume' : metrics.baselineDelta < 0 ? 'Below typical volume' : 'At typical volume');
    renderAnalyticsWidgets(metrics);

    renderTrafficChart(metrics.byHour);
    renderSevenDayChart(metrics.sevenDayTrend);
    renderHotspotRanking();
    renderClassificationBreakdown();
}

function renderAnalyticsWidgets(metrics) {
    const durationCard = document.getElementById('aDurationCard');
    const duration = metrics.duration;
    setText('aCongestionDuration', duration ? formatDuration(duration.elapsedMinutes) : '--');
    setText('aCongestionDurationNote', duration ? `${metrics.currentLevel} since ${formatShortTime(duration.startedAt)}` : 'Waiting for vision history');
    if (durationCard) durationCard.dataset.severity = metrics.currentLevel.toLowerCase();

    const trend = metrics.weekTrend;
    setText('aWeekTrend', trend.percent === null ? '--' : `${trend.percent >= 0 ? '+' : ''}${trend.percent}%`);
    const trendNote = document.getElementById('aWeekTrendNote');
    setText('aWeekTrendNote', trend.percent === null ? trend.note : `${trend.percent > 0 ? 'Upward traffic trend' : trend.percent < 0 ? 'Lower than usual' : 'At usual volume'} | ${trend.comparison}`);
    if (trendNote) trendNote.title = trend.note;

    setText('aResolutionTime', metrics.averageResolutionMinutes === null ? '--' : formatDuration(Math.round(metrics.averageResolutionMinutes)));
    setText('aResolutionTimeNote', metrics.averageResolutionMinutes === null ? 'No resolved reports this month' : 'Resolved reports this month');
}

function renderSevenDayChart(days) {
    const target = document.getElementById('sevenDayChart');
    if (!target) return;
    const highestValue = Math.max(...days.map((day) => day.value), 1);
    target.innerHTML = days.map((day) => {
        const height = day.value ? Math.max(12, Math.round((day.value / highestValue) * 100)) : 4;
        return `<div class="seven-day-bar-wrap"><span>${day.value ? day.value.toFixed(1) : '--'}</span><i class="${day.isToday ? 'today' : ''}" style="height:${height}%"></i><small>${day.label}</small></div>`;
    }).join('');
}

function renderTrafficChart(byHour) {
    const target = document.getElementById('trafficChart');
    if (!target) return;

    const entries = Object.keys(byHour)
        .map((hour) => ({ hour: Number(hour), value: byHour[hour] }))
        .sort((a, b) => a.hour - b.hour)
        .slice(-8);

    if (!entries.length) {
        target.innerHTML = '<div class="chart-empty">No data.</div>';
        return;
    }

    const maxValue = Math.max(...entries.map((entry) => entry.value), 1);
    target.innerHTML = `
        <div class="simple-bars">
            ${entries.map((entry) => {
                const height = Math.max(8, Math.round((entry.value / maxValue) * 100));
                return `<div class="bar-wrap"><div class="bar" style="height:${height}%"></div><small>${String(entry.hour).padStart(2, '0')}</small></div>`;
            }).join('')}
        </div>
    `;
}

function renderHotspotRanking() {
    const target = document.getElementById('hotspotRanking');
    if (!target) return;

    const ranked = getHotspotRankingData(6);
    target.innerHTML = ranked.map((item, index) => `
        <div class="rank"><b>${String(index + 1).padStart(2, '0')}</b><div><strong>${item.location}</strong><small>${classifyCongestion(item.avg)}</small></div><span>${item.avg}%</span></div>
    `).join('');
}

function renderClassificationBreakdown() {
    const target = document.getElementById('classificationBreakdown');
    if (!target) return;

    const items = getClassificationCounts();
    const total = Math.max(state.reports.length, 1);
    target.innerHTML = items.map((item) => {
        const percent = Math.round((item.count / total) * 100);
        return `
            <div>
                <span>${item.label}</span><strong>${item.count}</strong>
                <div class="progress"><i style="width:${percent}%"></i></div>
            </div>
        `;
    }).join('');
}

function exportAnalyticsPdf() {
    const jsPdfRef = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdfRef) {
        window.alert('PDF library not available.');
        return;
    }

    const metrics = computeAnalytics();
    const hotspots = getHotspotRankingData(5);
    const classes = getClassificationCounts();

    const doc = new jsPdfRef({ orientation: 'p', unit: 'mm', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();

    doc.setFillColor(242, 245, 251);
    doc.rect(0, 0, width, 42, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('BITCAS LGU TRAFFIC REPORT', 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
    doc.text('Coverage: Villamonte monitored intersection', 14, 32);

    doc.setDrawColor(210, 216, 227);
    doc.roundedRect(14, 48, width - 28, 42, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Summary Metrics', 18, 56);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total reports: ${metrics.totalReports}`, 18, 64);
    doc.text(`Average congestion score: ${metrics.avgCongestion}%`, 18, 70);
    doc.text(`Resolved rate: ${metrics.resolvedRate}%`, 18, 76);
    doc.text(`Peak hour: ${metrics.peakHour}`, 18, 82);

    doc.roundedRect(14, 96, width - 28, 70, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Hotspot Ranking', 18, 104);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let y = 112;
    if (!hotspots.length) {
        doc.text('No hotspot data available.', 18, y);
    } else {
        hotspots.forEach((item, index) => {
            doc.text(`${index + 1}. ${item.location} - ${item.avg}%`, 18, y);
            y += 7;
        });
    }

    doc.roundedRect(14, 172, width - 28, 56, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Classification Distribution', 18, 180);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let yClass = 188;
    classes.forEach((item) => {
        doc.text(`${item.label}: ${item.count}`, 18, yClass);
        yClass += 7;
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Note: Report generated from localStorage simulation (no backend database).', 14, 286);

    const datePart = new Date().toISOString().slice(0, 10);
    doc.save(`BITCAS_LGU_Report_${datePart}.pdf`);
}
