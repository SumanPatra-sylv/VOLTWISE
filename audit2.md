Plan: Full VoltWise Project Audit
TL;DR: After auditing every file across frontend (12 screens, 6 components, services, context, utils), backend (2 routers, 8 services, 1 adapter), database (14 SQL files), NILM pipeline, and all documentation — VoltWise is a well-architected PoC with significant mock/simulation gaps. Real data flows exist for dashboards, tariff optimization, and appliance control state management, but IoT hardware integration is 100% stubbed, 3 major screens are entirely fake, security has critical gaps (unverified JWT, no payment verification), and the single-process architecture cannot scale beyond ~1,000 homes. Against the success metrics, the project scores approximately 55-60% as a PoC.

Section 1: Real vs Mock Reality Matrix
Frontend Screens:

Screen	Data Source	Status	Notes
Home	Supabase RPC get_dashboard_stats + realtime	REAL	Progress bar hardcoded at 65% width
Insights	Supabase daily_aggregates + appliances	MOSTLY REAL	ACTIVE_DEVICES_PREVIEW still mock from constants.tsx; "On Track" badge always shown
Control	Supabase + FastAPI backend	REAL	currentSlotRate = 7.42 never updated from real tariff
Rewards/Carbon	Supabase multi-query carbon dashboard	REAL	Emission factors hardcoded in api.ts
Optimizer	Supabase + tariff engine + backend	REAL	Well-implemented
Profile	AppContext + carbon API	REAL	"3 New" notifications badge hardcoded
Onboarding	Supabase auth	REAL	2 demo consumer numbers hardcoded in AppContext.tsx
AdminDashboard	Supabase queries	BROKEN	Uses supabase.auth.admin.getUserById() which requires service_role key — fails with anon key
BillHistory	Local arrays in component	100% MOCK	Zero DB connection
Notifications	Local arrays in component	100% MOCK	Zero DB connection
SmartPlugSetup	setTimeout simulations	100% SIMULATED	No device pairing, no DB writes, fake WiFi password "password123"
TariffOptimizer	constants.tsx mock	DEAD CODE	No route in App.tsx — unreachable
Backend Services:

Component	Status	Details
Tuya smart plug commands	100% STUB	_send_tuya_command() in device.py always returns True
Smart plug power monitoring	100% STUB	_check_smart_plug_power() always returns None
Grid protection data	100% MOCK	MockGridSource returns hardcoded {status: "normal", frequency: 50.02, voltage: 230.5}
DISCOM API integration	0%	DiscomAPISource is an empty skeleton
Carbon intensity	STATIC SEED	48 rows pre-seeded from CEA data, no live API
Supabase DB operations	REAL	All CRUD functional
APScheduler scheduling	REAL	Cron/date triggers work, but in-memory only
Penalty engine math	REAL	Weighted multi-objective optimization
Tariff transition detection	REAL	Only fires on the hour
JWT auth	DECORATIVE	Token decoded but NOT signature-verified
Database/Seed Data:

Data Layer	Status
DISCOMs (SBPDCL, MGVCL)	REAL references to actual companies
Tariff slab rates	REAL from BERC/GERC 2025-26
ToD slot rates	SIMULATED (0.85x/1.0x/1.2x multipliers)
Consumer master (100 entries)	MOCK with fictitious names
Daily aggregates (30 days)	SEEDED with random()
Carbon intensity (48 hourly points)	SEMI-REAL from CEA, interpolated
Meter readings	NONE — no seed data
Bills	NONE — bill history screen can't show anything real
NILM results	NONE — get_consumption_breakdown() returns empty
Section 2: Critical Bugs & Wrong Logic
CRITICAL (will cause failures/security breaches):

#	Location	Bug
1	appliances.py _decode_jwt_payload()	JWT decoded without signature verification. Anyone can forge a token with any sub (user ID). No ownership check — user A can toggle user B's appliances.
2	RechargeModal.tsx	No server-side Razorpay payment verification. Client-side callback is trusted. An attacker can spoof razorpay_payment_id and update balance without paying. Balance update is 2 separate calls with no transaction.
3	autopilot.py ~line 541	get_grid_status calls check_grid_status(discom_id) without await — returns a coroutine object instead of data. Endpoint is broken.
4	AppContext.tsx + AdminDashboard.tsx	supabase.auth.admin.getUserById() requires service_role key — will fail with the anon key on the client side
5	supabase.ts	Falls back to 'https://placeholder.supabase.co' if env vars missing — app silently connects to nothing
6	00_disable_rls.sql	Grants DELETE on all tables to any authenticated user. Missing RLS disable for 5+ tables added in later migrations (those tables become unreachable)
HIGH (incorrect behavior):

