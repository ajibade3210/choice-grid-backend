# Choice Grid — Monitoring, Observability & Admin Operations

This guide provides operational runbooks for Choice Grid's internal monitoring, structured logging, health checks, admin metrics, and client error tracking. All tools operate strictly within free-tier, self-contained runtimes with zero external SaaS costs and zero uptime pingers.

---

## Section 1: Frontend Event & Error Logging

Choice Grid's client monitoring uses a zero-dependency, privacy-preserving event system (`src/utils/analytics.js`).

### Architecture
- **No External Scripts:** Avoids ad-blocker dropoff (Brave, Safari ITP, uBlock) and eliminates third-party subscription costs.
- **Privacy Guarantees:** Strictly zero PII. Telemetry tracks only anonymous identifiers (`habitId`), state transitions (`'X'`, `'.'`), and integer counts.
- **React Error Trap:** `ErrorBoundary.jsx` catches uncaught rendering errors, prints the stack trace via `console.error`, and logs a structured event (`react_error`) with the sanitized error message.

### Testing Locally
Open browser DevTools (Console):
```text
[Analytics Event: habit_toggle] { habitId: 'h-1', newState: 'X' }
[Analytics Event: quicklog_used] {}
[Analytics Event: record_broken] { streak: 5 }
[Analytics Event: settings_saved] { habitCount: 5 }
```

---

## Section 2: Admin Authentication & Metrics

Because Choice Grid has no public admin UI, internal metrics are protected by an environment secret and signed 24-hour JWTs.

### 1. Generating an Admin Token
Send a `POST` request to `/api/admin/login` with your `ADMIN_SECRET`:

```bash
curl -X POST https://api.choicegrid.app/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_ADMIN_SECRET"}'
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Fetching Operational Metrics
Pass the token in the `Authorization` header:

```bash
curl https://api.choicegrid.app/api/admin/metrics \
  -H "Authorization: Bearer <TOKEN>"
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

### Field Definitions
| Field | Description | Calculation |
|---|---|---|
| `totalUsers` | Total registered accounts | `User.countDocuments()` |
| `dau` | Daily active users | Unique users with logs created/updated in last 24h |
| `habitsCreated` | Total habits defined | Sum of all user `habits.length` in `HabitSettings` |
| `logsToday` | Habits logged today | Total logs matching today's date in `Africa/Lagos` |
| `avgStreak` | Average user streak | Average `currentStreak` across all accounts |
| `cached` | Cache status | `true` if served from 60s `node-cache`, `false` if fresh query |

---

## Section 3: `/api/status` and `/api/health` Docs

### 1. Live Server Telemetry Dashboard: `/api/status`
- **Path:** `http://localhost:5001/api/status` (or your production API URL)
- **Engine:** `express-status-monitor`
- **Metrics Rendered:**
  - Real-time CPU utilization (%)
  - Process memory (RSS vs Heap Used)
  - Event loop latency (ms)
  - Request throughput & response time curves
- **Data Retention:** Retains 60 in-memory spans at 1-second intervals.

### 2. Container Health Check: `GET /api/health`
Designed for container orchestrators (Render, Docker, Kubernetes) to verify process liveness and database connectivity.

```bash
curl http://localhost:5001/api/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "uptime": 342.15,
  "db": "connected",
  "memory": {
    "rss": 75436032,
    "heapTotal": 38780928,
    "heapUsed": 24159840,
    "external": 2841029,
    "arrayBuffers": 178201
  }
}
```

- `status`: `'ok'`
- `uptime`: Seconds since container start (`process.uptime()`).
- `db`: `'connected'` when Mongoose readyState is `1`, else `'disconnected'`.
- `memory`: Process memory breakdown in bytes.

---

## Section 4: Log Sampling Architecture

### Pino Structured Logging
Choice Grid utilizes **Pino** and **pino-http** for ultra-fast, structured JSON logging to `stdout`.

### The 10% Production Sampling Rule
High-volume HTTP access logs can create massive log volumes and CPU overhead. In production, requests are sampled at a 10% rate (`LOG_SAMPLE_RATE=0.1`):

```javascript
const sampleRate = parseFloat(process.env.LOG_SAMPLE_RATE) || 0.1;
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && Math.random() > sampleRate) {
    const originalError = req.log?.error?.bind(req.log) || console.error;
    req.log = { info: () => {}, warn: () => {}, debug: () => {}, error: originalError };
  }
  next();
});
```

### The SRE Error Guarantee
- **2xx/3xx Access Logs:** Sampled at 10% in production to conserve storage and bandwidth.
- **5xx Server Exceptions:** **100% of errors are permanently captured**. `req.log.error` is never muted, ensuring all unhandled exceptions, database connection errors, and 500 stack traces appear in production logs.

---

## Section 5: Catalog of Custom Tracked Events

All custom events follow strict anonymous schemas with zero personal identifiable information:

| Event Name | Trigger | Payload Schema | Example |
|---|---|---|---|
| `habit_toggle` | User toggles any cell in the 2D grid | `{ habitId: string, newState: string }` | `{ habitId: "h-1", newState: "X" }` |
| `quicklog_used` | User clicks QuickLog to complete today's habits | `{}` | `{}` |
| `record_broken` | User surpasses their previous longest streak | `{ streak: number }` | `{ streak: 7 }` |
| `settings_saved` | User adds, reorders, or removes habits | `{ habitCount: number }` | `{ habitCount: 6 }` |
| `react_error` | Caught by `ErrorBoundary` on UI crash | `{ error: string }` | `{ error: "Cannot read property 'name' of undefined" }` |
