<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';

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
            // Accounts are never written from this list. They change only through the
            // signed-in actions in api/desk_users.php, so a stale page cannot erase them.
            self::ensureSeedAdmin($pdo);

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

    public static function ensureSeedAdmin(PDO $pdo): void {
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
            'SELECT id, full_name, username, role, active, must_change_password, created_by, created_at_iso
             FROM users
             ORDER BY created_at_iso ASC'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        return array_map(static function (array $row): array {
            return [
                'id' => (string)$row['id'],
                'fullName' => (string)$row['full_name'],
                'username' => (string)$row['username'],
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

    // --- desk accounts: one action at a time, checked on the server ---
    // Each method throws InvalidArgumentException with a message the desk can show.

    public static function createUser(string $fullName, string $username, string $password, ?string $createdBy): array {
        $fullName = trim($fullName);
        $username = strtolower(trim($username));
        if ($fullName === '' || strlen($fullName) > 120) {
            throw new InvalidArgumentException('Full name is required.');
        }
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
            throw new InvalidArgumentException('Username must be 3-32 characters: letters, numbers, dot, dash, or underscore.');
        }
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('Temporary password must be at least 8 characters.');
        }

        $pdo = self::pdo();
        self::ensureSeedAdmin($pdo);
        $exists = $pdo->prepare('SELECT 1 FROM users WHERE username = :username LIMIT 1');
        $exists->execute([':username' => $username]);
        if ($exists->fetchColumn()) {
            throw new InvalidArgumentException('That username is already in use.');
        }

        $max = $pdo->query("SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) FROM users WHERE id LIKE 'USR-%'");
        $id = 'USR-' . (((int)($max ? $max->fetchColumn() : 0)) + 1);

        $insert = $pdo->prepare(
            'INSERT INTO users (id, full_name, username, password_hash, role, active, must_change_password, created_by, created_at_iso)
             VALUES (:id, :full_name, :username, :password_hash, :role, 1, 1, :created_by, :created_at_iso)'
        );
        $insert->execute([
            ':id' => $id,
            ':full_name' => $fullName,
            ':username' => $username,
            ':password_hash' => Auth::hashPassword($password),
            ':role' => 'traffic_desk',
            ':created_by' => $createdBy,
            ':created_at_iso' => gmdate('Y-m-d\TH:i:s\Z')
        ]);
        return self::publicUserById($pdo, $id);
    }

    public static function resetPassword(string $userId, string $password): array {
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('Temporary password must be at least 8 characters.');
        }
        $pdo = self::pdo();
        self::requireUserRow($pdo, $userId);
        $update = $pdo->prepare('UPDATE users SET password_hash = :hash, must_change_password = 1 WHERE id = :id');
        $update->execute([':hash' => Auth::hashPassword($password), ':id' => $userId]);
        return self::publicUserById($pdo, $userId);
    }

    public static function changeOwnPassword(string $userId, string $current, string $next): array {
        if (strlen($next) < 8) {
            throw new InvalidArgumentException('New password must be at least 8 characters.');
        }
        $pdo = self::pdo();
        $row = self::requireUserRow($pdo, $userId);
        if (!Auth::verifyPassword($pdo, $row, $current)) {
            throw new InvalidArgumentException('Current password does not match.');
        }
        $update = $pdo->prepare('UPDATE users SET password_hash = :hash, must_change_password = 0 WHERE id = :id');
        $update->execute([':hash' => Auth::hashPassword($next), ':id' => $userId]);
        return self::publicUserById($pdo, $userId);
    }

    public static function setActive(string $userId, bool $active, string $actorId): array {
        $pdo = self::pdo();
        $row = self::requireUserRow($pdo, $userId);
        if (!$active) {
            if ($userId === $actorId) {
                throw new InvalidArgumentException('You cannot disable the account you are using.');
            }
            if ($row['role'] === 'super_admin' && self::otherActiveAdmins($pdo, $userId) < 1) {
                throw new InvalidArgumentException('Keep at least one active super admin.');
            }
        }
        $update = $pdo->prepare('UPDATE users SET active = :active WHERE id = :id');
        $update->execute([':active' => $active ? 1 : 0, ':id' => $userId]);
        return self::publicUserById($pdo, $userId);
    }

    public static function deleteUser(string $userId, string $actorId): void {
        $pdo = self::pdo();
        $row = self::requireUserRow($pdo, $userId);
        if ($userId === $actorId) {
            throw new InvalidArgumentException('You cannot delete the account you are using.');
        }
        if ($row['role'] === 'super_admin' && self::otherActiveAdmins($pdo, $userId) < 1) {
            throw new InvalidArgumentException('Keep at least one super admin.');
        }
        $delete = $pdo->prepare('DELETE FROM users WHERE id = :id');
        $delete->execute([':id' => $userId]);
    }

    // Opens the congestion report for a HEAVY snapshot. The Pi upload calls this, so a report
    // exists even when nobody has the desk open. One report per snapshot_url.
    // Returns the report id, or null when the level is not HEAVY.
    public static function createVisionReport(
        string $cameraId,
        string $level,
        int $score,
        int $vehiclesInFrame,
        string $snapshotUrl
    ): ?string {
        if (strtoupper($level) !== 'HEAVY') {
            return null;
        }
        $pdo = self::pdo();

        $existing = $pdo->prepare('SELECT id FROM reports WHERE snapshot_url = :url LIMIT 1');
        $existing->execute([':url' => $snapshotUrl]);
        $found = $existing->fetchColumn();
        if ($found) {
            return (string)$found;
        }

        // Site details come from the latest live reading for this camera.
        $live = $pdo->prepare(
            'SELECT site_name, lat, lng, occupancy_pct, avg_speed_kph, speed_calibrated
             FROM camera_live WHERE camera_id = :camera LIMIT 1'
        );
        $live->execute([':camera' => $cameraId]);
        $site = $live->fetch();
        $site = is_array($site) ? $site : [];

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $pdo->beginTransaction();
        try {
            $max = $pdo->query("SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) FROM reports WHERE id LIKE 'RPT-%' FOR UPDATE");
            $id = 'RPT-' . (((int)($max ? $max->fetchColumn() : 0)) + 1);

            $insert = $pdo->prepare(
                'INSERT INTO reports (
                    id, location, camera_id, severity, congestion_score, vehicle_count,
                    occupancy_pct, avg_speed_kph, status, lat, lng, source, context, notes,
                    false_positive, snapshot_url, created_at_iso, updated_at_iso,
                    resolved_at_iso, created_by_user_id, updated_by_user_id
                ) VALUES (
                    :id, :location, :camera_id, :severity, :score, :vehicles,
                    :occupancy, :speed, :status, :lat, :lng, :source, :context, :notes,
                    0, :snapshot_url, :created_at, :updated_at,
                    NULL, NULL, NULL
                )'
            );
            $insert->execute([
                ':id' => $id,
                ':location' => (string)($site['site_name'] ?? 'Villamonte Street Intersection'),
                ':camera_id' => $cameraId,
                ':severity' => 'High',
                ':score' => max(0, min(100, $score)),
                ':vehicles' => max(0, $vehiclesInFrame),
                ':occupancy' => isset($site['occupancy_pct']) ? (float)$site['occupancy_pct'] : null,
                ':speed' => !empty($site['speed_calibrated']) && $site['avg_speed_kph'] !== null
                    ? (float)$site['avg_speed_kph']
                    : null,
                ':status' => 'Open',
                ':lat' => isset($site['lat']) ? (float)$site['lat'] : 10.6642688,
                ':lng' => isset($site['lng']) ? (float)$site['lng'] : 122.9675934,
                ':source' => 'Vision system',
                ':context' => sprintf(
                    'Automatically generated: HEAVY congestion (score %d) persisted for three reporting intervals.',
                    max(0, min(100, $score))
                ),
                ':notes' => '',
                ':snapshot_url' => $snapshotUrl,
                ':created_at' => $now,
                ':updated_at' => $now
            ]);

            // Keep the newest 500 reports and drop dispatch rows that pointed at removed ones.
            $pdo->exec(
                'DELETE FROM reports WHERE id IN (
                    SELECT id FROM (
                        SELECT id FROM reports ORDER BY created_at_iso DESC LIMIT 18446744073709551615 OFFSET 500
                    ) AS old_reports
                )'
            );
            $pdo->exec('DELETE FROM assignments WHERE report_id NOT IN (SELECT id FROM reports)');

            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        return $id;
    }

    // Used only by api/auth.php. Returns the stored hash, so it must never be echoed.
    public static function findUserRowByUsername(PDO $pdo, string $username): ?array {
        $stmt = $pdo->prepare(
            'SELECT id, full_name, username, password_hash, role, active, must_change_password, created_by, created_at_iso
             FROM users WHERE username = :username LIMIT 1'
        );
        $stmt->execute([':username' => strtolower(trim($username))]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    public static function publicUser(array $row): array {
        return [
            'id' => (string)$row['id'],
            'fullName' => (string)$row['full_name'],
            'username' => (string)$row['username'],
            'role' => $row['role'] === 'super_admin' ? 'super_admin' : 'traffic_desk',
            'active' => (int)$row['active'] === 1,
            'mustChangePassword' => (int)$row['must_change_password'] === 1,
            'createdBy' => $row['created_by'] !== null ? (string)$row['created_by'] : null,
            'createdAtIso' => (string)$row['created_at_iso']
        ];
    }

    private static function pdo(): PDO {
        $pdo = Database::connect();
        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('Database unavailable');
        }
        return $pdo;
    }

    private static function requireUserRow(PDO $pdo, string $userId): array {
        $stmt = $pdo->prepare(
            'SELECT id, full_name, username, password_hash, role, active, must_change_password, created_by, created_at_iso
             FROM users WHERE id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        if (!is_array($row)) {
            throw new InvalidArgumentException('Account not found.');
        }
        return $row;
    }

    private static function publicUserById(PDO $pdo, string $userId): array {
        return self::publicUser(self::requireUserRow($pdo, $userId));
    }

    private static function otherActiveAdmins(PDO $pdo, string $exceptId): int {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND active = 1 AND id <> :id");
        $stmt->execute([':id' => $exceptId]);
        return (int)$stmt->fetchColumn();
    }

    private static function replaceReports(PDO $pdo, array $reports): void {
        // Insert or update by id. Nothing is deleted here, so a page that has not yet seen a
        // report the camera just opened cannot erase it.
        $stmt = $pdo->prepare(
            'REPLACE INTO reports (
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
        $stmt = $pdo->prepare(
            'REPLACE INTO officers (
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
        $stmt = $pdo->prepare(
            'REPLACE INTO assignments (
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
