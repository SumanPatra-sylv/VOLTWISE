-- ============================================================
-- VOLTWISE — STEP 5: CONSUMER MASTER (Lookup Table)
-- ============================================================
-- Run AFTER 02_setup.sql + 04_seed_tariffs.sql
--
-- This simulates what IntelliSmart/DISCOM would provide via API:
--   GET /consumer/{consumer_id} → { discom, state, meter_id, tariff }
--
-- For PoC: we seed 100 demo consumers (50 SBPDCL + 50 MGVCL).
-- When user enters their consumer number during onboarding,
-- the app looks up this table and auto-detects everything.
-- ============================================================


-- ========================
-- TABLE: consumer_master
-- ========================
CREATE TABLE IF NOT EXISTS consumer_master (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_number   TEXT NOT NULL UNIQUE,
    discom_id         UUID NOT NULL REFERENCES discoms(id),
    discom_code       TEXT NOT NULL,
    state             TEXT NOT NULL,
    meter_number      TEXT NOT NULL,
    tariff_category   tariff_category DEFAULT 'residential',
    connection_type   meter_type DEFAULT 'prepaid',
    registered_name   TEXT,
    registered_phone  TEXT,
    sanctioned_load_kw NUMERIC(5,2) DEFAULT 5.0,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT now()
);


-- ========================
-- SEED: 100 Demo Consumers
-- ========================
-- 50 SBPDCL (Bihar, 12-digit) + 50 MGVCL (Gujarat, 11-digit)
-- Varied sanctioned loads: 2, 3, 5, 7 kW
-- Mix of prepaid/postpaid

