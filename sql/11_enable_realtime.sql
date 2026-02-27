-- ============================================================
-- VOLTWISE — STEP 11: ENABLE SUPABASE REALTIME
-- ============================================================
-- REQUIRED for the frontend to receive live updates when the
-- backend (scheduler) changes appliance status or creates
-- notifications.
--
-- Without this, the `postgres_changes` subscription in React
-- never fires — the UI only refreshes on user interaction.
--
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================

-- Add key tables to the Realtime publication
-- (Supabase only broadcasts changes for tables in this publication)
ALTER PUBLICATION supabase_realtime ADD TABLE appliances;
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE control_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_logs;

-- Verify: list tables in the publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
