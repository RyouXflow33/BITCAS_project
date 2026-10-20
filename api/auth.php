<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/DeskStore.php';
require_once __DIR__ . '/../app/models/Auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// GET: who is signed in right now (read again from MySQL).
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['ok' => true, 'session' => Auth::user()], JSON_UNESCAPED_SLASHES);
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
    Auth::logout();
    echo json_encode(['ok' => true]);
    exit;
}

// A session exists only after a correct password. There is no action that lets the
// browser describe its own session.
if ($action === 'login') {
    $username = strtolower(trim((string)($payload['username'] ?? '')));
    $password = (string)($payload['password'] ?? '');

    try {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }

        if (Auth::isLockedOut($pdo)) {
            http_response_code(429);
            echo json_encode(['ok' => false, 'error' => 'Too many failed attempts. Wait 10 minutes and try again.']);
            exit;
        }

        // Make sure the seeded super admin exists on a brand-new database.
        DeskStore::ensureSeedAdmin($pdo);

        $row = $username !== '' && $password !== '' ? DeskStore::findUserRowByUsername($pdo, $username) : null;
        $valid = false;
        if ($row) {
            $valid = Auth::verifyPassword($pdo, $row, $password);
        } else {
            Auth::burnTime($password);
        }

        if (!$valid) {
            Auth::recordFailure($pdo, $username);
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'Invalid username or password.']);
            exit;
        }
        if ((int)$row['active'] !== 1) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'This account is disabled. Ask the super admin.']);
            exit;
        }

        Auth::clearFailures($pdo);
        Auth::login($row);
        $session = Auth::user();

        echo json_encode([
            'ok' => true,
            'user' => DeskStore::publicUser($row),
            'session' => $session
        ], JSON_UNESCAPED_SLASHES);
        exit;
    } catch (Throwable $error) {
        error_log('auth login: ' . $error->getMessage());
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Database error during login.']);
        exit;
    }
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action']);
