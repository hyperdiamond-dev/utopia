-- Initial schema migration
-- This creates the basic tables structure based on existing database

-- Set the schema to terminal_utopia
SET search_path = terminal_utopia;

-- Create ENUM types first
CREATE TYPE terminal_utopia.user_status AS ENUM ('ACTIVE', 'WITHDRAWN', 'FLAGGED');
CREATE TYPE terminal_utopia.event_type AS ENUM ('LOGIN', 'LOGOUT', 'CONSENT', 'MODULE_START', 'MODULE_COMPLETION');

-- Users table
CREATE TABLE IF NOT EXISTS terminal_utopia.users (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    status terminal_utopia.user_status NOT NULL DEFAULT 'ACTIVE',
    last_login TIMESTAMP WITHOUT TIME ZONE,
    alias TEXT NOT NULL,
    active_module INTEGER
);

-- Create unique index on alias for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_alias ON terminal_utopia.users(alias);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON terminal_utopia.users(uuid);
CREATE INDEX IF NOT EXISTS idx_users_status ON terminal_utopia.users(status);

-- Consents table
CREATE TABLE IF NOT EXISTS terminal_utopia.consents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES terminal_utopia.users(id) ON DELETE CASCADE,
    version VARCHAR NOT NULL,
    content TEXT,
    consented_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Create indexes for consents
CREATE INDEX IF NOT EXISTS idx_consents_user_id ON terminal_utopia.consents(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_version ON terminal_utopia.consents(version);

-- Audits table
CREATE TABLE IF NOT EXISTS terminal_utopia.audits (
    id SERIAL PRIMARY KEY,
    event_type terminal_utopia.event_type NOT NULL,
    user_id INTEGER NOT NULL REFERENCES terminal_utopia.users(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    details JSON
);

-- Create indexes for audits
CREATE INDEX IF NOT EXISTS idx_audits_user_id ON terminal_utopia.audits(user_id);
CREATE INDEX IF NOT EXISTS idx_audits_event_type ON terminal_utopia.audits(event_type);
CREATE INDEX IF NOT EXISTS idx_audits_timestamp ON terminal_utopia.audits(timestamp);

-- Create a migrations tracking table
CREATE TABLE IF NOT EXISTS terminal_utopia.schema_migrations (
    version VARCHAR PRIMARY KEY,
    applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Record this migration
INSERT INTO terminal_utopia.schema_migrations (version) VALUES ('001_initial_schema') ON CONFLICT (version) DO NOTHING;
