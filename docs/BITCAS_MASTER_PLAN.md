# BITCAS — Master Plan & Technical Assessment

**Barangay Intelligent Traffic Congestion Alert System**
Site: Villamonte Street Intersection, Barangay Villamonte, Bacolod City
Hardware: Raspberry Pi 5 (4 GB) + camera · Hosting: Hostinger (PHP/MySQL) · Private access: Tailscale
Author's note: this document is the decision record. `docs/SYSTEM_OVERVIEW.md` describes what exists *today*; this describes what to build and why.

---

## 1. How the system works right now

Two programs that never talk directly. They share files.

**Vision side** — `vision/traffic_vision.py` opens a camera or video, runs YOLOv8n on every frame,
keeps only COCO classes 2/3/5/7 (car, motorcycle, bus, truck), assigns track IDs with a
nearest-centroid matcher, estimates speed in pixels/second, and classifies the smoothed vehicle
count into LIGHT / MODERATE / HEAVY. Every 3 seconds it atomically writes one JSON object to
`assets/data/congestion.json` and appends the same object to `assets/data/traffic_history.json`.
After 3 consecutive HEAVY publishes it also saves an annotated JPEG to `assets/snapshots/` and
puts the path in the payload as `snapshot_url`.

**Web side** — `index.php` is the only entry point. It whitelists `?page=` to
`command | analytics | incidents | dispatch`, includes the matching file from `includes/`, and
loads the client MVC in dependency order. There is no server-side logic beyond includes.

**The browser is the database.** `assets/js/mvc/models/store.js` holds one `state` object in
`localStorage` under `bitcas_ui_sim_v1` — reports, telemetry, officers, assignments, advisories,
snapshots. Every mutation calls `saveState()`. The Traffic Map page polls `congestion.json` every
3 s, validates it, and folds it into `state.live` + `state.telemetry`. If a payload is HEAVY and
carries a new `snapshot_url`, `maybeCreateEvidenceReport()` auto-creates a Severe Open report. The
Analytics page separately loads the whole `traffic_history.json` and replaces `state.telemetry`
with it.

That design is correct for a simulation. Nothing below says "throw it away" — the MVC split, the
payload contract, and the atomic writes are all worth keeping. What changes is where data lives
and what the vision node measures.

---

## 2. The five problems that matter most

These are real, reproducible, and each one blocks something you said you need.

### 2.1 `vehicle_count` is not a vehicle count

`vehicle_count` is `len(detections)` — the number of vehicles **visible in the frame right now**.
It is an occupancy sample, not throughput. Your KPI table asks for "Total Vehicles Today 18,542"
and "Traffic Flow 82 vehicles/min". Neither can be computed from this number, no matter how much
history you keep. Summing occupancy samples double-counts a car that sits in frame for 30 seconds
and misses nothing about a car that passes in 2 seconds.

**Fix:** a virtual counting line. When a tracked ID crosses it, emit one crossing record with its
class, direction, and speed. Throughput, flow rate, per-direction volume, and daily totals all
fall out of that one addition. This is the single highest-value change in the whole project.

### 2.2 The history file will destroy your SD card

`write_to_history()` reads the entire history file, parses it, appends one entry, and rewrites it
— every 3 seconds. That file is currently **650 KB**.

    650 KB × 20 writes/min × 60 × 24 ≈ 18.7 GB written per day

On a microSD card that is a wear-out death sentence in months, and the read-parse-rewrite cycle
blocks the detection loop every cycle. Worse: 1000 entries at 3 s is **50 minutes** of history. The
"7-day trend", "peak hour", and "vs last week" widgets can never be correct from this file.

**Fix:** stop keeping history on the Pi. POST each reading to Hostinger and keep only a small
local spool file for outage replay (see §5).

### 2.3 The congestion score has only three possible values

