// MVC - Model: analytics computations derived from the store.
//
// Guiding rule: never invent a metric the data cannot support. Throughput
// needs a calibrated counting line, speed needs a calibrated homography. When
// either is missing these functions return null and `capability` explains why,
// so the view can show an honest empty state instead of a plausible number.

function computeAnalytics(heatmapMetric) {
    const reports = state.reports;
    const telemetry = [...state.telemetry].sort((first, second) => new Date(first.timestampIso) - new Date(second.timestampIso));
    const rollups = getVisionHourly();
    const capability = computeDataCapability(telemetry, rollups);

    const totalReports = reports.length;
    const resolvedCount = reports.filter((report) => report.status === 'Resolved').length;
    const resolvedRate = totalReports ? Math.round((resolvedCount / totalReports) * 100) : 0;
    const avgCongestion = telemetry.length
        ? Math.round(telemetry.reduce((sum, point) => sum + point.congestionScore, 0) / telemetry.length)
        : 0;
    const baselineVehicleAverage = telemetry.length
        ? telemetry.reduce((sum, point) => sum + point.vehicleCount, 0) / telemetry.length
        : 0;
    const rollingSamples = telemetry.slice(-10);
    const rollingVehicleAverage = rollingSamples.length
        ? rollingSamples.reduce((sum, point) => sum + point.vehicleCount, 0) / rollingSamples.length
        : 0;
    const currentVehicleCount = state.live.currentVehicleCount || 0;
    const baselineDelta = currentVehicleCount - baselineVehicleAverage;
    const currentLevel = telemetry.at(-1)?.visionLevel || state.live.visionLevel || 'LIGHT';
    const duration = computeCongestionDuration(telemetry, currentLevel);
    const weekTrend = computeWeekTrend(telemetry);
    const averageResolutionMinutes = computeAverageResolutionMinutes(reports);
    const sevenDayTrend = computeSevenDayTrend(telemetry);
    const hourly = computeHourlyProfile(telemetry, capability);
    const peak = computePeakHour(hourly);

    return {
        capability,
        totalReports,
        resolvedRate,
        avgCongestion,
        peakHour: peak.label,
        peakBasis: peak.basis,
        hourly,
        byHour: hourly.reduce((result, bucket) => ({ ...result, [bucket.hour]: bucket.value }), {}),
        baselineVehicleAverage,
        rollingVehicleAverage,
        baselineDelta,
        currentLevel,
        duration,
        weekTrend,
        averageResolutionMinutes,
        sevenDayTrend,

        // Measured only when the vision node supports them.
        throughputTotal: computeThroughputTotal(telemetry, capability),
        throughputToday: computeThroughputToday(telemetry, capability),
        flowPerMinute: computeFlowPerMinute(telemetry, capability),
        avgSpeedKph: computeAverageSpeed(telemetry, capability),
        avgOccupancyPct: computeAverageOccupancy(telemetry, capability),
        vehicleMix: computeVehicleMix(telemetry),
        directionSplit: computeDirectionSplit(telemetry),

        // Need weeks of hourly history, so each carries its own status.
        heatmap: computeHeatmap(rollups, heatmapMetric),
        anomalies: detectAnomalies(telemetry, rollups),
        forecast: computeForecast(telemetry, rollups)
    };
}

// --- what can this dataset actually answer? -------------------------------