#	Location	Bug
7	tariff_watcher.py ~line 143	Calls execute_peak_entry/execute_peak_exit which don't exist in autopilot.py. Would crash at runtime (currently dead code but dangerous)
8	transition_watcher.py ~line 206	region_code defined in carbon try-block but used in penalty try-block — NameError if carbon block throws
9	Control.tsx	currentSlotRate = 7.42 hardcoded, never updated from real tariff data — rate shown is always ₹7.42/kWh
10	appliances.py toggle_appliance	new_status set based on body.action regardless of ctrl.success — reports success even when adapter fails
11	11_enable_realtime.sql	meter_readings NOT in realtime publication — live dashboard meter updates documented in userside.md won't work
12	02_setup.sql get_dashboard_stats (base version)	Midnight-crossing slot matching fails. Fixed in 07_migration.sql but base file still ships broken
MEDIUM:

#	Location	Bug
13	Insights.tsx	changePercent → Infinity/NaN when previous day value is 0
14	Insights.tsx	Color array has 6 entries — if >6 appliance categories, chart colors are undefined
15	ApplianceCard.tsx	Inline schedule picker saves to local state only — schedules lost on unmount
16	InterceptorModal.tsx	Deletes ALL active schedules for appliance before creating new one — nukes valid multi-schedules
17	scheduler_manager.py	cancel_schedule uses datetime.now() (naive) while other code uses datetime.now(timezone.utc) — timezone inconsistency
18	carbon.py	Dedup logic takes first entry per hour, not latest effective_from
Section 3: Hardcoded Data & Magic Numbers
File	Hardcoded Value	Impact
constants.tsx	ALL data: balance 550, YTD 2451, 4 mock appliances, 12 tariff rates, carbon stats, achievements	Used as fallbacks across multiple screens
api.ts	REGIONAL_AVERAGE_KWH = 250, CO2_PER_TREE_PER_MONTH = 1.75, emission factors (0.90/0.75/0.82), fallback rates (9.55/6.31)	Carbon calculations
Control.tsx	currentSlotRate = 7.42	Displayed to users as "current rate"
Home.tsx	Progress bar width: '65%'	Always shows 65% regardless of actual
Profile.tsx	"3 New" notifications, version "v1.0.2"	Misleading UI
autopilot.py	savings = power_kw * 3.24	Magic tariff rate in simulate_peak, not from user's actual plan
penalty_engine.py	DEFAULT_PENALTY_THRESHOLD = 0.6, strategy weights (0.7, 0.3), fallback carbon 680	Core optimization tuning
carbon.py	INDIA_AVG_GCO2 = 680.0, only Bihar+Gujarat in region map	All other states fall back to Bihar
grid_protection.py	Mock frequency 50.02Hz, voltage 230.5V	Grid status always "normal"
config.py	timezone = "Asia/Kolkata" single-zone assumption	Cannot support multi-timezone users
AppContext.tsx	Demo consumers '100100100101', '10010010201' with fabricated DBConsumerMaster objects	Demo mode
BillHistory.tsx	Entire screen: 12 months fake amounts, 5 fake bills, savedThisYear = 4200	100% mock
Notifications.tsx	10 fake notifications with hardcoded relative times	100% mock
SmartPlugSetup.tsx	Serial "VW-2024-PRO-8821", WiFi "password123", confidence scores (98%, 94%, 87%, 72%)	100% simulated
Section 4: Scalability Assessment
Can it handle millions of users? NO — not in its current architecture. Here's why:

Bottleneck	Location	Impact	Fix
In-memory APScheduler	main.py, scheduler_manager.py	Jobs lost on restart. Cannot run multiple backend instances (duplicate firing). 1M schedules will consume excessive RAM.	Migrate to Celery + Redis/RabbitMQ with distributed task queue
Synchronous home iteration	transition_watcher.py	Iterates ALL homes every 60s single-threaded. At 1M homes: each needing tariff+carbon+penalty calc → timeout	Batch processing with worker pools, event-driven architecture
Supabase REST API as sole DB interface	database.py	HTTP overhead per query, no connection pooling. Each DB call is an HTTP round-trip.	Direct PostgreSQL via asyncpg + PgBouncer
Sequential device processing	autopilot.py, grid_protection.py	Each device one-by-one	asyncio.gather() for parallel device commands
No table partitioning	02_setup.sql meter_readings, plug_readings	96 readings/day × millions of meters = billions of rows with no partition strategy	TimescaleDB hypertables or native PostgreSQL range partitioning
Single context re-renders	AppContext.tsx	Auth, profile, meter data all in one context — any change re-renders entire app tree	Split into AuthContext, ProfileContext, MeterContext
No route-level code splitting	App.tsx	All 12 screens loaded in initial bundle	React.lazy() + Suspense
No API rate limiting	All backend routers	No protection against abuse	Add middleware rate limiter (slowapi)
AdminDashboard N+1 queries	AdminDashboard.tsx	Fetches homes+meters individually per user, no pagination	Batch queries, server-side pagination
In-memory caches grow unbounded	transition_watcher.py _last_carbon_cache, _last_penalty_cache	One entry per home, never evicted	Add TTL-based eviction or move to Redis
Section 5: DISCOM & OEM API Integration Readiness
DISCOM Integration: 15% ready

