# Choice Grid — Monorepo & Admin Guide

Choice Grid is a daily habit tracker built around a monthly 2D grid system with automated streak calculation, grace periods, and internal production monitoring.

```
choice-grid/ (Monorepo Root)
├── choice-web/             # React 18 + Vite + Tailwind CSS Frontend (:5173)
├── choice-grid-backend/    # Node.js + Express + MongoDB REST API (:5001)
├── README.md               # Quickstart & Admin operations guide (this file)
└── README_MONITORING.md    # Detailed SRE & telemetry reference
```

---
 
## Quickstart

### 1. Backend (:5001)
```bash
cd choice-grid-backend
npm install
npm run dev
```

### 2. Frontend (:5173)
```bash
cd choice-web
npm install
npm run dev
```

---

## Admin Operations: Checking Analytics & Monitoring

Because Choice Grid does not expose a public admin UI, administrators query operational metrics and live server telemetry via authenticated endpoints.

### Quick Reference: Admin Endpoints

| Method | Endpoint | Auth Required | Purpose |
|---|---|---|---|
| `POST` | `/api/admin/login` | No (Requires Secret) | Generates a 24-hour signed admin JWT |
| `GET` | `/api/admin/metrics` | Yes (`Bearer <token>`) | Returns DAU, total users, habits created, logs today, avg streak |
| `GET` | `/api/status` | No | Real-time browser telemetry (CPU, RAM, latency curves) |
| `GET` | `/api/health` | No | Container uptime, MongoDB connection, process memory |

---

### Step-by-Step: How to Check Admin Analytics

#### Step 1: Get an Admin Token
Send a `POST` request to `/api/admin/login` with your `ADMIN_SECRET` (configured in `choice-grid-backend/.env`):

```bash
curl -X POST http://localhost:5001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_ADMIN_SECRET"}'
```

*(For production on Render, replace `http://localhost:5001` with your production API domain, e.g. `https://api.choicegrid.app`)*

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3ODg2NTI4ODEsImV4cCI6MTc4ODczOTI4MX0..."
}
```

---

#### Step 2: Fetch Operational Analytics & Metrics
Pass the generated token in the `Authorization` header to `/api/admin/metrics`:

```bash
curl http://localhost:5001/api/admin/metrics \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Response (200 OK):**
```json
{
  "totalUsers": 142,
  "dau": 38,
  "habitsCreated": 710,
  "logsToday": 31,
  "avgStreak": 4.65,
  "cached": false
}
```

#### What Each Metric Means:
- **`totalUsers`**: Total registered user accounts in the database.
- **`dau`**: Daily Active Users — unique users who created or updated habit logs in the last 24 hours.
- **`habitsCreated`**: Total number of habits configured across all users.
- **`logsToday`**: Total habit logs submitted for today's date in `Africa/Lagos`.
- **`avgStreak`**: Average active streak length across all users.
- **`cached`**: Responses are cached for 60 seconds via `node-cache` to protect MongoDB performance (`true` if served from cache).

---

### Step 3: Checking Live Server Telemetry & CPU/RAM
Open the status monitor in any web browser:

```text
http://localhost:5001/api/status
```

This renders a real-time dashboard powered by `express-status-monitor`:
- **CPU Utilization (%)**
- **Memory Consumption** (Heap Used vs. Total vs. RSS)
- **Event Loop Latency (ms)**
- **Requests Per Second & Response Time Curves**

---

### Step 4: Checking Container Health
To inspect container uptime and database connection status (e.g. for Render health probes or uptime diagnostics):

```bash
curl http://localhost:5001/api/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "uptime": 245.8,
  "db": "connected",
  "memory": {
    "rss": 75436032,
    "heapTotal": 38780928,
    "heapUsed": 24159840,
    "external": 2841029
  }
}
```

---

## Admin CLI Commands

### 1. Get Token Only:
```bash
curl -s -X POST http://localhost:5001/api/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"$(grep ADMIN_SECRET choice-grid-backend/.env | cut -d '=' -f2)\"}" | jq -r .token
```

### 2. Full Metrics One-Liner (Auto-reads secret from .env):
```bash
ADMIN_SEC=$(grep ADMIN_SECRET choice-grid-backend/.env | cut -d '=' -f2)
TOKEN=$(curl -s -X POST http://localhost:5001/api/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"$ADMIN_SEC\"}" | jq -r .token)
curl -s http://localhost:5001/api/admin/metrics \
  -H "Authorization: Bearer $TOKEN" | jq .
```

