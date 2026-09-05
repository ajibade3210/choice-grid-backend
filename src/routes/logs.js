import express from 'express';
import dayjs from 'dayjs';
import HabitLog from '../models/HabitLog.js';
import HabitSettings, { DEFAULT_HABITS } from '../models/HabitSettings.js';
import authMiddleware from '../middleware/auth.js';
import { TIMEZONE, getTodayStr } from '../utils/streakEngine.js';

const router = express.Router();

// Require auth for all log routes
router.use(authMiddleware);

// GET /api/logs/month/:year/:month
// Example: /api/logs/month/2026/09 or /api/logs/month/2026/9
router.get('/month/:year/:month', async (req, res, next) => {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid year and month (1-12) are required' });
    }

    const monthPadded = String(month).padStart(2, '0');
    // Compute start and end date in Africa/Lagos
    const monthDate = dayjs(`${year}-${monthPadded}-01`).tz(TIMEZONE);
    const daysInMonth = monthDate.daysInMonth();

    const startDate = `${year}-${monthPadded}-01`;
    const endDate = `${year}-${monthPadded}-${String(daysInMonth).padStart(2, '0')}`;

    const logs = await HabitLog.find({
      userId: req.user._id,
      date: { $gte: startDate, $lte: endDate },
    })
      .select('date log -_id')
      .sort({ date: 1 })
      .lean();

    // Map into array of [{ date, log }]
    const result = logs.map((doc) => ({
      date: doc.date,
      log: doc.log || {},
    }));

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/logs/today
router.get('/today', async (req, res, next) => {
  try {
    const todayStr = getTodayStr();
    const doc = await HabitLog.findOne({ userId: req.user._id, date: todayStr }).lean();
    res.status(200).json({
      date: todayStr,
      log: doc ? doc.log : {},
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/logs/:date
router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    const doc = await HabitLog.findOne({ userId: req.user._id, date }).lean();
    res.status(200).json({
      date,
      log: doc ? doc.log : {},
    });
  } catch (error) {
    next(error);
  }
});

// Helper to snapshot all active habits for that user so unchecked habits default to ""
const snapshotLogWithDefaults = async (userId, incomingLog) => {
  const settings = await HabitSettings.findOne({ userId });
  const activeHabits = settings ? settings.habits : DEFAULT_HABITS;

  const mergedLog = {};
  activeHabits.forEach((h) => {
    // Snapshot active habits for this date
    mergedLog[h.id] = incomingLog && incomingLog[h.id] ? incomingLog[h.id] : '';
  });

  // Preserve any additional keys that were passed
  if (incomingLog && typeof incomingLog === 'object') {
    Object.keys(incomingLog).forEach((k) => {
      if (mergedLog[k] === undefined) {
        mergedLog[k] = incomingLog[k];
      }
    });
  }

  return mergedLog;
};

// POST /api/logs/today
// Sets today Africa/Lagos to all X or uses provided log. Upsert.
router.post('/today', async (req, res, next) => {
  try {
    const todayStr = getTodayStr();
    let settings = await HabitSettings.findOne({ userId: req.user._id });
    if (!settings) {
      settings = await HabitSettings.create({
        userId: req.user._id,
        habits: DEFAULT_HABITS,
        longestStreak: 0,
      });
    }
    const habits = settings.habits || DEFAULT_HABITS;

    let targetLog = {};
    if (req.body.log && Object.keys(req.body.log).length > 0) {
      targetLog = await snapshotLogWithDefaults(req.user._id, req.body.log);
    } else {
      // Default: set all active habits to "X"
      habits.forEach((h) => {
        targetLog[h.id] = 'X';
      });
    }

    const updatedDoc = await HabitLog.findOneAndUpdate(
      { userId: req.user._id, date: todayStr },
      { $set: { log: targetLog } },
      { upsert: true, new: true, runValidators: true }
    );

    // Compute streak to check for record break
    const allLogs = await HabitLog.find({ userId: req.user._id }).select('date log -_id').lean();
    const maxHabits = habits.length;
    const longestStreakFromDB = settings.longestStreak || 0;
    const { calculateStats } = await import('../utils/streakEngine.js');
    const stats = calculateStats(allLogs, maxHabits, longestStreakFromDB);

    let isNewRecord = false;
    if (stats.isNewRecord) {
      isNewRecord = true;
      settings.longestStreak = stats.currentStreak;
      await settings.save();
    }

    res.status(200).json({
      date: updatedDoc.date,
      log: updatedDoc.log,
      isNewRecord,
      currentStreak: stats.currentStreak,
      longestStreak: settings.longestStreak,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/logs/:date
// Body: { log: { [habitId]: state }, maxHabits?: Number }
router.post('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { log } = req.body;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be formatted as YYYY-MM-DD' });
    }

    if (!log || typeof log !== 'object') {
      return res.status(400).json({ error: 'Log object is required' });
    }

    // Validate values: only 'X', '.', or ''
    for (const [key, val] of Object.entries(log)) {
      if (val !== 'X' && val !== '.' && val !== '') {
        return res.status(400).json({
          error: `Invalid cell state "${val}" for habit "${key}". Allowed: "X", ".", or ""`,
        });
      }
    }

    let settings = await HabitSettings.findOne({ userId: req.user._id });
    if (!settings) {
      settings = await HabitSettings.create({
        userId: req.user._id,
        habits: DEFAULT_HABITS,
        longestStreak: 0,
      });
    }
    const activeHabits = settings.habits || DEFAULT_HABITS;

    // Dot-notation $set to safely update individual habit keys without clobbering concurrent parallel updates
    const setFields = {};
    for (const [habitId, val] of Object.entries(log)) {
      setFields[`log.${habitId}`] = val;
    }

    // $setOnInsert defaults for any active habits not included in the payload
    const setOnInsertFields = {};
    activeHabits.forEach((h) => {
      if (log[h.id] === undefined) {
        setOnInsertFields[`log.${h.id}`] = '';
      }
    });

    const updateQuery = { $set: setFields };
    if (Object.keys(setOnInsertFields).length > 0) {
      updateQuery.$setOnInsert = setOnInsertFields;
    }

    const updatedDoc = await HabitLog.findOneAndUpdate(
      { userId: req.user._id, date },
      updateQuery,
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({
      date: updatedDoc.date,
      log: updatedDoc.log,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
