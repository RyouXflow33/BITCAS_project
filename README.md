# BITCAS: Barangay Intelligent Traffic Congestion Alert System

BITCAS watches one road (Villamonte, Bacolod) with a camera on a Raspberry Pi, counts vehicles, scores congestion,
and shows it to the barangay and LGU desk on a web dashboard. Drivers get advisories on a Flutter phone app
(separate folder, `BITCAS_Driver`).

## Stack

| Part | Technology |
|---|---|
| Web dashboard | PHP 8 (own MVC, no framework) and vanilla JavaScript, custom CSS |
| Database | MySQL (Hostinger in production, XAMPP locally) |
| Maps and PDF | Leaflet with OpenStreetMap tiles, jsPDF |
| Vision node | Python 3, OpenCV, YOLOv8n (NCNN) on a Raspberry Pi 5 with a USB webcam |
| Push alerts | OneSignal (REST key kept on the server only) |
| Driver app | Flutter |

No NoSQL database, CMS, framework or pre-made theme is used.

## Folders

```
index.php            entry point, loads the page controller
app/                 controllers, models (database access, auth), views
api/                 JSON endpoints used by the dashboard, the Pi and the phone app
assets/              css, js (MVC: core, models, views, controllers), snapshots
vision/              Raspberry Pi code (traffic_vision.py, calibrate.py, selftest.py)
tests/               smoke, report flow and unit tests
docs/                DATABASE.md, ARCHITECTURE.md, TESTING.md
```

## Run it locally (Windows, XAMPP)

1. Put the folder in `C:\xampp\htdocs\BITCAS_UI_Skeleton` and start Apache and MySQL in the XAMPP Control Panel.
2. Open `http://localhost/BITCAS_UI_Skeleton/`. With no `api/database.local.php`, the app connects to the local XAMPP MySQL and creates the `bitcas_db` database and tables on first use (development only).
3. To use your own credentials, copy `api/database.example.php` to `api/database.local.php` and fill it in. This file is ignored by git.
4. For push alerts, copy `api/onesignal.example.php` to `api/onesignal.local.php` and fill in the OneSignal values.
5. Sign in with the first super admin account. Passwords are stored as bcrypt hashes. The first account is created by `DeskStore::ensureSeedAdmin`. Change its password on first login.

Without XAMPP's Apache you can also run `php -S 127.0.0.1:8089` in the project folder.

## How the Pi connects

1. On the Pi, copy `vision/ingest.example.json` to `vision/ingest.local.json`, set `enabled` to `true`, and put in the site address and the ingest key. The same key goes in `api/database.local.php` as `ingest_api_key`.
2. The vision service `vision/bitcas-vision.service` runs `traffic_vision.py` and owns the camera. Start it with `sudo systemctl enable --now bitcas-vision`, and read its log with `journalctl -u bitcas-vision -n 40 --no-pager`.
3. About every 3 seconds the Pi posts the live reading to `api/save_data.php`. Every minute and every hour it posts a rollup. When congestion stays HEAVY it uploads a photo to `api/upload_snapshot.php`, and the server opens a report.
4. Every post carries the ingest key in the `X-API-Key` header. Without it the server answers 401.
5. If the internet drops, the Pi keeps writing its own files and re-sends the missed rows when the link returns.
6. The live annotated video is on the Pi's own page (`http://<pi-tailscale-address>:8080`, reached over Tailscale). The website shows numbers and photos, not video.
7. Calibration (road area, counting line, speed scale) is done once on the Pi desktop with `python calibrate.py`. Until then the system uses the whole frame, a default counting line and pixel speed.

## Tests

See `docs/TESTING.md` for every test case with its expected result. Quick commands:

```
php tests/smoke.php http://localhost/BITCAS_UI_Skeleton
node tests/escape_html.test.js
cd vision && python selftest.py
```

## More documentation

- `docs/DATABASE.md`: what each table stores and who writes it
- `docs/ARCHITECTURE.md`: data flow, access rules and the deploy checklist
- `docs/TESTING.md`: test cases and how to run them

## Security notes

- Secrets (`api/database.local.php`, `api/onesignal.local.php`, `vision/ingest.local.json`) are never committed.
- `.htaccess` hides `app/`, `vision/`, `docs/`, `tests/`, `.git` and any `*.local.*` file from the web.
- Writes need a signed-in session. The Pi can only write traffic data, and only with its key.
