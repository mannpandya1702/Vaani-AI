-- ════════════════════════════════════════════════════════════════
-- Vaani-AI Migration 006 — GRANTs for service_role + view access
--
-- Discovered during Day 2 Part 1.5 smoke test:
--   - service_role lacked SELECT on PHI tables (RLS bypass needs GRANT)
--   - Views (v_red_flag_lookup, etc.) don't inherit underlying table grants
--   - DEFAULT PRIVILEGES needed for future tables
-- ════════════════════════════════════════════════════════════════

-- Schema usage
grant usage on schema public to anon, authenticated, service_role;

-- All existing tables
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;

-- Default privileges for tables created in the future (next migration etc.)
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon;

-- Views
grant select on v_red_flag_lookup to service_role, authenticated, anon;
grant select on v_pregnancy_summary to service_role, authenticated, anon;
grant select on v_mo_users_with_indemnity to service_role, authenticated, anon;