Schema has discoms table with 2 seeded DISCOMs (SBPDCL, MGVCL) ✅
Tariff structure supports dynamic plans with ToD slots ✅
consumer_master lookup table exists for consumer number validation ✅
Missing: No DLMS/COSEM protocol handler for real meter data ingestion
Missing: No MDAS (Meter Data Acquisition System) integration endpoint
Missing: No billing reconciliation with DISCOM billing systems
Missing: DiscomAPISource in grid_protection.py is an empty skeleton
Missing: No NRLDC/SLDC frequency data feed
Missing: No prepaid vending integration (STS token generation)
OEM API Integration: 5% ready

Adapter pattern exists (TuyaAdapter / VirtualAdapter) — architecture is correct ✅
tinytuya is in requirements.txt ✅
Missing: _send_tuya_command() is a stub that always returns True
Missing: _check_smart_plug_power() always returns None
Missing: No Tuya Cloud API OAuth flow
Missing: No device discovery/pairing protocol
Missing: No support for other OEMs (Sonoff, Meross, SmartThings, Alexa)
Missing: No MQTT broker for real-time device telemetry
Section 6: Success Metrics Scoring
Metric	Target	Current Score	Assessment
Adoption: Onboard within 5 min	5 min	70%	Auth + consumer linking works. Smart plug setup is simulated (no real pairing). Onboarding flow is clean but device addition is manual.
Convenience: 3+ appliances controllable	3 appliances	40%	Toggle/schedule UI exists for unlimited appliances. BUT: all control is virtual (DB status updates only). Smart plug commands = stub. Schedules are cosmetic until APScheduler executes them. Physical device control = 0%.
Optimization: 10-15% cost savings via ToD	10-15% savings	65%	Tariff optimizer engine is well-built: real ToD slot matching, cost calculations, InterceptorModal with schedule suggestions, Optimizer screen with batch actions. Penalty engine with multi-objective optimization exists. BUT: savings can't be demonstrated without real meter data comparing before/after. Carbon seed data shows artificial improvement trend.
Reliability: ≥99% uptime	99% uptime	30%	Single-process APScheduler = single point of failure. No health monitoring dashboard. No auto-restart. No horizontal scaling. In-memory job store = jobs lost on restart. Netlify (frontend) is reliable, but backend on single server is not.
Sustainability: Visible CO₂ reduction	Visible tracking	60%	Carbon dashboard exists with emissions donut, daily trends, optimization comparison, eco scores. CEA-derived intensity data is semi-real. BUT: values are computed from seed data, not measured. India average (680 gCO₂/kWh) is accurate but not per-household. No integration with Electricity Maps or WattTime for live data.
Overall Score: ~55-60% as a PoC prototype

Section 7: What's Missing
Critical Missing Features:

Real IoT device communication — The entire promise of "Control appliances (turn ON/OFF)" is simulated. Need real Tuya/MQTT integration.

Meter data ingestion pipeline — No DLMS/COSEM, no MDAS integration, no way to get real smart meter readings into the system. meter_readings table exists but has zero data flow.

Working bill history — BillHistory.tsx is 100% fake. The bills table exists in the schema but nothing generates bills.

Working notifications — Notifications.tsx is 100% fake. Backend notification service exists but the frontend doesn't read from DB.

Real smart plug setup — SmartPlugSetup.tsx is pure theater. No BLE/WiFi pairing, no Tuya device registration.

Payment verification — Server-side Razorpay signature verification is completely missing.

No testing — Zero unit tests, zero integration tests, zero E2E tests. No testing libraries in dependencies.

No monitoring/observability — No Sentry, no logging aggregation, no health dashboards, no performance metrics.

Missing for Production:

No email verification / password reset flow
No rate limiting on any endpoint
No input validation server-side
No API versioning (no /v1/ prefix)
No caching layer (Redis)
No background job queue (Celery)
No CI/CD pipeline
No mobile app (web only, no React Native / Flutter)
No voice assistant integration (mentioned as optional in problem statement)
No dark mode
No multi-language support (important for Indian consumers across states)
No offline support / PWA capabilities
Section 8: Detailed Fix Plan
Phase 1: Critical Fixes (Week 1-2)

Fix JWT verification in appliances.py — Use PyJWT with Supabase JWT secret to verify signatures. Add ownership checks on all endpoints (verify user owns the appliance/home).