`visionLevelToScore()` in `helpers.js` maps HEAVY→90, MODERATE→60, LIGHT→30. So every telemetry
point stores one of three numbers. Average congestion, the 7-day chart, and the baseline-delta
widget are all computed from a 3-valued signal — they look like analytics but carry almost no
information. Meanwhile `updateReport()` throws the vision score away entirely and recomputes it
from `vehicleCount / 90`, an arbitrary constant.

**Fix:** compute a continuous 0–100 score on the Pi from occupancy, count, and speed (§4.3) and
carry it through unchanged.

### 2.4 Speed is in pixels per second

`calculate_speed()` uses the last two centroids of a track. Two problems: pixels/second is not a
unit any LGU official can act on, and a two-point difference is extremely noisy. A car near the
camera and a car far away moving identically report wildly different pixel speeds.

**Fix:** a one-time 4-point homography calibration at the intersection (§4.2) converts to km/h,
and a least-squares fit over the track's position deque replaces the two-point difference.

### 2.5 Smoothing smooths almost nothing

`congestion_history = deque(maxlen=30)` is appended **once per frame**, not once per second. At
25–30 FPS that is a 1-second window. The comment says "last 30 frames for smoothing" and that is
literally true, but the intent was clearly temporal smoothing.

**Fix:** append per publish interval, or make the window explicitly time-based (e.g. last 30 s).

**Smaller issues worth fixing while you are in there:** `self.tracked_vehicles` is keyed by
detection index, which is meaningless across frames; the greedy nearest-neighbour matcher swaps
IDs under occlusion; `getReportSource()` checks for a context string starting with
"Automatically generated" that `maybeCreateEvidenceReport()` never writes; login credentials are
hardcoded in `store.js` lines 119–123 and visible to anyone who opens DevTools; and the hotspot
ranking groups by `report.location`, but every auto-generated report hardcodes "Villamonte Street
Intersection", so that panel is effectively driven by seed data.

---

## 3. Your analytics list, graded honestly

You asked whether the research list is valid. Most of it is — but roughly a third of it cannot be
computed from one fixed camera without adding the counting line, the calibration, and the zone
definitions described in §4. Here is every item.

Verdicts are as of the original analysis; the **Status** column records where each one landed
after Phases 1 and 4. "Built, needs data" means the code is written and verified against the
sample generator, and will be accurate once the Pi has logged long enough.

