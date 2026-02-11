const jwt = require('jsonwebtoken');
const { findById, sanitizeUser } = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = header.slice(7);

    if (!JWT_SECRET) {
        console.error('JWT_SECRET is not configured');
        return res.status(500).json({ error: 'Server authentication misconfigured' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        req.user = sanitizeUser(user);
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}

module.exports = authMiddleware;
