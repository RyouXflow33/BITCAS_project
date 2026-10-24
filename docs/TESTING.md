# BITCAS test cases

Every test below is a script in the repository. Each one prints PASS or FAIL per case and ends with a count.
The exit code is 0 only when every case passes, so the scripts can also be run before each upload.

| Suite | File | What it covers | Needs |
|---|---|---|---|
| A. Web API smoke test | `tests/smoke.php` | Access control, login, accounts, ingest key, private files | PHP and the site URL |
| B. Report creation | `tests/report_flow.php` | A HEAVY photo from the Pi opens one report | Local PHP server and local MySQL |
| C. Output escaping (unit) | `tests/escape_html.test.js` | `escapeHtml()` stops typed text from becoming HTML | Node.js |
| D. Vision self-test | `vision/selftest.py` | Tracking, counting, scoring, records, catch-up replay | Python (no camera needed) |

Run commands are from the project folder. On Windows XAMPP, PHP is `C:\xampp\php\php.exe`.

## A. Web API smoke test (`tests/smoke.php`)

```
php tests/smoke.php https://your-site.example --blocked
```

Add `SMOKE_USER` and `SMOKE_PASSWORD` environment variables (a throwaway super admin, never the real one) to include the sign-in cases.
`--blocked` checks private folders by URL. Use it only against a real web server, because `php -S` ignores `.htaccess`.

| # | Case | Expected |
|---|---|---|
| A1 | `get_live` without signing in | 200 or 404 with JSON |
| A2 | Advisories list without signing in | 200 and a list (drivers must be able to read it) |
| A3 | `desk_state` read without a session | 401 |
| A4 | `desk_state` read response | contains no password hash |
| A5 | `desk_state` write without a session | 401 |
| A6 | Create a desk account without a session | 401 |
| A7 | Broadcast an advisory without a session | 401 |
| A8 | Clear advisories without a session | 401 |
| A9 | Old `auth.php` action `sync` (used to forge a session) | 400, the action no longer exists |
| A10 | Session after the forged `sync` | still none |
| A11 | Log in with only a hash | 401 (or 429 if throttled) |
| A12 | `save_data.php` without the ingest key | 401 |
| A13 | `upload_snapshot.php` without the ingest key | 401 |
| A13b | Register with a number in the name, a 61-letter name, or a short password | 422, no account is created |
| A13c | With sign-in: public register | account is created inactive |
| A13d | That account tries to sign in | 403 until a super admin enables it |
| A14 | With `--blocked`: `/app/models/schema.sql`, `/app/models/Auth.php`, `/api/database.local.php`, `/api/onesignal.local.php`, `/vision/traffic_vision.py`, `/.git/HEAD` | each 403 or 404 (6 cases) |
| A15 | With sign-in: wrong password | refused (401 or 429) |
| A16 | Correct password | 200 and `ok` |
| A17 | Login reply | contains no password hash |
| A18 | Session cookie | HttpOnly and SameSite |
| A19 | `desk_state` once signed in | 200, still no hash |
| A20 | Super admin creates a desk account | 200 and the new user id; reply has no hash |
| A21 | Same username again | 422 |
| A22 | New account signs in with its temporary password | 200 |
| A23 | That account tries to broadcast before changing its password | 403 |
| A24 | A desk account tries to create accounts | 403 |
| A25 | The account changes its own password | 200 |
| A26 | A desk account tries to disable accounts | 403 |
| A27 | Super admin deletes the test account | 200 |
| A28 | Super admin deletes their own account | 422 |
| A29 | After logout, `desk_state` | 401 |

Result on 23 Oct 2026 against the local server: 38 of 38 passed (public checks 16, including the registration limits, and the sign-in flow 22).

`php tests/input_rules.php` checks the same name, username, password, whole-number, and phone rules without a web server. 10 of 10 passed.

## B. Report creation (`tests/report_flow.php`)

Local only. It refuses to run against any host other than `127.0.0.1` or `localhost`, and deletes the rows it creates.

```
php -S 127.0.0.1:8089
php tests/report_flow.php http://127.0.0.1:8089
```

| # | Case | Expected |
|---|---|---|
| B1 | Live reading with the ingest key | stored |
| B2 | Upload a HEAVY snapshot | accepted, a report id like `RPT-n` comes back |
| B3 | Report row | source `Vision system`, status `Open`, severity `High`, score 72, 7 vehicles |
| B4 | Report details | location, position and occupancy copied from the live reading |
| B5 | Report snapshot link | points at the uploaded file |
| B6 | Upload the same snapshot again | same report id, no second report |
| B7 | Upload a LIGHT snapshot | no report is opened (`report_id` is null) |

Result: 10 of 10 checks passed.

## C. Output escaping unit test (`tests/escape_html.test.js`)

```
node tests/escape_html.test.js
```

The test loads the real `escapeHtml` from `assets/js/mvc/core/helpers.js`.

| # | Input | Expected |
|---|---|---|
| C1 | `Villamonte Street` | unchanged |
| C2 | `<script>alert(1)</script>` | `&lt;script&gt;alert(1)&lt;/script&gt;` |
| C3 | `<img src=x onerror=alert(1)>` | angle brackets escaped |
| C4 | `" onmouseover="alert(1)` | quotes escaped, cannot close an attribute |
| C5 | `A&B &lt;` | ampersands escaped first, no double decoding |
| C6 | `null`, `undefined`, `''` | empty string |
| C7 | `42` | `42` |

Result: 9 of 9 passed.

## D. Vision self-test (`vision/selftest.py`)

No camera or detection model is needed. It feeds synthetic vehicles through the real tracker, counting line, occupancy and scoring code.

```
cd vision
python selftest.py
```

| # | Case | Expected |
|---|---|---|
| D1 | Published payload | contains every key the dashboard reads |
| D2 | Counting line | fires, so the day total is above 0 |
| D3 | `crossings.jsonl` | has the crossings, each with a direction |
| D4 | `traffic_history.jsonl` | has aggregated minute lines |
| D5 | `traffic_hourly.jsonl` | has a rollup, even for a run shorter than an hour |
| D6 | Hourly crossings | equal the day total |
| D7 | Congestion level and score | a known level and a score from 0 to 100 |
| D8 | Positions | are `{x, y, class}` objects |
| D9 | Vehicle mix | per-class crossings in the minute and hourly records equal `crossings.jsonl` |
| D10 | Catch-up replay: link drops on the third row | replay stops there and asks to retry |
| D11 | Catch-up replay: link returns | sends the remaining rows once each, skips rows older than the server keeps |
| D12 | Catch-up replay: run again | sends nothing, rows are already acknowledged |
| D13 | Acknowledged marker | reaches the newest row |

The self-test never posts to the real database, even on the Pi where `ingest.local.json` exists.

## Not covered yet

- Detection accuracy against a hand count. The plan is a recorded clip with counted vehicles.
- The mobile app. Test it by comparing the live count on the phone with the dashboard and sending a test advisory.
