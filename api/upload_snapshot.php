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

$cameraId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($_POST['camera_id'] ?? 'CAM-VILLAMONTE-01')) ?: 'CAM-VILLAMONTE-01';
$level = strtoupper(trim((string)($_POST['congestion_level'] ?? 'HEAVY')));
$score = isset($_POST['congestion_score']) ? max(0, min(100, (int)$_POST['congestion_score'])) : 65;
$vehiclesInFrame = isset($_POST['vehicles_in_frame']) ? max(0, (int)$_POST['vehicles_in_frame']) : 0;
$capturedAt = trim((string)($_POST['captured_at'] ?? date('c')));
$requestedName = isset($_POST['filename']) ? basename((string)$_POST['filename']) : '';

$bytes = null;
if (isset($_FILES['snapshot']) && is_array($_FILES['snapshot']) && (int)($_FILES['snapshot']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $tmpPath = (string)$_FILES['snapshot']['tmp_name'];
    $bytes = is_file($tmpPath) ? file_get_contents($tmpPath) : false;
    if ($requestedName === '' && !empty($_FILES['snapshot']['name'])) {
        $requestedName = basename((string)$_FILES['snapshot']['name']);
    }
} elseif (!empty($_POST['image_base64'])) {
    $bytes = base64_decode((string)$_POST['image_base64'], true);
}

if (!is_string($bytes) || strlen($bytes) < 64 || substr($bytes, 0, 2) !== "\xFF\xD8") {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Expected a JPEG snapshot']);
    exit;
}

if (!preg_match('/^heavy_\d{8}_\d{6}\.jpg$/', $requestedName)) {
    $requestedName = 'heavy_' . date('Ymd_His') . '.jpg';
}

$snapshotDir = dirname(__DIR__) . '/assets/snapshots';
if (!is_dir($snapshotDir)) {
    mkdir($snapshotDir, 0775, true);
}

$targetPath = $snapshotDir . '/' . $requestedName;
if (file_put_contents($targetPath, $bytes, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not save snapshot']);
    exit;
}

$snapshotUrl = 'assets/snapshots/' . $requestedName;
try {
    VisionStore::saveSnapshotRecord($cameraId, $level, $score, $vehiclesInFrame, $snapshotUrl, $capturedAt);
} catch (Throwable $ignore) {
}

echo json_encode([
    'ok' => true,
    'snapshot_url' => $snapshotUrl
], JSON_UNESCAPED_SLASHES);
