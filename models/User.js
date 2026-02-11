const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// In-memory user storage (consistent with existing app pattern)
const usersById = new Map();
const usersByEmail = new Map();

const COACHING_LEVELS = ['middle_school', 'high_school', 'other'];
const PLAN_TYPES = ['trial', 'monthly', 'yearly'];
const PLAN_STATUSES = ['active', 'cancelled', 'expired'];

const TRIAL_DURATION_DAYS = 7;
const TRIAL_SCANS_DEFAULT = 3;
const BCRYPT_ROUNDS = 10;

/**
 * Creates a new user object with hashed password.
 * Returns the created user (without password field).
 */
async function createUser({ email, password, name, school, coachingLevel }) {
    const normalizedEmail = email.toLowerCase().trim();

    if (usersByEmail.has(normalizedEmail)) {
        const err = new Error('A user with this email already exists');
        err.statusCode = 409;
        throw err;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const user = {
        id: uuidv4(),
        email: normalizedEmail,
        password: hashedPassword,
        name,
        school: school || null,
        coachingLevel: COACHING_LEVELS.includes(coachingLevel) ? coachingLevel : null,
        plan: 'trial',
        planStatus: 'active',
        trialScansRemaining: TRIAL_SCANS_DEFAULT,
        trialEndsAt: trialEndsAt.toISOString(),
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
    };

    usersById.set(user.id, user);
    usersByEmail.set(normalizedEmail, user);

    return sanitizeUser(user);
}

/**
 * Finds a user by email. Returns full user object (including password hash)
 * for internal use (e.g. password comparison).
 */
function findByEmail(email) {
    return usersByEmail.get(email.toLowerCase().trim()) || null;
}

/**
 * Finds a user by ID. Returns full user object (including password hash)
 * for internal use.
 */
function findById(id) {
    return usersById.get(id) || null;
}

/**
 * Compares a plain-text password against the stored hash.
 */
async function comparePassword(plainText, hash) {
    return bcrypt.compare(plainText, hash);
}

/**
 * Returns a user object without the password field.
 */
function sanitizeUser(user) {
    const { password, ...safe } = user;
    return safe;
}

module.exports = {
    createUser,
    findByEmail,
    findById,
    comparePassword,
    sanitizeUser,
    COACHING_LEVELS,
    PLAN_TYPES,
    PLAN_STATUSES,
};
