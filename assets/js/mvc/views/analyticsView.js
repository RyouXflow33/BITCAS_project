// MVC - View: Analytics page rendering (charts, widgets, PDF export).
//
// Metrics the current data cannot support are rendered as a dashed "--" card
// carrying the reason. Showing why a number is missing is more useful to an
// operator than showing a number that looks real but is not measured.

// Which heatmap metric the operator last picked. Kept in the view because it
// is a display choice, not application state worth persisting.
let heatmapMetric = 'congestion';

function setHeatmapMetric(metric) {
    heatmapMetric = metric === 'volume' ? 'volume' : 'congestion';
    renderAnalyticsPage();
}

function renderAnalyticsPage() {
    const metrics = computeAnalytics(heatmapMetric);
    const capability = metrics.capability;

    renderDataScope(capability);
    renderMeasuredKpis(metrics);

    setText('aTotalReports', String(metrics.totalReports));
    setText('aAvgCongestion', `${metrics.avgCongestion}%`);
    setText('aResolvedRate', `${metrics.resolvedRate}%`);
    setText('aRollingVehicleAverage', metrics.rollingVehicleAverage.toFixed(1));
    setText('aBaselineVehicleAverage', metrics.baselineVehicleAverage.toFixed(1));
    setText('aBaselineDelta', signedNumber(Math.round(metrics.baselineDelta)));
    setText('aBaselineNote', metrics.baselineDelta > 0 ? 'Above typical volume' : metrics.baselineDelta < 0 ? 'Below typical volume' : 'At typical volume');

    renderAnomalyPanel(metrics.anomalies);
    renderForecastPanel(metrics.forecast);
    renderHeatmap(metrics.heatmap, capability);

    renderAnalyticsWidgets(metrics);
    renderTrafficChart(metrics.hourly, capability);
    renderSevenDayChart(metrics.sevenDayTrend, capability);
    renderVehicleMix(metrics.vehicleMix);
    renderDirectionSplit(metrics.directionSplit, capability);
    renderHotspotRanking();
    renderClassificationBreakdown();
}

function renderDataScope(capability) {
    const scope = document.getElementById('analyticsScope');
    if (!scope) return;

    if (!capability.sampleCount) {
        scope.dataset.state = 'empty';
        scope.innerHTML = '<strong>No vision history loaded</strong><span>Start the Pi vision node so readings are saved to the database.</span>';
        return;
    }

    const missing = [];
    if (!capability.hasThroughput) missing.push('vehicle counts');
    if (!capability.hasSpeed) missing.push('speed');
    if (!capability.hasOccupancy) missing.push('occupancy');

    scope.dataset.state = missing.length ? 'partial' : 'ok';
    scope.innerHTML = `
        <strong>${capability.sampleCount} samples over ${capability.spanLabel}</strong>
        <span>${missing.length
            ? `Unavailable in this dataset: ${missing.join(', ')}. Run vision/calibrate.py to enable them.`
            : 'Counting line and speed calibration both active.'}</span>
    `;
}

function renderMeasuredKpis(metrics) {
    const capability = metrics.capability;

    setKpiCard('kpiThroughput', 'aThroughputToday', 'aThroughputNote',
        metrics.throughputToday !== null ? String(metrics.throughputToday) : null,
        metrics.throughputToday !== null ? 'crossed the counting line' : unavailableReason('throughput'));

    setKpiCard('kpiFlow', 'aFlowRate', 'aFlowNote',
        metrics.flowPerMinute !== null ? `${metrics.flowPerMinute.toFixed(1)}` : null,
        metrics.flowPerMinute !== null ? `vehicles / min over ${capability.spanLabel}` : unavailableReason('throughput'));

    setKpiCard('kpiSpeed', 'aAvgSpeed', 'aAvgSpeedNote',
        metrics.avgSpeedKph !== null ? `${metrics.avgSpeedKph.toFixed(1)}` : null,
        metrics.avgSpeedKph !== null ? 'km/h average' : unavailableReason('speed'));

    setKpiCard('kpiOccupancy', 'aAvgOccupancy', 'aAvgOccupancyNote',
        metrics.avgOccupancyPct !== null ? `${metrics.avgOccupancyPct.toFixed(1)}%` : null,
        metrics.avgOccupancyPct !== null ? 'of road area covered' : unavailableReason('occupancy'));
}

