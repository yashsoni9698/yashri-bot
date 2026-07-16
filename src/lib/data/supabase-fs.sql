-- Run this in Supabase SQL Editor (replaces the previous table setup)
-- This approach stores files as key-value pairs, mimicking the filesystem

-- Drop previous tables if they exist (from prior run)
DROP TABLE IF EXISTS disabled_reminders CASCADE;
DROP TABLE IF EXISTS keepalive CASCADE;
DROP TABLE IF EXISTS work_snoozes CASCADE;
DROP TABLE IF EXISTS instagram_pending_offer CASCADE;
DROP TABLE IF EXISTS instagram_followups CASCADE;
DROP TABLE IF EXISTS instagram_accounts CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS memory CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS festivals CASCADE;
DROP TABLE IF EXISTS festival_clients CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- Simple key-value file store (simulates the data/ folder)
CREATE TABLE IF NOT EXISTS file_store (
  path TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Keep-alive table for the ping trick
CREATE TABLE IF NOT EXISTS keepalive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_file_store_path ON file_store(path);
