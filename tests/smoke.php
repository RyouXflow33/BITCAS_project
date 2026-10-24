<?php
declare(strict_types=1);

// Smoke test for the BITCAS web API. It only sends requests, so it works against local XAMPP or Hostinger.
//
//   php tests/smoke.php http://localhost/BITCAS_UI_Skeleton
//   php tests/smoke.php https://your-site.example --blocked
//
// Optional full sign-in check (use a throwaway super admin, never your real one):
//   set SMOKE_USER=name and SMOKE_PASSWORD=value before running.
//
// --blocked also checks that private folders cannot be opened by URL.
// Do not use --blocked with `php -S`, which ignores .htaccess.

if (PHP_SAPI !== 'cli') {
    exit("Run from the command line.\n");
}

$base = rtrim((string)($argv[1] ?? 'http://localhost/BITCAS_UI_Skeleton'), '/');
$checkBlocked = in_array('--blocked', $argv, true);
$user = (string)(getenv('SMOKE_USER') ?: '');
$password = (string)(getenv('SMOKE_PASSWORD') ?: '');

$jar = tempnam(sys_get_temp_dir(), 'bitcas_smoke_');
$passed = 0;
$failed = 0;

function request(string $method, string $url, ?array $json = null, bool $useJar = true): array {
    global $jar;
    $headerLines = [];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $json !== null ? ['Content-Type: application/json'] : [],
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$headerLines): int {
            $headerLines[] = trim($line);
            return strlen($line);
        }
    ]);
    if ($useJar) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $jar);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $jar);
    }
    if ($json !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json));
    }
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    return ['status' => $status, 'body' => (string)$body, 'json' => is_array($decoded) ? $decoded : null, 'headers' => $headerLines];
}

function check(string $name, bool $ok, string $detail = ''): void {
    global $passed, $failed;
    if ($ok) {
        $passed++;
        echo "  PASS  $name\n";
    } else {
        $failed++;
        echo "  FAIL  $name" . ($detail !== '' ? "  ($detail)" : '') . "\n";
    }
}

echo "BITCAS smoke test against $base\n\n";

echo "Public reads\n";
$live = request('GET', "$base/api/get_live.php", null, false);
check('get_live answers 200 or 404 with JSON', in_array($live['status'], [200, 404], true) && $live['json'] !== null, 'status ' . $live['status']);
$adv = request('GET', "$base/api/advisories.php", null, false);
check('advisories list is readable without signing in', $adv['status'] === 200 && is_array($adv['json']), 'status ' . $adv['status']);

echo "\nNothing is writable or readable without a session\n";
$r = request('GET', "$base/api/desk_state.php", null, false);
check('desk_state GET needs sign-in (401)', $r['status'] === 401, 'status ' . $r['status']);
check('desk_state GET leaks no password hash', stripos($r['body'], 'passwordHash') === false && stripos($r['body'], 'password_hash') === false);
$r = request('POST', "$base/api/desk_state.php", ['basedOnServerState' => true, 'reports' => []], false);
check('desk_state POST needs sign-in (401)', $r['status'] === 401, 'status ' . $r['status']);
$r = request('POST', "$base/api/desk_users.php", ['action' => 'create', 'fullName' => 'X', 'username' => 'xxx', 'password' => 'password1'], false);
check('desk_users create needs sign-in (401)', $r['status'] === 401, 'status ' . $r['status']);
$r = request('POST', "$base/api/advisories.php", ['action' => 'broadcast', 'level' => 'Low', 'area' => 'Test', 'message' => 'Test'], false);
check('advisory broadcast needs sign-in (401)', $r['status'] === 401, 'status ' . $r['status']);
$r = request('POST', "$base/api/advisories.php", ['action' => 'clear'], false);
check('advisory clear needs sign-in (401)', $r['status'] === 401, 'status ' . $r['status']);

