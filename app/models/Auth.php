<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';

// Session, password, and sign-in limits for the LGU desk.
// Passwords are checked here on the server. The browser never receives a stored hash.
final class Auth {
    // The first version of this project hashed in the browser with this prefix.
    // It is only used to accept an old hash once and replace it with bcrypt.
    private const LEGACY_PREFIX = 'bitcas-lgu|';
    private const MAX_FAILURES = 5;
    private const WINDOW_MINUTES = 10;

    public static function start(): void {
        if (session_status() !== PHP_SESSION_NONE) {
            return;
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
        session_start();
    }

    // The signed-in desk user, read again from MySQL so a deleted or disabled account stops working at once.
    public static function user(): ?array {
        self::start();
        $stored = $_SESSION['bitcas_user'] ?? null;
        if (!is_array($stored) || empty($stored['userId'])) {
            return null;
        }
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            return null;
        }
        try {
            $stmt = $pdo->prepare(
                'SELECT id, full_name, username, role, active, must_change_password FROM users WHERE id = :id LIMIT 1'
            );
            $stmt->execute([':id' => (string)$stored['userId']]);
            $row = $stmt->fetch();
        } catch (Throwable $ignore) {
            return null;
        }
        if (!is_array($row) || (int)$row['active'] !== 1) {
            unset($_SESSION['bitcas_user']);
            return null;
        }
        return [
            'userId' => (string)$row['id'],
            'username' => (string)$row['username'],
            'fullName' => (string)$row['full_name'],
            'role' => $row['role'] === 'super_admin' ? 'super_admin' : 'traffic_desk',
            'mustChangePassword' => (int)$row['must_change_password'] === 1,
            'loginAtIso' => (string)($stored['loginAtIso'] ?? gmdate('Y-m-d\TH:i:s\Z'))
        ];
    }

    // Stops the request with 401 when nobody is signed in.
    // $writes = true also blocks accounts that still owe a password change.
    public static function requireUser(bool $writes = false): array {
        $user = self::user();
        if ($user === null) {
            self::deny(401, 'Sign in required.');
        }
        if ($writes && $user['mustChangePassword']) {
            self::deny(403, 'Change your password first.');
        }
        return $user;
    }

    public static function requireSuperAdmin(): array {
        $user = self::requireUser(true);
        if ($user['role'] !== 'super_admin') {
            self::deny(403, 'Only the super admin can do this.');
        }
        return $user;
    }

    public static function deny(int $status, string $message): void {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $message]);
        exit;
    }

    public static function login(array $row): void {
        self::start();
        session_regenerate_id(true);
        $_SESSION['bitcas_user'] = [
            'userId' => (string)$row['id'],
            'loginAtIso' => gmdate('Y-m-d\TH:i:s\Z')
        ];
    }

    public static function logout(): void {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 3600,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => (bool)$params['secure'],
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    // --- passwords ---

    public static function hashPassword(string $password): string {
        return password_hash($password, PASSWORD_BCRYPT);
    }

    public static function legacyHash(string $password): string {
        return hash('sha256', self::LEGACY_PREFIX . $password);
    }

    private static function isBcrypt(string $stored): bool {
        return strlen($stored) === 60 && strpos($stored, '$2y$') === 0;
    }

    // $row is a users row that includes id and password_hash.
    public static function verifyPassword(PDO $pdo, array $row, string $password): bool {
        $stored = (string)($row['password_hash'] ?? '');
        if (self::isBcrypt($stored)) {
            return password_verify($password, $stored);
        }
        if (!hash_equals(strtolower($stored), self::legacyHash($password))) {
            return false;
        }
        // Correct password on an old hash: store it as bcrypt now.
        $update = $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $update->execute([':hash' => self::hashPassword($password), ':id' => (string)$row['id']]);
        return true;
    }

    // Spends the same time as a real check when the username does not exist.
    public static function burnTime(string $password): void {
        password_hash($password, PASSWORD_BCRYPT);
    }

    // --- sign-in limit ---

    private static function ensureAttemptTable(PDO $pdo): void {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS login_attempts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                ip VARCHAR(45) NOT NULL,
                username VARCHAR(64) NOT NULL,
                attempted_at DATETIME NOT NULL,
                KEY idx_ip_time (ip, attempted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    public static function clientIp(): string {
        return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
    }

    public static function isLockedOut(PDO $pdo): bool {
        try {
            self::ensureAttemptTable($pdo);
            $since = gmdate('Y-m-d H:i:s', time() - self::WINDOW_MINUTES * 60);
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip AND attempted_at >= :since');
            $stmt->execute([':ip' => self::clientIp(), ':since' => $since]);
            return (int)$stmt->fetchColumn() >= self::MAX_FAILURES;
        } catch (Throwable $ignore) {
            return false;
        }
    }

    public static function recordFailure(PDO $pdo, string $username): void {
        try {
            self::ensureAttemptTable($pdo);
            $insert = $pdo->prepare(
                'INSERT INTO login_attempts (ip, username, attempted_at) VALUES (:ip, :username, :at)'
            );
            $insert->execute([
                ':ip' => self::clientIp(),
                ':username' => substr($username, 0, 64),
                ':at' => gmdate('Y-m-d H:i:s')
            ]);
            $old = $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :cutoff');
            $old->execute([':cutoff' => gmdate('Y-m-d H:i:s', time() - 86400)]);
        } catch (Throwable $ignore) {
        }
    }

    public static function clearFailures(PDO $pdo): void {
        try {
            $stmt = $pdo->prepare('DELETE FROM login_attempts WHERE ip = :ip');
            $stmt->execute([':ip' => self::clientIp()]);
        } catch (Throwable $ignore) {
        }
    }
}
