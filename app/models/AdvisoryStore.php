<?php
declare(strict_types=1);

function advisory_file(): string {
    return dirname(__DIR__, 2) . '/assets/data/advisories.json';
}

function advisory_read(): array {
    $path = advisory_file();
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string)file_get_contents($path), true);
    return is_array($decoded) ? array_values(array_filter($decoded, 'is_array')) : [];
}

function advisory_write(array $list): void {
    $path = advisory_file();
    $directory = dirname($path);
    if (!is_dir($directory)) {
        mkdir($directory, 0775, true);
    }
    $encoded = json_encode(array_values($list), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        throw new RuntimeException('Could not encode advisories');
    }
    $temp = $path . '.tmp';
    if (file_put_contents($temp, $encoded . "\n", LOCK_EX) === false) {
        throw new RuntimeException('Could not write advisories');
    }
    if (is_file($path)) {
        unlink($path);
    }
    if (!rename($temp, $path)) {
        throw new RuntimeException('Could not replace advisories');
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