| # | Metric you listed | Verdict | What it needs | Status |
|---|---|---|---|---|
| 1 | Total vehicles detected | **Rebuild** | Counting line. Today's number is occupancy, not a total. | ✅ Built — `CountingLine`, deduped per track |
| 2 | Count by type (car/motorcycle/truck/bus) | **Works** | Already in `vehicle_types`. Attach it to crossings instead of frames. | ✅ Built — attached to crossings |
| 3 | Count per lane / direction | **Add** | Lane polygons + direction sign from track history. | 🟡 Direction built; per-lane still needs lane polygons |
| 4 | Hourly / daily / weekly counts | **Add** | Free once crossings land in MySQL with timestamps. | ✅ Built — hourly rollup, no DB needed yet |
| 5 | Traffic volume per period | **Add** | Same as #1. This is the definition of throughput. | ✅ Built |
| 6 | Peak vs non-peak periods | **Works** | Already approximated; becomes accurate with real volume. | ✅ Built — now from real crossings |
| 7 | Volume trends over time | **Add** | Needs the database. 50 minutes of JSON cannot show a trend. | ⏳ Built, needs data — heatmap volume view |
| 8 | Congestion level Low/Moderate/Heavy/Critical | **Extend** | Add a 4th CRITICAL band; make the score continuous (§4.3). | ✅ Built |
| 9 | Congestion % / score | **Fix** | Currently 3 discrete values. See §2.3. | ✅ Built — continuous 0–100 |
| 10 | Current vs normal conditions | **Works** | `computeAnalytics()` already does rolling-vs-baseline. Good work. | ✅ Built — now also per weekday-hour slot |
| 11 | Highlight critical intersections | **Deferred** | Meaningless with one camera. See #17. | ⛔ Still one camera |
| 12 | Traffic density (vehicles per area) | **Add** | Road-ROI occupancy %: sum of box areas ÷ ROI area. Better than raw count and robust to camera angle. | ✅ Built |
| 13 | Vehicles per lane / segment | **Add** | Lane polygons. | ⛔ Not built — needs lane polygons at the site |
| 14 | Average vehicle speed | **Fix** | Homography calibration → km/h (§4.2). | ✅ Built — pending on-site calibration |
| 15 | Speed trends by time of day | **Add** | Free once #14 and the database exist. | ⏳ Built, needs data — in the hourly rollup |
| 16 | Traffic flow in/out, direction | **Add** | Direction sign per crossing. | ✅ Built |
| 17 | Intersection comparison / ranking | **Honest answer: no** | You have one camera. Either rank the **approaches** (north/south legs) within that one view — which is genuinely useful and defensible — or wait for camera #2. Do not fake it with seed data. | ⛔ Unchanged — the Locations panel says so on screen |
| 18 | Historical trends by day/week/month | **Add** | Database. Non-negotiable. | ⏳ Built, needs data — weeks fit in the browser via rollups |
| 19 | Incident / anomaly detection | **Add** | Very doable: z-score of 5-min rolling mean vs same-slot historical mean, plus the stall signature (speed drops >40% while occupancy stays high). | ⏳ Built, needs data — `detectAnomalies` |
| 20 | Congestion duration | **Works** | `computeCongestionDuration()` already does this. | ✅ Built |
| 21 | Traffic prediction 15–60 min | **Add, keep it simple** | Same-weekday same-15-min-slot average over trailing 4 weeks, blended with an EWMA of the last 30 min. Runs in SQL, explainable to a panel. Do not promise an LSTM on a Pi. | ⏳ Built, needs data — `computeForecast`, exactly this blend |

**On the KPI card mock-up you drafted:** "Total Vehicles Today", "Traffic Flow (veh/min)", and
"Average Speed" all require §4 work first. "Current Vehicle Count", "Current Congestion", "Peak
Hour", and "Congestion Duration" work today. "Congested Intersections: 3" should become
"Congested Approaches" until there is a second camera.

**On the visualizations:** the bar and line charts in your reference images are fine. The heatmap
should be **hour × weekday**, not time × location — that is the chart that actually tells a
barangay when to post an officer, and it works with one camera. The donut for vehicle mix, the
area chart for flow, the KPI strip, and the alert panel all hold up. The live map stays, but be
upfront that it currently shows one node.

*All of the above are now on the Analytics page.* The heatmap is hour × weekday as argued, with
a congestion/volume toggle; cells that were never observed are hatched rather than coloured, so
"no data" never reads as "light traffic". The alert panel is the incident detector, and the KPI
strip shows measured throughput, flow, speed and occupancy — or a dashed card naming what is
missing.

---

## 4. Vision node v2 — what the Pi must measure

### 4.1 Counting line and zones (unlocks #1, #3, #4, #5, #16)

Define, once, in a config file next to the script:

- a **road ROI polygon** — the drivable area in the frame, so detections on sidewalks are ignored
- one or more **counting lines** across the approach
- optional **lane polygons** inside the ROI

Per frame, for each track, keep the previous centroid. If the segment from previous to current
centroid intersects a counting line, emit a crossing:

```json
{ "track_id": 418, "crossed_at": "2026-09-18T07:42:11", "class": "motorcycle",
  "direction": "inbound", "speed_kph": 23.4, "line": "north_approach" }
```

Direction is the sign of the dot product between the movement vector and the line's normal.
Dedupe by track ID so one vehicle counts once per line.

### 4.2 Speed calibration (unlocks #14, #15)

One-time, with a tape measure at the site. Pick 4 points on the road surface that form a known
rectangle in the real world (lane width × a measured distance along the road — lane width in the
Philippines is typically 3.0–3.5 m; measure it, do not assume). Record their pixel coordinates,
build the matrix with `cv2.getPerspectiveTransform`, store it in the config.

