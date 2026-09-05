import { User } from '../models/User.js';
import { HabitSettings } from '../models/HabitSettings.js';
import { generateToken } from '../utils/jwt.js';
import { sendWelcomeEmail } from '../utils/email.js';
import AppError from '../utils/AppError.js';

export const registerUser = async ({ name, email, password }) => {
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  // Create user
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
  });

  // Initialize habit settings atomically
  await HabitSettings.findOrCreateForUser(user._id);

  const token = generateToken(user._id);

  // Non-blocking welcome email dispatch
  sendWelcomeEmail(user.email, user.name).catch((err) => {
    console.error('[Email] Background dispatch error:', err.message);
  });

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = generateToken(user._id);

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  };
};

export const getUserProfile = (userDoc) => {
  return {
    id: userDoc._id,
    name: userDoc.name,
    email: userDoc.email,
  };
};
