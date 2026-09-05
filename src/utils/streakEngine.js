import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const TIMEZONE = 'Africa/Lagos';

export const getTodayInLagos = () => {
  return dayjs().tz(TIMEZONE);
};

export const getTodayStr = () => {
  return getTodayInLagos().format('YYYY-MM-DD');
};

/**
 * Checks if a specific day is complete based on that date's snapshot log:
 * Count X in log.
 * Count number of habits that existed ON THAT DATE from the log keys.
 * Day is complete if X count === that count and that count > 0.
 */
export const isDayComplete = (logObj) => {
  if (!logObj || typeof logObj !== 'object') return false;
  const keys = Object.keys(logObj);
  if (keys.length === 0) return false;

  let countX = 0;
  for (const k of keys) {
    if (logObj[k] === 'X') {
      countX++;
    }
  }

  return countX === keys.length;
};

/**
 * Calculates streak metrics using in-memory indexed logs:
 * @param {Array} logs - Array of { date: string, log: object }
 * @param {number} maxHabits - Current habits.length from HabitSettings
 * @param {number} longestStreakFromDB - Saved longest streak benchmark
 */
export const calculateStats = (logs, maxHabits, longestStreakFromDB = 0) => {
  const today = getTodayInLagos();
  const todayStr = today.format('YYYY-MM-DD');

  // Create fast O(1) hash map: { "YYYY-MM-DD": log }
  const logMap = new Map();
  logs.forEach((item) => {
    if (item.date && item.log) {
      logMap.set(item.date, item.log);
    }
  });

  // 1. Current Streak
  const todayLog = logMap.get(todayStr);
  const todayIsComplete = isDayComplete(todayLog);

  let currentStreak = 0;
  let checkDay = todayIsComplete ? today : today.subtract(1, 'day');

  // Limit check loop to 365 days max
  for (let i = 0; i < 365; i++) {
    const dStr = checkDay.format('YYYY-MM-DD');
    const dayLog = logMap.get(dStr);

    if (isDayComplete(dayLog)) {
      currentStreak++;
      checkDay = checkDay.subtract(1, 'day');
    } else {
      break;
    }
  }

  // 2. Longest Streak across all history using per-date completion
  // Filter all logged dates that are complete, sort chronologically
  const completeDates = [];
  logMap.forEach((log, dateStr) => {
    if (isDayComplete(log)) {
      completeDates.push(dateStr);
    }
  });

  completeDates.sort(); // Lexicographical sort works for YYYY-MM-DD

  let historyMaxStreak = 0;
  let currentRun = 0;
  let prevDate = null;

  for (const dateStr of completeDates) {
    if (!prevDate) {
      currentRun = 1;
    } else {
      const expectedNext = dayjs(prevDate).tz(TIMEZONE).add(1, 'day').format('YYYY-MM-DD');
      if (dateStr === expectedNext) {
        currentRun++;
      } else {
        currentRun = 1;
      }
    }
    if (currentRun > historyMaxStreak) {
      historyMaxStreak = currentRun;
    }
    prevDate = dateStr;
  }

  // 3. isNewRecord: true if currentStreak > longestStreak from DB and currentStreak > 0
  const isNewRecord = currentStreak > longestStreakFromDB && currentStreak > 0;

  // The longest streak to report is the max of the DB baseline, the historical runs, and current streak
  const longestStreak = Math.max(longestStreakFromDB, historyMaxStreak, currentStreak);

  // 4. Monthly Completion
  // Calculate completion percentage across logged days in the current month.
  // Each day's denominator is determined by its snapshotted habit count (historical integrity).
  const currentYear = today.year();
  const currentMonthPadded = String(today.month() + 1).padStart(2, '0');
  const daysInMonth = today.daysInMonth();

  let totalXInMonth = 0;
  let totalHabitsInLoggedDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${currentYear}-${currentMonthPadded}-${String(d).padStart(2, '0')}`;
    const dayLog = logMap.get(dStr);
    if (dayLog && typeof dayLog === 'object') {
      const habitKeys = Object.keys(dayLog);
      if (habitKeys.length > 0) {
        totalHabitsInLoggedDays += habitKeys.length;
        for (const val of Object.values(dayLog)) {
          if (val === 'X') {
            totalXInMonth++;
          }
        }
      }
    }
  }

  const monthlyCompletion =
    totalHabitsInLoggedDays > 0
      ? Math.round((totalXInMonth / totalHabitsInLoggedDays) * 1000) / 10
      : 0;

  return {
    currentStreak,
    longestStreak,
    monthlyCompletion,
    isNewRecord,
    maxHabits: maxHabits || 5,
  };
};
