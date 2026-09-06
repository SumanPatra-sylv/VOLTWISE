-- Create the new table for high-frequency smart meter data
CREATE TABLE interval_readings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- Adjust to meter_id if you have a separate meters table
    
    -- TIMESTAMPTZ is critical. It stores everything in UTC but knows it's a timezone.
    reading_timestamp TIMESTAMPTZ NOT NULL, 
    
    -- The actual energy consumed during this specific 15/30 min block
    kwh NUMERIC(10, 4) NOT NULL CHECK (kwh >= 0),
    
    -- Real utility MDMs track if a reading was actual, estimated (due to network drop), or interpolated
    quality_flag VARCHAR(20) DEFAULT 'ACTUAL' CHECK (quality_flag IN ('ACTUAL', 'ESTIMATED', 'INTERPOLATED')),
    
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Prevent duplicate readings if the smart meter loses network and double-posts its payload
    CONSTRAINT unique_meter_interval UNIQUE (user_id, reading_timestamp)
);

-- --- CRITICAL PERFORMANCE INDEXES ---

-- 1. The Billing Engine Index: 
-- Your Python script will always query by user_id and a time range, ordered chronologically.
-- This compound index makes that specific query incredibly fast.
CREATE INDEX idx_interval_billing ON interval_readings (user_id, reading_timestamp ASC);

-- 2. Optional: Time-only index if you ever want to run global grid analytics 
-- (e.g., "What was the total network load at 19:00 across all users?")
CREATE INDEX idx_interval_time ON interval_readings (reading_timestamp);