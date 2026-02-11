const supabase = require('../config/supabase');

async function supabaseAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = header.slice(7);

    try {
        // Verify the JWT with Supabase Auth
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Fetch the user profile from user_profiles table
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(401).json({ error: 'User profile not found' });
        }

        req.user = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            school: profile.school,
            coachingLevel: profile.coaching_level,
            plan: profile.plan,
            planStatus: profile.plan_status,
            trialScansRemaining: profile.trial_scans_remaining,
            trialEndsAt: profile.trial_ends_at,
            stripeCustomerId: profile.stripe_customer_id,
            stripeSubscriptionId: profile.stripe_subscription_id,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
        };

        next();
    } catch (err) {
        console.error('Supabase auth error:', err.message);
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = supabaseAuth;
