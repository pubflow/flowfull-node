-- Migration: Add Rate Limits Table
-- Purpose: Add rate limiting functionality for API protection
-- Compatible with: PostgreSQL, MySQL, LibSQL/SQLite

-- PostgreSQL/MySQL Version
-- ========================
CREATE TABLE IF NOT EXISTS rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    points INTEGER NOT NULL,
    expires TIMESTAMP NOT NULL
);

-- CREATE INDEX IF NOT EXIST for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires);

-- SQLite/LibSQL Version (alternative syntax)
-- ==========================================
-- CREATE TABLE IF NOT EXISTS rate_limits (
--     key TEXT PRIMARY KEY,
--     points INTEGER NOT NULL,
--     expires TEXT NOT NULL
-- );
-- 
-- CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires);

-- Comments for documentation
COMMENT ON TABLE rate_limits IS 'Rate limiting table for API protection';
COMMENT ON COLUMN rate_limits.key IS 'Unique identifier (IP:action format)';
COMMENT ON COLUMN rate_limits.points IS 'Remaining points/attempts';
COMMENT ON COLUMN rate_limits.expires IS 'When the rate limit window expires';
