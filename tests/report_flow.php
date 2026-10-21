<?php
declare(strict_types=1);

// Integration test: a HEAVY snapshot upload from the Pi opens exactly one congestion report,
// even when no dashboard is open. LOCAL ONLY: it writes to the local test database and deletes
// its own rows afterwards.
//
//   1. Start local MySQL and the app:  php -S 127.0.0.1:8089   (from the project folder)
//   2. Run:                            php tests/report_flow.php http://127.0.0.1:8089
//
// It reads the ingest key from api/database.local.php and never prints it.

if (PHP_SAPI !== 'cli') {
    exit("Run from the command line.\n");
}

require_once __DIR__ . '/../app/models/DeskStore.php';

$base = rtrim((string)($argv[1] ?? 'http://127.0.0.1:8089'), '/');
$host = (string)parse_url($base, PHP_URL_HOST);
if (!in_array($host, ['127.0.0.1', 'localhost'], true)) {
    exit("Refusing to run against $host. This test writes to the database it talks to, so it is local only.\n");
}

$key = (string)(Database::config()['ingest_api_key'] ?? '');
if ($key === '') {
    exit("No ingest key is configured locally (api/database.local.php).\n");
}
$pdo = Database::connect();
if (!($pdo instanceof PDO)) {
    exit("Local database is not running.\n");
}

const TEST_CAMERA = 'CAM-SMOKE-01';

function post(string $url, array $headers, $body): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => 20]);
    $out = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, json_decode((string)$out, true)];
}

function upload(string $base, string $key, string $level, string $name): array {
    $tmp = tempnam(sys_get_temp_dir(), 'jpg');
    file_put_contents($tmp, "\xFF\xD8\xFF\xE0" . str_repeat("\x00", 120) . "\xFF\xD9");
    $result = post("$base/api/upload_snapshot.php", ['X-API-Key: ' . $key], [
        'camera_id' => TEST_CAMERA, 'congestion_level' => $level, 'congestion_score' => '72',
        'vehicles_in_frame' => '7', 'captured_at' => date('c'), 'filename' => $name,
        'snapshot' => new CURLFile($tmp, 'image/jpeg', $name)
    ]);
    unlink($tmp);
    return $result;
}

$fail = 0;
function check(string $name, bool $ok, string $detail = ''): void {
    global $fail;
    echo ($ok ? '  PASS  ' : '  FAIL  ') . $name . ($ok ? '' : "  ($detail)") . "\n";
    if (!$ok) {
        $fail++;
    }
}

$heavyName = 'heavy_' . date('Ymd_His') . '.jpg';
$lightName = 'heavy_' . date('Ymd_His', time() + 1) . '.jpg';

echo "HEAVY snapshot opens one report\n";
[$status] = post("$base/api/save_data.php", ['Content-Type: application/json', 'X-API-Key: ' . $key], json_encode([
    'camera_id' => TEST_CAMERA, 'site_name' => 'Smoke Site', 'timestamp' => date('Y-m-d\TH:i:s'),
    'lat' => 10.5, 'lng' => 122.9, 'congestion_level' => 'HEAVY', 'congestion_score' => 72,
    'vehicles_in_frame' => 7, 'occupancy_pct' => 41.5, 'totals' => ['today' => 1]
]));
check('live reading stored', $status === 200, "status $status");

[$status, $reply] = upload($base, $key, 'HEAVY', $heavyName);
check('HEAVY upload accepted', $status === 200 && !empty($reply['ok']), json_encode($reply));
$id = (string)($reply['report_id'] ?? '');
check('a report id came back', strpos($id, 'RPT-') === 0, json_encode($reply));

$stmt = $pdo->prepare('SELECT * FROM reports WHERE id = :id');
$stmt->execute([':id' => $id]);
$row = $stmt->fetch();
check('report row exists with source Vision system', is_array($row) && $row['source'] === 'Vision system');
check('report copied site name, position and occupancy', is_array($row) && $row['location'] === 'Smoke Site' && abs((float)$row['lat'] - 10.5) < 0.001 && abs((float)$row['occupancy_pct'] - 41.5) < 0.01);
check('report is Open, High severity, score 72, 7 vehicles', is_array($row) && $row['status'] === 'Open' && $row['severity'] === 'High' && (int)$row['congestion_score'] === 72 && (int)$row['vehicle_count'] === 7);
check('report keeps the snapshot link', is_array($row) && $row['snapshot_url'] === 'assets/snapshots/' . $heavyName);

echo "\nRepeats and other levels\n";
[, $again] = upload($base, $key, 'HEAVY', $heavyName);
check('same snapshot again returns the same report', ($again['report_id'] ?? '') === $id, json_encode($again));
$count = $pdo->prepare('SELECT COUNT(*) FROM reports WHERE snapshot_url = :url');
$count->execute([':url' => 'assets/snapshots/' . $heavyName]);
check('still exactly one report for that snapshot', (int)$count->fetchColumn() === 1);

[$status, $light] = upload($base, $key, 'LIGHT', $lightName);
check('a LIGHT upload opens no report', $status === 200 && array_key_exists('report_id', $light) && $light['report_id'] === null, json_encode($light));

// Remove everything this test created.
$pdo->prepare('DELETE FROM reports WHERE snapshot_url IN (:a, :b)')->execute([':a' => 'assets/snapshots/' . $heavyName, ':b' => 'assets/snapshots/' . $lightName]);
$pdo->prepare('DELETE FROM snapshots WHERE camera_id = :c')->execute([':c' => TEST_CAMERA]);
$pdo->prepare('DELETE FROM camera_live WHERE camera_id = :c')->execute([':c' => TEST_CAMERA]);
foreach ([$heavyName, $lightName] as $file) {
    @unlink(__DIR__ . '/../assets/snapshots/' . $file);
}

echo $fail ? "\n$fail failed\n" : "\nall checks passed\n";
exit($fail ? 1 : 0);