INSERT INTO consumer_master (consumer_number, discom_id, discom_code, state, meter_number, tariff_category, connection_type, registered_name, sanctioned_load_kw) VALUES
-- ═══════════════════════════════════════════════════
-- SBPDCL — Bihar — 12-digit consumer numbers
-- ═══════════════════════════════════════════════════
('100100100101', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-001', 'residential', 'prepaid', 'Suman Patra', 5.0),
('100100100102', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-002', 'residential', 'prepaid', 'Rohit Kumar', 3.0),
('100100100103', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-003', 'residential', 'prepaid', 'Priya Singh', 5.0),
('100100100104', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-004', 'residential', 'prepaid', 'Amit Verma', 7.0),
('100100100105', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-005', 'residential', 'prepaid', 'Neha Gupta', 5.0),
('100100100106', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-006', 'residential', 'prepaid', 'Rajesh Yadav', 3.0),
('100100100107', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-007', 'residential', 'prepaid', 'Sunita Devi', 2.0),
('100100100108', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-008', 'residential', 'prepaid', 'Vikash Thakur', 5.0),
('100100100109', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-009', 'residential', 'prepaid', 'Arun Prasad', 7.0),
('100100100110', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-010', 'residential', 'prepaid', 'Kavita Kumari', 3.0),
('100100100111', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-011', 'residential', 'prepaid', 'Manoj Mishra', 5.0),
('100100100112', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-012', 'residential', 'prepaid', 'Deepa Rani', 2.0),
('100100100113', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-013', 'residential', 'prepaid', 'Santosh Ranjan', 5.0),
('100100100114', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-014', 'residential', 'postpaid', 'Anjali Sinha', 7.0),
('100100100115', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-015', 'residential', 'prepaid', 'Pankaj Dubey', 3.0),
('100100100116', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-016', 'residential', 'prepaid', 'Renu Kumari', 5.0),
('100100100117', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-017', 'residential', 'postpaid', 'Sunil Pandey', 5.0),
('100100100118', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-018', 'residential', 'prepaid', 'Meena Sharma', 2.0),
('100100100119', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-019', 'residential', 'prepaid', 'Ashok Choudhary', 7.0),
('100100100120', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-020', 'residential', 'prepaid', 'Sarita Devi', 3.0),
('100100100121', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-021', 'residential', 'prepaid', 'Binod Kumar', 5.0),
('100100100122', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-022', 'residential', 'postpaid', 'Lakshmi Prasad', 5.0),
('100100100123', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-023', 'residential', 'prepaid', 'Ramesh Mandal', 3.0),
('100100100124', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-024', 'residential', 'prepaid', 'Pooja Bharti', 7.0),
('100100100125', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-025', 'residential', 'prepaid', 'Dinesh Sahni', 5.0),
('100100100126', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-026', 'residential', 'prepaid', 'Anita Das', 2.0),
('100100100127', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-027', 'residential', 'postpaid', 'Mukesh Tiwari', 7.0),
('100100100128', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-028', 'residential', 'prepaid', 'Geeta Rani', 3.0),
('100100100129', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-029', 'residential', 'prepaid', 'Sanjay Paswan', 5.0),
('100100100130', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-030', 'residential', 'prepaid', 'Pushpa Kumari', 5.0),
('100100100131', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-031', 'residential', 'prepaid', 'Rakesh Jha', 3.0),
('100100100132', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-032', 'residential', 'postpaid', 'Shanti Devi', 5.0),
('100100100133', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-033', 'residential', 'prepaid', 'Nagendra Singh', 7.0),
('100100100134', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-034', 'residential', 'prepaid', 'Radha Kumari', 2.0),
('100100100135', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-035', 'residential', 'prepaid', 'Umesh Mahto', 5.0),
('100100100136', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-036', 'residential', 'prepaid', 'Mamta Srivastava', 3.0),
('100100100137', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-037', 'residential', 'postpaid', 'Pravin Chandra', 7.0),
('100100100138', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-038', 'residential', 'prepaid', 'Kiran Devi', 5.0),
('100100100139', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-039', 'residential', 'prepaid', 'Ajay Chaurasiya', 3.0),
('100100100140', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-040', 'residential', 'prepaid', 'Nirmala Kumari', 5.0),
('100100100141', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-041', 'residential', 'prepaid', 'Bhola Nath', 2.0),
('100100100142', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-042', 'residential', 'postpaid', 'Saroj Kumar', 7.0),
('100100100143', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-043', 'residential', 'prepaid', 'Usha Singh', 5.0),
('100100100144', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-044', 'residential', 'prepaid', 'Ravi Shankar', 3.0),
('100100100145', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-045', 'residential', 'prepaid', 'Lata Kumari', 5.0),
('100100100146', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-046', 'residential', 'prepaid', 'Vijay Mehta', 7.0),
('100100100147', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-047', 'residential', 'postpaid', 'Rekha Prasad', 3.0),
('100100100148', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-048', 'residential', 'prepaid', 'Gopal Krishna', 5.0),
('100100100149', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-049', 'residential', 'prepaid', 'Archana Devi', 2.0),
('100100100150', 'd1000000-0000-0000-0000-000000000001', 'SBPDCL', 'Bihar', 'MTR-BR-050', 'residential', 'prepaid', 'Shyam Sundar', 5.0),

-- ═══════════════════════════════════════════════════
-- MGVCL — Gujarat — 11-digit consumer numbers
-- ═══════════════════════════════════════════════════
('10010010201', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-001', 'residential', 'prepaid', 'Raj Patel', 5.0),
('10010010202', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-002', 'residential', 'prepaid', 'Meera Shah', 3.0),
('10010010203', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-003', 'residential', 'prepaid', 'Vikram Joshi', 5.0),
('10010010204', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-004', 'residential', 'prepaid', 'Anita Desai', 7.0),
('10010010205', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-005', 'residential', 'prepaid', 'Kiran Modi', 5.0),
('10010010206', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-006', 'residential', 'prepaid', 'Jayesh Bhatt', 3.0),
('10010010207', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-007', 'residential', 'postpaid', 'Nisha Trivedi', 2.0),
('10010010208', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-008', 'residential', 'prepaid', 'Suresh Parmar', 5.0),
('10010010209', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-009', 'residential', 'prepaid', 'Hema Raval', 7.0),
('10010010210', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-010', 'residential', 'prepaid', 'Prakash Chauhan', 3.0),
('10010010211', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-011', 'residential', 'prepaid', 'Rina Dalal', 5.0),
('10010010212', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-012', 'residential', 'postpaid', 'Nitin Solanki', 5.0),
('10010010213', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-013', 'residential', 'prepaid', 'Priti Rana', 2.0),
('10010010214', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-014', 'residential', 'prepaid', 'Dhiren Thakkar', 7.0),
('10010010215', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-015', 'residential', 'prepaid', 'Sangita Dave', 3.0),
('10010010216', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-016', 'residential', 'prepaid', 'Bhavin Mistry', 5.0),
('10010010217', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-017', 'residential', 'postpaid', 'Komal Vyas', 5.0),
('10010010218', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-018', 'residential', 'prepaid', 'Mahesh Gajjar', 7.0),
('10010010219', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-019', 'residential', 'prepaid', 'Sonal Mehta', 2.0),
('10010010220', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-020', 'residential', 'prepaid', 'Hitesh Barot', 3.0),
('10010010221', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-021', 'residential', 'prepaid', 'Falguni Doshi', 5.0),
('10010010222', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-022', 'residential', 'postpaid', 'Chirag Panchal', 7.0),
('10010010223', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-023', 'residential', 'prepaid', 'Asmita Bhavsar', 3.0),
('10010010224', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-024', 'residential', 'prepaid', 'Ketan Pandya', 5.0),
('10010010225', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-025', 'residential', 'prepaid', 'Divya Nair', 5.0),
('10010010226', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-026', 'residential', 'prepaid', 'Tushar Shukla', 2.0),
('10010010227', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-027', 'residential', 'postpaid', 'Rupa Jani', 7.0),
('10010010228', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-028', 'residential', 'prepaid', 'Manish Darji', 3.0),
('10010010229', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-029', 'residential', 'prepaid', 'Pallavi Kothari', 5.0),
('10010010230', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-030', 'residential', 'prepaid', 'Yash Contractor', 5.0),
('10010010231', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-031', 'residential', 'prepaid', 'Nandini Pujara', 3.0),
('10010010232', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-032', 'residential', 'postpaid', 'Alpesh Vaghela', 7.0),
('10010010233', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-033', 'residential', 'prepaid', 'Tejal Zaveri', 5.0),
('10010010234', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-034', 'residential', 'prepaid', 'Gautam Dholakia', 2.0),
('10010010235', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-035', 'residential', 'prepaid', 'Yamini Kapadia', 5.0),
('10010010236', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-036', 'residential', 'prepaid', 'Rohan Chokshi', 3.0),
('10010010237', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-037', 'residential', 'postpaid', 'Janki Amin', 7.0),
('10010010238', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-038', 'residential', 'prepaid', 'Viral Sanghvi', 5.0),
('10010010239', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-039', 'residential', 'prepaid', 'Bhumi Nanavati', 3.0),
('10010010240', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-040', 'residential', 'prepaid', 'Nilesh Thaker', 5.0),
('10010010241', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-041', 'residential', 'prepaid', 'Reshma Vora', 2.0),
('10010010242', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-042', 'residential', 'postpaid', 'Deepak Soni', 7.0),
('10010010243', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-043', 'residential', 'prepaid', 'Kavita Thakor', 5.0),
('10010010244', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-044', 'residential', 'prepaid', 'Jignesh Rathod', 3.0),
('10010010245', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-045', 'residential', 'prepaid', 'Urmi Parekh', 5.0),
('10010010246', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-046', 'residential', 'prepaid', 'Sagar Acharya', 7.0),
('10010010247', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-047', 'residential', 'postpaid', 'Bhavna Gohil', 3.0),
('10010010248', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-048', 'residential', 'prepaid', 'Aarav Rajput', 5.0),
('10010010249', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-049', 'residential', 'prepaid', 'Tara Kulkarni', 2.0),
('10010010250', 'd1000000-0000-0000-0000-000000000002', 'MGVCL', 'Gujarat', 'MTR-GJ-050', 'residential', 'prepaid', 'Parth Suthar', 5.0);


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT discom_code, count(*) FROM consumer_master GROUP BY discom_code;
-- Expected: SBPDCL=50, MGVCL=50, Total=100
--
-- -- Load distribution:
-- SELECT sanctioned_load_kw, count(*) FROM consumer_master GROUP BY sanctioned_load_kw ORDER BY 1;
--
-- -- Test lookup (what onboarding does):
-- SELECT cm.*, tp.id as tariff_plan_id, tp.name as tariff_plan_name
-- FROM consumer_master cm
-- JOIN tariff_plans tp ON tp.discom_id = cm.discom_id
--   AND tp.category = cm.tariff_category
--   AND tp.is_active = true
-- WHERE cm.consumer_number = '100100100101';
-- ============================================================