function setKpiCard(cardId, valueId, noteId, value, note) {
    const card = document.getElementById(cardId);
    const available = value !== null && value !== undefined;
    if (card) card.classList.toggle('unavailable', !available);
    setText(valueId, available ? value : '--');
    setText(noteId, note);
}

function renderAnalyticsWidgets(metrics) {
    const durationCard = document.getElementById('aDurationCard');
    const duration = metrics.duration;
    setText('aCongestionDuration', duration ? formatDuration(duration.elapsedMinutes) : '--');
    setText('aCongestionDurationNote', duration ? `${metrics.currentLevel} since ${formatShortTime(duration.startedAt)}` : 'Waiting for vision history');
    if (durationCard) durationCard.dataset.severity = metrics.currentLevel.toLowerCase();

    setText('aPeakHour', metrics.peakHour);
    setText('aPeakHourNote', metrics.peakBasis);

    const trend = metrics.weekTrend;
    setText('aWeekTrend', trend.percent === null ? '--' : `${trend.percent >= 0 ? '+' : ''}${trend.percent}%`);
    const trendNote = document.getElementById('aWeekTrendNote');
    setText('aWeekTrendNote', trend.percent === null ? trend.note : `${trend.percent > 0 ? 'Above usual' : trend.percent < 0 ? 'Below usual' : 'At usual volume'} | ${trend.comparison}`);
    if (trendNote) trendNote.title = trend.note;

    setText('aResolutionTime', metrics.averageResolutionMinutes === null ? '--' : formatDuration(Math.round(metrics.averageResolutionMinutes)));
    setText('aResolutionTimeNote', metrics.averageResolutionMinutes === null ? 'No resolved reports this month' : 'Resolved reports this month');
}

function renderTrafficChart(hourly, capability) {
    const target = document.getElementById('trafficChart');
    if (!target) return;

    setText('hourlyAxisNote', capability.hasThroughput ? 'vehicles counted / hour' : 'avg vehicles in frame (occupancy index)');
    setText('analyticsDataSource', capability.hasThroughput
        ? 'Counted crossings'
        : 'Occupancy samples - not a vehicle count');

    // Show every hour present, not a trailing slice -- otherwise the chart
    // silently hides the peak hour reported in the KPI above it.
    if (!hourly.length) {
        target.innerHTML = '<div class="chart-empty">No samples yet.</div>';
        return;
    }

    const maxValue = Math.max(...hourly.map((entry) => entry.value), 1);
    const showValues = hourly.length <= 12;
    const gap = hourly.length > 12 ? 3 : 8;

    target.innerHTML = `
        <div class="simple-bars" style="grid-template-columns:repeat(${hourly.length},1fr);gap:${gap}px">
            ${hourly.map((entry) => {
                const height = Math.max(8, Math.round((entry.value / maxValue) * 100));
                const label = String(entry.hour).padStart(2, '0');
                return `<div class="bar-wrap" title="${label}:00 - ${entry.value} (${entry.samples} samples)">${showValues ? `<span class="bar-value">${entry.value}</span>` : ''}<div class="bar" style="height:${height}%"></div><small>${label}</small></div>`;
            }).join('')}
        </div>
    `;
}

function renderSevenDayChart(days, capability) {
    const target = document.getElementById('sevenDayChart');
    if (!target) return;

    const highestValue = Math.max(...days.map((day) => day.value), 1);
    target.innerHTML = days.map((day) => {
        const height = day.hasData ? Math.max(12, Math.round((day.value / highestValue) * 100)) : 4;
        return `<div class="seven-day-bar-wrap"><span>${day.hasData ? day.value.toFixed(1) : '--'}</span><i class="${day.isToday ? 'today' : ''}${day.hasData ? '' : ' no-data'}" style="height:${height}%"></i><small>${day.label}</small></div>`;
    }).join('');

    setText('sevenDayNote', capability.hasDayHistory
        ? `Based on ${capability.spanLabel} of collected history.`
        : `Only ${capability.spanLabel} of history collected so far - days without bars have no samples yet.`);
}

function renderVehicleMix(mix) {
    const target = document.getElementById('vehicleMixChart');
    if (!target) return;

    if (!mix.length) {
        target.innerHTML = '<div class="chart-empty">No classified detections yet.</div>';
        return;
    }

    target.innerHTML = mix.map((item) => `
        <div class="mix-row">
            <span class="mix-label">${item.type}</span>
            <div class="progress"><i class="mix-${item.type}" style="width:${item.percent}%"></i></div>
            <strong>${item.percent}%</strong>
            <small>${item.count}</small>
        </div>
    `).join('');
}

