<section class="page-head">
    <div>
        <span class="section-kicker"><?= icon('analytics') ?> Analytics</span>
    </div>
    <div class="head-actions">
        <span class="tag info" id="analyticsSourceTag">VISION</span>
        <button class="btn primary" id="exportAnalyticsBtn"><?= icon('download') ?> Export LGU PDF</button>
    </div>
</section>

<div class="data-scope" id="analyticsScope">
    <strong>Loading vision history&hellip;</strong>
    <span id="analyticsScopeDetail">Reading from BITCAS MySQL database</span>
</div>

<div class="stats-grid">
    <div class="stat-card" id="kpiThroughput">
        <div class="stat-icon blue"><?= icon('car') ?></div>
        <div><span>Vehicles counted today</span><strong id="aThroughputToday">--</strong><em id="aThroughputNote">Waiting for data</em></div>
    </div>
    <div class="stat-card" id="kpiFlow">
        <div class="stat-icon violet"><?= icon('flow') ?></div>
        <div><span>Traffic flow</span><strong id="aFlowRate">--</strong><em id="aFlowNote">Waiting for data</em></div>
    </div>
    <div class="stat-card" id="kpiSpeed">
        <div class="stat-icon green"><?= icon('gauge') ?></div>
        <div><span>Average speed</span><strong id="aAvgSpeed">--</strong><em id="aAvgSpeedNote">Waiting for data</em></div>
    </div>
    <div class="stat-card" id="kpiOccupancy">
        <div class="stat-icon yellow"><?= icon('percent') ?></div>
        <div><span>Road occupancy</span><strong id="aAvgOccupancy">--</strong><em id="aAvgOccupancyNote">Waiting for data</em></div>
    </div>
</div>

<div class="analytics-grid analytics-grid-alerts">
    <section class="panel" id="anomalyPanel">
        <div class="panel-head">
            <div><h2><?= icon('alert') ?> Incident detection</h2><span id="anomalyWindow">Last 10 minutes</span></div>
            <span class="tag" id="anomalyTag">--</span>
        </div>
        <div id="anomalyList"></div>
    </section>
    <section class="panel" id="forecastPanel">
        <div class="panel-head">
            <div><h2><?= icon('activity') ?> Congestion forecast</h2><span>Next 15 to 60 minutes</span></div>
            <span class="axis-note" id="forecastNow">--</span>
        </div>
        <div class="forecast-row" id="forecastList"></div>
        <div class="panel-note" id="forecastNote"></div>
    </section>
</div>

<section class="panel heatmap-panel">
    <div class="panel-head">
        <div><h2><?= icon('layers') ?> Congestion heatmap</h2><span id="heatmapScope">Hour of day by weekday</span></div>
        <div class="segmented" id="heatmapMetric">
            <button type="button" class="active" data-metric="congestion">Congestion</button>
            <button type="button" data-metric="volume">Volume</button>
        </div>
    </div>
    <div class="heatmap" id="congestionHeatmap"></div>
    <div class="heatmap-footer">
        <div class="panel-note" id="heatmapNote"></div>
        <div class="heatmap-legend" id="heatmapLegend"></div>
    </div>
</section>

<div class="kpi-grid analytics-evidence">
    <div><span>Rolling vehicle average</span><strong id="aRollingVehicleAverage">--</strong><small>Latest 10 vision samples</small></div>
    <div><span>Historical baseline</span><strong id="aBaselineVehicleAverage">--</strong><small>All loaded vision samples</small></div>
    <div><span>Current vs baseline</span><strong id="aBaselineDelta">--</strong><small id="aBaselineNote">Waiting for live feed</small></div>
</div>

<div class="analytics-widgets analytics-widgets-4">
    <section class="analytics-widget" id="aDurationCard">
        <span>Congestion duration</span>
        <strong id="aCongestionDuration">--</strong>
        <small id="aCongestionDurationNote">Waiting for vision history</small>
    </section>
    <section class="analytics-widget">
        <span>Peak hour</span>
        <strong id="aPeakHour">--</strong>
        <small id="aPeakHourNote">Waiting for vision history</small>
    </section>
    <section class="analytics-widget">
        <span>Vs usual volume</span>
        <strong id="aWeekTrend">--</strong>
        <small id="aWeekTrendNote" title="Waiting for vision history">Waiting for vision history</small>
    </section>
    <section class="analytics-widget">
        <span>Avg resolution time</span>
        <strong id="aResolutionTime">--</strong>
        <small id="aResolutionTimeNote">Resolved reports this month</small>
    </section>
</div>

<div class="analytics-grid">
    <section class="panel chart-panel">
        <div class="panel-head">
            <div><h2><?= icon('analytics') ?> Hourly profile</h2><span id="analyticsDataSource">Vision history</span></div>
            <span class="axis-note" id="hourlyAxisNote">vehicles / hour</span>
        </div>
        <div class="chart" id="trafficChart"></div>
    </section>
    <section class="panel">
        <div class="panel-head"><div><h2><?= icon('layers') ?> Vehicle mix</h2><span>Share of detections</span></div></div>
        <div id="vehicleMixChart" class="mix-list"></div>
    </section>
</div>

<div class="analytics-grid">
    <section class="panel seven-day-panel">
        <div class="panel-head">
            <div><h2><?= icon('activity') ?> 7-day trend</h2><span>Average vehicles in frame per day</span></div>
            <span class="axis-note">vehicles in frame</span>
        </div>
        <div class="seven-day-chart" id="sevenDayChart"></div>
        <div class="panel-note" id="sevenDayNote"></div>
    </section>
    <section class="panel">
        <div class="panel-head"><div><h2><?= icon('flow') ?> Direction split</h2><span>Counted crossings</span></div></div>
        <div id="directionSplit" class="mix-list"></div>
    </section>
</div>

<div class="analytics-grid">
    <section class="panel">
        <div class="panel-head"><div><h2><?= icon('reports') ?> Report summary</h2><span>LGU response record</span></div></div>
        <div class="kpi-grid report-kpis">
            <div><span>Total reports</span><strong id="aTotalReports">0</strong><small>All time in this browser</small></div>
            <div><span>Average congestion score</span><strong id="aAvgCongestion">0%</strong><small>Across loaded vision samples</small></div>
            <div><span>Resolved rate</span><strong id="aResolvedRate">0%</strong><small>Reports marked resolved</small></div>
            <div><span>Class distribution</span><strong id="aClassSummary">--</strong><small>Low / Moderate / High</small></div>
        </div>
        <div class="kpi-grid" id="classificationBreakdown"></div>
    </section>
    <section class="panel">
        <div class="panel-head"><div><h2><?= icon('map-pin') ?> Locations</h2><span>By average score</span></div></div>
        <div id="hotspotRanking"></div>
        <div class="panel-note" id="hotspotNote"></div>
    </section>
</div>
