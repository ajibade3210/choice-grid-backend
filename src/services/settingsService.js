import { HabitSettings } from '../models/HabitSettings.js';
import AppError from '../utils/AppError.js';

export const getSettings = async (userId) => {
  const settings = await HabitSettings.findOrCreateForUser(userId);
  return {
    habits: settings.habits,
    longestStreak: settings.longestStreak,
  };
};

export const updateSettings = async (userId, habits) => {
  if (habits.length < 1 || habits.length > 10) {
    throw new AppError('Habits count must be between 1 and 10', 400);
  }

  const currentSettings = await HabitSettings.findOrCreateForUser(userId);
  const existingIdSet = new Set(currentSettings.habits.map((h) => h.id));

  const updatedHabits = habits.map((item, index) => {
    const name = typeof item === 'string' ? item.trim() : (item.name || '').trim();
    if (!name) {
      throw new AppError(`Habit at position ${index + 1} must have a non-empty name`, 400);
    }

    let id = item.id;
    if (!id || !existingIdSet.has(id)) {
      id = `h-${Date.now()}-${index}`;
    }

    return {
      id,
      name,
      createdAt: item.createdAt || new Date(),
    };
  });

  currentSettings.habits = updatedHabits;
  await currentSettings.save();

  return {
    habits: currentSettings.habits,
    longestStreak: currentSettings.longestStreak,
  };
};