Then transform each track's centroid history into ground-plane metres, fit a least-squares line
over the deque instead of differencing the last two points, and report km/h. Sanity-clamp to
0–120 km/h and drop tracks with fewer than 5 observations.

### 4.3 Continuous congestion score (fixes #8, #9)

Replace the three-value mapping with:

```
occupancy  = Σ(box area inside ROI) / ROI area          → 0..1
load       = min(1, unique_vehicles_in_ROI / capacity)  → 0..1   (capacity = your calibrated max)
slowness   = clamp(1 - avg_speed_kph / free_flow_kph, 0, 1)

score = round(100 × (0.45×occupancy + 0.30×load + 0.25×slowness))
```

Bands: 0–39 LIGHT · 40–64 MODERATE · 65–84 HEAVY · 85–100 CRITICAL.
Publish `congestion_score` **and** `congestion_level`, and stop recomputing the score in JS.

Calibrate `capacity` and `free_flow_kph` from your own first week of data — free-flow speed is the
85th percentile of observed speeds during a light-traffic hour. Document those two numbers; a
panel will ask where they came from.

### 4.4 Payload contract v2

```json
{
  "camera_id": "CAM-VILLAMONTE-01",
  "timestamp": "2026-09-18T07:42:11+08:00",
  "congestion_level": "MODERATE",
  "congestion_score": 58,
  "vehicles_in_frame": 11,
  "occupancy_pct": 34.2,
  "avg_speed_kph": 21.7,
  "vehicle_types": { "car": 7, "motorcycle": 3, "truck": 1 },
  "flow": { "inbound": 4, "outbound": 6, "window_seconds": 3 },
  "lanes": [ { "id": "L1", "vehicles": 6, "avg_speed_kph": 18.2 } ],
  "positions": [0.12, 0.31, 0.48],
  "snapshot_url": null,
  "crossings": [ { "track_id": 418, "class": "motorcycle", "direction": "inbound", "speed_kph": 23.4 } ],
  "health": { "fps": 6.2, "cpu_temp_c": 58.4, "uptime_s": 84213 }
}
```

`health` matters more than it looks — it is how you know the Pi is alive versus the network being
down, and it gives you a "camera offline" alert for free.

### 4.5 Raspberry Pi 5 hardening

| Problem | Change |
|---|---|
| YOLOv8n PyTorch on Pi CPU is ~2–4 FPS | Export to NCNN: `yolo export model=yolov8n.pt format=ncnn`, then load the NCNN model. Typically 2–3× faster on Pi 5. |
| `cap.read()` in the main loop buffers and lags behind real time | Run capture in a separate thread that keeps only the newest frame and drops the rest. |
| Detection runs on every frame | Detect every Nth frame; track (cheap) on the frames in between. |
| 416 may still be too slow with streaming alongside | Start at `--inference-size 320`, capture at 640×480, and only raise it if FPS allows. |
| OpenCV grabs all cores and starves the stream | `cv2.setNumThreads(3)` and `nice` the process. |
| Pi Camera Module on Bookworm | `cv2.VideoCapture(0)` is unreliable — use `picamera2` for CSI cameras, or a USB webcam for the simplest path. |
| SD card wear | Move history off the Pi (§2.2); log to `/run` (tmpfs) or use an SSD/USB boot for anything persistent. |
| Camera contention if you also stream | Do **not** let two processes open the camera. Run one streamer (MediaMTX or go2rtc) and have Python read its local RTSP feed. |
| Unattended restarts | Run as a `systemd` service with `Restart=always` and a watchdog on the last-publish timestamp. |

---

## 5. Architecture v2 — Pi, Hostinger, Tailscale

