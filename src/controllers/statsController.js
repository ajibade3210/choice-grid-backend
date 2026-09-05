import { asyncHandler } from '../middleware/asyncHandler.js';
import * as statsService from '../services/statsService.js';

export const getStats = asyncHandler(async (req, res) => {
  const result = await statsService.getUserStats(req.user._id);
  res.status(200).json(result);
});
