<?php
declare(strict_types=1);

final class Database {
    private static ?PDO $pdo = null;
    private static bool $failed = false;

    public static function config(): array {
        $defaults = [
            'host' => '127.0.0.1',
            'port' => 3306,
            'database' => 'u260832388_bitcas_db',
            'username' => 'u260832388_bitcas',
            'password' => '',
            'ingest_api_key' => ''
        ];
        $localPath = dirname(__DIR__, 2) . '/api/database.local.php';
        if (is_file($localPath)) {
            $loaded = include $localPath;
            if (is_array($loaded)) {
                $defaults = array_merge($defaults, $loaded);
            }
        }
        return $defaults;
    }

    public static function connect(): ?PDO {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        if (self::$failed) {
            return null;
        }

        $cfg = self::config();
        $host = (string)$cfg['host'];
        $port = (int)($cfg['port'] ?? 3306);
        $dbName = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$cfg['database']) ?: 'bitcas_db';
        $user = (string)$cfg['username'];
        $pass = (string)$cfg['password'];

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ];

        $pdo = null;
        try {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
            $pdo = new PDO($dsn, $user, $pass, $options);
        } catch (PDOException $firstError) {
            try {
                // Local XAMPP fallback when running on the laptop before uploading to Hostinger.
                $localDb = 'bitcas_db';
                $serverDsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $host, $port);
                $bootstrap = new PDO($serverDsn, 'root', '', $options);
                $bootstrap->exec(sprintf(
                    'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
                    $localDb
                ));
                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $localDb);
                $pdo = new PDO($dsn, 'root', '', $options);
            } catch (Throwable $secondError) {
                self::$failed = true;
                return null;
            }
        }

        try {
            self::ensureSchema($pdo);
        } catch (Throwable $schemaError) {
            // Keep connection alive even if a restricted host disallows DDL.
        }

        self::$pdo = $pdo;
        return self::$pdo;
    }

    public static function verifyIngestKey(?string $provided): bool {
        $cfg = self::config();
        $expected = trim((string)($cfg['ingest_api_key'] ?? ''));
        if ($expected === '' || $expected === 'CHANGE_THIS_INGEST_KEY') {
            return false;
        }
        return is_string($provided) && hash_equals($expected, trim($provided));
    }

    private static function ensureSchema(PDO $pdo): void {
        $check = $pdo->query("SHOW TABLES LIKE 'camera_live'");
        if ($check && $check->fetchColumn()) {
            return;
        }
        $sqlPath = __DIR__ . '/schema.sql';
        if (!is_file($sqlPath)) {
            return;
        }
        $sql = (string)file_get_contents($sqlPath);
        foreach (explode(';', $sql) as $statement) {
            $trimmed = trim($statement);
            if ($trimmed === '') {
                continue;
            }
            $pdo->exec($trimmed);
        }
    }
}