```
                         Tailscale private network (no port forwarding)
                    ┌──────────────────────────────────────────────────┐
                    │                                                  │
  ┌────────┐   ┌────┴─────────────────┐                      ┌─────────┴──────────┐
  │ Camera ├──▶│  Raspberry Pi 5      │                      │ Authorised viewer  │
  └────────┘   │  ├ MediaMTX (RTSP)   │  live video ────────▶│ (phone / laptop)   │
               │  └ traffic_vision.py │                      └────────────────────┘
               └────────┬─────────────┘
                        │  HTTPS POST, JSON, every 3 s, API key + HMAC
                        ▼
               ┌──────────────────────────────────────────┐
               │  Hostinger                               │
               │  ├ api/ingest.php    ← validates, stores │
               │  ├ api/current.php   → latest reading    │
               │  ├ api/history.php   → rollups           │
               │  ├ api/reports.php, api/dispatch.php     │
               │  └ MySQL + cron rollup/retention job     │
               └───────────────────┬──────────────────────┘
                                   │ HTTPS, session cookie
                                   ▼
                      ┌────────────────────────────┐
                      │  PHP dashboard (browser)   │
                      └────────────────────────────┘
```

Three rules that make this safe and reliable:

1. **The dashboard never talks to the Pi.** If the Pi dies, the dashboard shows stale-but-honest
   data and a "camera offline" banner. Live video is the only Pi-dependent feature, and it is on
   Tailscale, not the public internet.
2. **The Pi buffers when the network drops.** Field internet is unreliable. Queue unsent readings
   in a local SQLite spool and replay them on reconnect, with the original timestamps. Without this
   you silently lose data every time the connection blips.
3. **The ingest endpoint is authenticated.** Long random API key in a file on the Pi (not in git),
   sent as a header, plus an HMAC signature over the body and a timestamp to prevent replay. The
   endpoint validates every field and rejects anything out of range.

Shared Hostinger is correct for PHP/MySQL/dashboard. It cannot run YOLO, and it does not need to.

### Database schema (MySQL)

```sql
users        (id, username, password_hash, role, full_name, is_active, created_at)
cameras      (id, code, name, road_name, lat, lng, status, last_seen_at, config_json)

readings     (id, camera_id, recorded_at, level, score, vehicles_in_frame,
              occupancy_pct, avg_speed_kph, cars, motorcycles, buses, trucks,
              inbound, outbound)                      -- raw, 3 s cadence
crossings    (id, camera_id, track_id, crossed_at, vehicle_class, direction,
              speed_kph, line_id)                     -- one row per vehicle passing
readings_min (camera_id, bucket_start, ...)           -- cron rollup
readings_hr  (camera_id, bucket_start, ...)           -- cron rollup

reports      (id, camera_id, opened_at, closed_at, severity, score, peak_vehicles,
              status, source, snapshot_path, context, remarks,
              false_positive, updated_at)
officers     (id, badge_no, full_name, rank, contact_no, zone, shift_start,
              shift_end, status, photo_path, is_active)
assignments  (id, report_id, officer_id, dispatcher_id, status, assigned_at,
              acknowledged_at, enroute_at, onscene_at, resolved_at, field_notes)
advisories   (id, report_id, level, area, message, channel, sent_at, sent_by)
alerts       (id, camera_id, type, severity, detected_at, acknowledged_at, payload_json)
audit_log    (id, user_id, action, entity, entity_id, created_at, ip)
settings     (key, value)                             -- thresholds, capacity, free_flow_kph
```

**Retention:** raw `readings` 7 days, `crossings` 90 days, `readings_min` 90 days,
`readings_hr` forever. A nightly cron does the rollup and the purge. This keeps the database small
enough for shared hosting while preserving years of trend data.

Index `readings(camera_id, recorded_at)` and `crossings(camera_id, crossed_at)` — every analytics
query hits those.

---

## 6. Officer & Dispatch module

You asked what belongs here. Right now an officer is five fields (`id`, `name`, `status`,
`workload`, `zone`) and an assignment is Assigned → Resolved. That loses the number an LGU cares
about most: **response time**.

