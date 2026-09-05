import { asyncHandler } from '../middleware/asyncHandler.js';
import AppError from '../utils/AppError.js';
import * as settingsService from '../services/settingsService.js';

export const getSettings = asyncHandler(async (req, res) => {
  const result = await settingsService.getSettings(req.user._id);
  res.status(200).json(result);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const { habits } = req.body || {};

  if (!Array.isArray(habits)) {
    throw new AppError('Habits must be an array', 400);
  }

  const result = await settingsService.updateSettings(req.user._id, habits);
  res.status(200).json(result);
});
