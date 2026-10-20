<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/DeskStore.php';
require_once __DIR__ . '/../app/models/Auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        Auth::requireUser();
        echo json_encode(['ok' => true, 'state' => DeskStore::readState()], JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        Auth::requireUser(true);
        $payload = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($payload)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Expected JSON state']);
            exit;
        }
        // A page that never read the saved list must not replace it. Older cached
        // scripts do not send this flag, so they cannot overwrite reports or officers.
        if (empty($payload['basedOnServerState'])) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Reload the page before saving.']);
            exit;
        }
        $state = DeskStore::writeState($payload);
        echo json_encode(['ok' => true, 'state' => $state], JSON_UNESCAPED_SLASHES);
        exit;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use GET or POST']);
} catch (Throwable $error) {
    error_log('desk_state: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error. Try again.']);
}