function computeDataCapability(telemetry, hourly) {
    const first = telemetry[0];
    const last = telemetry.at(-1);
    const spanMinutes = first && last
        ? Math.max(0, (new Date(last.timestampIso) - new Date(first.timestampIso)) / 60000)
        : 0;

    const hourlyRecords = hourly || [];
    const hourlySpanDays = hourlyRecords.length >= 2
        ? (new Date(hourlyRecords.at(-1).timestampIso) - new Date(hourlyRecords[0].timestampIso)) / 86400000
        : 0;

    return {
        sampleCount: telemetry.length,
        hourlyCount: hourlyRecords.length,
        hourlySpanDays,
        hourlySpanLabel: hourlySpanDays >= 1
            ? `${Math.round(hourlySpanDays)} day${Math.round(hourlySpanDays) === 1 ? '' : 's'}`
            : `${Math.round(hourlySpanDays * 24)} hr`,
        // Two weeks is the point at which every weekday slot has at least two
        // prior readings, which is what the forecast and detector need.
        hasForecastHistory: hourlySpanDays >= 14,
        spanMinutes,
        spanLabel: spanMinutes >= 60 ? formatDuration(Math.round(spanMinutes)) : `${Math.round(spanMinutes)} min`,
        hasThroughput: telemetry.some((point) => Number.isFinite(point.crossings)),
        hasSpeed: telemetry.some((point) => Number.isFinite(point.avgSpeedKph)),
        hasOccupancy: telemetry.some((point) => Number.isFinite(point.occupancyPct)),
        hasDirections: telemetry.some((point) => Object.keys(point.byDirection || {}).length > 0),
        // A day-level chart needs more than a day of samples to mean anything.
        hasDayHistory: spanMinutes >= 24 * 60,
        hasWeekHistory: spanMinutes >= 7 * 24 * 60
    };
}

const UNAVAILABLE_REASONS = {
    throughput: 'Needs a calibrated counting line (run vision/calibrate.py)',
    speed: 'Needs speed calibration (run vision/calibrate.py, mode 3)',
    occupancy: 'Needs a vision node running v2',
    directions: 'Needs a calibrated counting line',
    dayHistory: 'Needs at least 24 hours of collected history',
    weekHistory: 'Needs at least 7 days of collected history'
};

function unavailableReason(key) {
    return UNAVAILABLE_REASONS[key] || 'Not enough data yet';
}

// --- measured metrics -----------------------------------------------------

function computeThroughputTotal(telemetry, capability) {
    if (!capability.hasThroughput) return null;
    return telemetry.reduce((sum, point) => sum + (Number(point.crossings) || 0), 0);
}

function computeThroughputToday(telemetry, capability) {
    if (!capability.hasThroughput) return null;
    const todayKey = formatLocalDateKey(new Date());
    return telemetry
        .filter((point) => formatLocalDateKey(new Date(point.timestampIso)) === todayKey)
        .reduce((sum, point) => sum + (Number(point.crossings) || 0), 0);
}

function computeFlowPerMinute(telemetry, capability) {
    if (!capability.hasThroughput || capability.spanMinutes < 1) return null;
    const total = computeThroughputTotal(telemetry, capability);
    return total / capability.spanMinutes;
}

function computeAverageSpeed(telemetry, capability) {
    if (!capability.hasSpeed) return null;
    const speeds = telemetry.map((point) => point.avgSpeedKph).filter(Number.isFinite);
    return speeds.length ? average(speeds) : null;
}

function computeAverageOccupancy(telemetry, capability) {
    if (!capability.hasOccupancy) return null;
    const values = telemetry.map((point) => point.occupancyPct).filter(Number.isFinite);
    return values.length ? average(values) : null;
}

function computeVehicleMix(telemetry) {
    const totals = {};
    telemetry.forEach((point) => {
        Object.entries(point.vehicleTypes || {}).forEach(([type, count]) => {
            totals[type] = (totals[type] || 0) + Number(count || 0);
        });
    });

    const sum = Object.values(totals).reduce((running, value) => running + value, 0);
    return Object.entries(totals)
        .map(([type, count]) => ({
            type,
            count,
            percent: sum ? Math.round((count / sum) * 100) : 0
        }))
        .sort((first, second) => second.count - first.count);
}

function computeDirectionSplit(telemetry) {
    const totals = {};
    telemetry.forEach((point) => {
        Object.entries(point.byDirection || {}).forEach(([direction, count]) => {
            totals[direction] = (totals[direction] || 0) + Number(count || 0);
        });
    });
    const sum = Object.values(totals).reduce((running, value) => running + value, 0);
    return Object.entries(totals).map(([direction, count]) => ({
        direction,
        count,
        percent: sum ? Math.round((count / sum) * 100) : 0
    }));
}