echo "\nSign-in cannot be forged\n";
$r = request('POST', "$base/api/auth.php", ['action' => 'sync', 'session' => ['userId' => 'USR-1', 'username' => 'lguadmin', 'role' => 'super_admin']], false);
check('auth sync action no longer exists (400)', $r['status'] === 400, 'status ' . $r['status']);
$r = request('GET', "$base/api/auth.php", null, true);
check('after the forged sync there is still no session', is_array($r['json']) && array_key_exists('session', $r['json']) && $r['json']['session'] === null);
$r = request('POST', "$base/api/auth.php", ['action' => 'login', 'username' => 'nobody', 'passwordHash' => str_repeat('a', 64)], false);
check('a bare hash cannot log in (401 or 429)', in_array($r['status'], [401, 429], true), 'status ' . $r['status']);

echo "\nRegistration limits\n";
$r = request('POST', "$base/api/auth.php", ['action' => 'register', 'fullName' => 'Juan1', 'username' => 'juanreg', 'password' => 'Temp-pass-123'], false);
check('a name with a number is refused (422)', $r['status'] === 422, 'status ' . $r['status']);
$r = request('POST', "$base/api/auth.php", ['action' => 'register', 'fullName' => str_repeat('A', 61), 'username' => 'juanreg', 'password' => 'Temp-pass-123'], false);
check('a name over 60 characters is refused (422)', $r['status'] === 422, 'status ' . $r['status']);
$r = request('POST', "$base/api/auth.php", ['action' => 'register', 'fullName' => 'Juan Reg', 'username' => 'juanreg', 'password' => 'short'], false);
check('a short password is refused (422)', $r['status'] === 422, 'status ' . $r['status']);

echo "\nIngest key\n";
$r = request('POST', "$base/api/save_data.php", ['camera_id' => 'SMOKE'], false);
check('save_data without the key is refused (401)', $r['status'] === 401, 'status ' . $r['status']);
$r = request('POST', "$base/api/upload_snapshot.php", [], false);
check('upload_snapshot without the key is refused (401)', $r['status'] === 401, 'status ' . $r['status']);

if ($checkBlocked) {
    echo "\nPrivate files cannot be opened by URL\n";
    foreach (['/app/models/schema.sql', '/app/models/Auth.php', '/api/database.local.php', '/api/onesignal.local.php', '/vision/traffic_vision.py', '/.git/HEAD'] as $path) {
        $r = request('GET', $base . $path, null, false);
        check("$path is blocked", in_array($r['status'], [403, 404], true), 'status ' . $r['status']);
    }
}

