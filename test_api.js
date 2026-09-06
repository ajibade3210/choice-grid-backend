import axios from 'axios';
import assert from 'assert';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import dotenv from 'dotenv';

dotenv.config();

dayjs.extend(utc);
dayjs.extend(timezone);

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

  // 12. Email: POST /register
  try {
    const regRes = await client.post('/auth/register', {
      name: testName,
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(regRes.status, 201, `Expected 201 Created, got ${regRes.status}`);
    assert.ok(regRes.data.token, 'Expected JWT token returned on register');
    recordResult(12, 'Email: POST /register initializes user & returns JWT', true, `User: ${testEmail}`);
  } catch (err) {
    recordResult(12, 'Email: POST /register', false, err.message);
  }

  // 1. Auth Session: Login, save token, verify GET /me works
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
    recordResult(1, 'Auth Session: Login, token generation, and GET /me restore', true, '/me restored authenticated user session');
  } catch (err) {
    recordResult(1, 'Auth Session', false, err.message);
  }

  // 2. 401 Exception: POST /login wrong pass returns 401 JSON
  try {
    const badLoginRes = await client.post('/auth/login', {
      email: testEmail,
      password: 'wrong_password_test',
    });
    assert.strictEqual(badLoginRes.status, 401, `Expected 401 Unauthorized, got ${badLoginRes.status}`);
    assert.ok(badLoginRes.data.error, 'Response must contain JSON error');
    recordResult(2, '401 Exception: POST /login wrong pass returns 401 JSON', true, `Status 401: "${badLoginRes.data.error}"`);
  } catch (err) {
    recordResult(2, '401 Exception', false, err.message);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. Key-Value Snapshotting: POST /settings with new array. Logs store by ID not index
  try {
    const initialSettingsRes = await client.get('/settings', { headers: authHeaders });
    assert.strictEqual(initialSettingsRes.status, 200);
    const originalHabits = initialSettingsRes.data.habits;
    assert.strictEqual(originalHabits.length, 5, 'Must have 5 default habits');

    // Update settings: add 6th habit
    const newHabits = [
      ...originalHabits,
      { id: 'h-6', name: 'Cold Shower' },
    ];
    const updateSettingsRes = await client.post('/settings', { habits: newHabits }, { headers: authHeaders });
    assert.strictEqual(updateSettingsRes.status, 200);
    assert.strictEqual(updateSettingsRes.data.habits.length, 6, 'Settings must reflect 6 habits');

    // Log for 'h-6' on test date
    const testDate = '2026-09-01';
    const logRes = await client.post(`/logs/${testDate}`, { log: { 'h-6': 'X', 'h-1': '.' } }, { headers: authHeaders });
    assert.strictEqual(logRes.status, 200);
    assert.strictEqual(logRes.data.log['h-6'], 'X');
    assert.strictEqual(logRes.data.log['h-1'], '.');
    recordResult(3, 'Key-Value Snapshotting: Habits mapped by stable IDs, not positional array indices', true, 'h-6 and h-1 logged distinctly');
  } catch (err) {
    recordResult(3, 'Key-Value Snapshotting', false, err.message);
  }

  // 4. Historical Integrity: Past logs remain untouched when settings habits mutate
  try {
    const testDate = '2026-09-01';
    const logBefore = await client.get(`/logs/${testDate}`, { headers: authHeaders });
    assert.strictEqual(logBefore.status, 200);
    const beforeVal = logBefore.data.log['h-6'];

    // Update settings again: delete h-6 and add h-7
    const currentSettings = (await client.get('/settings', { headers: authHeaders })).data.habits;
    const mutatedHabits = currentSettings.filter((h) => h.id !== 'h-6').concat([{ id: 'h-7', name: 'Evening Walk' }]);
    await client.post('/settings', { habits: mutatedHabits }, { headers: authHeaders });

    // Verify 2026-09-01 still has 'h-6' preserved in historical log
    const logAfter = await client.get(`/logs/${testDate}`, { headers: authHeaders });
    assert.strictEqual(logAfter.status, 200);
    assert.strictEqual(logAfter.data.log['h-6'], beforeVal, 'Historical log for h-6 must be preserved');
    recordResult(4, 'Historical Integrity: Deleting/modifying active habits does not wipe historical dates', true, 'Historical h-6 preserved after removal from settings');
  } catch (err) {
    recordResult(4, 'Historical Integrity', false, err.message);
  }

  // 5. Streak Grace Africa/Lagos: Yesterday complete & today incomplete retains streak
  try {
    const today = dayjs().tz(TIMEZONE);
    const todayStr = today.format('YYYY-MM-DD');
    const yesterdayStr = today.subtract(1, 'day').format('YYYY-MM-DD');

    // Get current habit IDs
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

  // 6. Race Condition: Fire 3 POST /logs/:date in parallel for same date
  try {
    const testDate = '2026-09-02';
    await Promise.all([
      client.post(`/logs/${testDate}`, { log: { 'h-1': 'X' } }, { headers: authHeaders }),
      client.post(`/logs/${testDate}`, { log: { 'h-2': 'X' } }, { headers: authHeaders }),
      client.post(`/logs/${testDate}`, { log: { 'h-3': 'X' } }, { headers: authHeaders }),
    ]);

    const checkRes = await client.get(`/logs/${testDate}`, { headers: authHeaders });
    assert.strictEqual(checkRes.status, 200);
    assert.strictEqual(checkRes.data.log['h-1'], 'X', 'h-1 must be X');
    assert.strictEqual(checkRes.data.log['h-2'], 'X', 'h-2 must be X');
    assert.strictEqual(checkRes.data.log['h-3'], 'X', 'h-3 must be X');
    recordResult(6, 'Race Condition: 3 parallel POST requests for same date all persist atomically', true, 'h-1, h-2, and h-3 all present as "X"');
  } catch (err) {
    recordResult(6, 'Race Condition', false, err.message);
  }

  // 7. Health Check: GET /api/health
  try {
    const healthRes = await client.get('/health');
    assert.strictEqual(healthRes.status, 200, `Expected 200 OK, got ${healthRes.status}`);
    assert.strictEqual(healthRes.data.status, 'ok', 'Status must be ok');
    assert.strictEqual(healthRes.data.db, 'connected', 'Database must be connected');
    assert.strictEqual(typeof healthRes.data.uptime, 'number', 'Uptime must be a number');
    assert.strictEqual(typeof healthRes.data.memory, 'object', 'Memory must be an object');
    recordResult(7, 'Health Check: GET /api/health returns status ok, db connected, uptime, and memory', true, `Uptime: ${Math.round(healthRes.data.uptime)}s, DB: ${healthRes.data.db}`);
  } catch (err) {
    recordResult(7, 'Health Check', false, err.message);
  }

  // 8. Admin Auth: POST /api/admin/login
  let adminToken = null;
  try {
    // Bad secret returns 401
    const badSecretRes = await client.post('/admin/login', { secret: 'wrong_secret' });
    assert.strictEqual(badSecretRes.status, 401, 'Wrong secret must return 401');

    // Valid secret returns 200 with JWT
    const goodSecretRes = await client.post('/admin/login', { secret: process.env.ADMIN_SECRET });
    assert.strictEqual(goodSecretRes.status, 200, `Expected 200 OK, got ${goodSecretRes.status}`);
    assert.ok(goodSecretRes.data.token, 'Token must exist in admin login response');
    adminToken = goodSecretRes.data.token;
    recordResult(8, 'Admin Auth: POST /api/admin/login validates secret and issues JWT', true, 'Authenticated admin session verified');
  } catch (err) {
    recordResult(8, 'Admin Auth', false, err.message);
  }

  // 9. Admin Metrics: GET /api/admin/metrics
  try {
    // Unauthorized without token
    const unauthRes = await client.get('/admin/metrics');
    assert.strictEqual(unauthRes.status, 401, 'Request without token must return 401');

    // Authorized with admin token
    const metricsRes = await client.get('/admin/metrics', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(metricsRes.status, 200, `Expected 200 OK, got ${metricsRes.status}`);
    assert.strictEqual(typeof metricsRes.data.totalUsers, 'number', 'totalUsers must be a number');
    assert.strictEqual(typeof metricsRes.data.dau, 'number', 'dau must be a number');
    assert.strictEqual(typeof metricsRes.data.habitsCreated, 'number', 'habitsCreated must be a number');
    assert.strictEqual(typeof metricsRes.data.logsToday, 'number', 'logsToday must be a number');
    assert.strictEqual(typeof metricsRes.data.avgStreak, 'number', 'avgStreak must be a number');

    // Second call tests 60s cache
    const cachedMetricsRes = await client.get('/admin/metrics', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(cachedMetricsRes.status, 200);
    assert.strictEqual(cachedMetricsRes.data.cached, true, 'Subsequent request must return cached: true');
    recordResult(9, 'Admin Metrics: GET /api/admin/metrics returns 5 metrics with 60s node-cache', true, `totalUsers: ${metricsRes.data.totalUsers}, dau: ${metricsRes.data.dau}, cached: ${cachedMetricsRes.data.cached}`);
  } catch (err) {
    recordResult(9, 'Admin Metrics', false, err.message);
  }

  // 10. Celebration: POST /logs/today when it breaks record
  try {
    const resetUser = `qa_record_${Date.now()}@choicegrid.app`;
    const regRes = await client.post('/auth/register', {
      name: 'Record Breaker',
      email: resetUser,
      password: 'password123',
    });
    const recordToken = regRes.data.token;
    const recordAuthHeaders = { Authorization: `Bearer ${recordToken}` };

    const firstTodayRes = await client.post('/logs/today', {}, { headers: recordAuthHeaders });
    assert.strictEqual(firstTodayRes.status, 200);
    assert.strictEqual(firstTodayRes.data.isNewRecord, true, 'First completion must trigger isNewRecord: true');
    assert.strictEqual(firstTodayRes.data.longestStreak, 1, 'DB longestStreak must update to 1');

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
