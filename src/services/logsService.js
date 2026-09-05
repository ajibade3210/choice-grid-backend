import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { HabitLog } from '../models/HabitLog.js';
import { HabitSettings, DEFAULT_HABITS } from '../models/HabitSettings.js';
import { TIMEZONE, getTodayStr } from '../utils/streakEngine.js';
import { syncUserStreakStats } from './statsService.js';
import AppError from '../utils/AppError.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const snapshotLogWithDefaults = (activeHabits, incomingLog) => {
  const habits = activeHabits || DEFAULT_HABITS;
  const mergedLog = {};
  habits.forEach((h) => {
    mergedLog[h.id] = incomingLog && incomingLog[h.id] ? incomingLog[h.id] : '';
  });

  if (incomingLog && typeof incomingLog === 'object') {
    Object.keys(incomingLog).forEach((k) => {
      if (mergedLog[k] === undefined) {
        mergedLog[k] = incomingLog[k];
      }
    });
  }

  return mergedLog;
};

export const getMonthLogs = async (userId, year, month) => {
  const monthPadded = String(month).padStart(2, '0');
  const monthDate = dayjs(`${year}-${monthPadded}-01`).tz(TIMEZONE);
  const daysInMonth = monthDate.daysInMonth();

  const startDate = `${year}-${monthPadded}-01`;
  const endDate = `${year}-${monthPadded}-${String(daysInMonth).padStart(2, '0')}`;

  const logs = await HabitLog.find({
    userId,
    date: { $gte: startDate, $lte: endDate },
  })
    .select('date log -_id')
    .sort({ date: 1 })
    .lean();

  return logs.map((doc) => ({
    date: doc.date,
    log: doc.log || {},
  }));
};

export const getDateLog = async (userId, date) => {
  const doc = await HabitLog.findOne({ userId, date }).lean();
  return {
    date,
    log: doc ? doc.log : {},
  };
};

export const upsertTodayLog = async (userId, incomingLog) => {
  const todayStr = getTodayStr();
  const settings = await HabitSettings.findOrCreateForUser(userId);
  const habits = settings.habits || DEFAULT_HABITS;

  let targetLog = {};
  if (incomingLog && Object.keys(incomingLog).length > 0) {
    targetLog = snapshotLogWithDefaults(habits, incomingLog);
  } else {
    habits.forEach((h) => {
      targetLog[h.id] = 'X';
    });
  }

  const updatedDoc = await HabitLog.findOneAndUpdate(
    { userId, date: todayStr },
    { $set: { log: targetLog } },
    { upsert: true, new: true, runValidators: true }
  );

  const stats = await syncUserStreakStats(userId, settings);

  return {
    date: updatedDoc.date,
    log: updatedDoc.log,
    isNewRecord: stats.isNewRecord,
    currentStreak: stats.currentStreak,
    longestStreak: settings.longestStreak,
  };
};

export const updateDateLog = async (userId, date, log) => {
  for (const [key, val] of Object.entries(log)) {
    if (val !== 'X' && val !== '.' && val !== '') {
      throw new AppError(
        `Invalid cell state "${val}" for habit "${key}". Allowed: "X", ".", or ""`,
        400
      );
    }
  }

  const settings = await HabitSettings.findOrCreateForUser(userId);
  const activeHabits = settings.habits || DEFAULT_HABITS;

  const setFields = {};
  for (const [habitId, val] of Object.entries(log)) {
    setFields[`log.${habitId}`] = val;
  }

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
    { userId, date },
    updateQuery,
    { upsert: true, new: true, runValidators: true }
  );

  return {
    date: updatedDoc.date,
    log: updatedDoc.log,
  };
};
