<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';

final class VisionStore {
    public static function saveLivePayload(array $payload): void {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }

        $cameraId = trim((string)($payload['camera_id'] ?? 'CAM-VILLAMONTE-01')) ?: 'CAM-VILLAMONTE-01';
        $siteName = trim((string)($payload['site_name'] ?? 'Villamonte Street Intersection'));
        $recordedAt = trim((string)($payload['timestamp'] ?? date('c')));
        $lat = isset($payload['lat']) && is_numeric($payload['lat']) ? (float)$payload['lat'] : null;
        $lng = isset($payload['lng']) && is_numeric($payload['lng']) ? (float)$payload['lng'] : null;
        $level = strtoupper(trim((string)($payload['congestion_level'] ?? 'LIGHT')));
        if (!in_array($level, ['LIGHT', 'MODERATE', 'HEAVY'], true)) {
            $level = 'LIGHT';
        }
        $score = isset($payload['congestion_score']) ? max(0, min(100, (int)$payload['congestion_score'])) : 0;
        $inFrame = isset($payload['vehicles_in_frame']) ? max(0, (int)$payload['vehicles_in_frame']) : (int)($payload['vehicle_count'] ?? 0);
        $smoothed = isset($payload['smoothed_vehicle_count']) ? (float)$payload['smoothed_vehicle_count'] : (float)$inFrame;
        $occupancy = isset($payload['occupancy_pct']) ? (float)$payload['occupancy_pct'] : 0.0;
        $speedKph = isset($payload['avg_speed_kph']) && is_numeric($payload['avg_speed_kph']) ? (float)$payload['avg_speed_kph'] : null;
        $speedCalibrated = !empty($payload['speed_calibrated']) ? 1 : 0;
        $todayTotal = isset($payload['totals']['today']) ? max(0, (int)$payload['totals']['today']) : 0;
        $snapshotUrl = isset($payload['snapshot_url']) && is_string($payload['snapshot_url']) && $payload['snapshot_url'] !== ''
            ? $payload['snapshot_url']
            : null;

        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Invalid live payload');
        }

        $stmt = $pdo->prepare(
            'REPLACE INTO camera_live (
                camera_id, site_name, recorded_at, lat, lng,
                congestion_level, congestion_score, vehicles_in_frame,
                smoothed_vehicle_count, occupancy_pct, avg_speed_kph,
                speed_calibrated, today_total, snapshot_url, payload_json
            ) VALUES (
                :camera_id, :site_name, :recorded_at, :lat, :lng,
                :congestion_level, :congestion_score, :vehicles_in_frame,
                :smoothed_vehicle_count, :occupancy_pct, :avg_speed_kph,
                :speed_calibrated, :today_total, :snapshot_url, :payload_json
            )'
        );
        $stmt->execute([
            ':camera_id' => $cameraId,
            ':site_name' => $siteName,
            ':recorded_at' => $recordedAt,
            ':lat' => $lat,
            ':lng' => $lng,
            ':congestion_level' => $level,
            ':congestion_score' => $score,
            ':vehicles_in_frame' => $inFrame,
            ':smoothed_vehicle_count' => $smoothed,
            ':occupancy_pct' => $occupancy,
            ':avg_speed_kph' => $speedKph,
            ':speed_calibrated' => $speedCalibrated,
            ':today_total' => $todayTotal,
            ':snapshot_url' => $snapshotUrl,
            ':payload_json' => $json
        ]);
    }

    public static function saveMinuteRecord(array $record): void {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }

        $cameraId = trim((string)($record['camera_id'] ?? 'CAM-VILLAMONTE-01')) ?: 'CAM-VILLAMONTE-01';
        $recordedAt = trim((string)($record['timestamp'] ?? ''));
        if ($recordedAt === '') {
            return;
        }
        $json = json_encode($record, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }

        $stmt = $pdo->prepare(
            'REPLACE INTO traffic_minute (
                camera_id, recorded_at, samples, congestion_score, congestion_level,
                peak_congestion_score, vehicles_in_frame_avg, vehicles_in_frame_peak,
                occupancy_pct, avg_speed_kph, speed_calibrated, crossings, payload_json
            ) VALUES (
                :camera_id, :recorded_at, :samples, :congestion_score, :congestion_level,
                :peak_congestion_score, :vehicles_in_frame_avg, :vehicles_in_frame_peak,
                :occupancy_pct, :avg_speed_kph, :speed_calibrated, :crossings, :payload_json
            )'
        );
        $stmt->execute([
            ':camera_id' => $cameraId,
            ':recorded_at' => $recordedAt,
            ':samples' => max(0, (int)($record['samples'] ?? 0)),
            ':congestion_score' => (float)($record['congestion_score'] ?? 0),
            ':congestion_level' => strtoupper(trim((string)($record['congestion_level'] ?? 'LIGHT'))),
            ':peak_congestion_score' => max(0, (int)($record['peak_congestion_score'] ?? 0)),
            ':vehicles_in_frame_avg' => (float)($record['vehicles_in_frame_avg'] ?? 0),
            ':vehicles_in_frame_peak' => max(0, (int)($record['vehicles_in_frame_peak'] ?? 0)),
            ':occupancy_pct' => (float)($record['occupancy_pct'] ?? 0),
            ':avg_speed_kph' => isset($record['avg_speed_kph']) && is_numeric($record['avg_speed_kph'])
                ? (float)$record['avg_speed_kph']
                : null,
            ':speed_calibrated' => !empty($record['speed_calibrated']) ? 1 : 0,
            ':crossings' => max(0, (int)($record['crossings'] ?? 0)),
            ':payload_json' => $json
        ]);
    }

    public static function saveHourlyRecord(array $record): void {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }

        $cameraId = trim((string)($record['camera_id'] ?? 'CAM-VILLAMONTE-01')) ?: 'CAM-VILLAMONTE-01';
        $recordedAt = trim((string)($record['timestamp'] ?? ''));
        if ($recordedAt === '') {
            return;
        }
        $json = json_encode($record, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }

        $stmt = $pdo->prepare(
            'REPLACE INTO traffic_hourly (
                camera_id, recorded_at, weekday, hour, samples, congestion_score,
                congestion_level, peak_congestion_score, vehicles_in_frame_avg,
                vehicles_in_frame_peak, occupancy_pct, avg_speed_kph,
                speed_calibrated, crossings, payload_json
            ) VALUES (
                :camera_id, :recorded_at, :weekday, :hour, :samples, :congestion_score,
                :congestion_level, :peak_congestion_score, :vehicles_in_frame_avg,
                :vehicles_in_frame_peak, :occupancy_pct, :avg_speed_kph,
                :speed_calibrated, :crossings, :payload_json
            )'
        );
        $stmt->execute([
            ':camera_id' => $cameraId,
            ':recorded_at' => $recordedAt,
            ':weekday' => max(0, min(6, (int)($record['weekday'] ?? 0))),
            ':hour' => max(0, min(23, (int)($record['hour'] ?? 0))),
            ':samples' => max(0, (int)($record['samples'] ?? 0)),
            ':congestion_score' => (float)($record['congestion_score'] ?? 0),
            ':congestion_level' => strtoupper(trim((string)($record['congestion_level'] ?? 'LIGHT'))),
            ':peak_congestion_score' => max(0, (int)($record['peak_congestion_score'] ?? 0)),
            ':vehicles_in_frame_avg' => (float)($record['vehicles_in_frame_avg'] ?? 0),
            ':vehicles_in_frame_peak' => max(0, (int)($record['vehicles_in_frame_peak'] ?? 0)),
            ':occupancy_pct' => (float)($record['occupancy_pct'] ?? 0),
            ':avg_speed_kph' => isset($record['avg_speed_kph']) && is_numeric($record['avg_speed_kph'])
                ? (float)$record['avg_speed_kph']
                : null,
            ':speed_calibrated' => !empty($record['speed_calibrated']) ? 1 : 0,
            ':crossings' => max(0, (int)($record['crossings'] ?? 0)),
            ':payload_json' => $json
        ]);
    }

    public static function saveSnapshotRecord(
        string $cameraId,
        string $level,
        int $score,
        int $vehiclesInFrame,
        string $snapshotUrl,
        string $capturedAt
    ): void {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            return;
        }
        $stmt = $pdo->prepare(
            'REPLACE INTO snapshots (camera_id, congestion_level, congestion_score, vehicles_in_frame, snapshot_url, captured_at)
             VALUES (:camera_id, :congestion_level, :congestion_score, :vehicles_in_frame, :snapshot_url, :captured_at)'
        );
        $stmt->execute([
            ':camera_id' => $cameraId ?: 'CAM-VILLAMONTE-01',
            ':congestion_level' => $level ?: 'HEAVY',
            ':congestion_score' => max(0, min(100, $score)),
            ':vehicles_in_frame' => max(0, $vehiclesInFrame),
            ':snapshot_url' => $snapshotUrl,
            ':captured_at' => $capturedAt ?: date('c')
        ]);
    }

    public static function latestLivePayload(): ?array {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            return null;
        }
        try {
            $stmt = $pdo->query('SELECT payload_json FROM camera_live ORDER BY updated_at DESC LIMIT 1');
            $row = $stmt ? $stmt->fetch() : false;
            if (is_array($row) && !empty($row['payload_json'])) {
                $decoded = json_decode((string)$row['payload_json'], true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        } catch (Throwable $dbError) {
            return null;
        }
        return null;
    }

    public static function historyLines(string $kind = 'minute', int $limit = 2880): array {
        $isHourly = $kind === 'hourly';
        $table = $isHourly ? 'traffic_hourly' : 'traffic_minute';

        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            return [];
        }

        $rows = [];
        try {
            $stmt = $pdo->prepare(
                sprintf('SELECT payload_json FROM %s ORDER BY recorded_at DESC LIMIT :lim', $table)
            );
            $stmt->bindValue(':lim', max(1, $limit), PDO::PARAM_INT);
            $stmt->execute();
            $fetched = $stmt->fetchAll();
            if ($fetched) {
                $fetched = array_reverse($fetched);
                foreach ($fetched as $row) {
                    if (!empty($row['payload_json'])) {
                        $rows[] = (string)$row['payload_json'];
                    }
                }
            }
        } catch (Throwable $dbError) {
            return [];
        }

        return $rows;
    }
}