// --- profiles -------------------------------------------------------------

// When the counting line is calibrated this is real hourly volume. Otherwise
// it is the average number of vehicles visible per sample -- an occupancy
// index, which correlates with volume but is NOT a vehicle count.
function computeHourlyProfile(telemetry, capability) {
    const buckets = {};
    telemetry.forEach((point) => {
        const hour = new Date(point.timestampIso).getHours();
        if (!buckets[hour]) buckets[hour] = { crossings: 0, occupancy: [], samples: 0 };
        buckets[hour].crossings += Number(point.crossings) || 0;
        buckets[hour].occupancy.push(point.vehicleCount);
        buckets[hour].samples += 1;
    });

    return Object.keys(buckets)
        .map(Number)
        .sort((first, second) => first - second)
        .map((hour) => {
            const bucket = buckets[hour];
            return {
                hour,
                samples: bucket.samples,
                value: capability.hasThroughput
                    ? bucket.crossings
                    : Math.round(average(bucket.occupancy) * 10) / 10
            };
        });
}

function computePeakHour(hourly) {
    if (!hourly.length) return { label: '--', basis: 'No samples yet' };
    const peak = hourly.reduce((best, bucket) => (bucket.value > best.value ? bucket : best), hourly[0]);
    return {
        label: `${String(peak.hour).padStart(2, '0')}:00`,
        basis: `${peak.value} in that hour`
    };
}

function computeCongestionDuration(telemetry, currentLevel) {
    if (!telemetry.length) return null;
    let start = telemetry[telemetry.length - 1];
    for (let index = telemetry.length - 2; index >= 0; index -= 1) {
        if (telemetry[index].visionLevel !== currentLevel) break;
        start = telemetry[index];
    }
    const startedAt = new Date(start.timestampIso);
    return {
        startedAt,
        elapsedMinutes: Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60000))
    };
}

function computeWeekTrend(telemetry) {
    const now = new Date();
    const todayKey = formatLocalDateKey(now);
    const hour = now.getHours();
    const today = telemetry.filter((point) => formatLocalDateKey(new Date(point.timestampIso)) === todayKey && new Date(point.timestampIso).getHours() === hour);
    if (!today.length) return { percent: null, note: 'No samples for this hour today', comparison: 'Unavailable' };

    const oldest = new Date(telemetry[0].timestampIso);
    const hasWeekOfHistory = now.getTime() - oldest.getTime() >= 7 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const comparison = telemetry.filter((point) => {
        const pointDate = new Date(point.timestampIso);
        if (formatLocalDateKey(pointDate) === todayKey) return false;
        return hasWeekOfHistory ? pointDate >= cutoff && pointDate.getHours() === hour : true;
    });
    if (!comparison.length) return { percent: null, note: hasWeekOfHistory ? 'No prior samples for this hour' : 'Not enough history to compare', comparison: 'Unavailable' };

    const todayAverage = average(today.map((point) => point.vehicleCount));
    const comparisonAverage = average(comparison.map((point) => point.vehicleCount));
    if (!comparisonAverage) return { percent: null, note: 'Historical average is zero', comparison: 'Unavailable' };
    return {
        percent: Math.round(((todayAverage - comparisonAverage) / comparisonAverage) * 100),
        note: hasWeekOfHistory ? 'Same hour, prior 4 weeks' : 'Using all available history',
        comparison: hasWeekOfHistory ? '4-week' : 'All history'
    };
}

function computeAverageResolutionMinutes(reports) {
    const now = new Date();
    const durations = reports
        .filter((report) => report.status === 'Resolved' && report.resolvedAtIso && isSameMonth(new Date(report.resolvedAtIso), now))
        .map((report) => (new Date(report.resolvedAtIso).getTime() - new Date(report.createdAtIso).getTime()) / 60000)
        .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);
    return durations.length ? average(durations) : null;
}

