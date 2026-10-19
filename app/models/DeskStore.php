<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';

final class DeskStore {
    private const SEEDED_ADMIN_HASH = '85e507903d4c970932a88f72039b779c878bc8f7c849aeb662ceebf228e19f80';

    public static function readState(): array {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }

        self::ensureSeedAdmin($pdo);

        $users = self::fetchUsers($pdo);
        $reports = self::fetchReports($pdo);
        $officers = self::fetchOfficers($pdo);
        $assignments = self::fetchAssignments($pdo);

        return [
            'users' => $users,
            'reports' => $reports,
            'officers' => $officers,
            'assignments' => $assignments,
            'nextReportNumber' => self::nextNumber($reports, 'RPT-'),
            'nextAssignmentNumber' => self::nextNumber($assignments, 'DSP-'),
            'nextUserNumber' => max(2, self::nextNumber($users, 'USR-'))
        ];
    }

    public static function writeState(array $payload): array {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }

        $pdo->beginTransaction();
        try {
            if (isset($payload['users']) && is_array($payload['users'])) {
                self::replaceUsers($pdo, $payload['users']);
            } else {
                self::ensureSeedAdmin($pdo);
            }

            if (isset($payload['reports']) && is_array($payload['reports'])) {
                self::replaceReports($pdo, $payload['reports']);
            }

            if (isset($payload['officers']) && is_array($payload['officers'])) {
                self::replaceOfficers($pdo, $payload['officers']);
            }

            if (isset($payload['assignments']) && is_array($payload['assignments'])) {
                self::replaceAssignments($pdo, $payload['assignments']);
            }

            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        return self::readState();
    }

    private static function ensureSeedAdmin(PDO $pdo): void {
        $countStmt = $pdo->query('SELECT COUNT(*) FROM users');
        $count = $countStmt ? (int)$countStmt->fetchColumn() : 0;
        if ($count > 0) {
            return;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO users (id, full_name, username, password_hash, role, active, must_change_password, created_by, created_at_iso)
             VALUES (:id, :full_name, :username, :password_hash, :role, :active, :must_change_password, :created_by, :created_at_iso)'
        );
        $stmt->execute([
            ':id' => 'USR-1',
            ':full_name' => 'LGU Admin',
            ':username' => 'lguadmin',
            ':password_hash' => self::SEEDED_ADMIN_HASH,
            ':role' => 'super_admin',
            ':active' => 1,
            ':must_change_password' => 0,
            ':created_by' => null,
            ':created_at_iso' => gmdate('Y-m-d\TH:i:s\Z')
        ]);
    }

    private static function fetchUsers(PDO $pdo): array {
        $stmt = $pdo->query(
            'SELECT id, full_name, username, password_hash, role, active, must_change_password, created_by, created_at_iso
             FROM users
             ORDER BY created_at_iso ASC'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        return array_map(static function (array $row): array {
            return [
                'id' => (string)$row['id'],
                'fullName' => (string)$row['full_name'],
                'username' => (string)$row['username'],
                'passwordHash' => (string)$row['password_hash'],
                'role' => $row['role'] === 'super_admin' ? 'super_admin' : 'traffic_desk',
                'active' => (int)$row['active'] === 1,
                'mustChangePassword' => (int)$row['must_change_password'] === 1,
                'createdBy' => $row['created_by'] !== null ? (string)$row['created_by'] : null,
                'createdAtIso' => (string)$row['created_at_iso']
            ];
        }, $rows);
    }

    private static function fetchReports(PDO $pdo): array {
        $stmt = $pdo->query(
            'SELECT id, location, camera_id, severity, congestion_score, vehicle_count,
                    occupancy_pct, avg_speed_kph, status, lat, lng, source, context, notes,
                    false_positive, snapshot_url, created_at_iso, updated_at_iso,
                    resolved_at_iso, created_by_user_id, updated_by_user_id
             FROM reports
             ORDER BY created_at_iso DESC
             LIMIT 120'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        return array_map(static function (array $row): array {
            return [
                'id' => (string)$row['id'],
                'location' => (string)$row['location'],
                'cameraId' => $row['camera_id'] !== null ? (string)$row['camera_id'] : null,
                'severity' => (string)$row['severity'],
                'congestionScore' => (int)$row['congestion_score'],
                'vehicleCount' => (int)$row['vehicle_count'],
                'occupancyPct' => $row['occupancy_pct'] !== null ? (float)$row['occupancy_pct'] : null,
                'avgSpeedKph' => $row['avg_speed_kph'] !== null ? (float)$row['avg_speed_kph'] : null,
                'status' => (string)$row['status'],
                'lat' => (float)$row['lat'],
                'lng' => (float)$row['lng'],
                'source' => (string)$row['source'],
                'context' => (string)($row['context'] ?? ''),
                'notes' => (string)($row['notes'] ?? ''),
                'falsePositive' => (int)$row['false_positive'] === 1,
                'snapshotUrl' => $row['snapshot_url'] !== null ? (string)$row['snapshot_url'] : null,
                'createdAtIso' => (string)$row['created_at_iso'],
                'updatedAtIso' => (string)$row['updated_at_iso'],
                'resolvedAtIso' => $row['resolved_at_iso'] !== null ? (string)$row['resolved_at_iso'] : null,
                'createdByUserId' => $row['created_by_user_id'] !== null ? (string)$row['created_by_user_id'] : null,
                'updatedByUserId' => $row['updated_by_user_id'] !== null ? (string)$row['updated_by_user_id'] : null
            ];
        }, $rows);
    }

    private static function fetchOfficers(PDO $pdo): array {
        $stmt = $pdo->query(
            'SELECT id, name, full_name, rank_title, contact, radio, zone,
                    shift_start, shift_end, rest_day, status, skills_json, date_assigned
             FROM officers
             ORDER BY id ASC'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        return array_map(static function (array $row): array {
            $skills = json_decode((string)$row['skills_json'], true);
            return [
                'id' => (string)$row['id'],
                'name' => (string)$row['name'],
                'fullName' => (string)$row['full_name'],
                'rank' => (string)$row['rank_title'],
                'contact' => (string)$row['contact'],
                'radio' => (string)$row['radio'],
                'zone' => (string)$row['zone'],
                'shiftStart' => (string)$row['shift_start'],
                'shiftEnd' => (string)$row['shift_end'],
                'restDay' => (string)$row['rest_day'],
                'status' => (string)$row['status'],
                'skills' => is_array($skills) && $skills ? array_values($skills) : ['Traffic control'],
                'dateAssigned' => (string)$row['date_assigned']
            ];
        }, $rows);
    }

    private static function fetchAssignments(PDO $pdo): array {
        $stmt = $pdo->query(
            'SELECT id, report_id, officer_id, status, assigned_at_iso,
                    acknowledged_at_iso, enroute_at_iso, onscene_at_iso,
                    resolved_at_iso, field_notes, created_by_user_id, updated_by_user_id
             FROM assignments
             ORDER BY assigned_at_iso DESC'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        return array_map(static function (array $row): array {
            return [
                'id' => (string)$row['id'],
                'reportId' => (string)$row['report_id'],
                'officerId' => (string)$row['officer_id'],
                'status' => (string)$row['status'],
                'assignedAtIso' => (string)$row['assigned_at_iso'],
                'acknowledgedAtIso' => $row['acknowledged_at_iso'] !== null ? (string)$row['acknowledged_at_iso'] : null,
                'enrouteAtIso' => $row['enroute_at_iso'] !== null ? (string)$row['enroute_at_iso'] : null,
                'onsceneAtIso' => $row['onscene_at_iso'] !== null ? (string)$row['onscene_at_iso'] : null,
                'resolvedAtIso' => $row['resolved_at_iso'] !== null ? (string)$row['resolved_at_iso'] : null,
                'fieldNotes' => (string)($row['field_notes'] ?? ''),
                'createdByUserId' => $row['created_by_user_id'] !== null ? (string)$row['created_by_user_id'] : null,
                'updatedByUserId' => $row['updated_by_user_id'] !== null ? (string)$row['updated_by_user_id'] : null
            ];
        }, $rows);
    }

    private static function replaceUsers(PDO $pdo, array $users): void {
        if (!$users) {
            self::ensureSeedAdmin($pdo);
            return;
        }
        $pdo->exec('DELETE FROM users');
        $stmt = $pdo->prepare(
            'INSERT INTO users (id, full_name, username, password_hash, role, active, must_change_password, created_by, created_at_iso)
             VALUES (:id, :full_name, :username, :password_hash, :role, :active, :must_change_password, :created_by, :created_at_iso)'
        );
        foreach ($users as $user) {
            if (!is_array($user) || empty($user['id']) || empty($user['username']) || empty($user['passwordHash'])) {
                continue;
            }
            $stmt->execute([
                ':id' => (string)$user['id'],
                ':full_name' => (string)($user['fullName'] ?? $user['username']),
                ':username' => strtolower(trim((string)$user['username'])),
                ':password_hash' => (string)$user['passwordHash'],
                ':role' => ($user['role'] ?? '') === 'super_admin' ? 'super_admin' : 'traffic_desk',
                ':active' => ($user['active'] ?? true) ? 1 : 0,
                ':must_change_password' => !empty($user['mustChangePassword']) ? 1 : 0,
                ':created_by' => !empty($user['createdBy']) ? (string)$user['createdBy'] : null,
                ':created_at_iso' => (string)($user['createdAtIso'] ?? gmdate('Y-m-d\TH:i:s\Z'))
            ]);
        }
        self::ensureSeedAdmin($pdo);
    }

    private static function replaceReports(PDO $pdo, array $reports): void {
        $pdo->exec('DELETE FROM reports');
        $stmt = $pdo->prepare(
            'INSERT INTO reports (
                id, location, camera_id, severity, congestion_score, vehicle_count,
                occupancy_pct, avg_speed_kph, status, lat, lng, source, context, notes,
                false_positive, snapshot_url, created_at_iso, updated_at_iso,
                resolved_at_iso, created_by_user_id, updated_by_user_id
            ) VALUES (
                :id, :location, :camera_id, :severity, :congestion_score, :vehicle_count,
                :occupancy_pct, :avg_speed_kph, :status, :lat, :lng, :source, :context, :notes,
                :false_positive, :snapshot_url, :created_at_iso, :updated_at_iso,
                :resolved_at_iso, :created_by_user_id, :updated_by_user_id
            )'
        );
        foreach (array_slice($reports, 0, 120) as $report) {
            if (!is_array($report) || empty($report['id'])) {
                continue;
            }
            $createdAt = (string)($report['createdAtIso'] ?? gmdate('Y-m-d\TH:i:s\Z'));
            $stmt->execute([
                ':id' => (string)$report['id'],
                ':location' => (string)($report['location'] ?? 'Villamonte Street Intersection'),
                ':camera_id' => !empty($report['cameraId']) ? (string)$report['cameraId'] : null,
                ':severity' => (string)($report['severity'] ?? 'High'),
                ':congestion_score' => max(0, min(100, (int)($report['congestionScore'] ?? 0))),
                ':vehicle_count' => max(0, (int)($report['vehicleCount'] ?? 0)),
                ':occupancy_pct' => isset($report['occupancyPct']) && is_numeric($report['occupancyPct'])
                    ? (float)$report['occupancyPct']
                    : null,
                ':avg_speed_kph' => isset($report['avgSpeedKph']) && is_numeric($report['avgSpeedKph'])
                    ? (float)$report['avgSpeedKph']
                    : null,
                ':status' => (string)($report['status'] ?? 'Open'),
                ':lat' => isset($report['lat']) && is_numeric($report['lat']) ? (float)$report['lat'] : 10.6642688,
                ':lng' => isset($report['lng']) && is_numeric($report['lng']) ? (float)$report['lng'] : 122.9675934,
                ':source' => (string)($report['source'] ?? 'Vision system'),
                ':context' => (string)($report['context'] ?? ''),
                ':notes' => (string)($report['notes'] ?? ''),
                ':false_positive' => !empty($report['falsePositive']) ? 1 : 0,
                ':snapshot_url' => !empty($report['snapshotUrl']) ? (string)$report['snapshotUrl'] : null,
                ':created_at_iso' => $createdAt,
                ':updated_at_iso' => (string)($report['updatedAtIso'] ?? $createdAt),
                ':resolved_at_iso' => !empty($report['resolvedAtIso']) ? (string)$report['resolvedAtIso'] : null,
                ':created_by_user_id' => !empty($report['createdByUserId']) ? (string)$report['createdByUserId'] : null,
                ':updated_by_user_id' => !empty($report['updatedByUserId']) ? (string)$report['updatedByUserId'] : null
            ]);
        }
    }

    private static function replaceOfficers(PDO $pdo, array $officers): void {
        $pdo->exec('DELETE FROM officers');
        $stmt = $pdo->prepare(
            'INSERT INTO officers (
                id, name, full_name, rank_title, contact, radio, zone,
                shift_start, shift_end, rest_day, status, skills_json, date_assigned
            ) VALUES (
                :id, :name, :full_name, :rank_title, :contact, :radio, :zone,
                :shift_start, :shift_end, :rest_day, :status, :skills_json, :date_assigned
            )'
        );
        foreach ($officers as $officer) {
            if (!is_array($officer) || empty($officer['id'])) {
                continue;
            }
            $id = strtoupper(trim((string)$officer['id']));
            $fullName = trim((string)($officer['fullName'] ?? $officer['name'] ?? $id));
            $skills = isset($officer['skills']) && is_array($officer['skills']) && $officer['skills']
                ? array_values($officer['skills'])
                : ['Traffic control'];
            $stmt->execute([
                ':id' => $id,
                ':name' => (string)($officer['name'] ?? $fullName),
                ':full_name' => $fullName,
                ':rank_title' => (string)($officer['rank'] ?? 'Traffic Enforcer'),
                ':contact' => (string)($officer['contact'] ?? '--'),
                ':radio' => (string)($officer['radio'] ?? $id),
                ':zone' => (string)($officer['zone'] ?? 'Villamonte'),
                ':shift_start' => (string)($officer['shiftStart'] ?? '06:00'),
                ':shift_end' => (string)($officer['shiftEnd'] ?? '14:00'),
                ':rest_day' => (string)($officer['restDay'] ?? 'Sunday'),
                ':status' => (string)($officer['status'] ?? 'Available'),
                ':skills_json' => json_encode($skills, JSON_UNESCAPED_SLASHES) ?: '["Traffic control"]',
                ':date_assigned' => (string)($officer['dateAssigned'] ?? date('Y-m-d'))
            ]);
        }
    }

    private static function replaceAssignments(PDO $pdo, array $assignments): void {
        $pdo->exec('DELETE FROM assignments');
        $stmt = $pdo->prepare(
            'INSERT INTO assignments (
                id, report_id, officer_id, status, assigned_at_iso,
                acknowledged_at_iso, enroute_at_iso, onscene_at_iso,
                resolved_at_iso, field_notes, created_by_user_id, updated_by_user_id
            ) VALUES (
                :id, :report_id, :officer_id, :status, :assigned_at_iso,
                :acknowledged_at_iso, :enroute_at_iso, :onscene_at_iso,
                :resolved_at_iso, :field_notes, :created_by_user_id, :updated_by_user_id
            )'
        );
        foreach ($assignments as $assignment) {
            if (!is_array($assignment) || empty($assignment['id']) || empty($assignment['reportId']) || empty($assignment['officerId'])) {
                continue;
            }
            $assignedAt = (string)($assignment['assignedAtIso'] ?? gmdate('Y-m-d\TH:i:s\Z'));
            $stmt->execute([
                ':id' => (string)$assignment['id'],
                ':report_id' => (string)$assignment['reportId'],
                ':officer_id' => (string)$assignment['officerId'],
                ':status' => (string)($assignment['status'] ?? 'Assigned'),
                ':assigned_at_iso' => $assignedAt,
                ':acknowledged_at_iso' => !empty($assignment['acknowledgedAtIso']) ? (string)$assignment['acknowledgedAtIso'] : $assignedAt,
                ':enroute_at_iso' => !empty($assignment['enrouteAtIso']) ? (string)$assignment['enrouteAtIso'] : null,
                ':onscene_at_iso' => !empty($assignment['onsceneAtIso']) ? (string)$assignment['onsceneAtIso'] : null,
                ':resolved_at_iso' => !empty($assignment['resolvedAtIso']) ? (string)$assignment['resolvedAtIso'] : null,
                ':field_notes' => (string)($assignment['fieldNotes'] ?? ''),
                ':created_by_user_id' => !empty($assignment['createdByUserId']) ? (string)$assignment['createdByUserId'] : null,
                ':updated_by_user_id' => !empty($assignment['updatedByUserId']) ? (string)$assignment['updatedByUserId'] : null
            ]);
        }
    }

    private static function nextNumber(array $items, string $prefix): int {
        $max = 0;
        foreach ($items as $item) {
            $id = (string)($item['id'] ?? '');
            if (strpos($id, $prefix) === 0) {
                $num = (int)substr($id, strlen($prefix));
                if ($num > $max) {
                    $max = $num;
                }
            } elseif (preg_match('/(\d+)$/', $id, $matches)) {
                $num = (int)$matches[1];
                if ($num > $max) {
                    $max = $num;
                }
            }
        }
        return $max + 1;
    }
}
