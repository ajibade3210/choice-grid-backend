import express from 'express';
import HabitLog from '../models/HabitLog.js';
import HabitSettings, { DEFAULT_HABITS } from '../models/HabitSettings.js';
import authMiddleware from '../middleware/auth.js';
import { calculateStats } from '../utils/streakEngine.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/stats
router.get('/', async (req, res, next) => {
  try {
    // 1. Fetch user's current settings
    let settings = await HabitSettings.findOne({ userId: req.user._id });
    if (!settings) {
      settings = await HabitSettings.create({
        userId: req.user._id,
        habits: DEFAULT_HABITS,
        longestStreak: 0,
      });
    }

    const maxHabits = settings.habits ? settings.habits.length : DEFAULT_HABITS.length;
    const longestStreakFromDB = settings.longestStreak || 0;

    // 2. Fetch all user logs in a single query
    const logs = await HabitLog.find({ userId: req.user._id })
      .select('date log -_id')
      .lean();

    // 3. Compute stats with Africa/Lagos streak engine
    const stats = calculateStats(logs, maxHabits, longestStreakFromDB);

    // 4. If a new record was set, update the benchmark in DB
    if (stats.isNewRecord) {
      settings.longestStreak = stats.currentStreak;
      await settings.save();
    }

    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
