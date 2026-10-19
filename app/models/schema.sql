-- BITCAS MySQL schema (XAMPP local and Hostinger phpMyAdmin)
-- Run this file inside your database in phpMyAdmin, or let Database::connect() create the tables.

CREATE TABLE IF NOT EXISTS camera_live (
    camera_id VARCHAR(64) NOT NULL PRIMARY KEY,
    site_name VARCHAR(120) NOT NULL DEFAULT 'Villamonte Street Intersection',
    recorded_at VARCHAR(40) NOT NULL,
    lat DOUBLE NULL,
    lng DOUBLE NULL,
    congestion_level VARCHAR(20) NOT NULL DEFAULT 'LIGHT',
    congestion_score INT NOT NULL DEFAULT 0,
    vehicles_in_frame INT NOT NULL DEFAULT 0,
    smoothed_vehicle_count DOUBLE NOT NULL DEFAULT 0,
    occupancy_pct DOUBLE NOT NULL DEFAULT 0,
    avg_speed_kph DOUBLE NULL,
    speed_calibrated TINYINT(1) NOT NULL DEFAULT 0,
    today_total INT NOT NULL DEFAULT 0,
    snapshot_url VARCHAR(255) NULL,
    payload_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS traffic_minute (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(64) NOT NULL,
    recorded_at VARCHAR(40) NOT NULL,
    samples INT NOT NULL DEFAULT 0,
    congestion_score DOUBLE NOT NULL DEFAULT 0,
    congestion_level VARCHAR(20) NOT NULL DEFAULT 'LIGHT',
    peak_congestion_score INT NOT NULL DEFAULT 0,
    vehicles_in_frame_avg DOUBLE NOT NULL DEFAULT 0,
    vehicles_in_frame_peak INT NOT NULL DEFAULT 0,
    occupancy_pct DOUBLE NOT NULL DEFAULT 0,
    avg_speed_kph DOUBLE NULL,
    speed_calibrated TINYINT(1) NOT NULL DEFAULT 0,
    crossings INT NOT NULL DEFAULT 0,
    payload_json LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_camera_minute (camera_id, recorded_at),
    KEY idx_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS traffic_hourly (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(64) NOT NULL,
    recorded_at VARCHAR(40) NOT NULL,
    weekday TINYINT NOT NULL DEFAULT 0,
    hour TINYINT NOT NULL DEFAULT 0,
    samples INT NOT NULL DEFAULT 0,
    congestion_score DOUBLE NOT NULL DEFAULT 0,
    congestion_level VARCHAR(20) NOT NULL DEFAULT 'LIGHT',
    peak_congestion_score INT NOT NULL DEFAULT 0,
    vehicles_in_frame_avg DOUBLE NOT NULL DEFAULT 0,
    vehicles_in_frame_peak INT NOT NULL DEFAULT 0,
    occupancy_pct DOUBLE NOT NULL DEFAULT 0,
    avg_speed_kph DOUBLE NULL,
    speed_calibrated TINYINT(1) NOT NULL DEFAULT 0,
    crossings INT NOT NULL DEFAULT 0,
    payload_json LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_camera_hour (camera_id, recorded_at),
    KEY idx_recorded_hour (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(64) NOT NULL,
    congestion_level VARCHAR(20) NOT NULL DEFAULT 'HEAVY',
    congestion_score INT NOT NULL DEFAULT 0,
    vehicles_in_frame INT NOT NULL DEFAULT 0,
    snapshot_url VARCHAR(255) NOT NULL,
    captured_at VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_snapshot_url (snapshot_url)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash CHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'traffic_desk',
    active TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_by VARCHAR(32) NULL,
    created_at_iso VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    location VARCHAR(160) NOT NULL,
    camera_id VARCHAR(64) NULL,
    severity VARCHAR(24) NOT NULL DEFAULT 'High',
    congestion_score INT NOT NULL DEFAULT 0,
    vehicle_count INT NOT NULL DEFAULT 0,
    occupancy_pct DOUBLE NULL,
    avg_speed_kph DOUBLE NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'Open',
    lat DOUBLE NOT NULL DEFAULT 10.6642688,
    lng DOUBLE NOT NULL DEFAULT 122.9675934,
    source VARCHAR(40) NOT NULL DEFAULT 'Vision system',
    context TEXT NULL,
    notes TEXT NULL,
    false_positive TINYINT(1) NOT NULL DEFAULT 0,
    snapshot_url VARCHAR(255) NULL,
    created_at_iso VARCHAR(40) NOT NULL,
    updated_at_iso VARCHAR(40) NOT NULL,
    resolved_at_iso VARCHAR(40) NULL,
    created_by_user_id VARCHAR(32) NULL,
    updated_by_user_id VARCHAR(32) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS officers (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    rank_title VARCHAR(80) NOT NULL DEFAULT 'Traffic Enforcer',
    contact VARCHAR(64) NOT NULL DEFAULT '--',
    radio VARCHAR(64) NOT NULL,
    zone VARCHAR(80) NOT NULL DEFAULT 'Villamonte',
    shift_start VARCHAR(16) NOT NULL DEFAULT '06:00',
    shift_end VARCHAR(16) NOT NULL DEFAULT '14:00',
    rest_day VARCHAR(20) NOT NULL DEFAULT 'Sunday',
    status VARCHAR(24) NOT NULL DEFAULT 'Available',
    skills_json TEXT NOT NULL,
    date_assigned VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assignments (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    report_id VARCHAR(32) NOT NULL,
    officer_id VARCHAR(32) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'Assigned',
    assigned_at_iso VARCHAR(40) NOT NULL,
    acknowledged_at_iso VARCHAR(40) NULL,
    enroute_at_iso VARCHAR(40) NULL,
    onscene_at_iso VARCHAR(40) NULL,
    resolved_at_iso VARCHAR(40) NULL,
    field_notes TEXT NULL,
    created_by_user_id VARCHAR(32) NULL,
    updated_by_user_id VARCHAR(32) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS advisories (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    level VARCHAR(24) NOT NULL,
    area VARCHAR(120) NOT NULL,
    message VARCHAR(300) NOT NULL,
    sent_at_iso VARCHAR(40) NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'OneSignal',
    created_by_user_id VARCHAR(32) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
