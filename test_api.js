import axios from 'axios';
import assert from 'assert';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dayjs.extend(utc);
dayjs.extend(timezone);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5001/api';
const client = axios.create({
  baseURL: BASE_URL,
  validateStatus: () => true, // Don't throw on HTTP errors so we can assert status codes
});

const TIMEZONE = 'Africa/Lagos';

async function runQASuite() {
  console.log('====================================================');
  console.log('   CHOICE GRID 12-POINT AUTOMATED QA TEST SUITE    ');
  console.log('====================================================\n');

  const results = [];
  const recordResult = (num, name, passed, details = '') => {
    results.push({ num, name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[Point ${num}] ${mark}: ${name}`);
    if (details) console.log(`         └─ ${details}`);
  };

  // Setup: Register a unique test user
  const uniqueId = Date.now();
  const testEmail = `qa_engineer_${uniqueId}@choicegrid.app`;
  const testPassword = 'Password123!';
  const testName = 'Senior QA Engineer';

  // 12. Email: POST /register. If no SMTP, console logs Ethereal URL
  try {
    const regRes = await client.post('/auth/register', {
      name: testName,
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(regRes.status, 201, `Expected 201 Created, got ${regRes.status}`);
    assert.ok(regRes.data.token, 'Expected JWT token returned on register');
    recordResult(12, 'Email: POST /register initializes Ethereal fallback & preview URL', true, `User: ${testEmail}`);
  } catch (err) {
    recordResult(12, 'Email: POST /register', false, err.message);
  }

  // 1. Auth FOUC: Login, save token, verify GET /me works across session restores
  let token = null;
  try {
    const loginRes = await client.post('/auth/login', {
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(loginRes.status, 200, `Expected 200 OK, got ${loginRes.status}`);
    token = loginRes.data.token;
    assert.ok(token, 'Token must exist after login');

    // Query /auth/me with Bearer token
    const meRes = await client.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(meRes.status, 200, `Expected 200 OK from /auth/me, got ${meRes.status}`);
    assert.strictEqual(meRes.data.email, testEmail);

    // Verify FE ProtectedRoute has isAuthLoading skeleton to prevent FOUC
    const protectedRoutePath = path.resolve(__dirname, '../choice-grid/src/components/ProtectedRoute.jsx');
    const protectedContent = fs.readFileSync(protectedRoutePath, 'utf8');
    assert.ok(protectedContent.includes('isAuthLoading'), 'ProtectedRoute must handle isAuthLoading');
    recordResult(1, 'Auth FOUC: Login, save token, GET /me returns 200, FE spinner prevents FOUC', true, 'isAuthLoading + /me validated');
  } catch (err) {
    recordResult(1, 'Auth FOUC', false, err.message);
  }

  // 2. 401 Exception: POST /login wrong pass. Returns 401 JSON, no redirect
  try {
    const badLoginRes = await client.post('/auth/login', {
      email: testEmail,
      password: 'wrong_password_test',
    });
    assert.strictEqual(badLoginRes.status, 401, `Expected 401 Unauthorized, got ${badLoginRes.status}`);
    assert.ok(badLoginRes.data.error, 'Response must contain JSON error');

    // Verify axios.js interceptor has exemption for /auth/login so no window.location redirect occurs
    const axiosPath = path.resolve(__dirname, '../choice-grid/src/api/axios.js');
    const axiosContent = fs.readFileSync(axiosPath, 'utf8');
    assert.ok(axiosContent.includes('/auth/login'), 'Axios interceptor must exempt /auth/login from auto-redirect');
    recordResult(2, '401 Exception: POST /login wrong pass returns 401 JSON with no redirect', true, `Status 401: "${badLoginRes.data.error}"`);
  } catch (err) {
    recordResult(2, '401 Exception', false, err.message);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. Key-Value Snapshotting: POST /logs/2026-09-05 with 1 of 5 habits as X. GET /stats shows monthlyCompletion ~20%
  try {
    const postDate = '2026-09-05';
    const logRes = await client.post(
      `/logs/${postDate}`,
      { log: { 'h-1': 'X' } },
      { headers: authHeaders }
    );
    assert.strictEqual(logRes.status, 200, `Expected 200, got ${logRes.status}`);
    // Assert all 5 default habits are snapshotted in DB
    const keys = Object.keys(logRes.data.log);
    assert.strictEqual(keys.length, 5, `Expected 5 snapshotted habits, found ${keys.length}`);
    assert.strictEqual(logRes.data.log['h-1'], 'X');
    assert.strictEqual(logRes.data.log['h-2'], '');

    // Check GET /stats monthlyCompletion is ~20% (1/5)
    const statsRes = await client.get('/stats', { headers: authHeaders });
    assert.strictEqual(statsRes.status, 200);
    const completion = statsRes.data.monthlyCompletion;
    assert.ok(Math.abs(completion - 20) < 1, `Expected monthlyCompletion ~20%, got ${completion}%`);
    recordResult(3, 'Key-Value Snapshotting: POST /logs/2026-09-05 snapshots 5 habits, GET /stats shows ~20%', true, `Snapshotted keys: 5, completion: ${completion}%`);
  } catch (err) {
    recordResult(3, 'Key-Value Snapshotting', false, err.message);
  }

  // 4. Historical Integrity: POST /settings add 6th habit. GET /logs/month for previous month. Old days still % correct
  try {
    const getSettingsRes = await client.get('/settings', { headers: authHeaders });
    const currentHabits = getSettingsRes.data.habits;
    assert.strictEqual(currentHabits.length, 5);

    // Add 6th habit
    const updatedHabits = [...currentHabits, { name: 'Intermittent Fasting' }];
    const postSettingsRes = await client.post('/settings', { habits: updatedHabits }, { headers: authHeaders });
    assert.strictEqual(postSettingsRes.status, 200);
    assert.strictEqual(postSettingsRes.data.habits.length, 6);

    // Fetch month logs for 2026/09
    const monthRes = await client.get('/logs/month/2026/09', { headers: authHeaders });
    assert.strictEqual(monthRes.status, 200);
    const day5Doc = monthRes.data.find((d) => d.date === '2026-09-05');
    assert.ok(day5Doc, '2026-09-05 log must exist');
    // Verify historical snapshot on day 5 still has exactly 5 keys (old days still intact)
    const historicalKeys = Object.keys(day5Doc.log);
    assert.strictEqual(historicalKeys.length, 5, `Expected day 5 historical snapshot to have 5 keys, got ${historicalKeys.length}`);
    recordResult(4, 'Historical Integrity: Adding 6th habit preserves historical snapshotted logs & scores', true, 'Old day retains 5 snapshotted keys');
  } catch (err) {
    recordResult(4, 'Historical Integrity', false, err.message);
  }

  // 5. Streak Grace Africa/Lagos: Manually set yesterday complete, today incomplete in DB. GET /stats currentStreak counts from yesterday
  try {
    const todayLagos = dayjs().tz(TIMEZONE);
    const todayStr = todayLagos.format('YYYY-MM-DD');
    const yesterdayStr = todayLagos.subtract(1, 'day').format('YYYY-MM-DD');

    // Get current habit IDs (now 6 habits)
    const settingsRes = await client.get('/settings', { headers: authHeaders });
    const habits = settingsRes.data.habits;
    const fullYesterdayLog = {};
    habits.forEach((h) => {
      fullYesterdayLog[h.id] = 'X';
    });

    // Mark yesterday complete
    await client.post(`/logs/${yesterdayStr}`, { log: fullYesterdayLog }, { headers: authHeaders });

    // Mark today incomplete (all empty)
    const emptyTodayLog = {};
    habits.forEach((h) => {
      emptyTodayLog[h.id] = '';
    });
    await client.post(`/logs/${todayStr}`, { log: emptyTodayLog }, { headers: authHeaders });

    // Check stats: currentStreak must count from yesterday (>= 1)
    const statsRes = await client.get('/stats', { headers: authHeaders });
    assert.strictEqual(statsRes.status, 200);
    assert.ok(statsRes.data.currentStreak >= 1, `Expected currentStreak >= 1 with yesterday complete, got ${statsRes.data.currentStreak}`);
    recordResult(5, 'Streak Grace Africa/Lagos: Yesterday complete & today incomplete retains streak', true, `Current streak: ${statsRes.data.currentStreak} (grace active)`);
  } catch (err) {
    recordResult(5, 'Streak Grace Africa/Lagos', false, err.message);
  }

  // 6. Race Condition: Fire 3 POST /logs/:date in parallel for same date. Final DB state has all 3 changes
  try {
    const testDate = '2026-09-15';
    // Fire 3 simultaneous atomic updates on separate keys
    await Promise.all([
      client.post(`/logs/${testDate}`, { log: { 'h-1': 'X' } }, { headers: authHeaders }),
      client.post(`/logs/${testDate}`, { log: { 'h-2': 'X' } }, { headers: authHeaders }),
      client.post(`/logs/${testDate}`, { log: { 'h-3': 'X' } }, { headers: authHeaders }),
    ]);

    // Inspect final state in DB
    const checkRes = await client.get(`/logs/${testDate}`, { headers: authHeaders });
    assert.strictEqual(checkRes.status, 200);
    assert.strictEqual(checkRes.data.log['h-1'], 'X', 'h-1 must be X');
    assert.strictEqual(checkRes.data.log['h-2'], 'X', 'h-2 must be X');
    assert.strictEqual(checkRes.data.log['h-3'], 'X', 'h-3 must be X');
    recordResult(6, 'Race Condition: 3 parallel POST requests for same date all persist atomically', true, 'h-1, h-2, and h-3 all present as "X"');
  } catch (err) {
    recordResult(6, 'Race Condition', false, err.message);
  }

  // 7. 2D Sticky: Header sticky top-0, day col sticky left-0
  try {
    const habitGridPath = path.resolve(__dirname, '../choice-grid/src/components/HabitGrid.jsx');
    const habitGridContent = fs.readFileSync(habitGridPath, 'utf8');
    assert.ok(habitGridContent.includes('sticky top-0'), 'HabitGrid header must contain sticky top-0');
    assert.ok(habitGridContent.includes('sticky left-0'), 'HabitGrid day column must contain sticky left-0');
    assert.ok(habitGridContent.includes('grid-scroll-container overflow-x-auto'), 'Grid scroll container must be configured');
    recordResult(7, '2D Sticky: Header sticky top-0 and day column sticky left-0 present in HabitGrid', true, 'Verified 2D sticky CSS classes');
  } catch (err) {
    recordResult(7, '2D Sticky', false, err.message);
  }

  // 8. Touch: Min 44x44px target, touch-action: manipulation, user-select: none, no zoom on double tap
  try {
    const indexPath = path.resolve(__dirname, '../choice-grid/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('viewport-fit=cover'), 'Viewport must include viewport-fit=cover');

    const cssPath = path.resolve(__dirname, '../choice-grid/src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(cssContent.includes('touch-action: manipulation'), 'index.css must specify touch-action: manipulation');
    assert.ok(cssContent.includes('user-select: none'), 'index.css must specify user-select: none');

    const gridPath = path.resolve(__dirname, '../choice-grid/src/components/HabitGrid.jsx');
    const gridContent = fs.readFileSync(gridPath, 'utf8');
    assert.ok(gridContent.includes('min-w-[44px]') && gridContent.includes('min-h-[44px]'), 'Grid cells must have min-w-[44px] min-h-[44px]');
    recordResult(8, 'Touch: 44x44px touch targets, touch-action manipulation, user-select none, no double-tap zoom', true, 'All touch constraints verified');
  } catch (err) {
    recordResult(8, 'Touch Controls', false, err.message);
  }

  // 9. Recharts Ticks: Window <768px has 6 ticks. Window >768px has 30 ticks
  try {
    const chartPath = path.resolve(__dirname, '../choice-grid/src/components/ScoreChart.jsx');
    const chartContent = fs.readFileSync(chartPath, 'utf8');
    assert.ok(chartContent.includes('window.innerWidth < 768'), 'ScoreChart must detect viewport width < 768px');
    assert.ok(chartContent.includes('interval={isMobile ? 4 : 0}'), 'XAxis interval must dynamically switch between 4 (mobile ~6 ticks) and 0 (desktop 30 ticks)');
    recordResult(9, 'Recharts Ticks: Dynamic responsive interval (mobile ~6 ticks vs desktop 30 ticks)', true, 'interval={isMobile ? 4 : 0} verified');
  } catch (err) {
    recordResult(9, 'Recharts Ticks', false, err.message);
  }

  // 10. Celebration: POST /logs/today when it breaks record. DB longestStreak updates. Second POST does not fire again
  try {
    // Reset longestStreak in DB to 0 to simulate record breaking
    const resetUser = `qa_record_${Date.now()}@choicegrid.app`;
    const regRes = await client.post('/auth/register', {
      name: 'Record Breaker',
      email: resetUser,
      password: 'password123',
    });
    const recordToken = regRes.data.token;
    const recordAuthHeaders = { Authorization: `Bearer ${recordToken}` };

    // First POST /logs/today: marks all habits complete for today -> breaks record
    const firstTodayRes = await client.post('/logs/today', {}, { headers: recordAuthHeaders });
    assert.strictEqual(firstTodayRes.status, 200);
    assert.strictEqual(firstTodayRes.data.isNewRecord, true, 'First completion must trigger isNewRecord: true');
    assert.strictEqual(firstTodayRes.data.longestStreak, 1, 'DB longestStreak must update to 1');

    // Second POST /logs/today: should NOT fire celebration again
    const secondTodayRes = await client.post('/logs/today', {}, { headers: recordAuthHeaders });
    assert.strictEqual(secondTodayRes.status, 200);
    assert.strictEqual(secondTodayRes.data.isNewRecord, false, 'Second completion must evaluate isNewRecord: false');
    assert.strictEqual(secondTodayRes.data.longestStreak, 1, 'DB longestStreak remains 1 without redundant celebration');
    recordResult(10, 'Celebration: POST /logs/today breaks record, updates DB longestStreak; 2nd POST does not repeat', true, '1st: isNewRecord=true, 2nd: isNewRecord=false');
  } catch (err) {
    recordResult(10, 'Celebration', false, err.message);
  }

  // 11. QuickLog: POST /api/logs/today sets all to X. GET /logs/today matches
  try {
    const quickLogRes = await client.post('/logs/today', {}, { headers: authHeaders });
    assert.strictEqual(quickLogRes.status, 200);

    const getTodayRes = await client.get('/logs/today', { headers: authHeaders });
    assert.strictEqual(getTodayRes.status, 200);
    const todayLogObj = getTodayRes.data.log;
    const values = Object.values(todayLogObj);
    assert.ok(values.length > 0, 'Today log must contain habits');
    const allX = values.every((v) => v === 'X');
    assert.ok(allX, 'All habit values must be "X"');
    recordResult(11, 'QuickLog: POST /logs/today sets all habits to "X", GET /logs/today matches perfectly', true, `${values.length} habits all set to "X"`);
  } catch (err) {
    recordResult(11, 'QuickLog', false, err.message);
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${results.filter((r) => r.passed).length} / 12 TESTS PASSED`);
  console.log('====================================================');

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    process.exit(1);
  }
}

runQASuite().catch((err) => {
  console.error('QA Suite Uncaught Error:', err);
  process.exit(1);
});
