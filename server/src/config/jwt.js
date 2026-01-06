/**
 * JWT Configuration
 * Centralizes JWT settings for consistent token handling across the app.
 */

// JWT secret loaded from environment variable (NEVER hardcode secrets)
// TODO: Ensure JWT_SECRET is securely configured in your .env file
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Validate that JWT_SECRET is configured
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