function computeSevenDayTrend(telemetry) {
    const today = new Date();
    return Array.from({ length: 7 }, (unused, index) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
        const samples = telemetry.filter((point) => formatLocalDateKey(new Date(point.timestampIso)) === formatLocalDateKey(date));
        return {
            label: index === 6 ? 'Today' : date.toLocaleDateString([], { weekday: 'short' }),
            value: samples.length ? average(samples.map((point) => point.vehicleCount)) : 0,
            hasData: samples.length > 0,
            isToday: index === 6
        };
    });
}

// --- hour x weekday heatmap ----------------------------------------------

// Built from hourly rollups rather than minute records, because a useful
// heatmap needs weeks of data and the browser only holds ~2 days of minutes.
function computeHeatmap(hourly, metric) {
    const key = metric === 'volume' ? 'crossings' : 'congestionScore';
    const grid = WEEKDAY_LABELS.map((label, weekday) => ({
        weekday,
        label,
        cells: Array.from({ length: 24 }, (unused, hour) => ({ hour, samples: 0, values: [] }))
    }));

    hourly.forEach((record) => {
        const cell = grid[record.weekday] && grid[record.weekday].cells[record.hour];
        if (!cell) return;
        const value = record[key];
        if (!Number.isFinite(value)) return;
        cell.samples += 1;
        cell.values.push(value);
    });

    let maxValue = 0;
    grid.forEach((row) => row.cells.forEach((cell) => {
        cell.value = cell.samples ? average(cell.values) : null;
        if (cell.value !== null) maxValue = Math.max(maxValue, cell.value);
        delete cell.values;
    }));

    const covered = grid.reduce((sum, row) => sum + row.cells.filter((cell) => cell.samples).length, 0);
    return {
        metric: metric === 'volume' ? 'volume' : 'congestion',
        grid,
        maxValue,
        coveredCells: covered,
        coveragePercent: Math.round((covered / (7 * 24)) * 100)
    };
}

// --- baselines ------------------------------------------------------------

function summariseStat(values) {
    const clean = values.filter(Number.isFinite);
    return {
        count: clean.length,
        mean: clean.length ? average(clean) : null,
        std: standardDeviation(clean)
    };
}

// The "normal" for this weekday and hour, built from prior weeks only. The
// current clock hour is excluded so a live anomaly is never compared against
// a baseline that already contains it.
function computeSlotBaseline(hourly, weekday, hour, now) {
    const currentSlotIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
    const matches = hourly.filter((record) => record.weekday === weekday
        && record.hour === hour
        && record.timestampIso !== currentSlotIso);

    return {
        samples: matches.length,
        score: summariseStat(matches.map((record) => record.congestionScore)),
        speed: summariseStat(matches.map((record) => record.avgSpeedKph)),
        occupancy: summariseStat(matches.map((record) => record.occupancyPct)),
        crossingsPerMinute: summariseStat(matches.map((record) => record.crossingsPerMinute))
    };
}

function computeRecentWindow(telemetry, minutes) {
    const cutoff = Date.now() - minutes * 60000;
    const recent = telemetry.filter((point) => new Date(point.timestampIso).getTime() >= cutoff);
    if (!recent.length) return null;

    const speeds = recent.map((point) => point.avgSpeedKph).filter(Number.isFinite);
    const occupancy = recent.map((point) => point.occupancyPct).filter(Number.isFinite);
    const crossings = recent.map((point) => point.crossings).filter(Number.isFinite);

    return {
        samples: recent.length,
        fromIso: recent[0].timestampIso,
        congestionScore: average(recent.map((point) => point.congestionScore)),
        avgSpeedKph: speeds.length ? average(speeds) : null,
        occupancyPct: occupancy.length ? average(occupancy) : null,
        crossingsPerMinute: crossings.length ? average(crossings) : null
    };
}

