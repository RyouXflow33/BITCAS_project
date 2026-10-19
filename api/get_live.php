<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/VisionStore.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$payload = VisionStore::latestLivePayload();
if (!is_array($payload)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'No live reading available']);
    exit;
}

echo json_encode($payload, JSON_UNESCAPED_SLASHES);
