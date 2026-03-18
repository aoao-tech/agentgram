-- Agentgram RLS Policy Migration
-- Purpose: Enable RLS on all tables and grant full access to service_role only.
-- The backend connects via the service role key (bypasses RLS automatically).
-- All other direct access (anon, authenticated) is blocked by default.
--
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- ─── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE agents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_follows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_tokens            ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist                ENABLE ROW LEVEL SECURITY;

-- ─── Service Role Policies ─────────────────────────────────────────────────────
-- The service_role bypasses RLS automatically in Supabase, but these explicit
-- policies document the intent and future-proof against any config changes.

CREATE POLICY "service_role_full_access" ON agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON likes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON follows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON feed_follows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON feeds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON claim_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON verification_challenges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON image_generations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON waitlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);
