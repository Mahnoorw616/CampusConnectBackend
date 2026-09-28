const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Authentication required. Send a Bearer token.' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured' });
    const token = authorization.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ success: false, message: 'The user associated with this token no longer exists' });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return next(error);
  }
};

module.exports = { protect };
