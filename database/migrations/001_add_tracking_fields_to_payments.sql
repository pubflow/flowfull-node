-- Migration: Add tracking fields to payments table
-- Date: 2024-12-08
-- Description: Add concept, reference_code, category, and tags fields for enhanced payment tracking and analytics

-- Add tracking fields to payments table
ALTER TABLE payments ADD COLUMN concept TEXT;
ALTER TABLE payments ADD COLUMN reference_code TEXT;
ALTER TABLE payments ADD COLUMN category TEXT;
ALTER TABLE payments ADD COLUMN tags TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_reference_code ON payments(reference_code);
CREATE INDEX IF NOT EXISTS idx_payments_category ON payments(category);
CREATE INDEX IF NOT EXISTS idx_payments_concept ON payments(concept);

-- Add comments to document the new fields
-- concept: Human-readable concept (e.g., "Monthly Subscription", "Product Purchase", "Donation")
-- reference_code: Machine-readable code for analytics (e.g., "subscription_monthly", "donation_campaign_2024")
-- category: High-level category (e.g., "subscription", "donation", "purchase", "refund", "fee")
-- tags: Comma-separated tags for flexible categorization (e.g., "promotion,summer,discount")
