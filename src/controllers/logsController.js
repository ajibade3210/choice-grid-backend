import { asyncHandler } from '../middleware/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { getTodayStr } from '../utils/streakEngine.js';
import * as logsService from '../services/logsService.js';

export const getMonthLogs = asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new AppError('Valid year and month (1-12) are required', 400);
  }

  const result = await logsService.getMonthLogs(req.user._id, year, month);
  res.status(200).json(result);
});

export const getTodayLog = asyncHandler(async (req, res) => {
  const result = await logsService.getDateLog(req.user._id, getTodayStr());
  res.status(200).json(result);
});

export const getDateLog = asyncHandler(async (req, res) => {
  const result = await logsService.getDateLog(req.user._id, req.params.date);
  res.status(200).json(result);
});

export const upsertTodayLog = asyncHandler(async (req, res) => {
  const result = await logsService.upsertTodayLog(req.user._id, req.body?.log);
  res.status(200).json(result);
});

export const updateDateLog = asyncHandler(async (req, res) => {
  const { date } = req.params;
  const { log } = req.body || {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError('Date must be formatted as YYYY-MM-DD', 400);
  }

  if (!log || typeof log !== 'object') {
    throw new AppError('Log object is required', 400);
  }

  const result = await logsService.updateDateLog(req.user._id, date, log);
  res.status(200).json(result);
});
