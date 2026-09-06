DO $$
DECLARE
    -- Your specific Admin/Demo Account UUID
    hero_user_id UUID := 'ef1cbea2-a6d8-4991-908b-e4bc50efd1ef'; 
BEGIN
    -- 1. Verify this ID actually exists in the profiles table to prevent errors
    PERFORM id FROM profiles WHERE id = hero_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User ID % not found in profiles table!', hero_user_id;
    END IF;

    -- 2. Generate and insert 30 days of REALISTIC 15-minute intervals
    INSERT INTO interval_readings (user_id, reading_timestamp, kwh, quality_flag)
    SELECT 
        hero_user_id,
        ts,
        (
            CASE 
                -- WEEKEND LOGIC (Saturday & Sunday)
                WHEN EXTRACT(ISODOW FROM ts AT TIME ZONE 'Asia/Kolkata') IN (6, 7) THEN
                    CASE
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 0 AND 7 THEN 0.10 + (random() * 0.05) 
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 8 AND 11 THEN 0.40 + (random() * 0.20) 
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 12 AND 17 THEN 0.35 + (random() * 0.15) 
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 18 AND 22 THEN 0.70 + (random() * 0.30) 
                        ELSE 0.20 + (random() * 0.10) 
                    END
                -- WEEKDAY LOGIC (Monday to Friday)
                ELSE
                    CASE
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 0 AND 5 THEN 0.08 + (random() * 0.04) 
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 6 AND 8 THEN 0.60 + (random() * 0.30) 
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 9 AND 17 THEN 0.12 + (random() * 0.08) 
                        WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 18 AND 22 THEN 0.85 + (random() * 0.40) 
                        ELSE 0.25 + (random() * 0.10) 
                    END
            END
        )::numeric(10,4) AS kwh,
        'ACTUAL'
    FROM generate_series(
        date_trunc('hour', now() - interval '30 days'), 
        date_trunc('hour', now()), 
        interval '15 minutes'
    ) AS ts
    ON CONFLICT (user_id, reading_timestamp) 
    DO UPDATE SET kwh = EXCLUDED.kwh; 

    RAISE NOTICE 'SUCCESS: User % seeded with 30 days of PERFECTLY ALIGNED interval data.', hero_user_id;
END $$;