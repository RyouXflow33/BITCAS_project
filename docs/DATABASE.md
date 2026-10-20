# BITCAS database: what each table holds

The database is MySQL on Hostinger. The tables are created by `app/models/schema.sql`,
and `Database::connect()` creates any that are missing the first time it runs.

Two kinds of data live here:

- **Traffic data** comes from the Raspberry Pi through `api/save_data.php` and `api/upload_snapshot.php`.
  The Pi proves who it is with the ingest key in the `X-API-Key` header.
- **Desk data** comes from people using the dashboard through `api/desk_state.php`, `api/desk_users.php`
  and `api/auth.php`. These need a signed-in session.

## Traffic tables (written by the Pi)

| Table | What one row is | Who writes it | How long it is kept |
|---|---|---|---|
| `camera_live` | The latest reading from one camera. One row per camera, replaced on every update (about every 3 seconds). | `save_data.php`, `kind=live` | Always only the newest. |
| `traffic_minute` | One minute of traffic: average and peak congestion score, vehicles in frame, occupancy, crossings, vehicle classes that crossed, direction split. | `save_data.php`, `kind=minute` | 3 days. |
| `traffic_hourly` | One hour of traffic, rolled up from the minute rows on the Pi. Includes `weekday` and `hour` for the heatmap and forecast. | `save_data.php`, `kind=hourly` | 90 days. |
| `snapshots` | One HEAVY-congestion photo: where the file is, level, score, vehicle count. The JPEG itself is a file in `assets/snapshots/`. | `upload_snapshot.php` | 30 days (row and file). |

Notes:

- `samples` in a minute row is how many 3-second readings were averaged into that minute. It is not a count of vehicles.
- A row is identified by `camera_id` plus `recorded_at`. Sending the same row twice replaces it, never duplicates it. The Pi relies on this for catch-up (see `ARCHITECTURE.md`).
- `payload_json` keeps the full record exactly as the Pi sent it. The dashboard reads the JSON, so a new field from the Pi (like `crossing_types`) reaches the dashboard without a table change.
- Old rows are removed automatically each time a new minute or hourly row is saved (`VisionStore`), so the database cannot fill up from traffic data.
- Vehicle mix on the Analytics page counts vehicles that crossed the counting line, by class (`crossing_types`). The per-reading view counts (`vehicle_types`) count one slow vehicle many times, so they are not used for the mix.

## Desk tables (written by the dashboard)

| Table | What one row is | Who writes it |
|---|---|---|
| `users` | A desk account: name, username, role, active flag, bcrypt password hash, must-change-password flag. | `desk_users.php` (create, reset, activate, delete, change own password) and the first-login upgrade in `Auth`. |
| `login_attempts` | One failed sign-in (IP, username, time). Five failures from one IP in ten minutes blocks further tries. | `Auth`. Old rows are cleared automatically. |
| `reports` | A congestion case. Opened by the server when the Pi uploads a HEAVY photo, then worked by the desk (status, notes, false-positive flag). | `upload_snapshot.php` creates it; `desk_state.php` saves desk edits. The newest 500 are kept. |
| `officers` | A traffic officer that can be dispatched. | `desk_state.php`. |
| `assignments` | One dispatch: which officer was sent to which report and the timestamps of each step (assigned, acknowledged, en route, on scene, resolved). | `desk_state.php`. |
| `advisories` | A driver advisory that was broadcast (level, area, message, time). | `AdvisoryController` after OneSignal accepts the broadcast. |

Passwords:

- Passwords are stored only as bcrypt hashes. The browser never receives a hash.
- An account created before this change may still hold the old SHA-256 hash. It is accepted once and replaced by a bcrypt hash at that user's first successful login.
- `users` is never written from the dashboard's saved list. Accounts change only through `desk_users.php`, so a page that has not finished loading can never wipe them.

## What is not in the database

- **Live video.** It is streamed by the Pi itself on its Tailscale address. The database only holds numbers and the JPEG of HEAVY moments.
- **The road line and map shapes.** They are fixed files in the web app, not data.
- **Calibration** (region of interest, counting line, speed scale). It lives in `vision/site_config.json` on the Pi. Until calibration is done, speed is not reported in km/h and the counting line is a temporary test line.
- **Secrets.** The database password, ingest key and OneSignal REST key are in `*.local.php` and `ingest.local.json` files that are not in git and are blocked from the web by `.htaccess`.