Fix Razorpay payment — Create POST /api/payments/verify endpoint in backend that verifies the Razorpay signature server-side using razorpay.utility.verify_payment_signature(). Only update meter balance after server verification.

Fix missing await in autopilot.py get_grid_status — Add await before check_grid_status(discom_id).

Fix Supabase placeholder fallback — Throw an error in supabase.ts if env vars are missing instead of silently connecting to placeholder.

Fix admin API calls — Proxy getUserById() through FastAPI backend which has service_role key. Remove client-side supabase.auth.admin calls from AppContext.tsx and AdminDashboard.tsx.

Fix currentSlotRate in Control.tsx — Fetch from tariff_slots table based on current hour, same as Home screen does.

Fix transition_watcher.py NameError — Move region_code declaration before both try-blocks with a default fallback.

Fix realtime publication — Add meter_readings and plug_readings to supabase_realtime publication in 11_enable_realtime.sql.

Fix RLS — Update 00_disable_rls.sql to include all tables from migrations 05, 12, 13.

Phase 2: Replace Mock Screens (Week 2-4)

Bill History — Connect BillHistory.tsx to bills table. Create a billing engine (either RPC function or backend cron) that generates monthly bills from daily_aggregates + tariff slabs. Show real data.

Notifications — Connect Notifications.tsx to notifications table. The backend already creates notifications (tariff transitions, schedule executions) — just read them.

Smart Plug Setup — Implement real Tuya device pairing using tinytuya / Tuya Cloud API. Steps: Tuya Cloud OAuth → device scan → WiFi provisioning → device registration → DB write.

Remove dead code — Delete TariffOptimizer.tsx (unreachable), tariff_watcher.py (dead, uses non-existent functions).

Phase 3: Real IoT Integration (Week 4-8)

Implement _send_tuya_command() in device.py — Replace stub with actual tinytuya.OutletDevice control commands (turn on/off, get status).

Implement _check_smart_plug_power() — Use Tuya device status API to read real-time power consumption from smart plugs.

Add MQTT broker — Deploy Mosquitto/EMQX for real-time device telemetry. Subscribe to Tuya device status changes.

Meter data pipeline — Create ingestion endpoint POST /api/meter-readings/ingest that accepts DLMS/COSEM formatted data from smart meters (or simulated MDAS feed).

Phase 4: Scalability (Week 8-12)

Replace APScheduler with Celery + Redis — Distributed task queue, survives restarts, horizontally scalable.

Replace Supabase REST with direct PostgreSQL (asyncpg + PgBouncer) for backend — Keep Supabase client for frontend only.

Partition time-series tables — Use PostgreSQL range partitioning on meter_readings and plug_readings by month.

Split AppContext into AuthContext, ProfileContext, MeterContext to reduce re-renders.

Add route-level code splitting with React.lazy() + Suspense in App.tsx.

Add Redis caching for frequently accessed data (tariff slots, carbon intensity, user profiles).

Enable strict: true in tsconfig.json and fix all TypeScript errors.

Phase 5: Production Readiness (Week 12-16)

Add testing — Jest/Vitest for unit tests, Playwright for E2E. Target ≥70% coverage on tariffOptimizer.ts, penalty engine, and scheduler.

Add monitoring — Sentry for error tracking, Prometheus + Grafana for metrics, structured logging.

Add CI/CD — GitHub Actions: lint → typecheck → test → build → deploy.

Add rate limiting — slowapi middleware on FastAPI with per-user limits.

Add input validation — Pydantic models for all request bodies (some already exist, extend to all).

API versioning — Prefix all endpoints with /v1/.

Add email verification and password reset flows.

PWA support — Add service worker, manifest.json, offline caching for critical screens.

Verification

Run all SQL migrations in order on a fresh Supabase instance, verify zero errors
JWT test: forge a token, attempt API call, verify it's rejected
Razorpay test: simulate payment with mock Razorpay key, verify server-side verification
Smart plug: pair a real Tuya device, toggle via app, verify physical state change
Schedule: create schedule, wait for trigger time, verify appliance state changes
Load test: simulate 1,000 concurrent homes with k6, verify <2s response times
Bill generation: run billing engine, verify bill matches manual calculation from tariff slabs
Decisions

Chose Celery+Redis over APScheduler for production scheduling (horizontal scaling)
Chose asyncpg+PgBouncer over Supabase REST for backend DB (connection pooling)
Chose Tuya as primary OEM (already architectured) over building multi-OEM from start
Kept tariff optimization math in frontend for instant UI (backend has authoritative copy for autopilot)
Recommended PostgreSQL native partitioning over TimescaleDB (fewer dependencies)
This is the complete audit draft. Shall I proceed to write it as FULL_AUDIT.md in the project root? Let me know if you'd like any section expanded or modified before implementation.