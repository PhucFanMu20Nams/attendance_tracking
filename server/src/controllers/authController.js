import * as authService from '../services/authService.js';

/** POST /api/auth/login */
export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'Identifier (email or username) is required' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' });
    }

    if (identifier.trim().length === 0) {
      return res.status(400).json({ message: 'Identifier cannot be empty' });
    }

    if (password.length === 0) {
      return res.status(400).json({ message: 'Password cannot be empty' });
    }

    const result = await authService.loginUser(identifier, password);

    return res.status(200).json({
      token: result.token,
      user: result.user
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/** GET /api/auth/me */
export const getMe = async (req, res) => {
  try {
    const user = await authService.getCurrentUser(req.user._id);

    return res.status(200).json({ user });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('GetMe error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
