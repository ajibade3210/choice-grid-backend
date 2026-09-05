import express from 'express';
import HabitSettings, { DEFAULT_HABITS } from '../models/HabitSettings.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Require auth for all settings routes
router.use(authMiddleware);

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    let settings = await HabitSettings.findOne({ userId: req.user._id });

    if (!settings) {
      settings = await HabitSettings.create({
        userId: req.user._id,
        habits: DEFAULT_HABITS,
        longestStreak: 0,
      });
    }

    res.status(200).json({
      habits: settings.habits,
      longestStreak: settings.longestStreak,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings
router.post('/', async (req, res, next) => {
  try {
    const { habits } = req.body;

    if (!Array.isArray(habits)) {
      return res.status(400).json({ error: 'Habits must be an array' });
    }

    if (habits.length < 1 || habits.length > 10) {
      return res.status(400).json({ error: 'Habits count must be between 1 and 10' });
    }

    let currentSettings = await HabitSettings.findOne({ userId: req.user._id });
    if (!currentSettings) {
      currentSettings = await HabitSettings.create({
        userId: req.user._id,
        habits: DEFAULT_HABITS,
        longestStreak: 0,
      });
    }

    // Set of existing habit IDs for this user
    const existingIdSet = new Set(currentSettings.habits.map((h) => h.id));

    // Map new habits array, preserving existing persistent IDs and generating new ones only for new additions
    const updatedHabits = habits.map((item, index) => {
      const name = typeof item === 'string' ? item.trim() : (item.name || '').trim();
      if (!name) {
        throw new Error(`Habit at position ${index + 1} must have a non-empty name`);
      }

      // Check if old ID was provided and belongs to user's history
      let id = item.id;
      if (!id || !existingIdSet.has(id)) {
        // Assign new unique persistent ID
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

    res.status(200).json({
      habits: currentSettings.habits,
      longestStreak: currentSettings.longestStreak,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
