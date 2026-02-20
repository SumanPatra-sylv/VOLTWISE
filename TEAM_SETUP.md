# VoltWise — Team Setup & Work Division (4 People)

> **Share this file with everyone on the team.**

---

## 🔧 First: What Everyone Must Install

Every team member needs these installed **before touching any code**:

### Required

| Tool | Command / Link | Why |
|------|---------------|-----|
| **Node.js v20+** | [nodejs.org](https://nodejs.org) (LTS) | Runtime |
| **Git** | [git-scm.com](https://git-scm.com) | Version control |
| **VS Code** | [code.visualstudio.com](https://code.visualstudio.com) | IDE |
| **pnpm** (recommended) or npm | `npm install -g pnpm` | Package manager |

### VS Code Extensions (Everyone)

| Extension | Why |
|-----------|-----|
| ESLint | Catch errors |
| Tailwind CSS IntelliSense | Autocomplete classes |
| Prettier | Consistent formatting |
| GitLens | See who changed what |

### After Cloning the Repo

```bash
git clone <your-repo-url>
cd voltwise
npm install          # installs all dependencies from package.json
```

This single command installs everything — React, Vite, Tailwind, Recharts, Framer Motion, Lucide icons, TypeScript, etc. **Nobody needs to install anything extra individually.**

### Environment File

Each person creates their own `.env.local` (this file is gitignored, never committed):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:8000/api
```

> **Share the Supabase URL and anon key via private DM, not in the repo.**

---

## 👥 Work Division (4 People)

### The Problem with AI IDEs

When multiple people use AI IDEs (Cursor, Copilot, Gemini Code Assist), the AI will:
- Rewrite entire files instead of editing specific lines
- Change formatting/style inconsistently
- Modify shared files that others are also editing → **merge conflicts**

### The Solution: **Work on Separate Files, Never the Same File at the Same Time**

---

### Role Assignment

| Role | Person | Works On | Branch |
|------|--------|----------|--------|
| **P1 — Database + Auth** | (assign) | Supabase setup, `services/supabase.ts`, auth flow, `services/api.ts` refactor | `feat/supabase-integration` |
| **P2 — Consumer Screens** | (assign) | `screens/Home.tsx`, `screens/Insights.tsx`, `screens/Control.tsx`, `screens/TariffOptimizer.tsx` | `feat/consumer-screens` |
| **P3 — Billing + Complaints** | (assign) | `screens/BillHistory.tsx`, `screens/Notifications.tsx`, `screens/Profile.tsx`, `screens/Onboarding.tsx` | `feat/billing-complaints` |
| **P4 — FastAPI Backend** | (assign) | New folder: `backend/` (Python, completely separate) | `feat/backend-api` |

---

### P1 — Database + Auth (Foundation Layer)

**This person works first. Others depend on their work.**

#### Files to Create/Modify

| Action | File | What |
|--------|------|------|
| CREATE | `services/supabase.ts` | Supabase client setup |
| MODIFY | `services/api.ts` | Replace mock returns with real Supabase calls |
| MODIFY | `.env.local` | Add Supabase keys |
| CREATE | `types/database.ts` | TypeScript types matching DB schema |
| MODIFY | `contexts/AppContext.tsx` | Add Supabase auth state |
| MODIFY | `screens/Onboarding.tsx` | Real OTP/signup flow |

#### Steps

1. Run `database_setup.md` Steps 1–20 in Supabase SQL Editor
2. Install SDK: `npm install @supabase/supabase-js`
3. Create `services/supabase.ts`:
   ```typescript
   import { createClient } from '@supabase/supabase-js'
   export const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY
   )
   ```
4. Refactor `services/api.ts` to use real Supabase queries
5. Test: signup, login, profile fetch, appliance list

#### ⚠️ Dependency Warning

> P2 and P3 **import from `services/api.ts`**. The function signatures (names, parameters, return types) **must not change**. Only the internal implementation changes (mock → real). This way P2/P3 don't need to change anything.

---

### P2 — Consumer Screens (UI + Data Binding)

**Can start immediately with mock data. Switches to real data after P1 merges.**

#### Files to Modify

| File | What to Do |
|------|------------|
| `screens/Home.tsx` | Wire dashboard to `api.getDashboardStats()`, add Realtime subscription |
| `screens/Insights.tsx` | Wire charts to `api.getConsumptionBreakdown()`, `api.getDailyTrend()` |
| `screens/Control.tsx` | Wire appliance toggles to `api.toggleAppliance()`, add scheduling UI |
| `screens/TariffOptimizer.tsx` | Wire to `api.getTariffRates()`, add recommendation cards |
| `components/LiquidGauge.tsx` | Already done — no changes needed |

#### Rule: DON'T Touch These Files

- ❌ `services/api.ts` — P1 owns this
- ❌ `contexts/AppContext.tsx` — P1 owns this
- ❌ `App.tsx` — only modify if adding new routes (coordinate with team)

---

### P3 — Billing, Notifications, Profile

**Can start immediately with mock data.**

#### Files to Modify

| File | What to Do |
|------|------------|
| `screens/BillHistory.tsx` | Wire to `api.getBillHistory()`, add PDF download, payment flow |
| `screens/Notifications.tsx` | Wire to `api.getNotifications()`, add mark-as-read, Realtime subscription |
| `screens/Profile.tsx` | Wire to `api.getProfile()`, add edit profile, link meter |
| `screens/Rewards.tsx` | Wire to `api.getAchievements()`, `api.getChallenges()` |
| `screens/Onboarding.tsx` | Only if P1 hasn't claimed it — coordinate! |

#### Rule: DON'T Touch These Files

- ❌ `services/api.ts` — P1 owns this
- ❌ `screens/Home.tsx` — P2 owns this
- ❌ `screens/Insights.tsx` — P2 owns this

---

### P4 — FastAPI Backend

**Completely independent. Works in a separate `backend/` folder.**

#### Setup

```bash
# Create backend folder (in project root)
mkdir backend
cd backend
python -m venv venv
venv\Scripts\activate     # Windows
pip install fastapi uvicorn supabase python-dotenv razorpay httpx
```

#### Files to Create

```
backend/
├── main.py                  # FastAPI app + CORS setup
├── requirements.txt         # pip freeze
├── .env                     # SUPABASE_URL, SUPABASE_SERVICE_KEY, RAZORPAY keys
├── routers/
│   ├── appliances.py        # POST /api/appliances/{id}/toggle
│   ├── scheduling.py        # POST /api/appliances/{id}/schedule
│   ├── plugs.py             # POST /api/plugs/pair, GET /api/plugs/{id}/status
│   ├── billing.py           # GET /api/billing/simulate
│   ├── payments.py          # POST /api/payments/create-order, verify
│   ├── recharge.py          # POST /api/recharge/create-order, verify
│   ├── carbon.py            # GET /api/carbon/stats, comparison
│   ├── nilm.py              # POST /api/nilm/disaggregate
│   ├── scheduler.py         # Internal cron endpoints
│   └── admin/
│       ├── reports.py       # GET /api/admin/reports/*
│       └── exports.py       # GET /api/admin/export
├── services/
│   ├── supabase_client.py   # Supabase service-role client
│   ├── tuya_service.py      # Tuya IoT API wrapper
│   └── razorpay_service.py  # Razorpay gateway
└── utils/
    └── auth.py              # JWT verification middleware
```

#### Rule

- ✅ This is a separate folder — **zero conflict risk** with frontend
- The only "contract" is `api_endpoints.md` — follow those exact routes and response shapes
- Run with: `uvicorn main:app --reload --port 8000`

---

## 🌿 Git Branch Strategy

```
main (protected — no direct pushes)
  │
  ├── feat/supabase-integration   (P1)
  ├── feat/consumer-screens       (P2)
  ├── feat/billing-complaints     (P3)
  └── feat/backend-api            (P4)
```

### Rules

| Rule | Why |
|------|-----|
| **Never push to `main` directly** | Everyone merges via Pull Request |
| **Pull from `main` daily** | `git pull origin main` before starting work |
| **Small, frequent commits** | Don't accumulate 20 files in one commit |
| **Descriptive commit messages** | `feat: wire Home.tsx to real dashboard API` not `update` |
| **Don't commit `node_modules/`** | Already in `.gitignore` |
| **Don't commit `.env.local`** | Already in `.gitignore` |

### Daily Workflow (Everyone)

```bash
# 1. Start of day — get latest
git checkout main
git pull origin main
git checkout your-branch
git merge main              # bring main's changes into your branch

# 2. Work on your files...

# 3. End of day — push
git add .
git commit -m "feat: description of what you did"
git push origin your-branch
```

### Merge Order

Since P1's work is the foundation:

```
1. P1 merges first  →  main now has Supabase client + real API
2. P4 merges second →  main now has backend
3. P2 merges third  →  main now has wired consumer screens
4. P3 merges last   →  main now has wired billing/profile
```

P2, P3, P4 can develop **in parallel** on their branches. They just merge **sequentially**.

---

## ⚠️ Danger Zones — Files That Cause Conflicts

These files are touched by multiple people. **Only one person modifies them at a time:**

| File | Owner | Others Must Ask First |
|------|-------|-----------------------|
| `services/api.ts` | P1 | P2, P3 need to coordinate if they want new API functions |
| `App.tsx` | Shared | Anyone adding routes announces in group chat first |
| `contexts/AppContext.tsx` | P1 | P2/P3 only read from context, never modify it |
| `package.json` | P1 | If anyone runs `npm install <something>`, tell the group |
| `constants.tsx` | Nobody after P1 merges | Will be deprecated once real data flows |
| `types.ts` | P1 | Expand as needed, but coordinate |

### If You Get a Merge Conflict

```bash
# Git will tell you which files conflict
# Open the conflicted file — you'll see markers like:
<<<<<<< HEAD
  your code
=======
  their code
>>>>>>> main

# Keep the correct version, delete the markers
# Then:
git add .
git commit -m "merge: resolve conflict in App.tsx"
```

### AI IDE Rule (CRITICAL)

> [!CAUTION]
> **Tell your AI IDE: "Only modify the file I'm asking about. Do not touch other files."**
>
> AI IDEs love to "helpfully" edit related files. This causes phantom conflicts.
>
> - Cursor: Use "Apply to current file only"
> - Copilot: Review every suggestion before accepting
> - Gemini Code Assist: Check the file list before confirming changes

---

## 📅 Suggested Timeline (Parallel Work)

```
Day 1-2:  P1 sets up Supabase DB + client + auth
          P4 sets up FastAPI skeleton + 3 endpoints
          P2 starts wiring Home.tsx + Insights.tsx (with mocks still)
          P3 starts wiring BillHistory.tsx + Notifications.tsx (with mocks)

Day 3:    P1 merges Supabase branch → main
          P2, P3 pull main → now have real Supabase client
          P2, P3 switch from mocks to real API calls
          P4 continues backend endpoints

Day 4-5:  P2 finishes consumer screens with real data
          P3 finishes billing + complaints with real data
          P4 finishes backend + merges
          P1 helps with integration issues

Day 6:    Everyone merges → full integration test
          Fix bugs, test flows end-to-end

Day 7:    Polish, deploy to Netlify (frontend) + Railway/Render (backend)
```

---

## 🔑 Shared Secrets (Don't Put in Git)

Create a private group note/doc with these. Each person copies to their `.env.local`:

| Secret | Where to Find |
|--------|--------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public |
| `SUPABASE_SERVICE_KEY` | Same page → service_role (P4 only, for backend) |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard (when set up) |
| `RAZORPAY_KEY_SECRET` | Same (P4 only) |

---

## ✅ Quick Checklist Before Starting

- [ ] Everyone has Node.js 20+ installed (`node --version`)
- [ ] Everyone has Git installed (`git --version`)
- [ ] Repo is cloned and `npm install` runs without errors
- [ ] Everyone has `.env.local` with Supabase keys
- [ ] Everyone is on their own branch (not `main`)
- [ ] Group chat created for coordination
- [ ] `database_setup.md` Steps 1-20 run in Supabase ✅
- [ ] VS Code extensions installed
