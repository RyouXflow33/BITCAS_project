// MVC - Model: analytics computations derived from the store.

function computeAnalytics() {
    const reports = state.reports;
    const telemetry = [...state.telemetry].sort((first, second) => new Date(first.timestampIso) - new Date(second.timestampIso));

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

    const byHour = {};
    telemetry.forEach((point) => {
        const hour = new Date(point.timestampIso).getHours();
        byHour[hour] = (byHour[hour] || 0) + point.vehicleCount;
    });

    let peakHour = '--';
    let peakVolume = -1;
    Object.keys(byHour).forEach((hourKey) => {
        const volume = byHour[hourKey];
        if (volume > peakVolume) {
            peakVolume = volume;
            peakHour = `${hourKey.padStart(2, '0')}:00`;
        }
    });

    return {
        totalReports,
        resolvedRate,
        avgCongestion,
        peakHour,
        byHour,
        baselineVehicleAverage,
        rollingVehicleAverage,
        baselineDelta,
        currentLevel,
        duration,
        weekTrend,
        averageResolutionMinutes,
        sevenDayTrend
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
    if (!comparison.length) return { percent: null, note: hasWeekOfHistory ? 'No prior samples for this hour' : 'Using all available history', comparison: 'Unavailable' };

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
            isToday: index === 6
        };
    });
}

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
            return { location, avg };
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