function renderDirectionSplit(split, capability) {
    const target = document.getElementById('directionSplit');
    if (!target) return;

    if (!capability.hasDirections || !split.length) {
        target.innerHTML = `<div class="chart-empty">${unavailableReason('directions')}</div>`;
        return;
    }

    target.innerHTML = split.map((item) => `
        <div class="mix-row">
            <span class="mix-label">${item.direction}</span>
            <div class="progress"><i style="width:${item.percent}%"></i></div>
            <strong>${item.percent}%</strong>
            <small>${item.count}</small>
        </div>
    `).join('');
}

function renderAnomalyPanel(anomalies) {
    const list = document.getElementById('anomalyList');
    const tag = document.getElementById('anomalyTag');
    if (!list || !tag) return;

    setText('anomalyWindow', anomalies.windowLabel
        ? `Last 10 minutes vs usual ${anomalies.windowLabel}`
        : 'Last 10 minutes');

    const tags = {
        alert: ['ACTION NEEDED', 'danger'],
        normal: ['NORMAL', 'success'],
        insufficient: ['NO BASELINE', 'warning'],
        'no-data': ['NO FEED', 'warning']
    };
    const [label, variant] = tags[anomalies.status] || tags['no-data'];
    tag.textContent = label;
    tag.className = `tag ${variant}`;

    if (!anomalies.items.length) {
        list.innerHTML = `<div class="chart-empty">${anomalies.reason}</div>`;
        return;
    }

    list.innerHTML = anomalies.items.map((item) => `
        <div class="anomaly-row severity-${item.severity.toLowerCase()}">
            <div class="anomaly-head">
                <strong>${item.title}</strong>
                <span class="tag ${severityTagClass(item.severity)}">${item.severity}</span>
            </div>
            <p>${item.detail}</p>
            <small>${item.metric}</small>
        </div>
    `).join('');
}

function renderForecastPanel(forecast) {
    const list = document.getElementById('forecastList');
    const note = document.getElementById('forecastNote');
    if (!list || !note) return;

    setText('forecastNow', Number.isFinite(forecast.currentScore) ? `now ${forecast.currentScore}%` : '--');
    note.textContent = forecast.reason;

    if (!forecast.horizons.length) {
        list.innerHTML = `<div class="chart-empty">${forecast.reason}</div>`;
        return;
    }

    list.innerHTML = forecast.horizons.map((horizon) => {
        if (horizon.status !== 'ok') {
            return `
                <div class="forecast-card unavailable">
                    <span>+${horizon.minutes} min</span>
                    <strong>--</strong>
                    <em>${horizon.reason}</em>
                </div>
            `;
        }
        return `
            <div class="forecast-card" style="--level:${visionLevelColor(horizon.level)}">
                <span>+${horizon.minutes} min &middot; ${horizon.label}</span>
                <strong>${horizon.score}%</strong>
                <b>${horizon.level}</b>
                <em title="${horizon.basis}">${horizon.confidence} confidence &middot; ${horizon.samples} prior wk</em>
            </div>
        `;
    }).join('');
}

function renderHeatmap(heatmap, capability) {
    const target = document.getElementById('congestionHeatmap');
    if (!target) return;

    const isVolume = heatmap.metric === 'volume';
    setText('heatmapScope', capability.hourlyCount
        ? `${capability.hourlyCount} hourly rollups over ${capability.hourlySpanLabel}`
        : 'Hour of day by weekday');

    const note = document.getElementById('heatmapNote');
    if (note) {
        note.textContent = capability.hourlyCount
            ? `${heatmap.coveragePercent}% of the 168 weekly slots have data. Blank cells were never observed.`
            : 'No hourly rollups found. The Pi vision node posts one hourly rollup per clock hour.';
    }

    if (!capability.hourlyCount) {
        target.innerHTML = '<div class="chart-empty">Waiting for the first hourly rollup.</div>';
        renderHeatmapLegend(heatmap, false);
        return;
    }

    const hourHeader = Array.from({ length: 24 }, (unused, hour) =>
        `<span class="heat-hour">${hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</span>`).join('');

    target.innerHTML = `
        <div class="heat-row heat-head"><span class="heat-day"></span>${hourHeader}</div>
        ${heatmap.grid.map((row) => `
            <div class="heat-row">
                <span class="heat-day">${row.label}</span>
                ${row.cells.map((cell) => renderHeatCell(cell, row.label, heatmap.maxValue, isVolume)).join('')}
            </div>
        `).join('')}
    `;
    renderHeatmapLegend(heatmap, true);
}

