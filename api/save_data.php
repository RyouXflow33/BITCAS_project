<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/VisionStore.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use POST']);
    exit;
}

$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if (!Database::verifyIngestKey(is_string($providedKey) ? $providedKey : '')) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid X-API-Key']);
    exit;
}

$raw = (string)file_get_contents('php://input');
$decoded = json_decode($raw, true);
if (!is_array($decoded)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Expected JSON payload']);
    exit;
}

try {
    $kind = (string)($decoded['kind'] ?? 'live');
    if ($kind === 'minute' && isset($decoded['record']) && is_array($decoded['record'])) {
        VisionStore::saveMinuteRecord($decoded['record']);
        echo json_encode(['ok' => true, 'stored' => 'traffic_minute']);
        exit;
    }

    if ($kind === 'hourly' && isset($decoded['record']) && is_array($decoded['record'])) {
        VisionStore::saveHourlyRecord($decoded['record']);
        echo json_encode(['ok' => true, 'stored' => 'traffic_hourly']);
        exit;
    }

    $live = isset($decoded['payload']) && is_array($decoded['payload']) ? $decoded['payload'] : $decoded;
    VisionStore::saveLivePayload($live);

    if (isset($decoded['minute']) && is_array($decoded['minute'])) {
        VisionStore::saveMinuteRecord($decoded['minute']);
    }
    if (isset($decoded['hourly']) && is_array($decoded['hourly'])) {
        VisionStore::saveHourlyRecord($decoded['hourly']);
    }

    echo json_encode(['ok' => true, 'stored' => 'camera_live']);
} catch (Throwable $error) {
    error_log('save_data: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error. Try again.']);
}
