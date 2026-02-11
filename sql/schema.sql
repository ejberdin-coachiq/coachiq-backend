-- ===========================================
-- CoachIQ – user_profiles table
-- Run this in your Supabase Dashboard → SQL Editor
-- ===========================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  school TEXT,
  coaching_level TEXT CHECK (coaching_level IN ('middle_school', 'high_school', 'other')),
  plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'monthly', 'yearly')),
  plan_status TEXT DEFAULT 'active' CHECK (plan_status IN ('active', 'cancelled', 'expired')),
  trial_scans_remaining INTEGER DEFAULT 3,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_stripe_customer ON user_profiles(stripe_customer_id);
CREATE INDEX idx_user_profiles_stripe_subscription ON user_profiles(stripe_subscription_id);

-- Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow the service_role key (used by the backend) to bypass RLS automatically.
-- No extra policy is needed – service_role already bypasses RLS by default.

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
