import jwt from 'jsonwebtoken';

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is not set in production');
    }
    console.warn('[Auth] WARNING: JWT_SECRET not provided. Using development fallback secret.');
    return 'choice_grid_super_secret_jwt_key_2026_production';
  }
  return secret;
};

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, getJwtSecret(), { expiresIn: '7d' });
};

export const verifyToken = (token) => {
  return jwt.verify(token, getJwtSecret());
};
