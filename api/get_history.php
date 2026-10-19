<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/VisionStore.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$kind = isset($_GET['kind']) && $_GET['kind'] === 'hourly' ? 'hourly' : 'minute';
$limit = $kind === 'hourly' ? 1440 : 2880;
$lines = VisionStore::historyLines($kind, $limit);

echo implode("\n", $lines);
if ($lines) {
    echo "\n";
}