function renderHeatCell(cell, dayLabel, maxValue, isVolume) {
    const time = `${dayLabel} ${String(cell.hour).padStart(2, '0')}:00`;
    if (cell.value === null) {
        return `<span class="heat-cell empty" title="${time} - never observed"></span>`;
    }
    const value = isVolume ? Math.round(cell.value) : Math.round(cell.value);
    const label = isVolume ? `${value} vehicles` : `congestion ${value}%`;
    const intensity = maxValue > 0 ? Math.min(1, cell.value / maxValue) : 0;
    // Volume has no natural colour bands, so it uses opacity on one hue while
    // congestion reuses the three bands the rest of the dashboard speaks in.
    const style = isVolume
        ? `background:rgba(231,76,60,${(0.12 + intensity * 0.88).toFixed(2)})`
        : `background:${visionLevelColor(scoreToVisionLevel(cell.value))}`;
    return `<span class="heat-cell" style="${style}" title="${time} - ${label} (${cell.samples} sample${cell.samples === 1 ? '' : 's'})"></span>`;
}

function renderHeatmapLegend(heatmap, hasData) {
    const legend = document.getElementById('heatmapLegend');
    if (!legend) return;

    if (!hasData) {
        legend.innerHTML = '';
        return;
    }

    if (heatmap.metric === 'volume') {
        legend.innerHTML = `
            <span>0</span>
            <i class="heat-ramp"></i>
            <span>${Math.round(heatmap.maxValue)} veh/hr</span>
        `;
        return;
    }

    legend.innerHTML = ['LIGHT', 'MODERATE', 'HEAVY'].map((level) =>
        `<span class="heat-key"><i style="background:${visionLevelColor(level)}"></i>${level.charAt(0)}${level.slice(1).toLowerCase()}</span>`).join('');
}

function renderHotspotRanking() {
    const target = document.getElementById('hotspotRanking');
    if (!target) return;

    const ranked = getHotspotRankingData(6);
    target.innerHTML = ranked.length
        ? ranked.map((item, index) => `
            <div class="rank"><b>${String(index + 1).padStart(2, '0')}</b><div><strong>${item.location}</strong><small>${classifyCongestion(item.avg)} | ${item.reports} report${item.reports === 1 ? '' : 's'}</small></div><span>${item.avg}%</span></div>
        `).join('')
        : '<div class="chart-empty">No reports yet.</div>';

    // Ranking locations against each other only means something with more than
    // one monitored site. Say so rather than implying a comparison.
    setText('hotspotNote', ranked.length > 1
        ? 'Ranked by average congestion score of reports filed at each location.'
        : 'Only one monitored location. Comparative ranking needs a second camera.');
}

