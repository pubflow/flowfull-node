-- Migration: Add Billing Fields to Subscriptions Table
-- Purpose: Add billing_interval, interval_multiplier, and renewal tracking fields

-- PostgreSQL Version
-- ==================

-- Add billing fields to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS interval_multiplier INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_billing_attempt TIMESTAMP,
ADD COLUMN IF NOT EXISTS billing_retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retry_attempts INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Create index for efficient renewal processing
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing 
ON subscriptions(next_billing_date, billing_status) 
WHERE billing_status IN ('active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_retry_billing 
ON subscriptions(last_billing_attempt, billing_retry_count) 
WHERE billing_status = 'past_due';

-- Migrate existing data from metadata
UPDATE subscriptions 
SET billing_interval = COALESCE(
    metadata->>'billing_interval', 
    'monthly'
)
WHERE billing_interval = 'monthly'; -- Only update defaults

-- Calculate next_billing_date for existing subscriptions
UPDATE subscriptions 
SET next_billing_date = current_period_end
WHERE next_billing_date IS NULL 
AND status IN ('active', 'trialing');

-- Add check constraints
ALTER TABLE subscriptions 
ADD CONSTRAINT chk_billing_interval 
CHECK (billing_interval IN ('daily', 'weekly', 'monthly', 'yearly'));

ALTER TABLE subscriptions 
ADD CONSTRAINT chk_interval_multiplier 
CHECK (interval_multiplier > 0 AND interval_multiplier <= 12);

ALTER TABLE subscriptions 
ADD CONSTRAINT chk_billing_status 
CHECK (billing_status IN ('active', 'past_due', 'suspended', 'cancelled'));

-- MySQL Version
-- =============

/*
-- Add billing fields to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
ADD COLUMN interval_multiplier INT NOT NULL DEFAULT 1,
ADD COLUMN next_billing_date TIMESTAMP NULL,
ADD COLUMN last_billing_attempt TIMESTAMP NULL,
ADD COLUMN billing_retry_count INT NOT NULL DEFAULT 0,
ADD COLUMN max_retry_attempts INT NOT NULL DEFAULT 3,
ADD COLUMN billing_status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Create indexes
CREATE INDEX idx_subscriptions_next_billing 
ON subscriptions(next_billing_date, billing_status);

CREATE INDEX idx_subscriptions_retry_billing 
ON subscriptions(last_billing_attempt, billing_retry_count);

-- Migrate existing data
UPDATE subscriptions 
SET billing_interval = COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.billing_interval')), 
    'monthly'
)
WHERE billing_interval = 'monthly';

-- Calculate next_billing_date
UPDATE subscriptions 
SET next_billing_date = current_period_end
WHERE next_billing_date IS NULL 
AND status IN ('active', 'trialing');
*/

-- SQLite Version
-- ==============

/*
-- SQLite doesn't support ADD COLUMN with constraints in one statement
-- Add columns one by one

ALTER TABLE subscriptions ADD COLUMN billing_interval TEXT DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN interval_multiplier INTEGER DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN next_billing_date TEXT;
ALTER TABLE subscriptions ADD COLUMN last_billing_attempt TEXT;
ALTER TABLE subscriptions ADD COLUMN billing_retry_count INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN max_retry_attempts INTEGER DEFAULT 3;
ALTER TABLE subscriptions ADD COLUMN billing_status TEXT DEFAULT 'active';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing 
ON subscriptions(next_billing_date, billing_status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_retry_billing 
ON subscriptions(last_billing_attempt, billing_retry_count);

-- Migrate existing data
UPDATE subscriptions 
SET billing_interval = COALESCE(
    json_extract(metadata, '$.billing_interval'), 
    'monthly'
)
WHERE billing_interval = 'monthly';

-- Calculate next_billing_date
UPDATE subscriptions 
SET next_billing_date = current_period_end
WHERE next_billing_date IS NULL 
AND status IN ('active', 'trialing');
*/

-- Verification Queries
-- ====================

-- Check migration success
SELECT 
    COUNT(*) as total_subscriptions,
    COUNT(billing_interval) as with_billing_interval,
    COUNT(next_billing_date) as with_next_billing_date,
    billing_interval,
    interval_multiplier
FROM subscriptions 
GROUP BY billing_interval, interval_multiplier;

-- Check upcoming renewals
SELECT 
    id,
    customer_id,
    billing_interval,
    interval_multiplier,
    current_period_end,
    next_billing_date,
    billing_status
FROM subscriptions 
WHERE next_billing_date <= NOW() + INTERVAL '7 days'
AND billing_status = 'active'
ORDER BY next_billing_date;

-- Check retry candidates
SELECT 
    id,
    customer_id,
    last_billing_attempt,
    billing_retry_count,
    max_retry_attempts,
    billing_status
FROM subscriptions 
WHERE billing_status = 'past_due'
AND billing_retry_count < max_retry_attempts
ORDER BY last_billing_attempt;
