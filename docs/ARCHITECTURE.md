# BITCAS architecture and deploy checklist

## How a reading travels

```
USB webcam
   |
   v
Raspberry Pi: bitcas-vision.service  (vision/traffic_vision.py, YOLOv8n via NCNN)
   |  detects, tracks, counts line crossings, scores congestion
   |
   |-- every ~3 s  --> POST api/save_data.php  kind=live    --> camera_live (one row, replaced)
   |-- every minute --> POST api/save_data.php  kind=minute  --> traffic_minute
   |-- every hour   --> POST api/save_data.php  kind=hourly  --> traffic_hourly
   |-- HEAVY for 3 intervals --> POST api/upload_snapshot.php (JPEG)
   |                                |--> assets/snapshots/*.jpg + snapshots row
   |                                '--> reports row (status Open)   <- opened by the server
   |
   '-- also written on the Pi (the primary record): traffic_history.jsonl,
       traffic_hourly.jsonl, crossings.jsonl

Hostinger (PHP + MySQL)
   api/*.php  -->  app/models/*  -->  MySQL

Dashboard (browser): PHP shell + vanilla JS
   reads camera_live / minute / hourly through api/ endpoints,
   reads and saves desk data (reports, officers, assignments) through api/desk_state.php,
   manages accounts through api/desk_users.php, signs in through api/auth.php.

Driver app (Flutter, separate folder): reads Hostinger first, then the local XAMPP copy.
```

Live annotated video is separate from all of this: it is the Pi's own camera page, reached over Tailscale.
Hostinger shows numbers and photos, not video.

## Safe against outages

The Pi writes every minute and hourly record to its own files before sending it.
The sender remembers the newest row the database confirmed (`vision/ingest_ack.local.json`).
After an internet outage or a reboot it re-sends everything newer than that marker, oldest first, and stops at the first failure to try again after a minute.
Rows older than the server keeps (3 days minute, 90 days hourly) are not re-sent.
Because the server stores each `(camera, time)` once, a row sent twice is harmless.

## Who is allowed to do what

| Caller | Proof | Can do |
|---|---|---|
| Raspberry Pi | `X-API-Key` ingest key | Write traffic data and snapshots only. |
| Desk user | Session cookie (HttpOnly, SameSite, Secure on https), re-checked against the `users` table on every request | Read and edit desk data. Roles are enforced on the server. |
| Super admin | Same session, role checked on the server | Also create, reset, deactivate and delete accounts. |
| Anyone else | Nothing | Read live and history traffic numbers (`get_live.php`, `get_history.php`) and advisories. Nothing else. |

Other protections: bcrypt passwords, login throttle (5 failures per 10 minutes per IP), accounts flagged "must change password" can do nothing else until they change it, errors return a generic message to the browser and the detail goes to the server log.

## Deploy checklist (Hostinger File Manager, upload by hand)

1. Upload all changed files together. The new login sends the password to the server and accounts use `desk_users.php`, so old and new files do not work mixed.
2. In `public_html`, delete the `.git` folder if it is there. `.htaccess` also blocks it, but it should not be on the server at all.
3. Make sure `.htaccess` is in `public_html` (it hides `app/`, `vision/`, `docs/`, `tests/`, `.sql`, `.md`, `.py`, `.jsonl` and `*.local.*` from the web).
4. Keep the existing `api/database.local.php` and `api/onesignal.local.php` on the server. Do not overwrite them from the laptop.
5. Open the site and press Ctrl+F5 once. Scripts carry a version number from their file time, so later uploads refresh by themselves.
6. Sign in. Accounts that were lost earlier have to be created again in Desk accounts.
7. Run the smoke test from the laptop: `php tests/smoke.php https://<site> --blocked`. Add `SMOKE_USER` and `SMOKE_PASSWORD` environment variables for the full sign-in flow.
8. On the Pi, restart the service after pulling changes: `sudo systemctl restart bitcas-vision`.

## Known limits (state them plainly in the paper)

- Calibration is not done. The region of interest is the whole frame, the counting line is a default test line, and speed is pixel speed, not km/h.
- Vehicle counts depend on the detector (YOLOv8n at low resolution on a Raspberry Pi). No accuracy study has been run.
- A report keeps the link to its photo, but photos are deleted after 30 days, so an old report can show a missing image.