### 6.1 Officer profile

| Group | Fields |
|---|---|
| Identity | Badge no., full name, photo, rank/designation, contact number, date assigned |
| Deployment | Home zone/beat, shift (start/end), rest day, current status |
| Status | Available · Assigned · En route · On scene · On break · Off duty |
| Live | Current assignment, time on current task, tasks handled today |
| Performance | Avg acknowledge time, avg clearance time, assignments this month, resolution rate |
| Optional | Skills/certifications (traffic enforcer, tow coordinator, first aid), radio call sign |

Keep `workload` but make it derived — tasks handled today and time on task — not a number that
jumps ±18 on assignment.

### 6.2 Assignment lifecycle

Replace the two-state flow with timestamps at every step:

```
Open ──assign──▶ Assigned ──ack──▶ Acknowledged ──▶ En route ──▶ On scene ──▶ Resolved
                    │                                                             │
                    └──────────── Reassigned / Escalated ─────────────────────────┘
```

Those timestamps give you, for free: **acknowledge time**, **response time** (assigned → on scene),
**clearance time** (on scene → resolved), and **total incident duration**. Those four numbers are
the report an LGU actually wants, and they are far more persuasive in a defence than another bar
chart.

### 6.3 Auto-recommendation (what "assign based on the crucial report" should mean)

Score each available officer against the report and sort. Show the reasoning, do not hide it:

```
match = 40×zone_match + 25×availability + 20×(1 − workload_today/max_workload)
      + 15×shift_overlap      − penalty if already on a P1
```

Then the dispatcher still clicks — the system recommends, a human decides. Say that explicitly in
the UI ("Recommended: BTAO-17 · same zone, available, 2 tasks today"). Right now the officer pool
shows `100 − workload` as a "score", which looks like a match score but is not one.

### 6.4 Priority and SLA

Map severity to priority and give each one a target: P1 Critical (5 min), P2 Heavy (10 min),
P3 Moderate (20 min). Show a live countdown on each open assignment and flag breaches. This turns
the dispatch board from a list into an operations tool.

### 6.5 Field feedback loop

Two small additions with outsized value:

- **False-positive flag** — one click on a report marks it "not congestion". That gives you
  labelled data for tuning YOLO thresholds and an honest accuracy figure for your paper.
- **Advisory linkage** — record which advisory was broadcast for which report, closing the loop
  detection → report → dispatch → public advisory. That full chain is the story of the system.

---

## 7. UI / UX and information architecture

Current nav is Traffic Map · Congested Reports · Assign Officer · Analytics. That mixes a live
operations view with an admin view and has no home for officer records or system settings.

Proposed structure:

| Page | Purpose | Notes |
|---|---|---|
| **Overview** | KPI strip, live map, alert panel, active officers | New landing page. First screen a barangay official sees. |
| **Live Monitor** | Map + detections + embedded Tailscale camera stream + current stats | The current Traffic Map, plus real video replacing the SVG placeholder. |
| **Analytics** | Tabbed: Volume · Congestion · Speed · Vehicle mix · Peaks · Prediction | Too much for one scroll. Tabs with a shared date-range picker. |
| **Reports** | List + detail + evidence + resolution | Already strong. Add resolution time and camera/zone ID to each row. |
| **Dispatch** | Kanban by assignment status with SLA timers | Status columns beat a flat list once there is a real lifecycle. |
| **Officers** | Directory, profiles, shift roster, performance | New. Currently has nowhere to live. |
| **Advisories** | Compose, history, delivery status | Split out of the map page. |
| **Settings** | Thresholds, ROI/line calibration, cameras, users, retention | New. Stop hardcoding constants in JS. |

Design principles to hold to:

- **Every number states its source and freshness.** "11 vehicles · from camera · 2 s ago" beats a
  bare "11". You already do this with the VISION/SIM tag — extend it everywhere.
- **Never present simulated data as real.** Keep the SIM badge, make it loud, and put a "camera
  offline" banner on the Overview when `last_seen_at` is older than 30 s.
