<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/models/Auth.php';
require_once __DIR__ . '/../app/models/Database.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Read-only view of rows that already exist. Nothing new is stored here.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use GET']);
    exit;
}

try {
    Auth::requireUser();
    $pdo = Database::connect();
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Database unavailable');
    }

    $range = (string)($_GET['range'] ?? 'week');
    $seconds = $range === 'day' ? 86400 : 7 * 86400;
    $cutoff = time() - $seconds;

    $hours = [];
    $hoursStored = 0;
    $totalCrossings = 0;
    $busiest = null;
    $hourRows = $pdo->query(
        'SELECT recorded_at, congestion_level, congestion_score, vehicles_in_frame_avg, vehicles_in_frame_peak, crossings
         FROM traffic_hourly ORDER BY recorded_at DESC LIMIT 2160'
    );
    foreach ($hourRows ? $hourRows->fetchAll() : [] as $row) {
        $when = strtotime((string)$row['recorded_at']);
        if ($when === false || $when < $cutoff) {
            continue;
        }
        $hoursStored++;
        $level = strtoupper((string)$row['congestion_level']);
        $crossings = (int)$row['crossings'];
        $score = (float)$row['congestion_score'];
        $totalCrossings += $crossings;
        $entry = [
            'recordedAt' => (string)$row['recorded_at'],
            'level' => (string)$row['congestion_level'],
            'score' => $score,
            'vehiclesAvg' => (float)$row['vehicles_in_frame_avg'],
            'vehiclesPeak' => (int)$row['vehicles_in_frame_peak'],
            'crossings' => $crossings
        ];
        if ($busiest === null || $score > $busiest['score'] || ($score === $busiest['score'] && $crossings > $busiest['crossings'])) {
            $busiest = $entry;
        }
        // A quiet LIGHT hour with no crossings is not a congestion record.
        if (in_array($level, ['MODERATE', 'HEAVY', 'CRITICAL'], true) || $crossings > 0) {
            $hours[] = $entry;
        }
    }

    $reports = [];
    $reportRows = $pdo->query(
        'SELECT id, location, severity, congestion_score, vehicle_count, status, created_at_iso, resolved_at_iso
         FROM reports ORDER BY created_at_iso DESC LIMIT 200'
    );
    foreach ($reportRows ? $reportRows->fetchAll() : [] as $row) {
        $when = strtotime((string)$row['created_at_iso']);
        if ($when === false || $when < $cutoff) {
            continue;
        }
        $reports[] = [
            'id' => (string)$row['id'],
            'location' => (string)$row['location'],
            'severity' => (string)$row['severity'],
            'score' => (int)$row['congestion_score'],
            'vehicles' => (int)$row['vehicle_count'],
            'status' => (string)$row['status'],
            'openedAt' => (string)$row['created_at_iso'],
            'resolvedAt' => $row['resolved_at_iso'] !== null ? (string)$row['resolved_at_iso'] : null
        ];
    }

    $assignments = [];
    $assignmentRows = $pdo->query(
        'SELECT a.id, a.status, a.assigned_at_iso, a.acknowledged_at_iso, a.enroute_at_iso,
                a.onscene_at_iso, a.resolved_at_iso, a.report_id,
                o.full_name AS officer_name, r.location
         FROM assignments a
         LEFT JOIN officers o ON o.id = a.officer_id
         LEFT JOIN reports r ON r.id = a.report_id
         ORDER BY a.assigned_at_iso DESC LIMIT 200'
    );
    foreach ($assignmentRows ? $assignmentRows->fetchAll() : [] as $row) {
        $when = strtotime((string)$row['assigned_at_iso']);
        if ($when === false || $when < $cutoff) {
            continue;
        }
        $assignments[] = [
            'id' => (string)$row['id'],
            'reportId' => (string)$row['report_id'],
            'location' => (string)($row['location'] ?? ''),
            'officer' => (string)($row['officer_name'] ?? ''),
            'status' => (string)$row['status'],
            'assignedAt' => (string)$row['assigned_at_iso'],
            'acknowledgedAt' => $row['acknowledged_at_iso'] !== null ? (string)$row['acknowledged_at_iso'] : null,
            'enrouteAt' => $row['enroute_at_iso'] !== null ? (string)$row['enroute_at_iso'] : null,
            'onsceneAt' => $row['onscene_at_iso'] !== null ? (string)$row['onscene_at_iso'] : null,
            'resolvedAt' => $row['resolved_at_iso'] !== null ? (string)$row['resolved_at_iso'] : null
        ];
    }

    echo json_encode([
        'ok' => true,
        'range' => $range === 'day' ? 'day' : 'week',
        'summary' => [
            'hoursStored' => $hoursStored,
            'congestedHours' => count($hours),
            'totalCrossings' => $totalCrossings,
            'busiest' => $busiest
        ],
        'congestion' => $hours,
        'reports' => $reports,
        'assignments' => $assignments
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('logs: ' . $error->getMessage());
    $status = (int)http_response_code();
    if ($status < 400) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Server error. Try again.']);
    }
}