// --- anomaly detection ----------------------------------------------------

function zScore(value, stat) {
    if (!Number.isFinite(value) || stat.mean === null || stat.std < 0.001) return null;
    return (value - stat.mean) / stat.std;
}

function ratio(value, stat) {
    if (!Number.isFinite(value) || !stat.mean) return null;
    return value / stat.mean;
}

// Very quiet baselines produce huge sigma values that read like a bug rather
// than a finding, so past 5 the exact figure stops being informative.
function formatSigma(value) {
    return value > 5 ? 'more than 5' : value.toFixed(1);
}

function detectAnomalies(telemetry, hourly) {
    const now = new Date();
    const recent = computeRecentWindow(telemetry, 10);
    if (!recent) {
        return { status: 'no-data', reason: 'No vision samples in the last 10 minutes.', items: [] };
    }

    const weekday = (now.getDay() + 6) % 7;
    const hour = now.getHours();
    const baseline = computeSlotBaseline(hourly, weekday, hour, now);
    if (baseline.samples < 2) {
        return {
            status: 'insufficient',
            reason: `Needs at least 2 prior ${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, '0')}:00 readings to know what normal looks like. Have ${baseline.samples}.`,
            items: []
        };
    }

    const items = [];
    const scoreZ = zScore(recent.congestionScore, baseline.score);
    const flowRatio = ratio(recent.crossingsPerMinute, baseline.crossingsPerMinute);
    const speedRatio = ratio(recent.avgSpeedKph, baseline.speed);
    const occupancyRatio = ratio(recent.occupancyPct, baseline.occupancy);

    // Vehicles present but not moving: the classic obstruction signature.
    if (speedRatio !== null && occupancyRatio !== null && speedRatio < 0.45 && occupancyRatio >= 0.9) {
        items.push({
            severity: 'Severe',
            title: 'Traffic stalled - possible obstruction',
            detail: `Speed is ${Math.round(speedRatio * 100)}% of normal for this hour while occupancy is ${Math.round(occupancyRatio * 100)}% of normal. Vehicles are present but not moving.`,
            metric: `${recent.avgSpeedKph.toFixed(1)} km/h vs ${baseline.speed.mean.toFixed(1)} km/h normal`
        });
    }

    if (flowRatio !== null && occupancyRatio !== null && flowRatio < 0.4 && occupancyRatio >= 0.9) {
        items.push({
            severity: 'Severe',
            title: 'Flow collapse with road still full',
            detail: `Only ${Math.round(flowRatio * 100)}% of the usual vehicles are getting through while occupancy holds steady. Consistent with a blockage downstream.`,
            metric: `${recent.crossingsPerMinute.toFixed(1)} veh/min vs ${baseline.crossingsPerMinute.mean.toFixed(1)} normal`
        });
    }

    // Empty road when it should be busy points upstream, not downstream.
    if (flowRatio !== null && occupancyRatio !== null && flowRatio < 0.25 && occupancyRatio < 0.4) {
        items.push({
            severity: 'High',
            title: 'Traffic flow stopped',
            detail: 'Almost no vehicles are arriving and the road is empty. Possible closure or diversion upstream.',
            metric: `${recent.crossingsPerMinute.toFixed(1)} veh/min vs ${baseline.crossingsPerMinute.mean.toFixed(1)} normal`
        });
    }

    if (scoreZ !== null && scoreZ > 2.5) {
        items.push({
            severity: 'High',
            title: 'Congestion well above normal',
            detail: `Congestion is ${Math.round((recent.congestionScore / baseline.score.mean - 1) * 100)}% above the usual level for ${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, '0')}:00 (${formatSigma(scoreZ)} standard deviations).`,
            metric: `score ${Math.round(recent.congestionScore)} vs ${Math.round(baseline.score.mean)} normal`
        });
    }

    const flowZ = zScore(recent.crossingsPerMinute, baseline.crossingsPerMinute);
    if (flowZ !== null && flowZ > 2.5) {
        items.push({
            severity: 'Moderate',
            title: 'Unusual traffic volume',
            detail: `Vehicle volume is ${formatSigma(flowZ)} standard deviations above normal for this hour.`,
            metric: `${recent.crossingsPerMinute.toFixed(1)} veh/min vs ${baseline.crossingsPerMinute.mean.toFixed(1)} normal`
        });
    }

    return {
        status: items.length ? 'alert' : 'normal',
        reason: items.length
            ? `${items.length} anomal${items.length === 1 ? 'y' : 'ies'} in the last 10 minutes.`
            : `Nothing unusual. Compared against ${baseline.samples} prior ${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, '0')}:00 readings.`,
        items,
        recent,
        baseline,
        windowLabel: `${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, '0')}:00`
    };
}