- **Colour means one thing.** Right now severity and status both use amber/red. Severity keeps the
  traffic-light palette; status uses neutral/indigo/slate. (The Reports page already does this —
  apply it everywhere.)
- **Charts need axes and units.** The reference charts you shared have no units. Every axis gets a
  label: vehicles/hour, km/h, % occupancy.
- **Design for the panel presentation.** A judge will ask "is this live?" — a visible timestamp,
  a health indicator, and an honest empty state answer that before they ask.

Keep the existing MVC structure. It is clean and the separation is real. The change is that
`store.js` calls an API instead of `localStorage`, which is one layer, one file.

---

## 8. Phased roadmap

**Phase 0 — Keep the demo working — ✅ DONE**
SD-card write pattern replaced with append-only JSONL, smoothing window made time-based, dead
`getReportSource()` branch fixed, vision score no longer overwritten by manual edits.
*Still outstanding: login credentials are still hardcoded in `store.js` — that moves in Phase 2
with real session auth.*

**Phase 1 — Measure the right things — ✅ DONE**
Counting line + direction, road ROI, occupancy %, continuous score with a CRITICAL band, speed
calibration to km/h, payload v2, `health` block. Still writes JSON locally, so the existing
dashboard keeps working. Delivered:

| File | What it does |
|---|---|
| `vision/site_config.json` | ROI, counting lines, homography, capacity, free-flow speed, score weights — all normalised 0–1 |
| `vision/traffic_vision.py` | Rewritten: threaded capture, ID-keyed tracker, counting lines, occupancy, continuous scoring, NCNN backend, health block, JSONL output |
| `vision/calibrate.py` | Click the ROI / counting line / speed rectangle on a real frame and save to config |
| `vision/selftest.py` | Whole pipeline on synthetic detections — no camera, no YOLO |
| `vision/make_sample_data.py` | A day of realistic v2 data for dashboard work, labelled SAMPLE DATA in the UI |

*Still to do at the site: stand at the intersection and hand-count 10 minutes against the system.
That comparison belongs in your paper, and it is the only way to know the thresholds are right.*

**Phase 2 — Backend**
MySQL schema, `api/ingest.php` with API key + HMAC, `api/current.php`, `api/history.php`. Pi posts
with a SQLite spool for outages. Real PHP session auth with hashed passwords and roles. Swap
`store.js` from `localStorage` to `fetch`. Cron rollups and retention.

**Phase 3 — Operations**
Full assignment lifecycle with timestamps, officer profiles, auto-recommendation, SLA timers,
Kanban dispatch, false-positive flag, advisory linkage.

**Phase 4 — Analytics that need history — ✅ BUILT, ⏳ WAITING ON DATA**
The code is written and verified against the sample generator. It will not say anything true
about Villamonte until the Pi has logged ~2 weeks. Delivered:

| File | What it does |
|---|---|
| `vision/traffic_vision.py` | `aggregate_minute_records()` + hourly flush → `traffic_hourly.jsonl`, one line per hour, flushed on the hour boundary and on shutdown |
| `vision/make_sample_data.py` | `--days 28` writes weeks of rollups plus 48 h of minute detail, with a live blockage injected so the detector has a real signature to catch |
| `analyticsModel.js` | `computeHeatmap`, `computeSlotBaseline`, `detectAnomalies`, `computeForecast` |
| `analytics.php` / `analyticsView.js` | Incident panel, forecast cards, congestion/volume heatmap with per-cell sample counts |
| `analyticsView.js` | PDF page 2: detected anomalies, forecast, and the historical basis behind both |

Three design choices worth defending in a viva:

- **The detector is ratio- and z-score-based against the same weekday and hour**, not a fixed
  threshold. "80 vehicles" is normal at 5 PM and alarming at 3 AM; a fixed threshold cannot
  tell those apart, and a baseline per hour-slot can.
