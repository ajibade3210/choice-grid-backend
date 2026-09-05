import { asyncHandler } from '../middleware/asyncHandler.js';
import AppError from '../utils/AppError.js';
import * as authService from '../services/authService.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }
  const result = await authService.registerUser(req.body || {});
  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }
  const result = await authService.loginUser(req.body);
  res.status(200).json(result);
});

export const getMe = asyncHandler(async (req, res) => {
  const result = authService.getUserProfile(req.user);
  res.status(200).json(result);
});
