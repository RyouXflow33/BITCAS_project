<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/DeskStore.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode([
        'ok' => true,
        'session' => $_SESSION['bitcas_user'] ?? null
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use GET or POST']);
    exit;
}

$payload = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Expected JSON']);
    exit;
}

$action = (string)($payload['action'] ?? '');

if ($action === 'logout') {
    unset($_SESSION['bitcas_user']);
    session_destroy();
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'sync' && isset($payload['session']) && is_array($payload['session'])) {
    $_SESSION['bitcas_user'] = [
        'userId' => (string)($payload['session']['userId'] ?? ''),
        'username' => (string)($payload['session']['username'] ?? ''),
        'fullName' => (string)($payload['session']['fullName'] ?? ''),
        'role' => ($payload['session']['role'] ?? '') === 'super_admin' ? 'super_admin' : 'traffic_desk',
        'mustChangePassword' => !empty($payload['session']['mustChangePassword']),
        'loginAtIso' => (string)($payload['session']['loginAtIso'] ?? gmdate('Y-m-d\TH:i:s\Z'))
    ];
    echo json_encode(['ok' => true, 'session' => $_SESSION['bitcas_user']], JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'login') {
    $username = strtolower(trim((string)($payload['username'] ?? '')));
    $passwordHash = strtolower(trim((string)($payload['passwordHash'] ?? '')));

    try {
        $desk = DeskStore::readState();
        $matched = null;
        foreach ($desk['users'] as $user) {
            if (($user['username'] ?? '') === $username) {
                $matched = $user;
                break;
            }
        }
        if (!$matched || !hash_equals(strtolower((string)$matched['passwordHash']), $passwordHash)) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'Invalid username or password.']);
            exit;
        }
        if (empty($matched['active'])) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'This account is disabled. Ask the super admin.']);
            exit;
        }

        $session = [
            'userId' => (string)$matched['id'],
            'username' => (string)$matched['username'],
            'fullName' => (string)$matched['fullName'],
            'role' => (string)$matched['role'],
            'mustChangePassword' => !empty($matched['mustChangePassword']),
            'loginAtIso' => gmdate('Y-m-d\TH:i:s\Z')
        ];
        $_SESSION['bitcas_user'] = $session;

        echo json_encode([
            'ok' => true,
            'user' => $matched,
            'session' => $session
        ], JSON_UNESCAPED_SLASHES);
        exit;
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Database error during login.']);
        exit;
    }
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action']);
