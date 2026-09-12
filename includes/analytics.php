<section class="page-head">
    <div>
        <span class="section-kicker">Analytics</span>
    </div>
    <div class="head-actions">
        <button class="btn ghost" id="analyticsRangeBtn">Last 24h</button>
        <button class="btn primary" id="exportAnalyticsBtn">Export LGU PDF</button>
    </div>
</section>

<div class="stats-grid">
    <div class="stat-card"><div class="stat-icon blue">#</div><div><span>Reports</span><strong id="aTotalReports">0</strong><em class="up" id="aReportTrend">+0</em></div></div>
    <div class="stat-card"><div class="stat-icon yellow">~</div><div><span>Avg score</span><strong id="aAvgCongestion">0%</strong><em class="down" id="aCongestionTrend">-0%</em></div></div>
    <div class="stat-card"><div class="stat-icon green">*</div><div><span>Resolved</span><strong id="aResolvedRate">0%</strong><em class="up" id="aResolvedTrend">+0%</em></div></div>
    <div class="stat-card"><div class="stat-icon violet">i</div><div><span>Peak</span><strong id="aPeakHour">--</strong><em class="up">hour</em></div></div>
</div>

<div class="kpi-grid analytics-evidence">
    <div><span>Rolling vehicle average</span><strong id="aRollingVehicleAverage">--</strong><small>Latest 10 vision samples</small></div>
    <div><span>Historical baseline</span><strong id="aBaselineVehicleAverage">--</strong><small>All loaded vision samples</small></div>
    <div><span>Current vs baseline</span><strong id="aBaselineDelta">--</strong><small id="aBaselineNote">Waiting for live feed</small></div>
</div>

<div class="analytics-widgets">
    <section class="analytics-widget" id="aDurationCard">
        <span>Congestion duration</span>
        <strong id="aCongestionDuration">--</strong>
        <small id="aCongestionDurationNote">Waiting for vision history</small>
    </section>
    <section class="analytics-widget">
        <span>Vs last week</span>
        <strong id="aWeekTrend">--</strong>
        <small id="aWeekTrendNote" title="Waiting for vision history">Waiting for vision history</small>
    </section>
    <section class="analytics-widget">
        <span>Avg resolution time</span>
        <strong id="aResolutionTime">--</strong>
        <small id="aResolutionTimeNote">Resolved reports this month</small>
    </section>
</div>

<section class="panel seven-day-panel">
    <div class="panel-head"><div><h2>7-day trend</h2><span>Average vehicles per day</span></div></div>
    <div class="seven-day-chart" id="sevenDayChart"></div>
</section>

<div class="analytics-grid">
    <section class="panel chart-panel">
        <div class="panel-head"><div><h2>Hourly vehicles</h2><span id="analyticsDataSource">Vision history</span></div><span class="tag info" id="analyticsSourceTag">VISION</span></div>
        <div class="chart" id="trafficChart"></div>
    </section>
    <section class="panel">
        <div class="panel-head"><div><h2>Hotspots</h2><span>Rank</span></div></div>
        <div id="hotspotRanking"></div>
    </section>
</div>

<div class="panel">
    <div class="panel-head"><div><h2>Class distribution</h2><span>Low to Severe</span></div></div>
    <div class="kpi-grid" id="classificationBreakdown"></div>
</div>
