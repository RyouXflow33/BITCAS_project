<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';

function advisory_read(): array {
    $pdo = Database::connect();
    if (!($pdo instanceof PDO)) {
        return [];
    }
    try {
        $stmt = $pdo->query(
            'SELECT id, level, area, message, sent_at_iso, channel, created_by_user_id
             FROM advisories
             ORDER BY sent_at_iso DESC
             LIMIT 20'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        return array_map(static function (array $row): array {
            return [
                'id' => (string)$row['id'],
                'level' => (string)$row['level'],
                'area' => (string)$row['area'],
                'message' => (string)$row['message'],
                'sentAtIso' => (string)$row['sent_at_iso'],
                'channel' => (string)$row['channel'],
                'createdByUserId' => $row['created_by_user_id'] !== null ? (string)$row['created_by_user_id'] : null
            ];
        }, $rows);
    } catch (Throwable $dbError) {
        return [];
    }
}

function advisory_write(array $list): void {
    $normalized = array_values(array_slice($list, 0, 20));
    $pdo = Database::connect();
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Database unavailable');
    }

    $pdo->beginTransaction();
    try {
        $pdo->exec('DELETE FROM advisories');
        $stmt = $pdo->prepare(
            'INSERT INTO advisories (id, level, area, message, sent_at_iso, channel, created_by_user_id)
             VALUES (:id, :level, :area, :message, :sent_at_iso, :channel, :created_by_user_id)'
        );
        foreach ($normalized as $item) {
            if (!is_array($item) || empty($item['id'])) {
                continue;
            }
            $stmt->execute([
                ':id' => (string)$item['id'],
                ':level' => (string)($item['level'] ?? 'Moderate'),
                ':area' => (string)($item['area'] ?? 'Villamonte Street Intersection'),
                ':message' => (string)($item['message'] ?? ''),
                ':sent_at_iso' => (string)($item['sentAtIso'] ?? date('c')),
                ':channel' => (string)($item['channel'] ?? 'OneSignal'),
                ':created_by_user_id' => isset($item['createdByUserId']) && $item['createdByUserId'] !== ''
                    ? (string)$item['createdByUserId']
                    : null
            ]);
        }
        $pdo->commit();
    } catch (Throwable $dbError) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $dbError;
    }
}

function advisory_push(array $advisory): array {
    $configPath = dirname(__DIR__, 2) . '/api/onesignal.local.php';
    if (!is_file($configPath)) {
        return [
            'sent' => false,
            'reason' => 'OneSignal is not configured. Copy api/onesignal.example.php to api/onesignal.local.php.'
        ];
    }

    $config = include $configPath;
    if (!is_array($config)) {
        return ['sent' => false, 'reason' => 'api/onesignal.local.php must return an array.'];
    }

    $appId = trim((string)($config['app_id'] ?? ''));
    $key = trim((string)($config['rest_api_key'] ?? ''));
    if ($appId === '' || $key === '' || strpos($appId, 'YOUR_') === 0) {
        return [
            'sent' => false,
            'reason' => 'Add the OneSignal App ID and REST API key in api/onesignal.local.php.'
        ];
    }

    $heading = $advisory['level'] . ' traffic · ' . $advisory['area'];
    $body = json_encode([
        'app_id' => $appId,
        'target_channel' => 'push',
        'included_segments' => ['Total Subscriptions'],
        'headings' => ['en' => $heading],
        'contents' => ['en' => $advisory['message']],
        'data' => [
            'id' => (string)$advisory['id'],
            'level' => (string)$advisory['level'],
            'area' => (string)$advisory['area'],
            'message' => (string)$advisory['message'],
            'sentAtIso' => (string)$advisory['sentAtIso'],
            'channel' => 'OneSignal'
        ]
    ]);

    $handle = curl_init('https://api.onesignal.com/notifications');
    if ($handle === false) {
        return ['sent' => false, 'reason' => 'PHP curl is not available.'];
    }

    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json; charset=utf-8',
            'Authorization: Key ' . $key
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_TIMEOUT => 12
    ]);

    $response = curl_exec($handle);
    $status = (int)curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $error = curl_error($handle);
    curl_close($handle);

    if ($response === false) {
        return ['sent' => false, 'reason' => $error !== '' ? $error : 'OneSignal request failed.'];
    }

    $decoded = json_decode($response, true);
    if ($status >= 200 && $status < 300 && is_array($decoded) && empty($decoded['errors'])) {
        return ['sent' => true, 'reason' => 'Sent to driver phones.'];
    }

    $detail = 'OneSignal rejected the broadcast.';
    if (is_array($decoded) && isset($decoded['errors'])) {
        $detail = is_string($decoded['errors']) ? $decoded['errors'] : json_encode($decoded['errors']);
    }
    return ['sent' => false, 'reason' => $detail];
}