// --- short-horizon forecast ----------------------------------------------

// Deliberately simple and explainable: blend what this slot normally looks
// like with what is happening right now, leaning on history further out. No
// black box -- every number here can be defended in a viva.
function computeForecast(telemetry, hourly) {
    const recent = computeRecentWindow(telemetry, 30);
    if (!recent) {
        return { status: 'no-data', reason: 'No vision samples in the last 30 minutes.', horizons: [] };
    }

    const now = new Date();
    const horizons = FORECAST_HORIZONS.map(({ minutes, historicalWeight }) => {
        const target = new Date(now.getTime() + minutes * 60000);
        const weekday = (target.getDay() + 6) % 7;
        const hour = target.getHours();
        const baseline = computeSlotBaseline(hourly, weekday, hour, now);
        const label = formatShortTime(target);

        if (baseline.samples < 2 || baseline.score.mean === null) {
            return {
                minutes, label, status: 'insufficient', samples: baseline.samples,
                reason: `Only ${baseline.samples} prior reading${baseline.samples === 1 ? '' : 's'} for ${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, '0')}:00`
            };
        }

        const score = Math.round(
            historicalWeight * baseline.score.mean + (1 - historicalWeight) * recent.congestionScore
        );
        const flow = baseline.crossingsPerMinute.mean !== null && recent.crossingsPerMinute !== null
            ? historicalWeight * baseline.crossingsPerMinute.mean + (1 - historicalWeight) * recent.crossingsPerMinute
            : baseline.crossingsPerMinute.mean;

        return {
            minutes,
            label,
            status: 'ok',
            score: Math.max(0, Math.min(100, score)),
            level: scoreToVisionLevel(score),
            crossingsPerMinute: flow,
            samples: baseline.samples,
            confidence: baseline.samples >= 4 ? 'High' : baseline.samples >= 2 ? 'Medium' : 'Low',
            basis: `${Math.round(historicalWeight * 100)}% typical ${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, '0')}:00, ${Math.round((1 - historicalWeight) * 100)}% current trend`
        };
    });

    const usable = horizons.filter((horizon) => horizon.status === 'ok');
    return {
        status: usable.length ? 'ok' : 'insufficient',
        reason: usable.length
            ? `Blended from ${recent.samples} recent samples and the same slot in prior weeks.`
            : 'Not enough weeks of history to forecast this slot yet.',
        horizons,
        currentScore: Math.round(recent.congestionScore)
    };
}

// --- report-derived -------------------------------------------------------

function getHotspotRankingData(limit) {
    const grouped = {};
    state.reports.forEach((report) => {
        if (!grouped[report.location]) grouped[report.location] = [];
        grouped[report.location].push(report.congestionScore);
    });

    return Object.keys(grouped)
        .map((location) => {
            const values = grouped[location];
            const avg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
            return { location, avg, reports: values.length };
        })
        .sort((a, b) => b.avg - a.avg)
        .slice(0, limit);
}

function getClassificationCounts() {
    const classes = ['Low', 'Moderate', 'High', 'Severe'];
    return classes.map((label) => ({
        label,
        count: state.reports.filter((report) => report.severity === label).length
    }));
}
