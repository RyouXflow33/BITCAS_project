<?php /** Set $showMapLegend = false before including to render the legend elsewhere. */ ?>
<div class="map" id="trafficMap"></div>
<?php if (!isset($showMapLegend) || $showMapLegend) include __DIR__ . '/map-legend.php'; ?>
