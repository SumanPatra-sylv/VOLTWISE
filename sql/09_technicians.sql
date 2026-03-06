-- ============================================================
-- VOLTWISE — STEP 9: TECHNICIANS TABLE
-- ============================================================
-- Run in Supabase SQL Editor
-- Creates technicians table with location support for nearby search
-- ============================================================

-- ========================
-- TABLE: technicians
-- ========================
CREATE TABLE IF NOT EXISTS technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    specialty TEXT NOT NULL,
    services TEXT[] DEFAULT '{}',
    rating NUMERIC(2,1) DEFAULT 4.5 CHECK (rating >= 1 AND rating <= 5),
    reviews_count INT DEFAULT 0,
    experience_years INT DEFAULT 1,
    is_verified BOOLEAN DEFAULT false,
    is_available BOOLEAN DEFAULT true,
    availability_text TEXT DEFAULT 'Available Now',
    hourly_rate NUMERIC(8,2),
    -- Location fields
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    -- Metadata
    profile_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- RPC: Get Nearby Technicians
-- ========================
-- Uses Haversine formula (works without PostGIS extension)
CREATE OR REPLACE FUNCTION get_nearby_technicians(
    user_lat NUMERIC,
    user_lng NUMERIC,
    radius_km NUMERIC DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    specialty TEXT,
    services TEXT[],
    rating NUMERIC,
    reviews_count INT,
    experience_years INT,
    is_verified BOOLEAN,
    is_available BOOLEAN,
    availability_text TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    city TEXT,
    distance_km NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.name,
        t.phone,
        t.specialty,
        t.services,
        t.rating,
        t.reviews_count,
        t.experience_years,
        t.is_verified,
        t.is_available,
        t.availability_text,
        t.latitude,
        t.longitude,
        t.city,
        -- Haversine formula for distance calculation
        ROUND(
            (6371 * acos(
                cos(radians(user_lat)) * cos(radians(t.latitude)) *
                cos(radians(t.longitude) - radians(user_lng)) +
                sin(radians(user_lat)) * sin(radians(t.latitude))
            ))::NUMERIC, 1
        ) AS distance_km
    FROM technicians t
    WHERE t.latitude IS NOT NULL 
      AND t.longitude IS NOT NULL
      AND (6371 * acos(
            cos(radians(user_lat)) * cos(radians(t.latitude)) *
            cos(radians(t.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(t.latitude))
          )) <= radius_km
    ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;


-- ========================
-- SEED: Demo Technicians
-- ========================
-- Locations around major Indian cities (Kolkata, Delhi, Mumbai, Patna, Ahmedabad)

INSERT INTO technicians (name, phone, specialty, services, rating, reviews_count, experience_years, is_verified, is_available, availability_text, latitude, longitude, city, state, pincode) VALUES

-- Kolkata area technicians
('Rajesh Kumar', '+91 98765 43210', 'Electrical Wiring & Repairs', ARRAY['Wiring', 'Meter Installation', 'Safety Inspection'], 4.8, 156, 12, true, true, 'Available Now', 22.5726, 88.3639, 'Kolkata', 'West Bengal', '700001'),
('Sunil Sharma', '+91 98765 43211', 'Smart Meter & IoT Devices', ARRAY['Smart Plug Setup', 'Meter Reading', 'IoT Installation'], 4.9, 203, 8, true, true, 'Available in 30 min', 22.5958, 88.2636, 'Howrah', 'West Bengal', '711101'),
('Amit Das', '+91 98765 43212', 'AC & Appliance Repair', ARRAY['AC Repair', 'Refrigerator', 'Washing Machine'], 4.7, 89, 15, true, true, 'Available Now', 22.6272, 88.3809, 'Salt Lake', 'West Bengal', '700091'),

-- Delhi NCR area technicians
('Vikram Singh', '+91 98765 43213', 'Solar Panel Installation', ARRAY['Solar Panels', 'Inverter Setup', 'Battery Systems'], 4.6, 67, 6, false, false, 'Tomorrow 9 AM', 28.7041, 77.1025, 'New Delhi', 'Delhi', '110001'),
('Pradeep Mishra', '+91 98765 43214', 'Home Automation', ARRAY['Smart Home', 'NILM Setup', 'Energy Monitoring'], 4.9, 124, 10, true, true, 'Available Now', 28.4595, 77.0266, 'Gurgaon', 'Haryana', '122001'),
('Deepak Yadav', '+91 98765 43215', 'Industrial Electrician', ARRAY['Industrial Wiring', 'Load Balancing', 'HT/LT Lines'], 4.5, 45, 20, true, false, 'Available in 1 hour', 28.5355, 77.3910, 'Noida', 'Uttar Pradesh', '201301'),

-- Mumbai area technicians
('Sachin Patil', '+91 98765 43216', 'Residential Electrician', ARRAY['House Wiring', 'MCB Installation', 'Earthing'], 4.8, 178, 14, true, true, 'Available Now', 19.0760, 72.8777, 'Mumbai', 'Maharashtra', '400001'),
('Rahul Deshmukh', '+91 98765 43217', 'Commercial Electrician', ARRAY['Office Wiring', 'Server Room', 'UPS Systems'], 4.7, 92, 11, true, true, 'Available in 45 min', 19.2183, 72.9781, 'Thane', 'Maharashtra', '400601'),

-- Patna area technicians (Bihar - for SBPDCL users)
('Ravi Shankar', '+91 98765 43218', 'Prepaid Meter Specialist', ARRAY['Meter Installation', 'Recharge Issues', 'SBPDCL Support'], 4.6, 134, 9, true, true, 'Available Now', 25.5941, 85.1376, 'Patna', 'Bihar', '800001'),
('Manoj Kumar', '+91 98765 43219', 'Home Electrician', ARRAY['Wiring', 'Fan Installation', 'Switchboard'], 4.5, 67, 7, true, true, 'Available Now', 25.6093, 85.1235, 'Patna', 'Bihar', '800020'),

-- Ahmedabad area technicians (Gujarat - for MGVCL users)
('Hitesh Patel', '+91 98765 43220', 'Solar & Green Energy', ARRAY['Solar Panels', 'Wind Energy', 'Battery Backup'], 4.9, 201, 13, true, true, 'Available Now', 23.0225, 72.5714, 'Ahmedabad', 'Gujarat', '380001'),
('Jayesh Shah', '+91 98765 43221', 'Smart Home Expert', ARRAY['Home Automation', 'Voice Control', 'Energy Audit'], 4.8, 156, 8, true, false, 'Available in 2 hours', 23.0469, 72.5294, 'Ahmedabad', 'Gujarat', '380015');

-- ========================
-- Enable RLS (optional)
-- ========================
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Technicians are viewable by everyone" ON technicians
    FOR SELECT USING (true);