if ($user !== '' && $password !== '') {
    echo "\nFull sign-in flow (as $user)\n";
    $r = request('POST', "$base/api/auth.php", ['action' => 'login', 'username' => $user, 'password' => 'wrong-password-for-test'], true);
    check('wrong password is refused', in_array($r['status'], [401, 429], true), 'status ' . $r['status']);
    if ($r['status'] === 429) {
        echo "  (locked out by earlier failures, wait 10 minutes and run again)\n";
    } else {
        $r = request('POST', "$base/api/auth.php", ['action' => 'login', 'username' => $user, 'password' => $password], true);
        check('correct password signs in', $r['status'] === 200 && !empty($r['json']['ok']), 'status ' . $r['status']);
        check('login reply has no password hash', stripos($r['body'], 'hash') === false);
        $cookie = '';
        foreach ($r['headers'] as $line) {
            if (stripos($line, 'set-cookie:') === 0) {
                $cookie = $line;
            }
        }
        check('session cookie is HttpOnly', stripos($cookie, 'httponly') !== false, $cookie);
        check('session cookie is SameSite', stripos($cookie, 'samesite') !== false, $cookie);

        $r = request('GET', "$base/api/desk_state.php", null, true);
        check('desk_state readable once signed in', $r['status'] === 200 && !empty($r['json']['ok']), 'status ' . $r['status']);
        check('desk_state still has no password hash', stripos($r['body'], 'passwordHash') === false);

        $tempName = 'smoke' . substr(bin2hex(random_bytes(4)), 0, 6);
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'create', 'fullName' => 'Smoke Test', 'username' => $tempName, 'password' => 'Temp-pass-123'], true);
        $created = $r['json']['user']['id'] ?? '';
        check('super admin can create a desk account', $r['status'] === 200 && $created !== '', 'status ' . $r['status'] . ' ' . $r['body']);
        check('created account reply has no password hash', stripos($r['body'], 'hash') === false);

        $r = request('POST', "$base/api/desk_users.php", ['action' => 'create', 'fullName' => 'Dup', 'username' => $tempName, 'password' => 'Temp-pass-123'], true);
        check('duplicate username is refused', $r['status'] === 422, 'status ' . $r['status']);

        // Sign in as the new account: it must change its password before it can write.
        $tempJar = tempnam(sys_get_temp_dir(), 'bitcas_smoke2_');
        $first = $jar;
        $jar = $tempJar;
        $r = request('POST', "$base/api/auth.php", ['action' => 'login', 'username' => $tempName, 'password' => 'Temp-pass-123'], true);
        check('new account signs in with its temporary password', $r['status'] === 200, 'status ' . $r['status']);
        $r = request('POST', "$base/api/advisories.php", ['action' => 'broadcast', 'level' => 'Low', 'area' => 'Test', 'message' => 'Should be blocked'], true);
        check('account that owes a password change cannot broadcast (403)', $r['status'] === 403, 'status ' . $r['status']);
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'create', 'fullName' => 'Nope', 'username' => 'nopeuser', 'password' => 'Temp-pass-123'], true);
        check('desk account cannot create accounts (403)', $r['status'] === 403, 'status ' . $r['status']);
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'change_password', 'currentPassword' => 'Temp-pass-123', 'newPassword' => 'Changed-pass-456'], true);
        check('account can change its own password', $r['status'] === 200, 'status ' . $r['status']);
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'set_active', 'userId' => $created, 'active' => false], true);
        check('desk account cannot disable accounts (403)', $r['status'] === 403, 'status ' . $r['status']);
        $jar = $first;
        @unlink($tempJar);

        $regName = 'smoke' . substr(bin2hex(random_bytes(3)), 0, 6);
        $r = request('POST', "$base/api/auth.php", ['action' => 'register', 'fullName' => 'Smoke Register', 'username' => $regName, 'password' => 'Temp-pass-123'], true);
        $registeredId = $r['json']['user']['id'] ?? '';
        check('public register creates an inactive account', $r['status'] === 200 && $registeredId !== '' && ($r['json']['user']['active'] ?? true) === false, 'status ' . $r['status']);
        $regJar = tempnam(sys_get_temp_dir(), 'bitcas_smoke3_');
        $adminJar = $jar;
        $jar = $regJar;
        $r = request('POST', "$base/api/auth.php", ['action' => 'login', 'username' => $regName, 'password' => 'Temp-pass-123'], true);
        check('inactive account cannot sign in (403)', $r['status'] === 403, 'status ' . $r['status']);
        $jar = $adminJar;
        @unlink($regJar);
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'set_active', 'userId' => $registeredId, 'active' => true], true);
        check('super admin can enable the registered account', $r['status'] === 200 && !empty($r['json']['user']['active']), 'status ' . $r['status']);
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'delete', 'userId' => $registeredId], true);
        check('super admin can delete the registered account', $r['status'] === 200, 'status ' . $r['status']);

        $r = request('POST', "$base/api/desk_users.php", ['action' => 'delete', 'userId' => $created], true);
        check('super admin can delete the test account', $r['status'] === 200, 'status ' . $r['status']);
        $me = request('GET', "$base/api/auth.php", null, true);
        $meId = $me['json']['session']['userId'] ?? '';
        $r = request('POST', "$base/api/desk_users.php", ['action' => 'delete', 'userId' => $meId], true);
        check('super admin cannot delete their own account', $r['status'] === 422, 'status ' . $r['status']);

        request('POST', "$base/api/auth.php", ['action' => 'logout'], true);
        $r = request('GET', "$base/api/desk_state.php", null, true);
        check('after logout the desk is closed again (401)', $r['status'] === 401, 'status ' . $r['status']);
    }
} else {
    echo "\n(Skipping the full sign-in flow. Set SMOKE_USER and SMOKE_PASSWORD to include it.)\n";
}

@unlink($jar);
echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
