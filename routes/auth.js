const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { createUser, findByEmail, comparePassword, sanitizeUser } = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// POST /api/auth/signup
router.post(
    '/signup',
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('name').notEmpty().withMessage('Name is required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        try {
            const { email, password, name, school, coachingLevel } = req.body;
            const user = await createUser({ email, password, name, school, coachingLevel });
            const token = generateToken(user.id);

            res.status(201).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    plan: user.plan,
                },
            });
        } catch (err) {
            const status = err.statusCode || 500;
            res.status(status).json({ error: err.message });
        }
    }
);

// POST /api/auth/login
router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        try {
            const { email, password } = req.body;
            const user = findByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const isMatch = await comparePassword(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const token = generateToken(user.id);
            const safe = sanitizeUser(user);

            res.json({
                token,
                user: {
                    id: safe.id,
                    email: safe.email,
                    name: safe.name,
                    plan: safe.plan,
                    planStatus: safe.planStatus,
                },
            });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

module.exports = router;
