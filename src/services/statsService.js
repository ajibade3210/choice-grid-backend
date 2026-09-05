import { HabitLog } from '../models/HabitLog.js';
import { HabitSettings, DEFAULT_HABITS } from '../models/HabitSettings.js';
import { calculateStats } from '../utils/streakEngine.js';

export const syncUserStreakStats = async (userId, settings) => {
  const logs = await HabitLog.find({ userId }).select('date log -_id').lean();
  const maxHabits = settings.habits ? settings.habits.length : DEFAULT_HABITS.length;
  const longestStreakFromDB = settings.longestStreak || 0;

  const stats = calculateStats(logs, maxHabits, longestStreakFromDB);

  if (stats.isNewRecord) {
    settings.longestStreak = stats.currentStreak;
    await settings.save();
  }

  return stats;
};

export const getUserStats = async (userId) => {
  const settings = await HabitSettings.findOrCreateForUser(userId);
  return syncUserStreakStats(userId, settings);
};
