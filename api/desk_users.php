<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/DeskStore.php';
require_once __DIR__ . '/../app/models/Auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

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

$action = (string)($payload['action'] ?? '');

try {
    // Changing your own password is the one action an account may do while it still owes a change.
    if ($action === 'change_password') {
        $me = Auth::requireUser();
        $user = DeskStore::changeOwnPassword(
            $me['userId'],
            (string)($payload['currentPassword'] ?? ''),
            (string)($payload['newPassword'] ?? '')
        );
        echo json_encode(['ok' => true, 'user' => $user, 'session' => Auth::user()], JSON_UNESCAPED_SLASHES);
        exit;
    }

    $admin = Auth::requireSuperAdmin();

    if ($action === 'create') {
        $user = DeskStore::createUser(
            (string)($payload['fullName'] ?? ''),
            (string)($payload['username'] ?? ''),
            (string)($payload['password'] ?? ''),
            $admin['userId']
        );
        echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === 'reset_password') {
        $user = DeskStore::resetPassword((string)($payload['userId'] ?? ''), (string)($payload['password'] ?? ''));
        echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === 'set_active') {
        $user = DeskStore::setActive(
            (string)($payload['userId'] ?? ''),
            !empty($payload['active']),
            $admin['userId']
        );
        echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === 'delete') {
        DeskStore::deleteUser((string)($payload['userId'] ?? ''), $admin['userId']);
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown action']);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('desk_users: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error. Try again.']);
}