- **The stall signature is speed collapse *with occupancy held*.** Either alone is ambiguous —
  a quiet road is also slow-free and empty. The conjunction is what distinguishes a blockage
  from a lull, and it is why occupancy had to exist before this phase could.
- **The forecast is a stated blend, not a model.** 35% history at +15 min up to 75% at +60 min,
  because the near term is dominated by what is happening now and the far term by what this slot
  normally does. Every card shows its own basis and confidence. A neural net here would be
  unexplainable *and* worse, on this much data.

Each of the three refuses to answer when the history is thin, naming what is missing — no
baseline, too few prior readings, no rollups yet. That is deliberate: a confident wrong forecast
is worse than a blank panel.

**Phase 5 — Field deployment**
MediaMTX + Tailscale for live video, systemd service with watchdog, camera-offline alerting,
enclosure/power/network at the site, second camera if budget allows.

Phases 2, 3 and 5 remain, in that order. Phase 4 is built ahead of Phase 2 on purpose — the
analytics were designed against a generator that produces the exact shape the Pi will produce,
so the day real history exists the panels light up with no further work. What they cannot do is
invent the history.

---

## 9. Risks and honest limitations

| Risk | Reality | Mitigation |
|---|---|---|
| Pi 5 running YOLO + RTSP stream | 4 GB is enough, CPU is the constraint | NCNN export, 320 inference, frame skipping, one camera consumer |
| Night / rain / glare accuracy | YOLOv8n on COCO degrades badly at night | IR illumination or a camera with good low-light; measure and *report* night accuracy rather than hiding it |
| Occlusion and ID swaps | Greedy centroid matching will swap IDs in dense traffic | Counting-line dedup limits the damage; ByteTrack/DeepSORT if CPU allows |
| One camera | No real multi-intersection comparison | Compare approaches, and say plainly that multi-camera is future work |
| Field internet | Drops will happen | SQLite spool + replay; never silently lose data |
| Shared hosting limits | Long-running processes and huge tables are not welcome | Rollups + retention keep the DB small; no daemons on Hostinger |
| Privacy | You are recording a public road | Do not store plates or faces; keep only counts and short-lived evidence snapshots; document a retention policy — a panel will ask |

---

## 10. Immediate next actions

Phases 0, 1 and 4 are done in code. What is left is work only you can do, because it happens at
the site:

1. **Record 2–3 minutes of footage** from where the camera will actually be mounted, at the angle
   it will actually have. Everything below depends on it.
2. **Calibrate against that footage**: `python calibrate.py --source clip.mp4`. Draw the road ROI
   (key 1), the counting line (key 2), and the 4-point speed rectangle (key 3), then press `s`.
   You will be asked for two real measurements in metres — take a tape to the intersection and
   write them down; do not estimate lane width.
3. **Validate against a hand count.** Run the node on the same clip and compare `totals.today`
   with what you count by eye over ten minutes. If it over-counts, the line is probably too close
   to where vehicles stop; if it under-counts, raise `max_match_distance_px`.
4. **Tune `capacity_vehicles` and `free_flow_kph`** in `site_config.json` from your own first week.
   Free-flow speed is the 85th percentile of observed speeds during a light hour. These two numbers
   set the whole congestion scale, and a panel will ask where they came from.
5. **Then start Phase 2** (MySQL + `api/ingest.php`) and begin collecting for real. The heatmap,
   the incident detector and the forecast are already built and already refuse to guess — they
   are waiting on roughly two weeks of `traffic_hourly.jsonl`, and that clock only starts once
   the Pi is logging at the site. Getting the node running is now the single highest-value task,
   because everything else is downstream of the data it produces.

### Running the node on the Pi

```bash
# One-time: 2-3x faster inference on a Pi 5
yolo export model=yolov8n.pt format=ncnn

# Verify the install without a camera
python selftest.py

# Production run
python traffic_vision.py --source 0 --no-display --backend ncnn \
                         --inference-size 320 --detect-every 2 --threads 3
```