function renderClassificationBreakdown() {
    const target = document.getElementById('classificationBreakdown');
    const items = getClassificationCounts();
    setText('aClassSummary', items.map((item) => item.count).join(' / '));
    if (!target) return;

    const total = Math.max(state.reports.length, 1);
    target.innerHTML = items.map((item) => {
        const percent = Math.round((item.count / total) * 100);
        return `
            <div>
                <span>${item.label}</span><strong>${item.count}</strong>
                <div class="progress"><i class="sev-fill-${item.label.toLowerCase()}" style="width:${percent}%"></i></div>
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
    const capability = metrics.capability;
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
    doc.roundedRect(14, 48, width - 28, 50, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Measured Traffic', 18, 56);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const unavailable = 'not available (needs calibration)';
    doc.text(`Data window: ${capability.sampleCount} samples over ${capability.spanLabel}`, 18, 64);
    doc.text(`Vehicles counted today: ${metrics.throughputToday !== null ? metrics.throughputToday : unavailable}`, 18, 70);
    doc.text(`Traffic flow: ${metrics.flowPerMinute !== null ? `${metrics.flowPerMinute.toFixed(1)} veh/min` : unavailable}`, 18, 76);
    doc.text(`Average speed: ${metrics.avgSpeedKph !== null ? `${metrics.avgSpeedKph.toFixed(1)} km/h` : unavailable}`, 18, 82);
    doc.text(`Road occupancy: ${metrics.avgOccupancyPct !== null ? `${metrics.avgOccupancyPct.toFixed(1)}%` : unavailable}`, 18, 88);

    doc.roundedRect(14, 104, width - 28, 40, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Congestion & Response', 18, 112);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Average congestion score: ${metrics.avgCongestion}%`, 18, 120);
    doc.text(`Peak hour: ${metrics.peakHour} (${metrics.peakBasis})`, 18, 126);
    doc.text(`Total reports: ${metrics.totalReports}   Resolved: ${metrics.resolvedRate}%`, 18, 132);
    doc.text(`Average resolution time: ${metrics.averageResolutionMinutes === null ? 'no resolved reports this month' : formatDuration(Math.round(metrics.averageResolutionMinutes))}`, 18, 138);

    doc.roundedRect(14, 150, width - 28, 58, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Locations by Average Score', 18, 158);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let y = 166;
    if (!hotspots.length) {
        doc.text('No report data available.', 18, y);
    } else {
        hotspots.forEach((item, index) => {
            doc.text(`${index + 1}. ${item.location} - ${item.avg}% (${item.reports} reports)`, 18, y);
            y += 7;
        });
    }

    doc.roundedRect(14, 214, width - 28, 50, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Classification Distribution', 18, 222);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let yClass = 230;
    classes.forEach((item) => {
        doc.text(`${item.label}: ${item.count}`, 18, yClass);
        yClass += 7;
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Metrics marked "not available" require site calibration; no value is estimated.', 14, 280);
    doc.text('Note: report and telemetry data are stored in the BITCAS MySQL database.', 14, 286);

    appendForecastPage(doc, width, metrics, capability);

    const datePart = new Date().toISOString().slice(0, 10);
    doc.save(`BITCAS_LGU_Report_${datePart}.pdf`);
}

// Kept on its own page: an LGU reader wants the "what happened / what is
// coming" narrative separate from the month's totals.
function appendForecastPage(doc, width, metrics, capability) {
    const { anomalies, forecast } = metrics;
    doc.addPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('INCIDENT DETECTION & FORECAST', 14, 20);

    doc.setDrawColor(210, 216, 227);
    doc.roundedRect(14, 28, width - 28, 62, 2, 2, 'S');
    doc.setFontSize(11);
    doc.text('Detected anomalies (last 10 minutes)', 18, 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let y = 44;
    if (!anomalies.items.length) {
        doc.text(doc.splitTextToSize(anomalies.reason, width - 40), 18, y);
    } else {
        anomalies.items.slice(0, 3).forEach((item) => {
            doc.setFont('helvetica', 'bold');
            doc.text(`[${item.severity}] ${item.title}`, 18, y);
            doc.setFont('helvetica', 'normal');
            y += 6;
            doc.splitTextToSize(`${item.detail} (${item.metric})`, width - 40).forEach((line) => {
                doc.text(line, 18, y);
                y += 5;
            });
            y += 3;
        });
    }

    doc.roundedRect(14, 96, width - 28, 56, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Predicted congestion', 18, 104);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let yForecast = 112;
    if (!forecast.horizons.length) {
        doc.text(forecast.reason, 18, yForecast);
    } else {
        forecast.horizons.forEach((horizon) => {
            const line = horizon.status === 'ok'
                ? `+${horizon.minutes} min (${horizon.label}): ${horizon.score}% ${horizon.level} - ${horizon.confidence} confidence, ${horizon.basis}`
                : `+${horizon.minutes} min: not forecastable - ${horizon.reason}`;
            doc.splitTextToSize(line, width - 40).forEach((wrapped) => {
                doc.text(wrapped, 18, yForecast);
                yForecast += 5;
            });
            yForecast += 2;
        });
    }

    doc.roundedRect(14, 158, width - 28, 30, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Historical basis', 18, 166);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Hourly rollups: ${capability.hourlyCount} covering ${capability.hourlySpanLabel}`, 18, 174);
    doc.text(`Weekly slot coverage: ${metrics.heatmap.coveragePercent}% of 168 hour-by-weekday slots`, 18, 180);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.splitTextToSize('Forecasts blend the historical average for the target hour with the current 30-minute trend. '
        + 'Anomalies compare the last 10 minutes against the same weekday and hour in previous weeks. '
        + 'Both need at least two weeks of history before they are dependable.', width - 28)
        .forEach((line, index) => doc.text(line, 14, 274 + index * 5));
}
