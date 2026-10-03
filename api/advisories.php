<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use POST']);
    exit;
}

$payload = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Expected JSON']);
    exit;
}

require_once __DIR__ . '/advisory_store.php';

try {
    $action = (string)($payload['action'] ?? '');
    if ($action === 'clear') {
        advisory_write([]);
        echo json_encode(['ok' => true, 'advisories' => []]);
        exit;
    }

    if ($action !== 'broadcast') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Unknown action']);
        exit;
    }

    $level = trim((string)($payload['level'] ?? ''));
    $area = trim((string)($payload['area'] ?? ''));
    $message = trim((string)($payload['message'] ?? ''));
    if (!in_array($level, ['Low', 'Moderate', 'High'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Level must be Low, Moderate, or High']);
        exit;
    }
    if ($area === '' || strlen($area) > 80 || $message === '' || strlen($message) > 280) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Area and message are required']);
        exit;
    }

    $actor = trim((string)($payload['createdByUserId'] ?? ''));
    if (strlen($actor) > 40) {
        $actor = '';
    }

    $advisory = [
        'id' => 'ADV-' . (int)round(microtime(true) * 1000),
        'level' => $level,
        'area' => $area,
        'message' => $message,
        'sentAtIso' => date('c'),
        'channel' => 'OneSignal',
        'createdByUserId' => $actor !== '' ? $actor : null
    ];

    $list = advisory_read();
    array_unshift($list, $advisory);
    $list = array_slice($list, 0, 20);
    advisory_write($list);

    $push = advisory_push($advisory);
    if (!$push['sent']) {
        $advisory['channel'] = 'Saved locally';
        $list[0] = $advisory;
        advisory_write($list);
    }

    echo json_encode(['ok' => true, 'advisory' => $advisory, 'push' => $push]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
}
